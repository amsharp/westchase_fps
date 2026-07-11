// tools/animqa/gemini/snap.js — FREE offline visual check: render a single
// idle frame of a weapon viewmodel to a JPEG so the composition/grip can be
// inspected (via Read) without spending a Gemini review. Uses the same
// off-screen-RT capture path as record.js (works under swiftshader).
//
// Run: NODE_PATH=/opt/node22/lib/node_modules node snap.js <weapon> [out.jpg] [applyExpr]
//   weapon: auto|smg|rifle|rocket|pistol   applyExpr: page JS run once after setup
// Out: <out.jpg> (default clips/snap_<weapon>.jpg)
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../../index.html');
const W = parseInt(process.env.WIDTH || '640', 10), H = Math.round(W * 0.75);
const WPN = process.argv[2] || 'auto';
const OUT = process.argv[3] || path.join(__dirname, 'clips', 'snap_' + WPN + '.jpg');
const APPLY = process.argv[4] || '';

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.addInitScript(() => { window.requestAnimationFrame = function () { return 0; }; });
  page.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate(() => { try { __wc.startGame(); } catch (e) { __wc.start(); }
    __wc.state.hp = 100; __wc.setWanted(0); __wc.setClock(60); });
  await page.evaluate((w) => { for (var i = 0; i < 20; i++) __wc.tick(1 / 60);
    __wc.state.owned[w] = true; __wc.setEquipped(w);
    __wc.teleport(0, 300); __wc.setYaw(0); __wc.setPitch(0); }, WPN);
  if (APPLY) await page.evaluate(APPLY);
  await page.evaluate(() => { for (var i = 0; i < 30; i++) __wc.tick(1 / 60); });
  const b64 = await page.evaluate(({ W, H, fire }) => {
    var R = __wc.renderer;
    var rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    var pix = new Uint8Array(W * H * 4), flip = new Uint8Array(W * H * 4), rw = W * 4;
    var m = document.createElement('canvas'); m.width = W; m.height = H;
    var ctx = m.getContext('2d'); var img = ctx.createImageData(W, H);
    R.setRenderTarget(rt);
    if (fire) { __wc.resetCooldowns && __wc.resetCooldowns(); __wc.tryAttack(); }
    __wc.tick(1 / 120);
    R.readRenderTargetPixels(rt, 0, 0, W, H, pix); R.setRenderTarget(null);
    for (var y = 0; y < H; y++) flip.set(pix.subarray((H - 1 - y) * rw, (H - y) * rw), y * rw);
    img.data.set(flip); ctx.putImageData(img, 0, 0);
    return m.toDataURL('image/jpeg', 0.8).split(',')[1];
  }, { W, H, fire: !!process.env.FIRE });
  fs.writeFileSync(OUT, Buffer.from(b64, 'base64'));
  console.log('wrote', OUT);
  await browser.close();
})().catch(e => { console.error('FATAL', String(e).split('\n')[0]); process.exit(1); });
