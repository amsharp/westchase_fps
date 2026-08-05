// v1.122.9: radio stops on crash, no auto-balloons, rare clown/furry/cult NPCs.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '../../index.html'), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 300000 });
  await p.evaluate(() => { __wc.start(); __wc.setClock && __wc.setClock(180); });

  const r = await p.evaluate(() => {
    var out = {};
    // 1) plane crash stops the radio (same fix path as the heli)
    __wc.spawnPlane(); __wc.boardPlane();
    __wc.radioSetStation(1);                 // radio ON in the cockpit
    out.radioBeforeCrash = __wc.radioState().playing;   // true
    __wc.crashPlane();
    out.radioAfterCrash = __wc.radioState().playing;    // expect false (stopped)
    // 2) balloons: none auto-spawn; count stays 0 across a bunch of ticks
    for (var i = 0; i < 60; i++) __wc.tick(1 / 30);
    out.balloonCount = __wc.balloonCount();             // expect 0
    // 3) rare novelty NPCs: spawn a big batch, measure the novelty fraction
    var rare = { GIGGLES: 1, RUFUS: 1, MORTIS: 1 };
    var before = __wc.npcs.length, N = 300, novelty = 0;
    for (var s = 0; s < N; s++) __wc.spawnNPC();
    for (var n = before; n < __wc.npcs.length; n++) { if (rare[__wc.npcs[n].vname]) novelty++; }
    out.spawned = __wc.npcs.length - before;
    out.novelty = novelty;
    out.noveltyPct = +(100 * novelty / out.spawned).toFixed(1);
    return out;
  });

  console.log('pageerrors:', errs.length); errs.slice(0, 6).forEach(e => console.log('  ERR:', e));
  console.log(JSON.stringify(r, null, 2));
  let ok = true;
  function chk(n, v) { console.log((v ? 'PASS' : 'FAIL') + ' - ' + n); if (!v) ok = false; }
  chk('radio was playing before crash', r.radioBeforeCrash === true);
  chk('radio stopped on plane crash', r.radioAfterCrash === false);
  chk('no auto-spawned balloons', r.balloonCount === 0);
  chk('novelty NPCs are rare (<5%, vs ~6% unweighted)', r.noveltyPct < 5);
  chk('0 pageerrors', errs.length === 0); if (errs.length) ok = false;
  await b.close();
  process.exit(ok ? 0 : 1);
})();
