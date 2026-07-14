// Collision alignment probe: compares building footprints (ground-truth via the
// invisible box proxies + mapBuildings) against the collision field (pushOut).
// Quantifies walk-through buildings (missing/undersized collider) and phantom
// halos (collider sticks out past the building). file:// boot, swiftshader.
var pw = require('playwright');
(async function () {
  var browser = await pw.chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--no-sandbox', '--disable-dev-shm-usage']
  });
  var page = await browser.newPage({ viewport: { width: 480, height: 300 } });
  var errs = [];
  page.on('pageerror', function (e) { errs.push('PAGEERR ' + e.message); });
  page.on('console', function (m) { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.goto('file:///home/user/wt-collision/index.html', { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(function () { return window.__wc && __wc.colliders && __wc.scene; }, null, { polling: 300, timeout: 300000 });
  await page.evaluate(function () { __wc.start(); });

  var res = await page.evaluate(function () {
    var cols = __wc.colliders, pushOut = __wc.pushOut, scene = __wc.scene, mb = __wc.mapBuildingsReg;
    scene.updateMatrixWorld(true);
    // ---- collect building proxies (invisible box meshes) ----
    // house proxies: BoxGeometry(1,1,1), invisible, rotation.y=a, scale=(w,hgt,d)
    var proxies = [], sm = __wc.solidMeshesReg;
    for (var si = 0; si < sm.length; si++) {
      var o = sm[si];
      if (!o.isMesh || o.visible !== false || !o.geometry) continue;
      var g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
      var bb = g.boundingBox, sz = bb.max.clone().sub(bb.min);
      // unit box centered at origin == the house/canopy proxy
      if (Math.abs(sz.x - 1) > 0.01 || Math.abs(sz.y - 1) > 0.01 || Math.abs(sz.z - 1) > 0.01) continue;
      if (Math.abs(bb.max.x + bb.min.x) > 0.01) continue;
      proxies.push({ x: o.position.x, z: o.position.z, w: o.scale.x, d: o.scale.z, hgt: o.scale.y, a: o.rotation.y });
    }
    function moved(x, z, r) { var q = pushOut(x, z, r || 0.3); var dx = q.x - x, dz = q.z - z; return dx * dx + dz * dz > 1e-6; }
    // interior-solid fraction of an oriented footprint (grid sample interior, inset)
    function interiorSolid(p, inset) {
      var ca = Math.cos(p.a), sa = Math.sin(p.a), hw = p.w / 2 - inset, hd = p.d / 2 - inset;
      if (hw <= 0 || hd <= 0) return { frac: 1, n: 0 };
      var n = 0, solid = 0, NS = 5;
      for (var iu = 0; iu < NS; iu++) for (var iv = 0; iv < NS; iv++) {
        var lu = (iu / (NS - 1) - 0.5) * 2 * hw, lv = (iv / (NS - 1) - 0.5) * 2 * hd;
        // local->world with rotation.y=a: wx=lu*ca+lv*sa, wz=-lu*sa+lv*ca
        var wx = lu * ca + lv * sa + p.x, wz = -lu * sa + lv * ca + p.z;
        n++; if (moved(wx, wz, 0.3)) solid++;
      }
      return { frac: solid / n, n: n };
    }
    // phantom halo: sample a ring just outside footprint; solid there w/o any
    // proxy overlap = collider sticks out past the actual building
    function pointInAnyProxy(x, z, margin) {
      for (var i = 0; i < proxies.length; i++) {
        var p = proxies[i], ca = Math.cos(p.a), sa = Math.sin(p.a);
        var dx = x - p.x, dz = z - p.z;
        var lu = dx * ca - dz * sa, lv = dx * sa + dz * ca; // inverse rot
        if (Math.abs(lu) <= p.w / 2 + margin && Math.abs(lv) <= p.d / 2 + margin) return true;
      }
      return false;
    }
    var wt = [], phantoms = [];   // walk-through houses, phantom halo houses
    var near90 = [];
    for (var i = 0; i < proxies.length; i++) {
      var p = proxies[i];
      if (p.hgt < 2.5) continue;   // canopy/hollow shells (walk-under) excluded
      var isr = interiorSolid(p, 0.6);
      if (isr.frac < 0.5) wt.push({ x: Math.round(p.x), z: Math.round(p.z), w: +p.w.toFixed(1), d: +p.d.toFixed(1), a: +(p.a * 180 / Math.PI).toFixed(1), frac: +isr.frac.toFixed(2) });
      // flag near-90deg rotated non-square houses
      var deg = ((p.a * 180 / Math.PI) % 180 + 180) % 180;
      var near = Math.min(Math.abs(deg - 90), Math.abs(deg - 0), Math.abs(deg - 180));
      if (Math.abs(deg - 90) < 15 && Math.abs(p.w - p.d) > 2) near90.push({ x: Math.round(p.x), z: Math.round(p.z), w: +p.w.toFixed(1), d: +p.d.toFixed(1), deg: +deg.toFixed(1), frac: +isr.frac.toFixed(2) });
      // phantom ring
      var ca = Math.cos(p.a), sa = Math.sin(p.a), ring = 0, phc = 0;
      for (var e = 0; e < 24; e++) {
        var ang = e / 24 * Math.PI * 2, ex = Math.cos(ang), ez = Math.sin(ang);
        // point 1.2u outside the footprint edge along axis-scaled direction
        var lu = (p.w / 2 + 1.0) * Math.cos(ang), lv = (p.d / 2 + 1.0) * Math.sin(ang);
        var wx = lu * ca + lv * sa + p.x, wz = -lu * sa + lv * ca + p.z;
        if (pointInAnyProxy(wx, wz, 0.5)) continue; // near another building, skip
        ring++;
        if (moved(wx, wz, 0.3)) phc++;
      }
      if (ring > 0 && phc / ring > 0.25) phantoms.push({ x: Math.round(p.x), z: Math.round(p.z), w: +p.w.toFixed(1), d: +p.d.toFixed(1), a: +(p.a * 180 / Math.PI).toFixed(1), phantom: +(phc / ring).toFixed(2) });
    }
    // venue center solidity (mapBuildings entries that aren't houses (hs flag))
    var venueMiss = [];
    for (var m = 0; m < mb.length; m++) {
      var e = mb[m]; if (e.hs) continue;
      if (!moved(e.x, e.z, 0.4)) venueMiss.push({ x: Math.round(e.x), z: Math.round(e.z), w: e.w, d: e.d });
    }
    // count colliders by tag
    var byTag = {};
    for (var c = 0; c < cols.length; c++) { var t = cols[c].tag || '(none)'; byTag[t] = (byTag[t] || 0) + 1; }
    return {
      nProxies: proxies.length, nSolidProxies: proxies.filter(function (p) { return p.hgt >= 2.5; }).length,
      walkThrough: wt, nWalkThrough: wt.length,
      phantoms: phantoms, nPhantom: phantoms.length,
      near90: near90, nNear90: near90.length,
      venueMiss: venueMiss, nColliders: cols.length, byTag: byTag
    };
  });
  console.log('ERRORS:', errs.length ? errs.slice(0, 10).join('\n') : 'none');
  console.log(JSON.stringify(res, null, 1));
  await browser.close();
})();
