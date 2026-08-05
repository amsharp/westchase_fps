// v1.122.6 verify: radio station name HUD text is back; plane/heli radio defaults OFF.
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
    // 1) setting a station shows its name on the HUD chip
    __wc.radioSetStation(1);   // index 1 = RAP
    var hud1 = __wc.radioHudText();
    r.station1 = __wc.radioState().stationName;
    r.hud1text = hud1 && hud1.text; r.hud1shown = hud1 && hud1.shown;
    // 2) turning it off shows RADIO OFF
    __wc.radioSetStation(-1);
    var hud2 = __wc.radioHudText();
    r.hud2text = hud2 && hud2.text;
    r.offStation = __wc.radioState().station;
    // 3) cycle order from OFF: Electronic -> Rap -> Chill -> Rock -> OFF
    var order = [];
    for (var i = 0; i < 5; i++) { __wc.radioCycle(); order.push(__wc.radioState().stationName); }
    r.cycleOrder = order;
    // 4) plane/heli default OFF: turn the radio ON, then board the heli -> should be OFF
    __wc.radioSetStation(2);   // CHILL on
    r.beforeBoard = __wc.radioState().station;   // 2
    __wc.spawnPlayerHeli(); __wc.boardHeli();
    r.heliBoardStation = __wc.radioState().station;   // expect -1 (off by default)
    // and R cycles it while piloting -> Electronic (index 0)
    __wc.radioCycle();   // simulates the R keybind action while piloting
    r.heliAfterCycle = __wc.radioState().station;     // expect 0
    __wc.exitHeli();
    r.afterExit = __wc.radioState().station;           // exit stops radio (station saved to heliRadio)
    return r;
  });

  console.log('pageerrors:', errs.length); errs.slice(0, 6).forEach(e => console.log('  ERR:', e));
  console.log(JSON.stringify(out, null, 2));
  let ok = true;
  function chk(n, v) { console.log((v ? 'PASS' : 'FAIL') + ' - ' + n); if (!v) ok = false; }
  chk('station name HUD shows RAP', out.hud1text === '♪ RAP' && out.hud1shown === true && out.station1 === 'RAP');
  chk('RADIO OFF text on off', out.hud2text === 'RADIO OFF' && out.offStation === -1);
  chk('cycle order OFF->Electronic->Rap->Chill->Rock->OFF',
    JSON.stringify(out.cycleOrder) === JSON.stringify(['ELECTRONIC', 'RAP', 'CHILL', 'ROCK', 'OFF']));
  chk('heli boards with radio OFF (was on)', out.beforeBoard === 2 && out.heliBoardStation === -1);
  chk('R cycles radio while piloting heli', out.heliAfterCycle === 0);
  console.log(errs.length === 0 ? 'PASS - 0 pageerrors' : 'FAIL - pageerrors'); if (errs.length) ok = false;
  await b.close();
  process.exit(ok ? 0 : 1);
})();
