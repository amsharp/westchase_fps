// gripclip.js — HARD evidence for whether the FP support hand penetrates the gun.
// Poses the arms exactly as the game does (poseArmsNow = the updatePlayer path),
// then for every hand-mesh vertex casts a ray through the gun mesh: an ODD
// intersection count means the vertex is INSIDE the gun volume (clipping). Also
// renders an extreme zoom of the grip from FP + side + top + front with a big
// contact-sheet, and prints penetration stats.
// Run: NODE_PATH=... node tools/animqa/gripclip.js [weapon]
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
const OUT = path.join(__dirname, 'arms');
const W = process.argv[2] || 'auto';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate((w) => { try { __wc.startGame(); } catch (e) { __wc.start(); }
    __wc.state.hp = 100; __wc.setWanted(0); __wc.setClock(60); __wc.state.owned[w] = true; __wc.teleport(0, 300); __wc.setYaw(0); __wc.setPitch(0); }, W);
  await page.waitForFunction(() => window.__wc.handPos() !== null, { timeout: 20000 }).catch(() => {});
  const res = await page.evaluate(async (w) => {
    var T = window.THREE;
    __wc.setEquipped(w); __wc.setYaw(0); __wc.setPitch(0); __wc.poseArmsNow();
    __wc.camera.updateMatrixWorld(true);
    // locate the skinned arms mesh and the gun meshes (non-skinned) under the camera
    var cam = __wc.camera, arms = null, gunMeshes = [];
    cam.traverse(function (o) {
      if (o.isSkinnedMesh) arms = o;
    });
    // gun group = the visible viewmodel group; collect its non-skinned meshes
    var vmGrp = null;
    if (arms) { var p = arms; while (p && p.parent && p.parent !== cam) p = p.parent; vmGrp = p; }
    if (vmGrp) vmGrp.traverse(function (o) { if (o.isMesh && !o.isSkinnedMesh && o.geometry && o.geometry.attributes.position && o.visible) gunMeshes.push(o); });
    if (!arms || !gunMeshes.length) return { err: 'missing arms/gun', arms: !!arms, guns: gunMeshes.length };
    arms.updateMatrixWorld(true);
    // build a raycaster; for each LEFT-hand-ish arm vertex (world space), count
    // gun intersections along +X — odd => inside the gun volume.
    var ray = new T.Raycaster(); ray.firstHitOnly = false;
    var dir = new T.Vector3(1, 0, 0);
    var posAttr = arms.geometry.attributes.position;
    // world matrix for the skinned mesh: use skinning to get true deformed verts
    // (SkinnedMesh.boneTransform). three r149 has applyBoneTransform / boneTransform.
    var v = new T.Vector3(), inside = 0, total = 0, near = 0;
    var penPts = [];
    var boneFn = arms.applyBoneTransform ? 'applyBoneTransform' : (arms.boneTransform ? 'boneTransform' : null);
    for (var i = 0; i < posAttr.count; i++) {
      v.fromBufferAttribute(posAttr, i);
      if (boneFn) arms[boneFn](i, v); else v.applyMatrix4(arms.matrixWorld);
      if (boneFn) v.applyMatrix4(arms.matrixWorld);   // boneTransform gives local-skinned; to world
      // only sample the forward half (support hand region near the gun): z < -0.4 in cam space
      var vc = v.clone(); cam.worldToLocal(vc);
      if (vc.z > -0.35) continue;   // skip the trigger hand / forearm near camera
      total++;
      ray.set(v, dir);
      var hits = ray.intersectObjects(gunMeshes, true);
      // count hits in BOTH directions to judge enclosure: odd forward hits => inside
      if (hits.length % 2 === 1) { inside++; penPts.push([Math.round(vc.x*1000)/1000, Math.round(vc.y*1000)/1000, Math.round(vc.z*1000)/1000]); }
      // also nearest-surface proximity
      if (hits.length && hits[0].distance < 0.015) near++;
    }
    return { arms: true, guns: gunMeshes.length, sampled: total, insideGun: inside, nearSurface: near,
             penSample: penPts.slice(0, 12), boneFn: boneFn };
  }, W);
  console.log(JSON.stringify(res, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
