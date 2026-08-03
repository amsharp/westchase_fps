// minimal headless boot check: load the game, confirm __wc comes up with no page
// errors, then render ONE oblique of downtown. Generous timeouts for the big map.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const OUT = path.resolve(__dirname, 'shots'); if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage(); await p.setViewportSize({ width: 1280, height: 800 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '../../index.html'), { waitUntil: 'domcontentloaded', timeout: 120000 });
  console.log('DOM loaded, waiting for __wc...');
  await p.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 300000 });
  console.log('__wc up. pageerrors so far:', errs.length);
  errs.slice(0, 5).forEach(e => console.log('  ERR:', e));
  const info = await p.evaluate(() => {
    __wc.start(); if (__wc.setClock) __wc.setClock(180);
    return { foundSlabs: window.__foundSlabs, cityBuildings: __wc.cityBuildings ? __wc.cityBuildings().length : 'n/a' };
  });
  console.log('foundation slabs:', info.foundSlabs, '| city buildings:', info.cityBuildings);
  await p.evaluate(async () => { for (let i = 0; i < 20; i++) { __wc.setClock && __wc.setClock(180); __wc.tick(1 / 30); await new Promise(r => setTimeout(r, 25)); } });
  const V = [
    { name: 'oblique_center', eye: [2086, 420, 2560], look: [2086, 40, 2170], fov: 60 },
    { name: 'block_low', eye: [2300, 70, 2380], look: [2280, 6, 2200], fov: 62 },
    { name: 'block_low2', eye: [2200, 55, 1950], look: [2200, 6, 2120], fov: 62 }
  ];
  for (const v of V) {
    const url = await p.evaluate((v) => {
      const T = window.THREE, cam = new T.PerspectiveCamera(v.fov, 1280 / 800, 0.5, 6000);
      cam.position.set(v.eye[0], v.eye[1], v.eye[2]); cam.up.set(0, 1, 0); cam.lookAt(v.look[0], v.look[1], v.look[2]);
      const sf = __wc.scene.fog; __wc.scene.fog = null; __wc.renderer.render(__wc.scene, cam); __wc.scene.fog = sf;
      return __wc.renderer.domElement.toDataURL('image/png');
    }, v);
    fs.writeFileSync(path.join(OUT, v.name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', v.name);
  }
  console.log('FINAL pageerrors:', errs.length);
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
