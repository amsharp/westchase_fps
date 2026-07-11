// wristscan.js — the support hand sits BESIDE the gun (fist channel perpendicular
// to the barrel) instead of wrapping it. Sweep the wrist euler (SUPPORT_POSE
// bone 27) at a fixed grip target and measure penetration (inside=bad) vs surface
// contact (near=good). A real wrap = LOW inside + HIGH near. Prints a ranked table.
// Run: NODE_PATH=... node tools/animqa/wristscan.js <weapon> <gx> <gy> <gz>
const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
const W = process.argv[2] || 'auto';
const GRIP = [parseFloat(process.argv[3] || '0.16'), parseFloat(process.argv[4] || '-0.02'), parseFloat(process.argv[5] || '-0.70')];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate((w) => { try { __wc.startGame(); } catch (e) { __wc.start(); }
    __wc.state.hp = 100; __wc.setWanted(0); __wc.setClock(60); __wc.state.owned[w] = true; __wc.teleport(0, 300); __wc.setYaw(0); __wc.setPitch(0); }, W);
  await page.waitForFunction(() => window.__wc.handPos() !== null, { timeout: 20000 }).catch(() => {});
  const out = await page.evaluate(async (args) => {
    var w = args.w, grip = args.grip, T = window.THREE;
    __wc.setEquipped(w); __wc.setYaw(0); __wc.setPitch(0); __wc.setGrip(w, grip);
    var base = __wc.getSupPose(w).map(function (a) { return a.slice(); });
    function measure() {
      __wc.poseArmsNow(); __wc.camera.updateMatrixWorld(true);
      var cam = __wc.camera, arms = null; cam.traverse(function (o) { if (o.isSkinnedMesh) arms = o; });
      var vg = arms; while (vg && vg.parent && vg.parent !== cam) vg = vg.parent;
      var guns = []; if (vg) vg.traverse(function (o) { if (o.isMesh && !o.isSkinnedMesh && o.geometry && o.visible) guns.push(o); });
      arms.updateMatrixWorld(true);
      var ray = new T.Raycaster(), dir = new T.Vector3(1, 0, 0), pos = arms.geometry.attributes.position, v = new T.Vector3(), vc = new T.Vector3();
      var inside = 0, near = 0, bf = arms.boneTransform ? 'boneTransform' : 'applyBoneTransform';
      for (var i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i); arms[bf](i, v); v.applyMatrix4(arms.matrixWorld); vc.copy(v); cam.worldToLocal(vc);
        if (vc.z > -0.35) continue;
        ray.set(v, dir); var h = ray.intersectObjects(guns, true);
        if (h.length % 2 === 1) inside++; else if (h.length && h[0].distance < 0.018) near++;
      }
      return { inside: inside, near: near };
    }
    var rows = [];
    // sweep wrist euler (entry 3 = bone 27) around the base
    var b = base[3];
    for (var dx = -1.2; dx <= 1.2; dx += 0.6)
      for (var dy = -1.2; dy <= 1.2; dy += 0.6)
        for (var dz = -1.2; dz <= 1.2; dz += 0.6) {
          var e = [ +(b[0]+dx).toFixed(2), +(b[1]+dy).toFixed(2), +(b[2]+dz).toFixed(2) ];
          var sp = base.map(function (a) { return a.slice(); }); sp[3] = e;
          __wc.setSupPose(w, sp);
          var m = measure();
          rows.push({ e: e, inside: m.inside, near: m.near });
        }
    rows.sort(function (a, b) { return (a.inside - b.inside) || (b.near - a.near); });
    return { base: b, rows: rows.slice(0, 20) };
  }, { w: W, grip: GRIP });
  console.log('grip', JSON.stringify(GRIP), 'base wrist', JSON.stringify(out.base));
  console.log('wrist-euler'.padEnd(22), 'inside', 'near');
  out.rows.forEach(function (r) { console.log(JSON.stringify(r.e).padEnd(22), String(r.inside).padStart(6), String(r.near).padStart(5)); });
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
