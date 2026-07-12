// wristzoom.js — FP-eye close-up of the support grip for a list of (grip, wrist-euler)
// combos, so we can SEE which orientation actually wraps the handguard.
// Run: NODE_PATH=... node tools/animqa/wristzoom.js <weapon> '[{"g":[..],"w":[..]},...]'
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
const OUT = path.join(__dirname, 'arms');
const W = process.argv[2] || 'auto';
const COMBOS = JSON.parse(process.argv[3] || '[]');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate((w) => { try { __wc.startGame(); } catch (e) { __wc.start(); }
    __wc.state.hp = 100; __wc.setWanted(0); __wc.setClock(60); __wc.state.owned[w] = true; __wc.teleport(0, 300); __wc.setYaw(0); __wc.setPitch(0); }, W);
  await page.waitForFunction(() => window.__wc.handPos() !== null, { timeout: 20000 }).catch(() => {});
  const url = await page.evaluate(async (args) => {
    var w = args.w, combos = args.combos, T = window.THREE;
    __wc.setEquipped(w); __wc.setYaw(0); __wc.setPitch(0);
    var base = __wc.getSupPose(w).map(function (a) { return a.slice(); });
    var COLS = 3, ROWS = Math.ceil(combos.length / 3), CW = 440, CH = 440;
    var sheet = document.createElement('canvas'); sheet.width = CW * COLS; sheet.height = CH * ROWS;
    var sx = sheet.getContext('2d'); sx.fillStyle = '#111'; sx.fillRect(0, 0, sheet.width, sheet.height);
    var gl = __wc.renderer.domElement, cam = __wc.camera;
    for (var i = 0; i < combos.length; i++) {
      var C = combos[i];
      if (C.g) __wc.setGrip(w, C.g);
      if (C.w) { var sp = base.map(function (a) { return a.slice(); }); sp[3] = C.w; __wc.setSupPose(w, sp); }
      if (C.c && __wc.setLCurl) __wc.setLCurl(C.c[0], C.c[1], C.c[2]);
      __wc.poseArmsNow(); cam.updateMatrixWorld(true);
      var hp = __wc.handPos(); var lh = new T.Vector3(hp.L[0], hp.L[1], hp.L[2]);
      var fwd = new T.Vector3(); cam.getWorldDirection(fwd); fwd.normalize();
      // tight cam near the eye, looking at the hand
      var tc = new T.PerspectiveCamera(30, 1, 0.005, 50);
      tc.position.copy(cam.position).addScaledVector(fwd, 0.03); tc.lookAt(lh); tc.updateMatrixWorld(true);
      __wc.renderer.render(__wc.scene, tc);
      var col = i % 3, row = (i / 3) | 0;
      try { sx.drawImage(gl, 0, 0, gl.width, gl.height, col * CW, row * CH, CW, CH); } catch (e) {}
      sx.fillStyle = '#0f0'; sx.font = 'bold 15px monospace';
      sx.fillText('g' + JSON.stringify(C.g || 'ship'), col * CW + 6, row * CH + 18);
      sx.fillText('w' + JSON.stringify(C.w || 'base'), col * CW + 6, row * CH + 36);
    }
    return sheet.toDataURL('image/png');
  }, { w: W, combos: COMBOS });
  fs.writeFileSync(path.join(OUT, 'wristzoom_' + W + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote wristzoom_' + W + '.png');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
