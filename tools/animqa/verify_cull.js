// verify: NPC count doubled + off-screen characters frustum-cull (bounded draw calls).
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 940, height: 588 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve('/home/user/wc-current/index.html'), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  const r = await p.evaluate(() => {
    __wc.start(); __wc.state.hp = 100; __wc.setWanted(0); __wc.setClock(60);
    // ISOLATION TEST: cluster every NPC at one spot on open ground, away from
    // world geometry, so draw-call delta between facing-toward vs facing-away is
    // purely the characters. If frustum culling works, facing away drops them.
    var CX = 250, CZ = 250;
    for (var i = 0; i < __wc.npcs.length; i++) { var n = __wc.npcs[i]; if (!n.mesh) continue;
      n.x = CX + (i % 20) * 0.6 - 6; n.z = CZ + ((i / 20) | 0) * 0.6; n.state = 'stand';
      n.mesh.position.set(n.x, 0, n.z); n.mesh.visible = true; n.mesh.updateMatrixWorld(true); }
    __wc.teleport(CX, CZ - 14); __wc.setPitch(-0.02);   // stand just south of the cluster
    __wc.scene.updateMatrixWorld(true);
    function measure(yaw) {
      __wc.setYaw(yaw); __wc.camera.updateMatrixWorld(true);
      __wc.renderer.info.autoReset = false; __wc.renderer.info.reset();
      __wc.renderer.render(__wc.scene, __wc.camera);
      return { calls: __wc.renderer.info.render.calls, tris: __wc.renderer.info.render.triangles };
    }
    var skinnedInScene = 0; __wc.scene.traverse(function (o) { if (o.isSkinnedMesh) skinnedInScene++; });
    var toward = measure(0);          // yaw 0 looks -z → toward cluster at +z? actually toward decreasing z
    var toward2 = measure(Math.PI);   // yaw PI looks +z → toward the cluster (cluster is north/+z of player)
    var away = measure(0);            // yaw 0 → away from cluster
    var up = measure(Math.PI); // placeholder
    // decisive pair: face the cluster (PI) vs face away (0)
    return { npcCount: __wc.npcs.length, skinnedInScene: skinnedInScene,
             faceCluster: toward2, faceAway: away };
  });
  console.log('npcCount:', r.npcCount, '| skinnedMeshesInScene:', r.skinnedInScene);
  console.log('facing CLUSTER  — calls:', r.faceCluster.calls, 'tris:', r.faceCluster.tris);
  console.log('facing AWAY     — calls:', r.faceAway.calls, 'tris:', r.faceAway.tris);
  console.log('=> calls culled by looking away:', r.faceCluster.calls - r.faceAway.calls, '(should be ~hundreds if NPC bodies cull)');
  console.log('page errors:', errs.length, JSON.stringify(errs.slice(0,5)));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
