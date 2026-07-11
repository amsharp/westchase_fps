// fpgrid.js — clean full-frame FP screenshot at pitch 0 with a 10% measurement
// grid overlaid, for measuring viewmodel composition against ref/SPEC.md.
// Run: NODE_PATH=/opt/node22/lib/node_modules node tools/animqa/fpgrid.js [weapon] [pitch]
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
const OUT = path.join(__dirname, 'arms');
const W = process.argv[2] || 'auto';
const PITCH = parseFloat(process.argv[3] || '0');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate((w) => { try { __wc.startGame(); } catch (e) { __wc.start(); }
    __wc.state.hp = 100; __wc.setWanted(0); __wc.setClock(60); __wc.state.owned[w] = true; __wc.teleport(0, 300); __wc.setYaw(0); }, W);
  await page.waitForFunction(() => window.__wc.handPos() !== null, { timeout: 20000 }).catch(() => {});
  const url = await page.evaluate(([w, pitch]) => {
    __wc.setEquipped(w); __wc.setYaw(0); __wc.setPitch(pitch); __wc.poseArmsNow();
    __wc.camera.updateMatrixWorld(true); __wc.renderer.render(__wc.scene, __wc.camera);
    var gl = __wc.renderer.domElement;
    var c = document.createElement('canvas'); c.width = 800; c.height = 600;
    var x = c.getContext('2d'); x.drawImage(gl, 0, 0, 800, 600);
    // 10% grid
    x.strokeStyle = 'rgba(0,255,120,0.5)'; x.fillStyle = '#0f8'; x.font = '12px monospace'; x.lineWidth = 1;
    for (var i = 1; i < 10; i++) {
      x.beginPath(); x.moveTo(i * 80, 0); x.lineTo(i * 80, 600); x.stroke();
      x.beginPath(); x.moveTo(0, i * 60); x.lineTo(800, i * 60); x.stroke();
      x.fillText((i * 10) + '', i * 80 + 2, 12);
      x.fillText((i * 10) + '', 2, i * 60 - 2);
    }
    // crosshair center
    x.strokeStyle = 'rgba(255,60,60,0.9)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(400, 285); x.lineTo(400, 315); x.moveTo(385, 300); x.lineTo(415, 300); x.stroke();
    return c.toDataURL('image/png');
  }, [W, PITCH]);
  fs.writeFileSync(path.join(OUT, 'fpgrid_' + W + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote fpgrid_' + W + '.png');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
