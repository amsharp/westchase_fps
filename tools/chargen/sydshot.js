// Render SYD (skinned) front + back to verify the in-game look.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const OUT = path.resolve(__dirname, 'shots'); if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage(); await p.setViewportSize({ width: 500, height: 760 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '../../index.html'), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 300000 });
  await p.evaluate(() => { __wc.start(); __wc.setClock && __wc.setClock(180); });

  const info = await p.evaluate(() => {
    var T = window.THREE;
    // SYD is the last MESHY_CHARS entry; build her skinned mesh directly
    var idx = (typeof MESHY_CHARS !== 'undefined') ? MESHY_CHARS.findIndex(c => c.n === 'SYD') : -1;
    var mesh = __wc.buildMeshySkinned(__wc.randomCharConfig(), idx);
    mesh.position.set(0, 0, 0);
    var sc = new T.Scene(); sc.background = new T.Color(0xdfe6ea);
    sc.add(new T.HemisphereLight(0xffffff, 0x556070, 1.3));
    var dl = new T.DirectionalLight(0xffffff, 0.9); dl.position.set(2, 4, 3); sc.add(dl);
    sc.add(mesh);
    window.__sydMesh = mesh; window.__sydScene = sc; window.__sydIdx = idx;
    return { idx: idx };
  });

  for (const view of [{ n: 'front', z: 3.4 }, { n: 'back', z: -3.4 }]) {
    const url = await p.evaluate((v) => {
      var T = window.THREE;
      var cam = new T.PerspectiveCamera(32, 500 / 760, 0.1, 100);
      cam.position.set(0.0, 1.0, v.z); cam.up.set(0, 1, 0); cam.lookAt(0, 0.95, 0);
      __wc.renderer.render(window.__sydScene, cam);
      return __wc.renderer.domElement.toDataURL('image/png');
    }, view);
    fs.writeFileSync(path.join(OUT, 'SYD_' + view.n + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log('SYD meshy index:', info.idx, '| pageerrors:', errs.length);
  errs.slice(0, 5).forEach(e => console.log('  ERR:', e));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
