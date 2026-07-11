// INVISIBLE-BARRIER SCANNER / SHIP GATE — map-wide audit of colliders vs
// visible geometry. A collider is flagged ORPHAN if no visible mesh stands
// inside its bounds (nothing above y=0.25 — raised beds/planters top out ~0.3).
//   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/_barrierscan.js [outJson]
//   Exit code: 0 = no orphans, 1 = orphans found (or boot failure) — usable
//   directly as a pre-ship gate (see "BARRIER GATE" in tools/TRIAGE.md).
// Occupancy test (v2, instancing-aware — the old 5-point raycast sampler was
// blind to InstancedMesh forest fill and flagged 100s of false orphans):
//   1. InstancedMesh: every instance's world position becomes an occupancy
//      point (radius 1.5) when its scaled geometry rises above y=0.6.
//   2. Small regular meshes (<4000u^2 footprint): tight world-bbox overlap.
//   3. Big merged batches: downward raycast on a ~1.5u grid inside the
//      collider (step widens on huge colliders, capped at ~240 rays each).
// Output: JSON { orphans:[{cx,cz,x0..z1,w,d,tag,...}], checked, justified, ms }.
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
  if (process.env.STRICT === '1') await page.evaluate(function () { window.__scanStrict = 1; });

  var res = await page.evaluate(function () {
    var t0 = performance.now();
    var THREE_ = window.THREE;
    var cols = __wc.colliders;
    var scene = __wc.scene;
    var i, j, k;

    // ---- collect occupancy sources once ----
    var CELL = 20;                      // spatial hash cell for points/rects
    var ptGrid = {};                    // instanced-tree points
    var rectGrid = {};                  // small-mesh world bboxes
    var bigs = [];                      // big merged meshes (raycast targets)
    function gput(grid, x0, x1, z0, z1, e) {
      var gx0 = Math.floor(x0 / CELL), gx1 = Math.floor(x1 / CELL);
      var gz0 = Math.floor(z0 / CELL), gz1 = Math.floor(z1 / CELL);
      for (var gx = gx0; gx <= gx1; gx++) for (var gz = gz0; gz <= gz1; gz++) {
        var key = gx + '|' + gz;
        (grid[key] || (grid[key] = [])).push(e);
      }
    }
    scene.updateMatrixWorld(true);
    var m4 = new THREE_.Matrix4(), wp = new THREE_.Vector3(), wq = new THREE_.Quaternion(), ws = new THREE_.Vector3();
    scene.traverse(function (o) {
      if (!o.isMesh || !o.visible) return;
      var p = o, vis = true;
      while (p) { if (p.visible === false) { vis = false; break; } p = p.parent; }
      if (!vis) return;
      if (o.material && o.material.transparent && o.material.opacity !== undefined && o.material.opacity < 0.15) return;
      if (!o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      var gb = o.geometry.boundingBox;
      if (o.isInstancedMesh) {
        var gh = gb.max.y - gb.min.y;
        for (i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m4);
          m4.premultiply(o.matrixWorld);
          m4.decompose(wp, wq, ws);
          if (gb.max.y * ws.y < 0.6) continue;      // flat layer (shadow blobs) or crushed
          if (gh * ws.y < 0.4) continue;
          gput(ptGrid, wp.x - 1.5, wp.x + 1.5, wp.z - 1.5, wp.z + 1.5, [wp.x, wp.z]);
        }
        return;
      }
      var bb = gb.clone().applyMatrix4(o.matrixWorld);
      if (bb.max.y < 0.25) return;
      var area = (bb.max.x - bb.min.x) * (bb.max.z - bb.min.z);
      if (area > 4000) { bigs.push({ m: o, bb: bb }); return; }
      gput(rectGrid, bb.min.x, bb.max.x, bb.min.z, bb.max.z, [bb.min.x, bb.max.x, bb.min.z, bb.max.z]);
    });

    // ---- registries that justify a collider without geometry checks ----
    var just = [];
    function addJ(x0, x1, z0, z1) { just.push({ x0: x0, x1: x1, z0: z0, z1: z1 }); }
    var mb = window.mapBuildings || __wc.mapBuildings || __wc.mapBuildingsReg;
    if (mb) for (i = 0; i < mb.length; i++) {
      var b = mb[i];
      if (b.x !== undefined && b.w !== undefined) addJ(b.x - b.w / 2 - 1, b.x + b.w / 2 + 1, b.z - b.d / 2 - 1, b.z + b.d / 2 + 1);
      else if (b.x0 !== undefined) addJ(b.x0 - 1, b.x1 + 1, b.z0 - 1, b.z1 + 1);
    }
    var br = window.breakables || __wc.breakables;
    if (br) for (i = 0; i < br.length; i++) {
      var kk = br[i]; var bx = kk.x !== undefined ? kk.x : (kk.mesh && kk.mesh.position.x); var bz = kk.z !== undefined ? kk.z : (kk.mesh && kk.mesh.position.z);
      if (bx !== undefined) addJ(bx - 1.5, bx + 1.5, bz - 1.5, bz + 1.5);
    }
    // STRICT=1 disables the registry shortcut so EVERY collider must be
    // proven by actual geometry (slower; use when auditing the registries
    // themselves). Default keeps them as a cheap fast-path.
    var strict = !!window.__scanStrict;
    function justified(cx, cz) {
      if (strict) return false;
      for (var i2 = 0; i2 < just.length; i2++) {
        var j2 = just[i2];
        if (cx > j2.x0 && cx < j2.x1 && cz > j2.z0 && cz < j2.z1) return true;
      }
      return false;
    }

    // ---- occupancy: instanced point in rect? ----
    function ptIn(x0, x1, z0, z1) {
      var gx0 = Math.floor((x0 - 1.5) / CELL), gx1 = Math.floor((x1 + 1.5) / CELL);
      var gz0 = Math.floor((z0 - 1.5) / CELL), gz1 = Math.floor((z1 + 1.5) / CELL);
      for (var gx = gx0; gx <= gx1; gx++) for (var gz = gz0; gz <= gz1; gz++) {
        var lst = ptGrid[gx + '|' + gz];
        if (!lst) continue;
        for (var n = 0; n < lst.length; n++) {
          var e = lst[n];
          if (e[0] >= x0 - 0.4 && e[0] <= x1 + 0.4 && e[1] >= z0 - 0.4 && e[1] <= z1 + 0.4) return true;
        }
      }
      return false;
    }
    // ---- occupancy: small-mesh bbox overlaps rect? ----
    // inset shrinks the collider rect a touch so a mesh merely TOUCHING the
    // edge doesn't justify it — but it must adapt to thin colliders (a fence
    // panel's zero-thickness plane sits inside a 0.28u-wide collider).
    function rectIn(x0, x1, z0, z1) {
      var inx = Math.min(0.15, (x1 - x0) / 4), inz = Math.min(0.15, (z1 - z0) / 4);
      var gx0 = Math.floor(x0 / CELL), gx1 = Math.floor(x1 / CELL);
      var gz0 = Math.floor(z0 / CELL), gz1 = Math.floor(z1 / CELL);
      for (var gx = gx0; gx <= gx1; gx++) for (var gz = gz0; gz <= gz1; gz++) {
        var lst = rectGrid[gx + '|' + gz];
        if (!lst) continue;
        for (var n = 0; n < lst.length; n++) {
          var e = lst[n];
          if (e[1] > x0 + inx && e[0] < x1 - inx && e[3] > z0 + inz && e[2] < z1 - inz) return true;
        }
      }
      return false;
    }
    // ---- occupancy: raycast the big merged batches on a grid ----
    var ray = new THREE_.Raycaster();
    var down = new THREE_.Vector3(0, -1, 0);
    function bigHit(x0, x1, z0, z1) {
      var cands = [];
      for (var n = 0; n < bigs.length; n++) {
        var e = bigs[n];
        if (x1 < e.bb.min.x || x0 > e.bb.max.x || z1 < e.bb.min.z || z0 > e.bb.max.z) continue;
        cands.push(e.m);
      }
      if (!cands.length) return false;
      var w = x1 - x0, d = z1 - z0;
      var sx = Math.max(1.5, w / 15), sz = Math.max(1.5, d / 15);   // <=~240 rays each
      for (var px = x0 + Math.min(sx, w) / 2; px <= x1; px += sx) {
        for (var pz = z0 + Math.min(sz, d) / 2; pz <= z1; pz += sz) {
          ray.set(new THREE_.Vector3(px, 60, pz), down);
          var hits = ray.intersectObjects(cands, false);
          for (var h = 0; h < hits.length; h++) if (hits[h].point.y > 0.25) return true;
        }
      }
      return false;
    }

    var orphans = [], checked = 0, justCt = 0, worldHalf = 0, nPts = 0;
    for (var key in ptGrid) nPts += ptGrid[key].length;
    for (var c = 0; c < cols.length; c++) {
      worldHalf = Math.max(worldHalf, Math.abs(cols[c].x0), Math.abs(cols[c].x1));
    }
    for (var c2 = 0; c2 < cols.length; c2++) {
      var co = cols[c2];
      if (co.active === false || co.lake) continue;
      checked++;
      var cx = (co.x0 + co.x1) / 2, cz = (co.z0 + co.z1) / 2;
      var w2 = co.x1 - co.x0, d2 = co.z1 - co.z0;
      if (justified(cx, cz)) { justCt++; continue; }
      if (ptIn(co.x0, co.x1, co.z0, co.z1)) continue;
      if (rectIn(co.x0, co.x1, co.z0, co.z1)) continue;
      if (bigHit(co.x0, co.x1, co.z0, co.z1)) continue;
      var e2 = { cx: +cx.toFixed(1), cz: +cz.toFixed(1), x0: +co.x0.toFixed(1), x1: +co.x1.toFixed(1), z0: +co.z0.toFixed(1), z1: +co.z1.toFixed(1), w: +w2.toFixed(1), d: +d2.toFixed(1) };
      var ks = Object.keys(co);
      for (var k2 = 0; k2 < ks.length; k2++) if (['x0', 'x1', 'z0', 'z1'].indexOf(ks[k2]) < 0) e2[ks[k2]] = co[ks[k2]];
      orphans.push(e2);
    }
    return { orphans: orphans, checked: checked, justified: justCt, instancedPts: nPts, bigMeshes: bigs.length, worldHalf: worldHalf, ms: Math.round(performance.now() - t0) };
  });

  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  console.log('checked', res.checked, 'justified', res.justified, 'instPts', res.instancedPts, 'ORPHANS', res.orphans.length, 'in', res.ms, 'ms — full list in', OUT);
  var show = res.orphans.slice(0, 40);
  for (var i = 0; i < show.length; i++) console.log(' orphan @', show[i].cx, show[i].cz, 'size', show[i].w, 'x', show[i].d, 'tag', show[i].tag || '?');
  await browser.close();
  process.exit(res.orphans.length ? 1 : 0);   // ship gate: 0 orphans required
})().catch(function (e) { console.error('FAIL', e); process.exit(1); });
