// ctrl.js — close-up verification of control-surface deflection SIGNS.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const PAGE = 'file://' + path.resolve(__dirname, 'plane.html');
const OUT = path.join(__dirname, 'ctrl.png');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 520, height: 520 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
  await page.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__ready === true, { timeout: 60000 });
  const dataUrl = await page.evaluate(() => {
    var T = window.THREE, P = window.WC_PLANE, B = window.__built;
    var views = [
      // rear view slightly above wing level: right wing on img-LEFT (cam faces +Z).
      // roll-RIGHT => right(+X) aileron UP, left(-X) aileron DOWN.
      ['roll-RIGHT: R-wing(img-left) TE UP', [0, 0.9, -11], [0, -0.3, -0.6], 30, function () { P.setControls(B.parts, 1, 0, 0); }],
      // close 3/4 rear of the RIGHT wing tip to read that aileron alone.
      ['roll-RIGHT: right aileron only', [7.5, 2.2, -6.5], [4.0, -0.3, -1.4], 34, function () { P.setControls(B.parts, 1, 0, 0); }],
      // pure side of tail, elevator pitch-up => trailing edge UP.
      ['pitch-UP: elevator TE UP', [16, 2.4, -5.9], [0, 2.4, -5.9], 20, function () { P.setControls(B.parts, 0, 1, 0); }],
      // top-down of tail: rudder yaw-RIGHT => trailing edge swings to +X (img side).
      ['yaw-RIGHT: rudder TE to +X', [0.01, 14, -5.9], [0, 0, -5.9], 26, function () { P.setControls(B.parts, 0, 0, 1); }]
    ];
    var CW = 320, NX = 2, NY = 2;
    var sheet = document.createElement('canvas'); sheet.width = CW * NX; sheet.height = CW * NY;
    var sx = sheet.getContext('2d'); sx.fillStyle = '#334'; sx.fillRect(0, 0, sheet.width, sheet.height);
    for (var i = 0; i < views.length; i++) {
      var v = views[i]; v[4]();
      var cam = new T.PerspectiveCamera(v[3], 1, 0.1, 200);
      cam.position.set(v[1][0], v[1][1], v[1][2]); cam.lookAt(v[2][0], v[2][1], v[2][2]);
      B.group.updateMatrixWorld(true); window.__renderer.render(window.__scene, cam);
      var gl = window.__renderer.domElement;
      var cx = (i % NX) * CW, cy = Math.floor(i / NX) * CW;
      sx.drawImage(gl, 0, 0, gl.width, gl.height, cx, cy, CW, CW);
      // axis hint: +X arrow
      sx.fillStyle = '#0f0'; sx.font = 'bold 15px monospace'; sx.fillText(v[0], cx + 5, cy + 20);
    }
    return sheet.toDataURL('image/png');
  });
  fs.writeFileSync(OUT, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', OUT);
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
