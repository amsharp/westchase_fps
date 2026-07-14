// Interior walkability probe. For each of the 7 interiors, enter it, then:
//  - grab the active collider set (curInterior.colliders, or intColliders for gas)
//  - collect furniture mesh footprints (box meshes standing on the floor)
//  - sample a floor grid; a cell is "blocked" if pushOut moves it (>eps)
//  - "open floor" = cell not inside any furniture footprint (waist-height box)
//  - report blocked-open-floor cells (invisible barriers / overshoot)
//  - flood-fill reachability from doorIn; report large unreachable-open pockets
// file:// boot, swiftshader.
var pw = require('playwright');
var R = 0.55;      // player collision radius
var STEP = 0.5;    // grid resolution
(async function () {
  var browser = await pw.chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--no-sandbox', '--disable-dev-shm-usage']
  });
  var page = await browser.newPage({ viewport: { width: 480, height: 300 } });
  var errs = [];
  page.on('pageerror', function (e) { errs.push('PAGEERR ' + e.message); });
  page.on('console', function (m) { if (m.type() === 'error') { var t = m.text(); if (t.indexOf('ERR_CONNECTION_RESET') < 0 && t.indexOf('peerjs') < 0) errs.push('CONSOLE ' + t); } });
  await page.goto('file:///home/user/wt-interiors/index.html', { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(function () { return window.__wc && __wc.pushOut && __wc.scene; }, null, { polling: 300, timeout: 300000 });
  await page.evaluate(function () { __wc.start(); });

  var ids = ['gas', 'publix', 'dunkin', 'starbucks', 'sakura', 'dollar_tree', 'bank'];
  var out = {};
  for (var k = 0; k < ids.length; k++) {
    var id = ids[k];
    var r = await page.evaluate(function (arg) {
      var id=arg.id, R=arg.R, STEP=arg.STEP;
      // enter
      if (id === 'gas') __wc.enterStore();
      else __wc.enterInterior(id);
      var wc = window.__wc;
      var spec = wc.interiorState();
      var scene = wc.scene; scene.updateMatrixWorld(true);
      // active collider set + box
      var cols, box;
      if (id === 'gas') { cols = wc.intCollidersRef ? wc.intCollidersRef() : null; box = { x0: 44, x1: 66, z0: 32, z1: 48, y: -60 }; }
      else { var sp = wc.curInteriorRef(); cols = sp.colliders; box = sp.box; }
      // furniture footprints: box meshes standing on floor, waist height band
      var Y = box.y;
      var furn = [];
      scene.traverse(function (o) {
        if (!o.isMesh || o.visible === false || !o.geometry) return;
        var g = o.geometry;
        if (!g.type || g.type.indexOf('BoxGeometry') < 0) return;
        var p = new THREE.Vector3(); o.getWorldPosition(p);
        if (p.y < Y + 0.05 || p.y > Y + 3.2) return;   // exclude floor/ceiling/high signs
        // world AABB of the box
        if (!g.boundingBox) g.computeBoundingBox();
        var bb = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
        // skip huge (walls/floor) via footprint area gate handled by caller
        furn.push({ x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z, y0: bb.min.y, y1: bb.max.y });
      });
      // also cylinders (stools/tables/posts) as circle footprints -> treat as small boxes
      scene.traverse(function (o) {
        if (!o.isMesh || o.visible === false || !o.geometry) return;
        var g = o.geometry;
        if (!g.type || g.type.indexOf('Cylinder') < 0) return;
        var p = new THREE.Vector3(); o.getWorldPosition(p);
        if (p.y < Y + 0.05 || p.y > Y + 3.2) return;
        if (!g.boundingBox) g.computeBoundingBox();
        var bb = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
        furn.push({ x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z, y0: bb.min.y, y1: bb.max.y, cyl: 1 });
      });
      function inFurn(x, z) {
        for (var i = 0; i < furn.length; i++) {
          var f = furn[i];
          // only count as furniture footprint if the box is floor-standing solid
          // (bottom near floor) and not a tall thin sign etc.
          if (x >= f.x0 - 0.05 && x <= f.x1 + 0.05 && z >= f.z0 - 0.05 && z <= f.z1 + 0.05) return true;
        }
        return false;
      }
      function blocked(x, z) {
        var q = wc.pushOut(x, z, R, cols);
        var dx = q.x - x, dz = q.z - z; return dx * dx + dz * dz > 1e-6;
      }
      // walkable interior bounds (inside the walls, minus player radius)
      var wx0 = box.x0 + 0.25 + R, wx1 = box.x1 - 0.25 - R;
      var wz0 = box.z0 + 0.25 + R, wz1 = box.z1 - 0.25 - R;
      // grid
      var nx = Math.floor((wx1 - wx0) / STEP) + 1, nz = Math.floor((wz1 - wz0) / STEP) + 1;
      var grid = [];   // 0 open-walkable, 1 furniture(blocked-legit), 2 blocked-open(bad), 3 wall-adjacent blocked
      var blockedOpen = [];
      for (var iz = 0; iz < nz; iz++) {
        grid.push([]);
        for (var ix = 0; ix < nx; ix++) {
          var x = wx0 + ix * STEP, z = wz0 + iz * STEP;
          var b = blocked(x, z), f = inFurn(x, z);
          var v;
          if (!b) v = 0;
          else if (f) v = 1;          // legit furniture block
          else { v = 2; blockedOpen.push({ x: +x.toFixed(1), z: +z.toFixed(1) }); }
          grid[iz].push(v);
        }
      }
      // reachability flood-fill from doorIn cell over non-blocked cells
      var din = (id === 'gas') ? { x: 55, z: 45.8 } : wc.curInteriorRef().doorIn;
      var sx = Math.round((din.x - wx0) / STEP), sz = Math.round((din.z - wz0) / STEP);
      sx = Math.max(0, Math.min(nx - 1, sx)); sz = Math.max(0, Math.min(nz - 1, sz));
      var seen = [];
      for (var q2 = 0; q2 < nz; q2++) { seen.push([]); for (var q3 = 0; q3 < nx; q3++) seen[q2].push(false); }
      // if door cell blocked, nudge to nearest open
      function openCell(cx, cz) { return cx >= 0 && cx < nx && cz >= 0 && cz < nz && grid[cz][cx] === 0; }
      if (!openCell(sx, sz)) { for (var rad = 1; rad < 8 && !openCell(sx, sz); rad++) { if (openCell(sx + rad, sz)) sx += rad; else if (openCell(sx - rad, sz)) sx -= rad; else if (openCell(sx, sz + rad)) sz += rad; else if (openCell(sx, sz - rad)) sz -= rad; } }
      var stack = [[sx, sz]]; seen[sz][sx] = true; var reachN = 0;
      while (stack.length) {
        var c = stack.pop(); reachN++;
        var cx = c[0], cz = c[1];
        var nb = [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]];
        for (var n = 0; n < 4; n++) {
          var ax = nb[n][0], az = nb[n][1];
          if (ax < 0 || ax >= nx || az < 0 || az >= nz) continue;
          if (seen[az][ax] || grid[az][ax] !== 0) continue;
          seen[az][ax] = true; stack.push([ax, az]);
        }
      }
      // count open cells (v==0) total and unreachable ones
      var openTotal = 0, unreach = [];
      for (var oz = 0; oz < nz; oz++) for (var ox = 0; ox < nx; ox++) {
        if (grid[oz][ox] === 0) { openTotal++; if (!seen[oz][ox]) unreach.push({ x: +(wx0 + ox * STEP).toFixed(1), z: +(wz0 + oz * STEP).toFixed(1) }); }
      }
      // ASCII map (z rows, x cols): '#'=furn,'X'=blocked-open(bad),'.'=open-reach,'o'=open-unreach
      var lines = [];
      for (var mz = 0; mz < nz; mz++) {
        var s = '';
        for (var mx = 0; mx < nx; mx++) {
          var g2 = grid[mz][mx];
          if (g2 === 1) s += '#';
          else if (g2 === 2) s += 'X';
          else s += seen[mz][mx] ? '.' : 'o';
        }
        lines.push(s);
      }
      return {
        id: id, box: box, nCols: cols.length, nFurn: furn.length,
        gridW: nx, gridH: nz,
        blockedOpenN: blockedOpen.length, blockedOpen: blockedOpen.slice(0, 40),
        openTotal: openTotal, reachN: reachN, unreachN: unreach.length, unreach: unreach.slice(0, 40),
        map: lines, cols: cols
      };
    }, {id:id, R:R, STEP:STEP});
    // exit
    await page.evaluate(function (id) { if (id === 'gas') __wc.exitStore(); else __wc.exitInterior(); }, id);
    out[id] = r;
  }
  console.log('ERRORS:', errs.length ? errs.slice(0, 15).join('\n') : 'none');
  for (var i = 0; i < ids.length; i++) {
    var d = out[ids[i]];
    console.log('\n===== ' + d.id + ' =====  box x[' + d.box.x0 + ',' + d.box.x1 + '] z[' + d.box.z0 + ',' + d.box.z1 + '] cols=' + d.nCols + ' furn=' + d.nFurn);
    console.log('blockedOpen=' + d.blockedOpenN + '  openTotal=' + d.openTotal + '  reachable=' + d.reachN + '  unreachableOpen=' + d.unreachN);
    if (d.blockedOpenN) console.log('  blockedOpen pts:', JSON.stringify(d.blockedOpen));
    if (d.unreachN) console.log('  unreachOpen pts:', JSON.stringify(d.unreach));
    console.log('  MAP (rows=z asc, cols=x asc):');
    for (var m = 0; m < d.map.length; m++) console.log('   ' + d.map[m]);
  }
  await browser.close();
})();
