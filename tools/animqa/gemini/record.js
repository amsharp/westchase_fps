// tools/animqa/gemini/record.js — record real gameplay clips (video + GAME AUDIO)
// for multimodal AI review. Records in-page via MediaRecorder: WebGL canvas
// captureStream + a WebAudio tap (every node that connects to the destination
// is also teed into a MediaStreamDestination), muxed to one webm.
//
// Run:  NODE_PATH=/opt/node22/lib/node_modules node record.js <scenario> [outfile]
// Scenarios: ak | smg | rifle | rocket | pistol | punch | npcwalk | run | drive
// Out: tools/animqa/gemini/clips/<scenario>.webm
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../../index.html');
const OUT = path.join(__dirname, 'clips');
const SCEN = process.argv[2] || 'ak';
const OUTFILE = process.argv[3] || path.join(OUT, SCEN + '.webm');
fs.mkdirSync(OUT, { recursive: true });

// each scenario: [setup(page-side JS string), durationMs, driver(page-side JS string run at t=0)]
const WEAPON = (w) => [`
  __wc.state.owned['${w}'] = true; __wc.setEquipped('${w}');
  __wc.teleport(0, 300); __wc.setYaw(0); __wc.setPitch(0);`, 11000, `
  var t0 = performance.now();
  // 0-2.5s idle | 2.5-4.5s fire | 4.5-7s walk | 7-9s yaw sweep | 9-11s idle
  var iv = setInterval(function () {
    var t = (performance.now() - t0) / 1000;
    if (t > 2.5 && t < 4.5) { __wc.resetCooldowns && __wc.resetCooldowns(); __wc.tryAttack(); }
    if (t > 4.5 && t < 7) __wc.pressKey('KeyW', true); else __wc.pressKey('KeyW', false);
    if (t > 7 && t < 9) __wc.setYaw(Math.sin((t - 7) * 1.6) * 0.7);
    if (t >= 9) __wc.setYaw(0);
    if (t > 11.5) clearInterval(iv);
  }, 50);`];
const SCENARIOS = {
  ak: WEAPON('auto'), smg: WEAPON('smg'), rifle: WEAPON('rifle'),
  rocket: WEAPON('rocket'), pistol: WEAPON('pistol'),
  punch: [`__wc.setEquipped('fists'); __wc.teleport(0, 104); __wc.setYaw(0); __wc.setPitch(-0.05);`, 8000, `
    var t0 = performance.now();
    var iv = setInterval(function () { var t = (performance.now() - t0) / 1000;
      if (t > 1 && t < 5) { __wc.resetCooldowns && __wc.resetCooldowns(); __wc.tryAttack(); }
      if (t > 8.5) clearInterval(iv); }, 300);`],
  npcwalk: [`__wc.teleport(0, 112); __wc.setYaw(0); __wc.setPitch(-0.04); __wc.setEquipped('fists');`, 10000, ``],
  run: [`__wc.teleport(0, 60); __wc.setYaw(0); __wc.setPitch(0); __wc.setEquipped('auto'); __wc.state.owned.auto = true;`, 8000, `
    __wc.pressKey('ShiftLeft', true); __wc.pressKey('KeyW', true);
    setTimeout(function(){ __wc.pressKey('KeyW', false); __wc.pressKey('ShiftLeft', false); }, 7000);`],
  drive: [`__wc.teleport(6, 20); __wc.setYaw(Math.PI / 2); __wc.setPitch(-0.05);`, 12000, `
    var c = __wc.nearestStealableCar && __wc.nearestStealableCar(); if (c) __wc.enterCar(c);
    setTimeout(function(){ __wc.pressKey('KeyW', true); }, 1500);
    setTimeout(function(){ __wc.pressKey('KeyW', false); }, 10000);`]
};

(async () => {
  const [setup, dur, driver] = SCENARIOS[SCEN] || SCENARIOS.ak;
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  // audio tap: every node that connects to the AudioContext destination is also
  // teed into a MediaStreamDestination we can record.
  await page.addInitScript(() => {
    const orig = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (target) {
      try {
        if (target && typeof AudioDestinationNode !== 'undefined' && target instanceof AudioDestinationNode) {
          if (!window.__tapDest) window.__tapDest = this.context.createMediaStreamDestination();
          orig.call(this, window.__tapDest);
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
  });
  page.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate(() => { try { __wc.startGame(); } catch (e) { __wc.start(); }
    __wc.state.hp = 100; __wc.setWanted(0); __wc.setClock(60); });
  await page.waitForFunction(() => window.__wc.handPos() !== null, { timeout: 20000 }).catch(() => {});
  await page.evaluate(setup);
  await page.waitForTimeout(700);   // settle
  const b64 = await page.evaluate(([driver, dur]) => new Promise((resolve, reject) => {
    var canvas = __wc.renderer.domElement;
    var stream = canvas.captureStream(30);
    if (window.__tapDest) window.__tapDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    var mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm';
    var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2500000 });
    var chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => { var b = new Blob(chunks, { type: 'video/webm' });
      var r = new FileReader(); r.onload = () => resolve(r.result.split(',')[1]); r.onerror = reject; r.readAsDataURL(b); };
    rec.start(500);
    (0, eval)(driver);
    setTimeout(() => rec.stop(), dur);
  }), [driver, dur]);
  fs.writeFileSync(OUTFILE, Buffer.from(b64, 'base64'));
  const kb = Math.round(fs.statSync(OUTFILE).size / 1024);
  console.log('wrote', OUTFILE, kb + 'KB', '| audioTap:', await page.evaluate(() => !!window.__tapDest));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
