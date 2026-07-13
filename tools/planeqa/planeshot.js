// planeshot.js — INTEGRATION verify: fly the REAL Learjet (plane.js) with the
// real flight code and capture it. Left col = player chase cam (main camera),
// right col = external orbit on the plane, across flight stages + crash.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
const OUT = path.join(__dirname);
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR', m.text().slice(0, 160)); });
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate(() => { try { __wc.startGame(); } catch (e) { __wc.start(); } __wc.state.hp = 100; __wc.setWanted(0); __wc.setClock(60); });
  const info = await page.evaluate(async () => {
    var T = window.THREE, gl = __wc.renderer.domElement, cam = __wc.camera;
    var real = (typeof WC_PLANE !== 'undefined') && WC_PLANE.LENGTH;
    __wc.teleport(0, 300); __wc.setYaw(0); __wc.setPitch(0);
    __wc.spawnPlane();
    var CW = 640, CH = 480, ROWS = 4;
    var sheet = document.createElement('canvas'); sheet.width = CW * 2; sheet.height = CH * ROWS;
    var sx = sheet.getContext('2d');
    function planeGroup() { var p = __wc.plane && __wc.plane(); return p && (p.group || p.mesh || p.obj); }
    function drawRow(row, label) {
      // left: main camera (chase view)
      __wc.renderer.render(__wc.scene, cam);
      sx.drawImage(gl, 0, row * CH, CW, CH);
      // right: external orbit on the plane
      var g = planeGroup(); var ctr = g ? g.position.clone() : new T.Vector3(0, 20, 0);
      var ext = new T.PerspectiveCamera(45, CW / CH, 0.1, 3000);
      ext.position.set(ctr.x + 22, ctr.y + 10, ctr.z + 26); ext.lookAt(ctr); ext.updateMatrixWorld(true);
      __wc.renderer.render(__wc.scene, ext);
      sx.drawImage(gl, CW, row * CH, CW, CH);
      sx.fillStyle = '#0f0'; sx.font = 'bold 20px monospace';
      sx.fillText(label, 10, row * CH + 26); sx.fillText('chase', 10, row * CH + 50); sx.fillText('external', CW + 10, row * CH + 50);
    }
    var st0 = __wc.planeState();
    drawRow(0, 'spawn/ground');
    // throttle up; start rotating (pull up) after ~1.5s so it lifts off
    __wc.pressKey('KeyW', true);
    for (var i = 0; i < 75; i++) { if (i >= 45) __wc.planeMouse(0, 9); __wc.stepLite(1 / 30); }
    var st1 = __wc.planeState();
    drawRow(1, 'liftoff alt=' + (st1 ? st1.alt.toFixed(0) : '?'));
    // keep climbing to gear-up altitude
    for (i = 0; i < 90; i++) { __wc.planeMouse(0, 7); __wc.stepLite(1 / 30); }
    var st2 = __wc.planeState();
    drawRow(2, 'climb alt=' + (st2 ? st2.alt.toFixed(0) : '?') + ' gear=' + (st2 ? st2.gearT.toFixed(1) : '?'));
    // crash it
    __wc.crashPlane();
    for (i = 0; i < 25; i++) __wc.stepLite(1 / 30);
    var st3 = __wc.planeState();
    drawRow(3, 'CRASH debris+scorch');
    return { real: real, LEN: (typeof WC_PLANE !== 'undefined') ? WC_PLANE.LENGTH : null,
             st0: st0, st1: st1, st2: st2, st3: st3, url: sheet.toDataURL('image/jpeg', 0.85) };
  });
  fs.writeFileSync(path.join(OUT, 'flightcheck.jpg'), Buffer.from(info.url.split(',')[1], 'base64'));
  delete info.url;
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
