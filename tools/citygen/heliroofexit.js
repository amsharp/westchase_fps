// v1.122.3 verify: exiting a helicopter that landed on a rooftop leaves the
// player STANDING ON THE ROOF (player.y ~ roofY + EYE, x/z near the building),
// not teleported down to the street beside it.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '../../index.html'), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 300000 });
  await p.evaluate(() => { __wc.start(); __wc.setClock && __wc.setClock(180); });

  const out = await p.evaluate(() => {
    // pick the tallest downtown building to land on
    var recs = (__wc.cityBuildings && __wc.cityBuildings()) || [];
    var tall = null;
    for (var i = 0; i < recs.length; i++) { var r = recs[i]; if (!tall || (r.H || 0) > (tall.H || 0)) tall = r; }
    if (!tall) return { err: 'no city buildings' };
    var foundH = tall.foundH || 0, roofY = foundH + (tall.H || 0);
    // surface exactly at the building center, feet at roof height
    var surfCtr = __wc.surfAt(tall.x, tall.z, roofY);
    // spawn + board the heli, then set it resting on the roof center
    var h = __wc.spawnPlayerHeli();
    __wc.boardHeli();
    var HELI_SKID = 1.0;   // matches game
    h.group.position.set(tall.x, surfCtr + HELI_SKID, tall.z);
    h.yaw = 0; h.pitch = 0; h.roll = 0; h.vx = h.vy = h.vz = 0;
    // now exit — should place the player on the roof
    __wc.exitHeli();
    return {
      bx: tall.x, bz: tall.z, roofY: roofY, surfCtr: surfCtr,
      px: __wc.player.x, pz: __wc.player.z, py: __wc.player.y,
      distXZ: Math.hypot(__wc.player.x - tall.x, __wc.player.z - tall.z),
      W: tall.W, D: tall.D
    };
  });

  console.log('pageerrors:', errs.length); errs.slice(0, 6).forEach(e => console.log('  ERR:', e));
  console.log(JSON.stringify(out, null, 2));
  let ok = true;
  if (out.err) { console.log('FAIL -', out.err); ok = false; }
  else {
    var footR = Math.max(out.W || 0, out.D || 0) / 2 + 4;   // within footprint + a little
    var onRoofY = Math.abs(out.py - (out.surfCtr + 1.7)) < 1.5;   // standing on the deck, not at street y=1.7
    var nearBldg = out.distXZ < footR;
    var notStreet = out.py > 5;   // a real skyscraper roof is well above the street
    [['player.y ~ roof + EYE', onRoofY], ['player stays over the footprint', nearBldg],
     ['player NOT dumped to street level', notStreet]].forEach(function (t) {
      console.log((t[1] ? 'PASS' : 'FAIL') + ' - ' + t[0]); if (!t[1]) ok = false;
    });
  }
  console.log(errs.length === 0 ? 'PASS - 0 pageerrors' : 'FAIL - pageerrors'); if (errs.length) ok = false;
  await b.close();
  process.exit(ok ? 0 : 1);
})();
