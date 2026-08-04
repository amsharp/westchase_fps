// v1.122.4 verify: shots are blocked by buildings + highway decks, heli LOS +
// 3s cadence + inaccuracy, and no side gunners.
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
    // ---- 1) a shot through a downtown building is blocked ----
    var recs = (__wc.cityBuildings && __wc.cityBuildings()) || [];
    var tall = null;
    for (var i = 0; i < recs.length; i++) { if (!tall || recs[i].H > tall.H) tall = recs[i]; }
    if (tall) {
      var half = Math.max(tall.W, tall.D) / 2 + 8;
      // cop on one side at ground, player on the far side at ground, building between
      var ax = tall.x - half, az = tall.z, bx = tall.x + half, bz = tall.z;
      r.throughBuilding = __wc.losBlocked(ax, 1.4, az, bx, 1.5, bz);   // expect true (blocked)
      // clear shot to the side of the building (no obstruction) -> not blocked
      r.clearBeside = __wc.losBlocked(tall.x - half, 1.4, tall.z + half + 30, tall.x - half, 1.5, tall.z + half + 60);
      // a heli straight overhead shooting down through the roof to a player at the base
      r.heliThroughRoof = __wc.losBlocked(tall.x + 2, tall.foundH + tall.H + 30, tall.z, tall.x, 1.5, tall.z);
    }
    // ---- 2) highway deck: player on the deck, cop underneath ----
    // find a hw:deck collider via a probe: scan a grid for a deck by asking surfAt
    // high above ground. Simpler: use __wc to find any deck collider through losBlocked
    // by locating a highway from REMAP if present.
    var deck = null;
    try {
      var RR = window.REMAP_ROADS || [];
      for (var k = 0; k < RR.length; k++) if (RR[k].kind === 'highway' && RR[k].pts && RR[k].pts.length >= 2) { deck = RR[k]; break; }
    } catch (e) {}
    if (deck) {
      var p0 = deck.pts[0], p1 = deck.pts[1];
      var mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2, elev = deck.elev || 8;
      // cop under the deck at ground, player standing ON the deck above -> blocked
      r.underHighway = __wc.losBlocked(mx, 1.4, mz, mx, elev + 1.7, mz);
      r.deckElev = elev;
    }
    // ---- 3) heli: no side gunners, single 3s cadence, LOS-gated ----
    __wc.setWanted(3);
    // give the player a gun so heli will engage (set state.equipped directly)
    __wc.state.owned = __wc.state.owned || {}; __wc.state.owned.rifle = true;
    __wc.state.equipped = 'rifle';
    var h = __wc.spawnHeli();
    r.gunnerCount = (h.gunners || []).length;   // expect 0
    // find a genuinely open patch of ground (nothing overhead) to test clear LOS
    var ox = 300, oz = 300, found = false;
    for (var sx2 = -400; sx2 <= 500 && !found; sx2 += 20) for (var sz2 = 400; sz2 <= 1200 && !found; sz2 += 20) {
      if (!__wc.losBlocked(sx2, 30, sz2, sx2, 1.7, sz2)) { ox = sx2; oz = sz2; found = true; }
    }
    r.openSpot = [ox, oz];
    // park the heli right over the player in clear sky
    __wc.teleport(ox, oz); __wc.player.y = 1.7;
    h.x = ox; h.z = oz; h.y = 34; h.state = 'fly';
    r.heliLOSClear = __wc.heliHasLOS(h);   // straight down, open field -> true
    // count fires over ~6.7s by driving heliFire directly (independent of updateHelis gating)
    h.fireT = 0;
    var fires = 0;
    for (var t = 0; t < 200; t++) {
      __wc.state.hp = 100;
      var pf = h.fireT;
      __wc.heliFire(h, 1 / 30);
      if (h.fireT > pf + 1.0) fires++;   // fireT jumped back up to ~3 -> it just fired
    }
    r.firesIn6_7s = fires;   // expect ~2-3 (once per 3s), definitely < 6
    // hit-rate sanity: over many shots at point-blank, some hit + many miss (not 100%)
    var hits = 0, N = 120; __wc.teleport(ox, oz); __wc.player.y = 1.7; h.x = ox + 4; h.z = oz; h.y = 34; h.state = 'fly';
    for (var s = 0; s < N; s++) { __wc.state.hp = 100; h.fireT = 0; __wc.heliFire(h, 1); if (__wc.state.hp < 100) hits++; }
    r.hitFrac = hits / N;   // expect between 0 and 1 (misses sometimes, hits sometimes)
    return r;
  });

  console.log('pageerrors:', errs.length); errs.slice(0, 6).forEach(e => console.log('  ERR:', e));
  console.log(JSON.stringify(out, null, 2));
  let ok = true;
  function chk(n, v) { console.log((v ? 'PASS' : 'FAIL') + ' - ' + n); if (!v) ok = false; }
  chk('shot through building is blocked', out.throughBuilding === true);
  chk('clear shot beside building not blocked', out.clearBeside === false);
  chk('heli shot straight down through roof blocked', out.heliThroughRoof === true);
  if (out.underHighway !== undefined) chk('cop under highway blocked from deck', out.underHighway === true);
  else console.log('SKIP - no highway in map to test under-deck');
  chk('no side gunners on heli', out.gunnerCount === 0);
  chk('heli has clear LOS straight down', out.heliLOSClear === true);
  chk('heli fires ~once/3s (2-3 in 6.7s)', out.firesIn6_7s >= 1 && out.firesIn6_7s <= 3);
  chk('heli misses sometimes (0<hitFrac<1)', out.hitFrac > 0 && out.hitFrac < 1);
  console.log(errs.length === 0 ? 'PASS - 0 pageerrors' : 'FAIL - pageerrors'); if (errs.length) ok = false;
  await b.close();
  process.exit(ok ? 0 : 1);
})();
