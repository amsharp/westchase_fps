// Record an in-game flight of the Learjet to a webm video via MediaRecorder on
// the renderer canvas (captureStream(0) + manual requestFrame, real-time paced).
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const OUT = path.resolve(__dirname, 'plane_flight.webm');
const FPS = 30, DUR = 14; // seconds
const N = FPS * DUR;

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 960, height: 600 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '../../index.html'), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await p.evaluate(() => { __wc.start(); __wc.setWanted(0); __wc.state.hp = 100; __wc.setClock(70); });

  // set up: start AIRBORNE over the town centre, climbing, so the ground can't
  // catch it; we hold altitude and bank into a lazy circle for the shot.
  await p.evaluate(() => {
    __wc.teleport(0, 0); __wc.setYaw(0); __wc.spawnPlane();
    var pl = __wc.plane();
    pl.onGround = false; pl.group.position.set(0, 40, 90);
    var nose = new THREE.Vector3(0, 0, 1).applyQuaternion(pl.group.quaternion);
    pl.vel.copy(nose).multiplyScalar(40); pl.throttle = 0.85;
    window.__frames = 0;
  });

  const b64 = await p.evaluate(async ({ N, FPS }) => {
    var cv = __wc.renderer.domElement;
    var stream = cv.captureStream(0);
    var track = stream.getVideoTracks()[0];
    var rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 5000000 });
    var chunks = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start();
    var dt = 1 / FPS;
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    for (var f = 0; f < N; f++) {
      __wc.state.hp = 100; __wc.setWanted(0);           // keep it alive/clean for the shot
      var pl = __wc.plane(); if (!pl) break;
      __wc.pressKey('KeyW', true);                       // throttle up
      var st = __wc.planeState();
      if (f < 60) {
        // climb-out
        __wc.planeMouse(0, 12);
      } else {
        // lazy banking circle over the town; keep the nose up enough to hold alt
        __wc.planeMouse(14, 9);
        if (st) { if (st.alt < 60) __wc.planeMouse(0, 12); else if (st.alt > 130) __wc.planeMouse(0, -6); }
      }
      __wc.stepLite(dt);
      var s2 = __wc.planeState(); if (!s2) break;         // crashed -> stop
      __wc.renderer.render(__wc.scene, __wc.camera);
      track.requestFrame();
      window.__frames = f;
      await sleep(dt * 1000);
    }
    __wc.pressKey('KeyW', false);
    await new Promise(function (res) { rec.onstop = res; rec.stop(); });
    var blob = new Blob(chunks, { type: 'video/webm' });
    var buf = await blob.arrayBuffer();
    var bytes = new Uint8Array(buf), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }, { N, FPS });

  const frames = await p.evaluate(() => window.__frames);
  fs.writeFileSync(OUT, Buffer.from(b64, 'base64'));
  console.log('wrote', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB, captured frames:', frames, '/', N);
  console.log('errors:', errs.length, JSON.stringify(errs.slice(0, 4)));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
