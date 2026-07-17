// Per-collider overshoot probe: for each interior collider, measure the fraction
// of its footprint that has NO backing mesh in the waist band (phantom area =
// invisible barrier sticking into walkable floor). Uses ALL mesh world-AABBs in
// the band [Y+0.15, Y+2.2]. Walls (at box edges) reported separately.
var pw = require('playwright');
(async function () {
  var browser = await pw.chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--no-sandbox', '--disable-dev-shm-usage']
  });
  var page = await browser.newPage({ viewport: { width: 480, height: 300 } });
  var errs = [];
  page.on('pageerror', function (e) { errs.push('PAGEERR ' + e.message); });
  page.on('console', function (m) { if (m.type() === 'error') { var t = m.text(); if (t.indexOf('ERR_CONNECTION_RESET') < 0) errs.push(t); } });
  await page.goto('file:///home/user/wt-interiors/index.html', { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(function () { return window.__wc && __wc.pushOut; }, null, { polling: 300, timeout: 300000 });
  await page.evaluate(function () { __wc.start(); });

  var ids = ['gas', 'publix', 'dunkin', 'starbucks', 'sakura', 'dollar_tree', 'bank'];
  var res = {};
  for (var k = 0; k < ids.length; k++) {
    var id = ids[k];
    res[id] = await page.evaluate(function (id) {
      if (id === 'gas') __wc.enterStore(); else __wc.enterInterior(id);
      var wc = window.__wc, scene = wc.scene; scene.updateMatrixWorld(true);
      var cols, box;
      if (id === 'gas') { cols = wc.intCollidersRef(); box = { x0: 44, x1: 66, z0: 32, z1: 48, y: -60 }; }
      else { var sp = wc.curInteriorRef(); cols = sp.colliders; box = sp.box; }
      var Y = box.y;
      // all mesh footprints (world AABB) in the waist band
      var foot = [];
      scene.traverse(function (o) {
        if (!o.isMesh || o.visible === false || !o.geometry) return;
        var g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
        var bb = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
        // must overlap the waist band vertically (something solid at leg/hip height)
        if (bb.max.y < Y + 0.15 || bb.min.y > Y + 2.2) return;
        // ignore giant planes (floor/ceiling) and walls handled via edge test
        var area = (bb.max.x - bb.min.x) * (bb.max.z - bb.min.z);
        if (area > 400) return;   // room-sized floor/ceiling
        foot.push({ x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z });
      });
      function covered(x, z) {
        for (var i = 0; i < foot.length; i++) { var f = foot[i]; if (x >= f.x0 - 0.05 && x <= f.x1 + 0.05 && z >= f.z0 - 0.05 && z <= f.z1 + 0.05) return true; }
        return false;
      }
      function isWall(c) {
        // a collider hugging a box edge (thin, along the perimeter)
        var e = 0.6;
        return Math.abs(c.x0 - box.x0) < e || Math.abs(c.x1 - box.x1) < e || Math.abs(c.z0 - box.z0) < e || Math.abs(c.z1 - box.z1) < e ? ((c.x1 - c.x0) < 1 || (c.z1 - c.z0) < 1) && ((c.x1 - c.x0) > (box.x1 - box.x0) * 0.8 || (c.z1 - c.z0) > (box.z1 - box.z0) * 0.8) : false;
      }
      var report = [];
      for (var ci = 0; ci < cols.length; ci++) {
        var c = cols[ci];
        var w = +(c.x1 - c.x0).toFixed(2), d = +(c.z1 - c.z0).toFixed(2);
        var wall = isWall(c);
        // sample grid inside collider
        var n = 0, phantom = 0, SS = 0.25;
        for (var x = c.x0 + 0.05; x <= c.x1 - 0.05; x += SS) for (var z = c.z0 + 0.05; z <= c.z1 - 0.05; z += SS) { n++; if (!covered(x, z)) phantom++; }
        if (n === 0) { n = 1; if (!covered((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2)) phantom = 1; }
        var frac = phantom / n;
        report.push({ i: ci, cx: +((c.x0 + c.x1) / 2).toFixed(1), cz: +((c.z0 + c.z1) / 2).toFixed(1), w: w, d: d, wall: wall, phantom: +frac.toFixed(2) });
      }
      if (id === 'gas') __wc.exitStore(); else __wc.exitInterior();
      return { id: id, box: box, nFoot: foot.length, report: report };
    }, id);
  }
  console.log('ERRORS:', errs.length ? errs.slice(0, 10).join('\n') : 'none');
  for (var i = 0; i < ids.length; i++) {
    var d = res[ids[i]];
    console.log('\n===== ' + d.id + ' =====  footprints=' + d.nFoot);
    for (var r = 0; r < d.report.length; r++) {
      var c = d.report[r];
      var flag = (!c.wall && c.phantom > 0.25) ? '  <<< PHANTOM ' + Math.round(c.phantom * 100) + '%' : '';
      console.log('  col#' + c.i + ' c(' + c.cx + ',' + c.cz + ') ' + c.w + 'x' + c.d + (c.wall ? ' [wall]' : '') + ' phantom=' + c.phantom + flag);
    }
  }
  await browser.close();
})();
