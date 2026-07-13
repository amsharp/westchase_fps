// shot.js — render the Learjet from several angles + gear/control states into
// one contact sheet. Headless swiftshader via Playwright.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const PAGE = 'file://' + path.resolve(__dirname, 'plane.html');
const OUT = path.join(__dirname, 'contact.png');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--no-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 520, height: 520 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await page.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__ready === true, { timeout: 60000 });

  const dataUrl = await page.evaluate(() => {
    var T = window.THREE, P = window.WC_PLANE, B = window.__built;
    // labelled views: [label, cam xyz, target xyz, fov, setup()]
    var views = [
      ['SIDE (gear down)', [22, 1, 0], [0, 0.2, 0], 30, function () { P.setGear(B.parts, 0); P.setControls(B.parts, 0, 0, 0); }],
      ['FRONT', [0.3, 1, 24], [0, 0.4, 0], 26, null],
      ['TOP', [0, 24, -0.5], [0, 0, -0.5], 30, null],
      ['3/4 FRONT', [15, 8, 15], [0, 0, 0], 32, null],
      ['3/4 REAR (engines/tail)', [-14, 7, -13], [0, 1, -3], 34, null],
      ['GEAR UP', [16, 6, 12], [0, 0, 0], 32, function () { P.setGear(B.parts, 1); }],
      ['CTRL: roll-R + pitch-up', [0, 9, 20], [0, 0, -1], 30,
        function () { P.setGear(B.parts, 0); P.setControls(B.parts, 1, 1, 0); }],
      ['CTRL: yaw-R (from top-rear)', [3, 10, -14], [0, 1.5, -5], 34,
        function () { P.setControls(B.parts, 0, 0, 1); }]
    ];
    var CW = 260, NX = 4, NY = 2;
    var sheet = document.createElement('canvas'); sheet.width = CW * NX; sheet.height = CW * NY;
    var sx = sheet.getContext('2d'); sx.fillStyle = '#223'; sx.fillRect(0, 0, sheet.width, sheet.height);
    for (var i = 0; i < views.length; i++) {
      var v = views[i]; if (v[4]) v[4]();
      var cam = new T.PerspectiveCamera(v[3], 1, 0.1, 200);
      cam.position.set(v[1][0], v[1][1], v[1][2]);
      cam.lookAt(v[2][0], v[2][1], v[2][2]);
      B.group.updateMatrixWorld(true);
      window.__renderer.render(window.__scene, cam);
      var gl = window.__renderer.domElement;
      var cx = (i % NX) * CW, cy = Math.floor(i / NX) * CW;
      sx.drawImage(gl, 0, 0, gl.width, gl.height, cx, cy, CW, CW);
      sx.fillStyle = '#0f0'; sx.font = 'bold 14px monospace';
      sx.fillText(v[0], cx + 5, cy + 18);
    }
    return sheet.toDataURL('image/png');
  });
  fs.writeFileSync(OUT, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', OUT);
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
