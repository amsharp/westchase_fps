// Quantify floor area lost to the world-boundary clamp, per interior, BEFORE vs
// AFTER the fix. A floor cell (open, inside walls, not in furniture) is
// "clamp-blocked" if |x|>598.8 or |z|>598.8 (the old unconditional clamp would
// force the player off it). AFTER the fix the clamp is skipped indoors, so 0.
var pw = require('playwright');
var CLAMP = 600 - 1.2, R = 0.55, STEP = 0.5;
(async function () {
  var browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
  var page = await browser.newPage({ viewport: { width: 480, height: 300 } });
  await page.goto('file:///home/user/wt-interiors/index.html', { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(function () { return window.__wc && __wc.pushOut; }, null, { polling: 300, timeout: 300000 });
  await page.evaluate(function () { __wc.start(); });
  var ids = ['gas', 'publix', 'dunkin', 'starbucks', 'sakura', 'dollar_tree', 'bank'];
  var rows = [];
  for (var k = 0; k < ids.length; k++) {
    var r = await page.evaluate(function (arg) {
      var id = arg.id, CLAMP = arg.CLAMP, R = arg.R, STEP = arg.STEP, wc = window.__wc;
      if (id === 'gas') __wc.enterStore(); else __wc.enterInterior(id);
      var cols, box;
      if (id === 'gas') { cols = wc.intCollidersRef(); box = { x0: 44, x1: 66, z0: 32, z1: 48, y: -60 }; }
      else { var sp = wc.curInteriorRef(); cols = sp.colliders; box = sp.box; }
      var wx0 = box.x0 + 0.25 + R, wx1 = box.x1 - 0.25 - R, wz0 = box.z0 + 0.25 + R, wz1 = box.z1 - 0.25 - R;
      var openN = 0, lost = 0;
      for (var x = wx0; x <= wx1; x += STEP) for (var z = wz0; z <= wz1; z += STEP) {
        var q = wc.pushOut(x, z, R, cols); if (Math.hypot(q.x - x, q.z - z) > 1e-3) continue;   // blocked by furniture/wall
        openN++;
        if (Math.abs(x) > CLAMP || Math.abs(z) > CLAMP) lost++;   // old clamp would exclude
      }
      if (id === 'gas') __wc.exitStore(); else __wc.exitInterior();
      return { id: id, openN: openN, lost: lost, pct: +(100 * lost / openN).toFixed(1) };
    }, { id: ids[k], CLAMP: CLAMP, R: R, STEP: STEP });
    rows.push(r);
  }
  console.log('interior       openFloorCells  clamp-blocked(before)  after   %lost');
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    console.log('  ' + (r.id + '            ').slice(0, 13) + ' ' + ('     ' + r.openN).slice(-6) + '           ' + ('    ' + r.lost).slice(-6) + '              0     ' + r.pct + '%');
  }
  await browser.close();
})();
