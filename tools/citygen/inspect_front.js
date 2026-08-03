// Render building families head-on from the 4 cardinal directions, whole building
// framed, to find which local face carries the storefront/entrance (the "front").
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const OUT = path.resolve(__dirname, 'shots'); if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage(); await p.setViewportSize({ width: 700, height: 760 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '../../index.html'), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 90000 });
  await p.evaluate(() => { __wc.start(); if (__wc.setClock) __wc.setClock(180); });
  await p.waitForTimeout(1200);
  const models = ['brick1', 'citybiz1', 'citybiz4', 'office1', 'highrise1'];
  await p.evaluate((models) => {
    window.__insp = [];
    models.forEach(function (id, k) {
      var placed = __wc.placeCatalogModel(id, 300 + k * 80, -300, 0, 10, null);
      window.__insp.push({ id: id, x: 300 + k * 80, z: -300, H: placed ? placed.H : 0, W: placed ? placed.W : 10, D: placed ? placed.D : 10 });
    });
  }, models);
  await p.evaluate(async () => { for (let i = 0; i < 40; i++) { __wc.setClock && __wc.setClock(180); __wc.tick(1 / 30); await new Promise(r => setTimeout(r, 12)); } });
  const insp = await p.evaluate(() => window.__insp);
  const dirs = { PZ: [0, 0, 1], PX: [1, 0, 0], NZ: [0, 0, -1], NX: [-1, 0, 0] };
  for (const info of insp) {
    for (const dn in dirs) {
      const d = dirs[dn];
      const url = await p.evaluate((a) => {
        const T = window.THREE, cam = new T.PerspectiveCamera(38, 700 / 760, 0.5, 4000);
        const dist = a.H * 1.7 + 20;
        cam.position.set(a.x + a.d[0] * dist, a.H * 0.45, a.z + a.d[2] * dist);
        cam.up.set(0, 1, 0); cam.lookAt(a.x, a.H * 0.42, a.z);
        const sf = __wc.scene.fog; __wc.scene.fog = null; __wc.renderer.render(__wc.scene, cam); __wc.scene.fog = sf;
        return __wc.renderer.domElement.toDataURL('image/png');
      }, { x: info.x, z: info.z, H: info.H, d });
      fs.writeFileSync(path.join(OUT, 'ff_' + info.id + '_' + dn + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    }
    console.log('rendered', info.id, 'W', info.W.toFixed(1), 'D', info.D.toFixed(1), 'H', info.H.toFixed(1));
  }
  console.log('errs', errs.length);
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
