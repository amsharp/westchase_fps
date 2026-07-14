// muzcheck.js — confirm the muzzle flash lands on the true barrel BORE for each
// gun. Replicates meshyMuzzleAt (forward-most authored local -x vertex, ring-
// averaged) in-page and compares to the live flash world position after firing.
const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
const GUNS = ['pistol', 'smg', 'rifle', 'auto'];   // rocket has no flash sprite (fires a projectile)
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate(() => {
    try { __wc.startGame(); } catch (e) { __wc.start(); }
    __wc.state.hp = 100; __wc.setWanted(0); __wc.setClock(60);
    __wc.teleport(0, 300); __wc.setYaw(0); __wc.setPitch(0);
    ['pistol', 'smg', 'rifle', 'auto'].forEach(function (g) { __wc.state.owned[g] = true; });
  });
  await page.waitForTimeout(300);
  const res = await page.evaluate((guns) => {
    var T = window.THREE, out = {};
    guns.forEach(function (gun) {
      __wc.setEquipped(gun); __wc.setYaw(0); __wc.setPitch(0); __wc.camera.rotation.x = 0; __wc.resetCooldowns();
      __wc.state.hp = 100; __wc.setWanted(0);
      // settle: run enough frames for the 0.45s draw animation to finish so the
      // gun group sits at its rest VM_LIFT (no rack-anim displacement) before we fire
      for (var s = 0; s < 45; s++) { __wc.state.hp = 100; __wc.tick(0.016); }
      __wc.setYaw(0); __wc.setPitch(0); __wc.camera.rotation.x = 0; __wc.resetCooldowns();
      __wc.camera.updateMatrixWorld(true);
      // the equipped visible gun group under the camera (skip the flash plane)
      __wc.tryAttack();
      __wc.camera.updateMatrixWorld(true);
      var flashObj = null;
      __wc.camera.traverse(function (o) { if (o.isMesh && o.geometry.type === 'PlaneGeometry' && o.material && o.material.depthTest === false && o.visible) flashObj = o; });
      var fw = new T.Vector3(); if (flashObj) flashObj.getWorldPosition(fw);
      function worldVisible(o) { for (var p = o; p; p = p.parent) if (!p.visible) return false; return true; }
      // bore = forward-most authored-x vertex (min x), ring-averaged in world — exactly meshyMuzzleAt
      // scope to the truly-visible gun group only; skip skinned (arms) + planes.
      var minlx = 1e9, meshes = [];
      __wc.camera.traverse(function (o) {
        if (!o.isMesh || o.isSkinnedMesh || o === flashObj) return;
        if (o.geometry.type === 'PlaneGeometry' || !worldVisible(o)) return;
        var pos = o.geometry.attributes && o.geometry.attributes.position; if (!pos) return;
        o.updateMatrixWorld(true); meshes.push(o);
        for (var i = 0; i < pos.count; i++) if (pos.getX(i) < minlx) minlx = pos.getX(i);
      });
      var bx = 0, by = 0, bz = 0, n = 0, v = new T.Vector3();
      meshes.forEach(function (o) {
        var pos = o.geometry.attributes.position;
        for (var i = 0; i < pos.count; i++) if (pos.getX(i) <= minlx + 0.02) { v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(o.matrixWorld); bx += v.x; by += v.y; bz += v.z; n++; }
      });
      var r = function (a) { return Math.round(a * 1000) / 1000; };
      var d = n && flashObj ? Math.sqrt((fw.x - bx / n) * (fw.x - bx / n) + (fw.y - by / n) * (fw.y - by / n) + (fw.z - bz / n) * (fw.z - bz / n)) : null;
      out[gun] = { flashVisible: !!(flashObj && flashObj.visible), boreDist_m: d == null ? null : r(d), flash: flashObj ? [r(fw.x), r(fw.y), r(fw.z)] : null, bore: n ? [r(bx / n), r(by / n), r(bz / n)] : null };
    });
    return out;
  }, GUNS);
  console.log(JSON.stringify(res, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
