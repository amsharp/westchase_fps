// gripscan.js — objective grip search. For a grid of GRIP_TGT candidates (and
// optionally wrist-roll seeds), pose the arms the way the game does and measure
// (a) how many support-hand vertices are INSIDE the gun volume (penetration, want 0)
// and (b) how many are within 1.5cm of the gun surface (contact, want high).
// Prints a ranked table so we pick a grip that TOUCHES without CLIPPING.
// Run: NODE_PATH=... node tools/animqa/gripscan.js <weapon> '[[x,y,z],...]'
const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
const W = process.argv[2] || 'auto';
const CANDS = JSON.parse(process.argv[3] || 'null');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate((w) => { try { __wc.startGame(); } catch (e) { __wc.start(); }
    __wc.state.hp = 100; __wc.setWanted(0); __wc.setClock(60); __wc.state.owned[w] = true; __wc.teleport(0, 300); __wc.setYaw(0); __wc.setPitch(0); }, W);
  await page.waitForFunction(() => window.__wc.handPos() !== null, { timeout: 20000 }).catch(() => {});
  const out = await page.evaluate(async (args) => {
    var w = args.w, cands = args.cands, T = window.THREE;
    __wc.setEquipped(w); __wc.setYaw(0); __wc.setPitch(0);
    if (!cands) {
      // default grid around the current grip: x 0.12..0.24, y -0.05..0.10, z -0.58..-0.80
      cands = [];
      for (var gz = -0.58; gz >= -0.82; gz -= 0.06)
        for (var gy = -0.06; gy <= 0.10; gy += 0.05)
          for (var gx = 0.12; gx <= 0.24; gx += 0.04) cands.push([+gx.toFixed(2), +gy.toFixed(2), +gz.toFixed(2)]);
    }
    function measure() {
      __wc.poseArmsNow(); __wc.camera.updateMatrixWorld(true);
      var cam = __wc.camera, arms = null; cam.traverse(function (o) { if (o.isSkinnedMesh) arms = o; });
      var vmGrp = arms; while (vmGrp && vmGrp.parent && vmGrp.parent !== cam) vmGrp = vmGrp.parent;
      var guns = []; if (vmGrp) vmGrp.traverse(function (o) { if (o.isMesh && !o.isSkinnedMesh && o.geometry && o.visible) guns.push(o); });
      arms.updateMatrixWorld(true);
      var ray = new T.Raycaster(), dir = new T.Vector3(1, 0, 0);
      var pos = arms.geometry.attributes.position, v = new T.Vector3(), vc = new T.Vector3();
      var inside = 0, near = 0, tot = 0;
      var bf = arms.boneTransform ? 'boneTransform' : 'applyBoneTransform';
      for (var i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i); arms[bf](i, v); v.applyMatrix4(arms.matrixWorld);
        vc.copy(v); cam.worldToLocal(vc);
        if (vc.z > -0.35) continue;   // support-hand region only
        tot++;
        ray.set(v, dir); var hits = ray.intersectObjects(guns, true);
        if (hits.length % 2 === 1) inside++;
        else if (hits.length && hits[0].distance < 0.018) near++;
      }
      return { inside: inside, near: near, tot: tot };
    }
    var rows = [];
    for (var c = 0; c < cands.length; c++) {
      __wc.setGrip(w, cands[c]);
      var m = measure();
      rows.push({ g: cands[c], inside: m.inside, near: m.near, tot: m.tot });
    }
    // rank: penetration first (want 0), then contact (want high)
    rows.sort(function (a, b) { return (a.inside - b.inside) || (b.near - a.near); });
    return rows;
  }, { w: W, cands: CANDS });
  console.log('grip'.padEnd(22), 'inside', 'near', 'tot');
  out.slice(0, 18).forEach(function (r) {
    console.log(JSON.stringify(r.g).padEnd(22), String(r.inside).padStart(6), String(r.near).padStart(4), String(r.tot).padStart(4));
  });
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
