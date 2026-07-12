// allguns.js — full-frame FP of all long guns in a 2x2, source values, to check
// the draped support grip across weapons at gameplay scale.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
const OUT = path.join(__dirname, 'arms');
const GUNS = process.argv.slice(2).length ? process.argv.slice(2) : ['auto', 'smg', 'rifle', 'rocket'];
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate(() => { try { __wc.startGame(); } catch (e) { __wc.start(); }
    __wc.state.hp = 100; __wc.setWanted(0); __wc.setClock(60); __wc.teleport(0, 300); __wc.setYaw(0); __wc.setPitch(0);
    ['auto','smg','rifle','rocket'].forEach(function(g){ __wc.state.owned[g]=true; }); });
  await page.waitForFunction(() => window.__wc.handPos() !== null, { timeout: 20000 }).catch(() => {});
  const url = await page.evaluate(async (guns) => {
    var CW = 800, CH = 600, sheet = document.createElement('canvas'); sheet.width = CW * 2; sheet.height = CH * 2;
    var sx = sheet.getContext('2d'), gl = __wc.renderer.domElement;
    for (var i = 0; i < guns.length; i++) {
      __wc.setEquipped(guns[i]); __wc.setYaw(0); __wc.setPitch(0); __wc.poseArmsNow(); __wc.camera.updateMatrixWorld(true);
      __wc.renderer.render(__wc.scene, __wc.camera);
      var cx = (i % 2) * CW, cy = ((i / 2) | 0) * CH;
      sx.drawImage(gl, cx, cy, CW, CH);
      sx.fillStyle = '#0f0'; sx.font = 'bold 26px monospace'; sx.fillText(guns[i].toUpperCase(), cx + 12, cy + 34);
    }
    return sheet.toDataURL('image/png');
  }, GUNS);
  fs.writeFileSync(path.join(OUT, 'allguns.png'), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote allguns.png');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
