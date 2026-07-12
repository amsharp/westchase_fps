// gripfp.js — render the FULL-FRAME FP view for a set of LEFT-hand grip targets,
// gridded, composited so we judge the grip at true gameplay scale.
// Run: NODE_PATH=... node tools/animqa/gripfp.js [weapon] '[[y,z,..],...]'
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
const OUT = path.join(__dirname, 'arms');
const W = process.argv[2] || 'auto';
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
  const CANDS = JSON.parse(process.argv[3] || JSON.stringify([
    [0.22, -0.08, -0.72], [0.20, 0.00, -0.70], [0.18, 0.05, -0.66], [0.16, 0.08, -0.62]
  ]));
  const url = await page.evaluate(async (args) => {
    var w = args.w, cands = args.cands, T = window.THREE;
    __wc.setEquipped(w); __wc.setYaw(0); __wc.setPitch(0);
    var COLS = 2, ROWS = Math.ceil(cands.length / 2), CW = 800, CH = 600;
    var sheet = document.createElement('canvas'); sheet.width = CW * COLS; sheet.height = CH * ROWS;
    var sx = sheet.getContext('2d');
    var gl = __wc.renderer.domElement;
    for (var r = 0; r < cands.length; r++) {
      __wc.setGrip(w, cands[r]); __wc.poseArmsNow(); __wc.camera.updateMatrixWorld(true);
      __wc.renderer.render(__wc.scene, __wc.camera);
      var cx = (r % 2) * CW, cy = ((r / 2) | 0) * CH;
      sx.drawImage(gl, cx, cy, CW, CH);
      // grid + crosshair
      sx.strokeStyle = 'rgba(0,255,120,0.4)'; sx.lineWidth = 1;
      for (var i = 1; i < 10; i++) { sx.beginPath(); sx.moveTo(cx + i * 80, cy); sx.lineTo(cx + i * 80, cy + 600); sx.stroke(); sx.beginPath(); sx.moveTo(cx, cy + i * 60); sx.lineTo(cx + 800, cy + i * 60); sx.stroke(); }
      sx.strokeStyle = 'rgba(255,60,60,0.9)'; sx.lineWidth = 2;
      sx.beginPath(); sx.moveTo(cx + 400, cy + 288); sx.lineTo(cx + 400, cy + 312); sx.moveTo(cx + 388, cy + 300); sx.lineTo(cx + 412, cy + 300); sx.stroke();
      sx.fillStyle = '#0f0'; sx.font = 'bold 22px monospace'; sx.fillText('grip=' + JSON.stringify(cands[r]), cx + 8, cy + 26);
    }
    return sheet.toDataURL('image/png');
  }, { w: W, cands: CANDS });
  fs.writeFileSync(path.join(OUT, 'gripfp_' + W + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote gripfp_' + W + '.png');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
