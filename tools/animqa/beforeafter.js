// beforeafter.js — full-frame FP (gameplay scale) of the SHIPPED grip vs a
// candidate {g,w,c}, side by side, so the play view can be judged directly.
// Run: NODE_PATH=... node tools/animqa/beforeafter.js <weapon> '{"g":[..],"w":[..],"c":[..]}'
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
const OUT = path.join(__dirname, 'arms');
const W = process.argv[2] || 'auto';
const C = JSON.parse(process.argv[3] || '{}');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate((w) => { try { __wc.startGame(); } catch (e) { __wc.start(); }
    __wc.state.hp = 100; __wc.setWanted(0); __wc.setClock(60); __wc.state.owned[w] = true; __wc.teleport(0, 300); __wc.setYaw(0); __wc.setPitch(0); }, W);
  await page.waitForFunction(() => window.__wc.handPos() !== null, { timeout: 20000 }).catch(() => {});
  const url = await page.evaluate(async (args) => {
    var w = args.w, C = args.c;
    __wc.setEquipped(w); __wc.setYaw(0); __wc.setPitch(0);
    var gl = __wc.renderer.domElement;
    var CW = 800, CH = 600, sheet = document.createElement('canvas'); sheet.width = CW; sheet.height = CH * 2;
    var sx = sheet.getContext('2d');
    // BEFORE: shipped
    __wc.poseArmsNow(); __wc.camera.updateMatrixWorld(true); __wc.renderer.render(__wc.scene, __wc.camera);
    sx.drawImage(gl, 0, 0, CW, CH);
    sx.fillStyle = '#f44'; sx.font = 'bold 26px monospace'; sx.fillText('BEFORE (shipped)', 12, 34);
    // AFTER: candidate
    if (C.g) __wc.setGrip(w, C.g);
    if (C.w) { var sp = __wc.getSupPose(w).map(function (a) { return a.slice(); }); sp[3] = C.w; __wc.setSupPose(w, sp); }
    if (C.c && __wc.setLCurl) __wc.setLCurl(C.c[0], C.c[1], C.c[2]);
    __wc.poseArmsNow(); __wc.camera.updateMatrixWorld(true); __wc.renderer.render(__wc.scene, __wc.camera);
    sx.drawImage(gl, 0, CH, CW, CH);
    sx.fillStyle = '#4f4'; sx.font = 'bold 26px monospace'; sx.fillText('AFTER (draped grip)', 12, CH + 34);
    return sheet.toDataURL('image/png');
  }, { w: W, c: C });
  fs.writeFileSync(path.join(OUT, 'beforeafter_' + W + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote beforeafter_' + W + '.png');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
