// INVISIBLE-BARRIER SCANNER — map-wide audit of colliders vs visible geometry.
// A collider is flagged ORPHAN if no visible mesh stands inside its bounds
// (nothing above y=0.3 at sampled points). Run: NODE_PATH=/opt/node22/lib/node_modules
//   node tools/_barrierscan.js [outJson]
// Output: JSON { orphans:[{cx,cz,x0..z1,w,d,tags}], checked, justified, ms }.
// Used as a pre-ship gate: orphans must be [] (or every entry acked in TRIAGE.md).
var pw = require('playwright');
var fs = require('fs');
var OUT = process.argv[2] || '/tmp/claude-0/-home-user-westchase-fps/efaef73e-76aa-5d75-8d6c-935e41bd5d2d/scratchpad/barrierscan.json';

(async function () {
  var browser = await pw.chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage']
  });
  var page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  page.on('pageerror', function (e) { console.log('PAGEERR', e.message); });
  await page.goto('http://127.0.0.1:8155/index.html', { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(function () { return window.__wc && __wc.colliders && __wc.scene; }, null, { polling: 300, timeout: 300000 });

  var res = await page.evaluate(function () {
    var t0 = performance.now();
    var THREE_ = window.THREE;
    var cols = __wc.colliders;
    var scene = __wc.scene;

    // ---- collect visible meshes once, with cached world Box3 ----
    var meshes = [];
    scene.updateMatrixWorld(true);
    scene.traverse(function (o) {
      if (!o.isMesh || !o.visible) return;
      var p = o; var vis = true;
      while (p) { if (p.visible === false) { vis = false; break; } p = p.parent; }
      if (!vis) return;
      if (o.material && o.material.transparent && o.material.opacity !== undefined && o.material.opacity < 0.15) return;
      if (!o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      var bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      meshes.push({ m: o, bb: bb, big: (bb.max.x - bb.min.x) * (bb.max.z - bb.min.z) > 4000 });
    });

    // ---- registries that justify a collider without raycasting ----
    var just = []; // list of {x0,x1,z0,z1}
    function addJ(x0, x1, z0, z1) { just.push({ x0: x0, x1: x1, z0: z0, z1: z1 }); }
    if (window.mapBuildings || __wc.mapBuildings) {
      var mb = window.mapBuildings || __wc.mapBuildings;
      for (var i = 0; i < mb.length; i++) {
        var b = mb[i];
        if (b.x !== undefined && b.w !== undefined) addJ(b.x - b.w / 2 - 1, b.x + b.w / 2 + 1, b.z - b.d / 2 - 1, b.z + b.d / 2 + 1);
        else if (b.x0 !== undefined) addJ(b.x0 - 1, b.x1 + 1, b.z0 - 1, b.z1 + 1);
      }
    }
    if (window.breakables || __wc.breakables) {
      var br = window.breakables || __wc.breakables;
      for (var i2 = 0; i2 < br.length; i2++) {
        var k = br[i2]; var bx = k.x !== undefined ? k.x : (k.mesh && k.mesh.position.x); var bz = k.z !== undefined ? k.z : (k.mesh && k.mesh.position.z);
        if (bx !== undefined) addJ(bx - 1.5, bx + 1.5, bz - 1.5, bz + 1.5);
      }
    }
    function justified(cx, cz) {
      for (var i = 0; i < just.length; i++) {
        var j = just[i];
        if (cx > j.x0 && cx < j.x1 && cz > j.z0 && cz < j.z1) return true;
      }
      return false;
    }

    // ---- ray visibility: something visible above y 0.3 at (x,z)? ----
    var ray = new THREE_.Raycaster();
    var down = new THREE_.Vector3(0, -1, 0);
    function standsAt(x, z) {
      // candidates: meshes whose bb contains (x,z) with top above 0.3
      var cands = [];
      for (var i = 0; i < meshes.length; i++) {
        var e = meshes[i];
        if (x < e.bb.min.x - 0.3 || x > e.bb.max.x + 0.3 || z < e.bb.min.z - 0.3 || z > e.bb.max.z + 0.3) continue;
        if (e.bb.max.y < 0.3) continue;
        if (!e.big) return true;           // tight bbox with height => visible thing here
        cands.push(e.m);                   // big merged batch: verify by ray
      }
      if (!cands.length) return false;
      ray.set(new THREE_.Vector3(x, 60, z), down);
      var hits = ray.intersectObjects(cands, false);
      for (var h = 0; h < hits.length; h++) if (hits[h].point.y > 0.3) return true;
      return false;
    }

    var orphans = [], checked = 0, justCt = 0;
    var HALF_GUESS = 0;
    for (var c = 0; c < cols.length; c++) {
      var cl = cols[c];
      HALF_GUESS = Math.max(HALF_GUESS, Math.abs(cl.x0), Math.abs(cl.x1));
    }
    for (var c2 = 0; c2 < cols.length; c2++) {
      var co = cols[c2];
      if (co.active === false || co.lake) continue;
      checked++;
      var cx = (co.x0 + co.x1) / 2, cz = (co.z0 + co.z1) / 2;
      var w = co.x1 - co.x0, d = co.z1 - co.z0;
      if (justified(cx, cz)) { justCt++; continue; }
      // sample center + corners (inset)
      var pts = [[cx, cz], [co.x0 + 0.2, co.z0 + 0.2], [co.x1 - 0.2, co.z0 + 0.2], [co.x0 + 0.2, co.z1 - 0.2], [co.x1 - 0.2, co.z1 - 0.2]];
      if (w > 8 || d > 8) { // long walls: sample along the long axis too
        for (var s = 1; s < 6; s++) pts.push([co.x0 + w * s / 6, co.z0 + d * s / 6]);
      }
      var any = false;
      for (var p2 = 0; p2 < pts.length; p2++) { if (standsAt(pts[p2][0], pts[p2][1])) { any = true; break; } }
      if (!any) {
        var e2 = { cx: +cx.toFixed(1), cz: +cz.toFixed(1), x0: +co.x0.toFixed(1), x1: +co.x1.toFixed(1), z0: +co.z0.toFixed(1), z1: +co.z1.toFixed(1), w: +w.toFixed(1), d: +d.toFixed(1) };
        var ks = Object.keys(co);
        for (var k2 = 0; k2 < ks.length; k2++) if (['x0', 'x1', 'z0', 'z1'].indexOf(ks[k2]) < 0) e2[ks[k2]] = co[ks[k2]];
        orphans.push(e2);
      }
    }
    return { orphans: orphans, checked: checked, justified: justCt, totalMeshes: meshes.length, worldHalf: HALF_GUESS, ms: Math.round(performance.now() - t0) };
  });

  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  console.log('checked', res.checked, 'justified', res.justified, 'ORPHANS', res.orphans.length, 'in', res.ms, 'ms — full list in', OUT);
  var show = res.orphans.slice(0, 30);
  for (var i = 0; i < show.length; i++) console.log(' orphan @', show[i].cx, show[i].cz, 'size', show[i].w, 'x', show[i].d);
  await browser.close();
})().catch(function (e) { console.error('FAIL', e); process.exit(1); });
