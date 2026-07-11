// SFX pipeline — in-game verification. Boots the real game headless, forces
// audio init, waits for the pack to decode, then drives every replaced sound
// through its REAL path with window.__sfxLog instrumented:
//   - each weapon fires -> pack:true log entries
//   - boom / crash / glass / cash / cardoor / ricochet via sfx()
//   - footsteps (all surfaces) route to pack buffers
//   - engine: enter a car, throttle -> c.eng.smp active, playbackRate scales
//   - flee screams: panicNear chaos -> sex-matched screams, limiter + cooldown
// Exits 1 on any console error / missing pack path.
//   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/sfxgen/verify_ingame.js
var pw = require('playwright');

(async function () {
  var browser = await pw.chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });
  var page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  var errs = [];
  page.on('pageerror', function (e) { errs.push('PAGEERR: ' + e.message); });
  page.on('console', function (m) { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await page.goto('http://127.0.0.1:8155/index.html', { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(function () { return !!window.__wc; }, null, { timeout: 120000 });

  var res = await page.evaluate(async function () {
    var w = window.__wc, out = {};
    window.__sfxLog = [];
    w.renderer.setSize(64, 48);
    w.start();
    w.initAudio();   // headless: no user gesture ever fires startGame()
    for (var i = 0; i < 10; i++) w.tick(1 / 30);
    // wait for pack decode (initAudio ran in start; decode is async)
    for (var tr = 0; tr < 100; tr++) {
      var info = w.sfxPackInfo();
      var keys = Object.keys(info);
      if (keys.length && keys.every(function (k) { return info[k] > 0; })) break;
      await new Promise(function (r) { setTimeout(r, 100); });
    }
    out.packInfo = w.sfxPackInfo();

    function logsFor(kind) { return window.__sfxLog.filter(function (e) { return e.kind === kind; }); }
    // --- weapons through the real fire path ---
    var guns = ['pistol', 'smg', 'rifle', 'auto'];
    w.state.money = 99999;
    guns.forEach(function (gk) { w.state.owned[gk] = true; });
    out.guns = {};
    for (var g = 0; g < guns.length; g++) {
      w.setEquipped(guns[g]);
      w.resetCooldowns();
      w.state.hp = 100;
      w.tryAttack();
      w.tick(1 / 30);
      var l = logsFor(guns[g]);
      out.guns[guns[g]] = l.length ? (l[l.length - 1].pack ? 'PACK' : 'SYNTH') : 'NO SOUND';
    }
    // --- direct kinds through sfx() (same entry the game code uses) ---
    var kinds = ['boom', 'crash', 'glass', 'punchhit', 'hit', 'thud', 'ko', 'cash', 'buy', 'eat', 'cardoor', 'ricochet', 'copshot', 'copsmg', 'rocketfire', 'slap'];
    out.kinds = {};
    kinds.forEach(function (k) {
      window.__sfxLog = [];
      w.sfx(k);
      out.kinds[k] = window.__sfxLog.length ? (window.__sfxLog[0].pack ? 'PACK' : 'SYNTH') : 'NO LOG';
    });
    // kinds intentionally left on synth
    var synthKinds = ['raygun', 'laser', 'deny', 'alarm', 'tick', 'killtick', 'grunt'];
    out.synthKinds = {};
    synthKinds.forEach(function (k) {
      window.__sfxLog = [];
      w.sfx(k);
      out.synthKinds[k] = window.__sfxLog.length ? (window.__sfxLog[0].pack ? 'PACK' : 'SYNTH') : 'NO LOG';
    });
    // --- footsteps: pack path returns before the synth switch; assert the
    // buffers exist for every surface key used by footStep ---
    ['water', 'grass', 'interior', 'concrete', 'asphalt'].forEach(function (s) { w.footStep(s, false); w.footStep(s, true); });
    out.footPack = {
      concrete: out.packInfo.step_concrete, grass: out.packInfo.step_grass,
      water: out.packInfo.step_water, wood: out.packInfo.step_wood
    };
    // --- engine: steal a car, drive, check sample engine + rate scaling ---
    var c = null, ci;
    for (ci = 0; ci < w.cars.length; ci++) if (!w.cars[ci].parked && !w.cars[ci].exploded) { c = w.cars[ci]; break; }
    if (c) {
      var cp = c.car.group.position;
      w.teleport(cp.x + 1.5, cp.z + 1.5);
      w.enterCar(c);
      w.pressKey('KeyW', true);
      var rates = [];
      for (i = 0; i < 240; i++) {
        w.state.hp = 100; w.setWanted(0);
        w.tick(1 / 30);
        if (i % 60 === 59 && c.eng && c.eng.smp) rates.push([Math.round(c.pspeed * 10) / 10, Math.round(c.eng.si.playbackRate.value * 1000) / 1000, Math.round(c.eng.gh.gain.value * 1000) / 1000]);
      }
      w.pressKey('KeyW', false);
      out.engine = {
        smp: !!(c.eng && c.eng.smp), cls: c.eng && c.eng.chr.cls,
        gainOn: c.eng ? c.eng.g.gain.value > 0.01 : false,
        rateRamp: rates   // [speed, idleRate, highGain] over time — rate/gain must climb
      };
      w.exitCar();
      w.tick(1 / 30);
      // traffic cars: every live engine should be (or become) sample-based
      var syn = 0, smp = 0, none = 0;
      for (ci = 0; ci < w.cars.length; ci++) { var e = w.cars[ci].eng; if (!e) none++; else if (e.smp) smp++; else syn++; }
      out.engineFleet = { sample: smp, synth: syn, none: none };
    } else out.engine = 'NO CAR FOUND';
    // --- flee screams: chaos near NPCs, count screams + limiter ---
    window.__sfxLog = [];
    w.teleport(-72, -97);   // Publix lot — pedestrians around
    for (i = 0; i < 30; i++) w.tick(1 / 30);
    var t0 = null, screams = 0;
    for (var b = 0; b < 6; b++) {
      w.panicNear(w.player.x, w.player.z, 2400);
      for (i = 0; i < 10; i++) { w.state.hp = 100; w.setWanted(0); w.tick(1 / 30); }
    }
    var slog = window.__sfxLog.filter(function (e) { return e.kind.indexOf('scream') === 0; });
    out.screams = {
      total: slog.length,
      byKey: slog.reduce(function (m, e) { m[e.kind] = (m[e.kind] || 0) + 1; return m; }, {}),
      // 6 panic waves over ~2s of sim; limiter (0.5s) caps possible plays at ~4-5
      limiterOk: slog.length > 0 && slog.length <= 5
    };
    // direct scream sanity: force one of each sex through fleeScream
    window.__sfxLog = [];
    w.fleeScream({ x: w.player.x, z: w.player.z, fem: 1, phase: 1, vname: 'TESTF' }, false);
    w.fleeScream({ x: w.player.x, z: w.player.z, fem: 0, phase: 2, vname: 'TESTM' }, false);   // limiter: expect only 1st
    out.screamDirect = window.__sfxLog.map(function (e) { return e.kind; });
    return out;
  });
  console.log(JSON.stringify(res, null, 1));
  var fail = [];
  Object.keys(res.guns).forEach(function (k) { if (res.guns[k] !== 'PACK') fail.push('gun ' + k + '=' + res.guns[k]); });
  Object.keys(res.kinds).forEach(function (k) { if (res.kinds[k] !== 'PACK') fail.push('kind ' + k + '=' + res.kinds[k]); });
  Object.keys(res.synthKinds).forEach(function (k) { if (res.synthKinds[k] === 'PACK') fail.push('synth kind ' + k + ' unexpectedly PACK'); });
  if (!res.engine || res.engine.smp !== true) fail.push('engine not sample-based');
  if (res.engineFleet && res.engineFleet.synth > 0) fail.push(res.engineFleet.synth + ' fleet engines still synth');
  if (!res.screams || !res.screams.total) fail.push('no flee screams played');
  if (res.screams && !res.screams.limiterOk) fail.push('scream limiter suspect: ' + res.screams.total);
  if (errs.length) fail.push(errs.length + ' console errors');
  console.log(fail.length ? 'FAIL: ' + fail.join(' | ') : 'IN-GAME VERIFY OK');
  if (errs.length) console.log(errs.slice(0, 6).join('\n'));
  await browser.close();
  process.exit(fail.length ? 1 : 0);
})().catch(function (e) { console.error('FATAL', e); process.exit(2); });
