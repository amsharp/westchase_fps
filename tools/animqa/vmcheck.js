// vmcheck.js — per-gun FP viewmodel verification for the no-arms build.
// Renders each gun forward-facing, saves a jpg per weapon, and (for one gun)
// fires once to confirm the muzzle flash lands at the barrel tip.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
const OUT = path.join(__dirname, 'vmshots');
const GUNS = ['pistol', 'smg', 'rifle', 'auto', 'rocket'];
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errs = [];
  page.on('pageerror', e => { errs.push('PAGEERR ' + e.message.split('\n')[0]); });
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().split('\n')[0]); });
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate(() => {
    try { __wc.startGame(); } catch (e) { __wc.start(); }
    __wc.state.hp = 100; __wc.setWanted(0); __wc.setClock(60);
    __wc.teleport(0, 300); __wc.setYaw(0); __wc.setPitch(0);
    ['pistol', 'smg', 'rifle', 'auto', 'rocket'].forEach(function (g) { __wc.state.owned[g] = true; });
  });
  await page.waitForTimeout(400);
  for (const g of GUNS) {
    const info = await page.evaluate((gun) => {
      __wc.setEquipped(gun); __wc.setYaw(0); __wc.setPitch(0);
      __wc.camera.updateMatrixWorld(true);
      __wc.renderer.render(__wc.scene, __wc.camera);
      return { flashAt: __wc.WEAPONS ? null : null };
    }, g);
    const url = await page.evaluate(() => { return __wc.renderer.domElement.toDataURL('image/jpeg', 0.9); });
    fs.writeFileSync(path.join(OUT, g + '.jpg'), Buffer.from(url.split(',')[1], 'base64'));
  }
  // muzzle-flash alignment: fire each gun once, capture, and report flash world
  // pos vs the gun's forward-most (barrel-tip) vertex world pos.
  const muzzle = {};
  for (const g of GUNS) {
    const m = await page.evaluate((gun) => {
      __wc.setEquipped(gun); __wc.setYaw(0); __wc.setPitch(0); __wc.resetCooldowns();
      __wc.camera.rotation.x = 0;
      __wc.tryAttack();
      __wc.camera.updateMatrixWorld(true);
      // flash is the only visible mesh whose name we can find via vm; grab it by
      // scanning the camera children's group named vm for a visible plane.
      var T = window.THREE;
      var flashObj = null;
      __wc.camera.traverse(function (o) { if (o.isMesh && o.geometry && o.geometry.type === 'PlaneGeometry' && o.visible && o.material && o.material.depthTest === false) flashObj = o; });
      var fw = new T.Vector3(); if (flashObj) flashObj.getWorldPosition(fw);
      // barrel tip: forward-most (min authored -x → after transform, most -z) vertex
      // across the equipped gun group meshes
      var grp = null;
      __wc.camera.traverse(function (o) { /* find equipped group later */ });
      // easier: find most-forward vertex among all visible non-flash meshes under vm
      var best = null, bestZ = 1e9, v = new T.Vector3();
      __wc.camera.traverse(function (o) {
        if (!o.isMesh || o === flashObj || !o.visible || o.geometry.type === 'PlaneGeometry') return;
        var pos = o.geometry.attributes && o.geometry.attributes.position; if (!pos) return;
        o.updateMatrixWorld(true);
        for (var i = 0; i < pos.count; i++) { v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(o.matrixWorld); if (v.z < bestZ) { bestZ = v.z; best = v.clone(); } }
      });
      __wc.renderer.render(__wc.scene, __wc.camera);
      var r3 = function (p) { return p ? [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round(p.z * 100) / 100] : null; };
      var d = (flashObj && best) ? Math.round(Math.sqrt((fw.x - best.x) * (fw.x - best.x) + (fw.y - best.y) * (fw.y - best.y) + (fw.z - best.z) * (fw.z - best.z)) * 1000) / 1000 : null;
      return { flash: r3(flashObj ? fw : null), tip: r3(best), dist: d, flashVisible: !!(flashObj && flashObj.visible) };
    }, g);
    muzzle[g] = m;
    const url = await page.evaluate(() => { return __wc.renderer.domElement.toDataURL('image/jpeg', 0.9); });
    fs.writeFileSync(path.join(OUT, g + '_fire.jpg'), Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log('MUZZLE', JSON.stringify(muzzle, null, 2));
  console.log('ERRORS', errs.length ? JSON.stringify(errs) : 'none');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
