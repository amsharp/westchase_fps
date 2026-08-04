// verify: textures applied, foundations lift movers, props lifted; render a low
// street view in the downtown to eyeball concrete/grass + props on foundations.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const OUT = path.resolve(__dirname, 'shots'); if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage(); await p.setViewportSize({ width: 1100, height: 760 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '../../index.html'), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.__wc && window.__wc.foundAt, { timeout: 300000 });
  const r = await p.evaluate(() => {
    __wc.start(); if (__wc.setClock) __wc.setClock(180);
    var cb = __wc.cityBuildings(), out = { slabs: window.__foundSlabs, grassImg: __wc.grassIsImg(), concImg: __wc.concIsImg() };
    // pick a downtown building; foundation should read FOUND_H at its footprint
    var b0 = cb[10];
    out.foundAtBldg = +__wc.foundAt(b0.x, b0.z).toFixed(2);
    out.surfAtBldgGround = +__wc.surfAt(b0.x, b0.z, 0.2).toFixed(2);   // a mover at ground rides up onto the pad
    // breakables in the downtown box that got lifted
    var bk = __wc.breakables, lifted = 0, onFound = 0;
    for (var i = 0; i < bk.length; i++) {
      var q = bk[i]; if (q.x < 1632 || q.x > 2860 || q.z < 1474 || q.z > 2689) continue;
      var fh = __wc.foundAt(q.x, q.z);
      if (fh > 0.001) { onFound++; if (q.g.position.y >= fh - 0.01) lifted++; }
    }
    out.downtownBreakablesOnFound = onFound; out.ofThoseLifted = lifted;
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('pageerrors:', errs.length); errs.slice(0, 4).forEach(e => console.log(' ERR', e));
  // find a foundation edge near a road to place a street-level camera
  await p.evaluate(async () => { for (let i = 0; i < 20; i++) { __wc.setClock && __wc.setClock(180); __wc.tick(1 / 30); await new Promise(r => setTimeout(r, 25)); } });
  const V = [
    { name: 'tex_street', eye: [2120, 5, 2110], look: [2260, 8, 2110], fov: 74 },
    { name: 'tex_block', eye: [2320, 45, 2360], look: [2300, 5, 2210], fov: 62 }
  ];
  for (const v of V) {
    const url = await p.evaluate((v) => {
      const T = window.THREE, cam = new T.PerspectiveCamera(v.fov, 1100 / 760, 0.4, 6000);
      cam.position.set(v.eye[0], v.eye[1], v.eye[2]); cam.up.set(0, 1, 0); cam.lookAt(v.look[0], v.look[1], v.look[2]);
      const sf = __wc.scene.fog; __wc.scene.fog = null; __wc.renderer.render(__wc.scene, cam); __wc.scene.fog = sf;
      return __wc.renderer.domElement.toDataURL('image/png');
    }, v);
    fs.writeFileSync(path.join(OUT, v.name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', v.name);
  }
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
