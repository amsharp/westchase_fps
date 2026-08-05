// render the new rifle: FP viewmodel + dropped pickup, to verify orientation/proportions
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const OUT = path.resolve(__dirname, 'shots'); if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage(); await p.setViewportSize({ width: 900, height: 640 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '../../index.html'), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 300000 });
  await p.evaluate(() => { __wc.start(); if (__wc.setClock) __wc.setClock(180); });
  await p.evaluate(async () => { for (let i = 0; i < 12; i++) { __wc.setClock && __wc.setClock(180); __wc.tick(1 / 30); await new Promise(r => setTimeout(r, 20)); } });

  // 1) FP viewmodel: equip rifle, force the viewmodel visible, look level, render main cam
  const fp = await p.evaluate(() => {
    __wc.teleport(300, 300); __wc.player.y = 1.7;
    __wc.setEquipped('rifle');
    var vm = __wc.camera.children.find(c => c.type === 'Group');   // the vm group parented to camera
    __wc.camera.rotation.set(0, 0, 0);
    __wc.tick(1 / 30);
    var sf = __wc.scene.fog; __wc.scene.fog = null; __wc.renderer.render(__wc.scene, __wc.camera); __wc.scene.fog = sf;
    return __wc.renderer.domElement.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(OUT, 'rifle_fp.png'), Buffer.from(fp.split(',')[1], 'base64'));

  // 2) dropped pickup model: drop one, aim a fresh camera at it from the side
  const drop = await p.evaluate(() => {
    __wc.teleport(300, 300); __wc.player.y = 1.7;
    __wc.dropWeapon('rifle', 306, 300);
    // find the drop's world position
    var ds = __wc.drops, d = null;
    for (var i = 0; i < ds.length; i++) { var e = ds[i]; if (e.kind === 'rifle' || (e.g && Math.hypot((e.x||0)-306,(e.z||0)-300) < 3)) { d = e; break; } }
    if (!d) d = ds[ds.length - 1];
    var g = d && (d.g || d.mesh); if (g) g.updateMatrixWorld(true);
    var wp = new THREE.Vector3(); if (g) g.getWorldPosition(wp); else wp.set(306, 1, 300);
    var T = window.THREE, cam = new T.PerspectiveCamera(40, 900 / 640, 0.1, 400);
    cam.position.set(wp.x + 2.2, wp.y + 1.0, wp.z + 2.2); cam.up.set(0, 1, 0); cam.lookAt(wp.x, wp.y, wp.z);
    var sf = __wc.scene.fog; __wc.scene.fog = null; __wc.renderer.render(__wc.scene, cam); __wc.scene.fog = sf;
    return { url: __wc.renderer.domElement.toDataURL('image/png'), found: !!g, wy: wp.y };
  });
  fs.writeFileSync(path.join(OUT, 'rifle_drop.png'), Buffer.from(drop.url.split(',')[1], 'base64'));

  console.log('drop found', drop.found, 'wy', drop.wy, '| pageerrors', errs.length);
  errs.slice(0, 5).forEach(e => console.log('  ERR:', e));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
