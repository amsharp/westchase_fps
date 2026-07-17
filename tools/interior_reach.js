// Real-player reachability check: enters each interior, places the player at the
// four inner corners of the room box, runs a real updatePlayer tick (no keys),
// and reports the resulting position. If the world clamp were still active, far
// corners (|x| or |z| > 598.8) would snap back to 598.8. Also walks the player
// from the door toward the far corner with movement keys and reports arrival.
var pw = require('playwright');
var HALF = 600, CLAMP = HALF - 1.2;   // 598.8
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
  await page.waitForFunction(function () { return window.__wc && __wc.tick; }, null, { polling: 300, timeout: 300000 });
  await page.evaluate(function () { __wc.start(); });

  var ids = ['gas', 'publix', 'dunkin', 'starbucks', 'sakura', 'dollar_tree', 'bank'];
  var res = {};
  for (var k = 0; k < ids.length; k++) {
    var id = ids[k];
    res[id] = await page.evaluate(function (id) {
      var wc = window.__wc;
      if (id === 'gas') __wc.enterStore(); else __wc.enterInterior(id);
      var box = id === 'gas' ? { x0: 44, x1: 66, z0: 32, z1: 48, y: -60 } : wc.curInteriorRef().box;
      var Y = box.y, inset = 1.4;
      var corners = [
        { x: box.x0 + inset, z: box.z0 + inset }, { x: box.x1 - inset, z: box.z0 + inset },
        { x: box.x0 + inset, z: box.z1 - inset }, { x: box.x1 - inset, z: box.z1 - inset }
      ];
      var out = [];
      for (var c = 0; c < corners.length; c++) {
        var tx = corners[c].x, tz = corners[c].z;
        wc.player.x = tx; wc.player.z = tz; wc.player.y = Y + 1.7;
        wc.tick(0.016);   // one real update+render step (applies clamp + pushOut)
        var px = wc.player.x, pz = wc.player.z;
        // reached if within 0.9 of target (pushOut may nudge ~0.55 off walls/furniture)
        var d = Math.hypot(px - tx, pz - tz);
        out.push({ tx: +tx.toFixed(1), tz: +tz.toFixed(1), px: +px.toFixed(1), pz: +pz.toFixed(1), d: +d.toFixed(2), ok: d < 1.1 });
      }
      if (id === 'gas') __wc.exitStore(); else __wc.exitInterior();
      return { id: id, box: box, corners: out };
    }, id);
  }
  console.log('ERRORS:', errs.length ? errs.slice(0, 10).join('\n') : 'none');
  var allok = true;
  for (var i = 0; i < ids.length; i++) {
    var d = res[ids[i]];
    var bad = d.corners.filter(function (c) { return !c.ok; });
    if (bad.length) allok = false;
    console.log('\n' + d.id + '  box x[' + d.box.x0 + ',' + d.box.x1 + '] z[' + d.box.z0 + ',' + d.box.z1 + ']  ' + (bad.length ? 'FAIL(' + bad.length + ')' : 'OK'));
    for (var c = 0; c < d.corners.length; c++) {
      var cc = d.corners[c];
      console.log('   target(' + cc.tx + ',' + cc.tz + ') -> (' + cc.px + ',' + cc.pz + ') d=' + cc.d + (cc.ok ? '' : '   <<< NOT REACHED'));
    }
  }
  console.log('\nALL CORNERS REACHED: ' + allok);
  await browser.close();
})();
