// v1.122.5 verify: a cop car that catches an on-foot player but can't disgorge
// (foot-cop cap full) SHADOW-parks nearby instead of grinding into the player;
// re-approaches when the player opens distance; and pours cops out when a slot frees.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '../../index.html'), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 300000 });
  await p.evaluate(() => { __wc.start(); __wc.setClock && __wc.setClock(180); });

  const out = await p.evaluate(async () => {
    var r = {};
    // open spot with nothing overhead / around
    var ox = 140, oz = 140;
    for (var sx = -300; sx <= 400 && true; sx += 20) { var done = false; for (var sz = 300; sz <= 900; sz += 20) { if (!__wc.losBlocked(sx, 30, sz, sx, 1.7, sz)) { ox = sx; oz = sz; done = true; break; } } if (done) break; }
    function pd(cc) { return Math.hypot(cc.x - __wc.player.x, cc.z - __wc.player.z); }
    function setupCar(dist) {
      // one cruiser placed `dist` from the player, engaged, on the seek path
      var cc = __wc.copCars()[0] || (__wc.spawnCopCar(), __wc.copCars()[0]);
      cc.x = __wc.player.x + dist; cc.z = __wc.player.z; cc.state = 'seek'; cc.disgorged = false; cc.speed = 6;
      cc.car.group.position.set(cc.x, 0, cc.z);
      return cc;
    }
    // ---- A) cap FULL -> shadow, and the car does NOT reach the player ----
    __wc.teleport(ox, oz); __wc.player.y = 1.7; __wc.setEquipped('fists'); __wc.setWanted(1);
    // fill the foot-cop cap (1 star -> desiredCops = 3): spawn 3 cops far away
    for (var i = 0; i < 3; i++) __wc.spawnCop(false);
    var cc = setupCar(12);
    var minPd = 999, sawShadow = false;
    for (var t = 0; t < 40; t++) {
      __wc.state.hp = 100; __wc.setWanted(1); __wc.teleport(ox, oz); __wc.player.y = 1.7;
      __wc.tick(1 / 30);
      var c0 = __wc.copCars()[0]; if (!c0) break;
      if (c0.state === 'shadow') sawShadow = true;
      minPd = Math.min(minPd, pd(c0));
    }
    r.capFullState = __wc.copCars()[0] && __wc.copCars()[0].state;
    r.sawShadow = sawShadow;
    r.minPdWhileFull = Math.round(minPd * 10) / 10;   // should stay near the standoff, NOT collapse to ~0
    // ---- B) player runs far -> shadow car re-approaches (leaves shadow) ----
    __wc.teleport(ox + 60, oz);   // 60u away from the car (> SHADOW_REAPPROACH=24)
    var reapproached = false;
    for (var t2 = 0; t2 < 20; t2++) {
      __wc.state.hp = 100; __wc.setWanted(1); __wc.teleport(ox + 60, oz); __wc.player.y = 1.7;
      __wc.tick(1 / 30);
      var c1 = __wc.copCars()[0]; if (c1 && c1.state !== 'shadow') { reapproached = true; break; }
    }
    r.reapproachedState = __wc.copCars()[0] && __wc.copCars()[0].state;
    r.reapproached = reapproached;
    // ---- C) room frees up -> the car pours cops out (parks) ----
    // clear the foot cops so desiredCops - alive > 0, bring player back next to the car
    var cc2 = __wc.copCars()[0];
    __wc.teleport(cc2.x - 12, cc2.z); __wc.player.y = 1.7;   // player 12u from the cruiser
    // empty the cop list to open room
    var copsArr = __wc.cops; copsArr.length = 0;
    cc2.state = 'seek'; cc2.disgorged = false;
    var copsBefore = __wc.cops.length, disgorged = false;
    for (var t3 = 0; t3 < 30; t3++) {
      __wc.state.hp = 100; __wc.setWanted(1);
      var px = cc2.x - 12, pz = cc2.z; __wc.teleport(px, pz); __wc.player.y = 1.7;
      __wc.tick(1 / 30);
      if (__wc.copCars()[0] && __wc.copCars()[0].state === 'parked') { disgorged = true; break; }
    }
    r.disgorgeState = __wc.copCars()[0] && __wc.copCars()[0].state;
    r.copsAfter = __wc.cops.length;
    r.disgorged = disgorged;
    return r;
  });

  console.log('pageerrors:', errs.length); errs.slice(0, 6).forEach(e => console.log('  ERR:', e));
  console.log(JSON.stringify(out, null, 2));
  let ok = true;
  function chk(n, v) { console.log((v ? 'PASS' : 'FAIL') + ' - ' + n); if (!v) ok = false; }
  chk('cap full -> car shadow-parks', out.capFullState === 'shadow' && out.sawShadow);
  chk('shadow car does NOT drive onto player (minPd > 7)', out.minPdWhileFull > 7);
  chk('player runs off -> car re-approaches (leaves shadow)', out.reapproached === true);
  chk('room frees -> car parks & cops pile out', out.disgorged === true && out.copsAfter > 0);
  console.log(errs.length === 0 ? 'PASS - 0 pageerrors' : 'FAIL - pageerrors'); if (errs.length) ok = false;
  await b.close();
  process.exit(ok ? 0 : 1);
})();
