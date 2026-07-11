// tools/animqa/gemini/record.js — record real gameplay clips for multimodal AI
// animation review.
//
// HEADLESS-CAPTURE REWRITE (v3): under swiftshader there is no GPU and no
// vsync/BeginFrame, so (a) the game's requestAnimationFrame loop is starved to
// ~2 fps and (b) EVERY frame the game composites to the on-screen canvas the
// software compositor stalls the main thread ~1-3 s, throttling all JS tasks to
// ~1/s. MediaRecorder + canvas.captureStream is therefore compositor-bound to
// <1 fps and produced 0-frame webms. Fix:
//   1. neutralise the game's rAF loop (override requestAnimationFrame) so the
//      canvas is never composited and the task queue stays fast;
//   2. render each frame into an OFF-SCREEN WebGLRenderTarget (canvas untouched
//      => compositor idle) and readRenderTargetPixels — pure GL readback;
//   3. drive a FIXED small timestep per frame (not wall-clock): full-scene
//      render+readback costs ~1 s each under swiftshader, but because game-time
//      advances a fixed dt per captured frame, the clip plays back as smooth
//      real-time motion at the chosen fps;
//   4. JPEG-encode each frame in-page and mux to MJPEG-AVI here (Gemini accepts
//      video/avi; no ffmpeg/npm needed — see aviwriter.js).
// Clips are VIDEO-ONLY (MediaRecorder audio is unusable in this environment);
// audio-sync findings are out of scope for these clips.
//
// Run:  NODE_PATH=/opt/node22/lib/node_modules node record.js <scenario> [outfile]
// Scenarios: ak | smg | rifle | rocket | pistol | punch | npcwalk | run | drive
//            | lineup:<batch>  (NPC model locomotion rows — see lineup.js)
// Env: FPS (playback/capture fps, default 12), WIDTH (render width, default 640)
// Out: tools/animqa/gemini/clips/<scenario>.avi
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const { writeAvi } = require('./aviwriter');
const GAME = 'file://' + path.resolve(__dirname, '../../../index.html');
const OUT = path.join(__dirname, 'clips');
const SCEN = process.argv[2] || 'ak';
const OUTFILE = process.argv[3] || path.join(OUT, SCEN.replace(/[:]/g, '_') + '.avi');
const FPS = parseInt(process.env.FPS || '15', 10);
const WIDTH = parseInt(process.env.WIDTH || '640', 10);
const HEIGHT = Math.round(WIDTH * 0.75);
fs.mkdirSync(OUT, { recursive: true });

// each scenario: { setup: <page JS string, run once>, secs: <clip seconds>,
// step: <body of function(t) run each frame; t = elapsed CLIP seconds> }. step
// drives input; the harness advances the sim by a fixed dt (1/FPS) each frame.
const WEAPON = (w) => ({
  setup: `__wc.state.owned['${w}'] = true; __wc.setEquipped('${w}');
          __wc.teleport(0, 300); __wc.setYaw(0); __wc.setPitch(0);`,
  secs: 11,
  // 0-2.5 idle | 2.5-4.5 fire | 4.5-7 walk | 7-9 yaw sweep | 9-11 idle
  step: `
    if (t > 2.5 && t < 4.5) { __wc.resetCooldowns && __wc.resetCooldowns(); __wc.tryAttack(); }
    __wc.pressKey('KeyW', (t > 4.5 && t < 7));
    if (t > 7 && t < 9) __wc.setYaw(Math.sin((t - 7) * 1.6) * 0.7);
    else if (t >= 9) __wc.setYaw(0);`
});
const SCENARIOS = {
  ak: WEAPON('auto'), smg: WEAPON('smg'), rifle: WEAPON('rifle'),
  rocket: WEAPON('rocket'), pistol: WEAPON('pistol'),
  punch: {
    setup: `__wc.setEquipped('fists'); __wc.teleport(0, 104); __wc.setYaw(0); __wc.setPitch(-0.05);`,
    secs: 8,
    step: `if (t > 1 && t < 5) { if (!window.__lp || t - window.__lp > 0.28) { window.__lp = t; __wc.resetCooldowns && __wc.resetCooldowns(); __wc.tryAttack(); } }`
  },
  npcwalk: {
    setup: `__wc.teleport(0, 112); __wc.setYaw(0); __wc.setPitch(-0.04); __wc.setEquipped('fists');`,
    secs: 10, step: ``
  },
  run: {
    setup: `__wc.teleport(0, 60); __wc.setYaw(0); __wc.setPitch(0); __wc.state.owned.auto = true; __wc.setEquipped('auto');`,
    secs: 8,
    step: `__wc.pressKey('ShiftLeft', t < 7); __wc.pressKey('KeyW', t < 7);`
  },
  drive: {
    setup: `__wc.teleport(6, 20); __wc.setYaw(Math.PI / 2); __wc.setPitch(-0.05);`,
    secs: 12,
    step: `if (!window.__drove) { window.__drove = 1; var c = __wc.nearestStealableCar && __wc.nearestStealableCar(); if (c) __wc.enterCar(c); }
           __wc.pressKey('KeyW', t > 1.5 && t < 10);`
  }
};

// ---- NPC lineup batches (loaded lazily from lineup.js if present) ----------
if (SCEN.indexOf('lineup') === 0) {
  let LINEUP;
  try { LINEUP = require('./lineup.js'); } catch (e) { console.error('lineup.js not found:', e.message); process.exit(2); }
  const batch = SCEN.split(':')[1] || '0';
  const s = LINEUP.scenario(batch);
  if (!s) { console.error('no lineup batch', batch); process.exit(2); }
  SCENARIOS[SCEN] = s;
}

(async () => {
  const scen = SCENARIOS[SCEN] || SCENARIOS.ak;
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  // neutralise the game's rAF loop so the canvas is never composited (keeps the
  // JS task queue fast); we drive rendering ourselves into an off-screen RT.
  await page.addInitScript(() => { window.requestAnimationFrame = function () { return 0; }; });
  page.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate(() => { try { __wc.startGame(); } catch (e) { __wc.start(); }
    __wc.state.hp = 100; __wc.setWanted(0); __wc.setClock(60); });
  // prime a few ticks so arms/vm/materials exist before setup poses them
  await page.evaluate(() => { for (var i = 0; i < 20; i++) __wc.tick(1 / 60); });
  await page.evaluate(scen.setup);
  await page.evaluate(() => { for (var i = 0; i < 8; i++) __wc.tick(1 / 60); });

  // Collect JPEG frames. Everything runs in ONE page.evaluate, MessageChannel-
  // paced (not timer-throttled), rendering to an off-screen RT.
  const t0 = Date.now();
  const b64frames = await page.evaluate(({ stepBody, secs, fps, W, H }) => new Promise((resolve, reject) => {
    try {
      var step = new Function('t', stepBody || '');
      var R = __wc.renderer;
      var rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      var pix = new Uint8Array(W * H * 4), flip = new Uint8Array(W * H * 4), rw = W * 4;
      var m = document.createElement('canvas'); m.width = W; m.height = H;
      var ctx = m.getContext('2d'); var img = ctx.createImageData(W, H);
      var dt = 1 / fps, N = Math.round(secs * fps), out = [];
      // rendering to the RT uses the RT's own dimensions for the viewport, so the
      // on-screen canvas size is irrelevant; the fixed 4:3 RT matches the camera.
      R.setRenderTarget(rt);
      var mc = new MessageChannel();
      mc.port1.onmessage = function () {
        try {
          if (out.length >= N) { R.setRenderTarget(null); resolve(out); return; }
          var t = out.length * dt;
          try { step(t); } catch (e) {}
          __wc.tick(dt);                       // updates + renders into rt
          R.readRenderTargetPixels(rt, 0, 0, W, H, pix);
          for (var y = 0; y < H; y++) flip.set(pix.subarray((H - 1 - y) * rw, (H - y) * rw), y * rw);
          img.data.set(flip); ctx.putImageData(img, 0, 0);
          out.push(m.toDataURL('image/jpeg', 0.72).split(',')[1]);
          mc.port2.postMessage(0);
        } catch (e) { try { R.setRenderTarget(null); } catch (_) {} reject(e); }
      };
      mc.port2.postMessage(0);
    } catch (e) { reject(e); }
  }), { stepBody: scen.step, secs: scen.secs, fps: FPS, W: WIDTH, H: HEIGHT });

  const frames = b64frames.map(b => Buffer.from(b, 'base64'));
  const bytes = writeAvi(OUTFILE, frames, WIDTH, HEIGHT, FPS);
  console.log('wrote', OUTFILE, Math.round(bytes / 1024) + 'KB',
    '| frames:', frames.length, '@', FPS + 'fps', WIDTH + 'x' + HEIGHT,
    '| capture', Math.round((Date.now() - t0) / 1000) + 's');
  await browser.close();
})().catch(e => { console.error('FATAL', String(e).split('\n')[0]); process.exit(1); });
