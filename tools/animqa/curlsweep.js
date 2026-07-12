// curlsweep.js — full-frame FP of the AK for a set of (Lcurl, Rcurl) finger-curl
// combos so we can pick a relaxed-but-still-gripping hand pose.
// Run: NODE_PATH=... node tools/animqa/curlsweep.js
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
const OUT = path.join(__dirname, 'arms');
const COMBOS = JSON.parse(process.argv[2] || JSON.stringify([
  { L: [0.5, 1.0, 0.6], R: [0.68, 1.38, 0.74], t: 'current' },
  { L: [0.38, 0.75, 0.45], R: [0.48, 0.95, 0.52], t: 'relaxed' },
  { L: [0.30, 0.58, 0.38], R: [0.40, 0.78, 0.44], t: 'looser' },
  { L: [0.22, 0.44, 0.30], R: [0.32, 0.62, 0.36], t: 'loosest' }
]));
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate(() => { try { __wc.startGame(); } catch (e) { __wc.start(); }
    __wc.state.hp = 100; __wc.setWanted(0); __wc.setClock(60); __wc.state.owned.auto = true; __wc.teleport(0, 300); __wc.setYaw(0); __wc.setPitch(0); });
  await page.waitForFunction(() => window.__wc.handPos() !== null, { timeout: 20000 }).catch(() => {});
  const url = await page.evaluate(async (combos) => {
    var T = window.THREE;
    __wc.setEquipped('auto'); __wc.setYaw(0); __wc.setPitch(0);
    var gl = __wc.renderer.domElement, cam = __wc.camera;
    var CW = 800, CH = 600, sheet = document.createElement('canvas'); sheet.width = CW * 2; sheet.height = CH * Math.ceil(combos.length / 2);
    var sx = sheet.getContext('2d');
    // a tight cam near the eye zoomed on the hands for a second row per combo? keep full FP for now
    for (var i = 0; i < combos.length; i++) {
      var C = combos[i];
      __wc.setLCurl(C.L[0], C.L[1], C.L[2]); __wc.setRCurl(C.R[0], C.R[1], C.R[2]);
      __wc.poseArmsNow(); cam.updateMatrixWorld(true); __wc.renderer.render(__wc.scene, cam);
      var cx = (i % 2) * CW, cy = ((i / 2) | 0) * CH;
      sx.drawImage(gl, cx, cy, CW, CH);
      sx.fillStyle = '#0f0'; sx.font = 'bold 22px monospace';
      sx.fillText(C.t + ' L' + JSON.stringify(C.L), cx + 8, cy + 26);
      sx.fillText('R' + JSON.stringify(C.R), cx + 8, cy + 50);
    }
    return sheet.toDataURL('image/png');
  }, COMBOS);
  fs.writeFileSync(path.join(OUT, 'curlsweep.png'), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote curlsweep.png');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
