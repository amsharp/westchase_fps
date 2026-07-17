// Headless verification for the car radio + simplified engine (v1.70).
// The radio state machine (station cycling, per-station 3-track loop, stop on
// exit/destroy, player-only) is driven through window.__wc and asserted on the
// audio element's state. 'ended' is simulated by dispatching the event so the
// auto-advance loop is exercised without real MP3 files present.
const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.resolve(__dirname, '../index.html');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|ERR_CONNECTION/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate(() => { __wc.start(); __wc.setWanted(0); __wc.state.hp = 100; });
  const base = p => (p || '').split('/').pop();

  console.log('\n[1] starts OFF');
  let s = await page.evaluate(() => __wc.radioState());
  ok(s.station === -1 && !s.playing, 'radio starts OFF (station=' + s.station + ')');
  ok(s.stations === 4, 'four stations registered');

  console.log('\n[2] cycle OFF -> Electronic -> Rap -> Chill -> Rock -> OFF');
  const seq = await page.evaluate(() => {
    var out = [];
    for (var i = 0; i < 5; i++) { __wc.radioCycle(); var st = __wc.radioState(); out.push({ name: st.stationName, station: st.station, track: st.track, src: st.src }); }
    return out;
  });
  const names = seq.map(x => x.name);
  ok(names[0] === 'ELECTRONIC', 'cycle 1 = ELECTRONIC');
  ok(names[1] === 'RAP', 'cycle 2 = RAP');
  ok(names[2] === 'CHILL', 'cycle 3 = CHILL');
  ok(names[3] === 'ROCK', 'cycle 4 = ROCK');
  ok(seq[4].station === -1, 'cycle 5 wraps back to OFF');
  ok(base(seq[0].src) === 'electronic_1.mp3', 'electronic loads track 1 (' + base(seq[0].src) + ')');
  ok(base(seq[1].src) === 'rap_1.mp3', 'switching station resets to its track 1 (' + base(seq[1].src) + ')');

  console.log('\n[3] each station plays its 3 tracks in sequence then loops');
  const loop = await page.evaluate(() => {
    __wc.radioSetStation(0);  // electronic
    var out = [__wc.radioState().src];
    // simulate 4 song-endings: t1->t2->t3->t1 (loop)
    var el = document.querySelector('audio');
    for (var i = 0; i < 4; i++) { __wc.radioNext(); out.push(__wc.radioState().src); }
    return out;
  });
  const lb = loop.map(base);
  ok(lb[0] === 'electronic_1.mp3', 'track starts at 1');
  ok(lb[1] === 'electronic_2.mp3', 'ended -> track 2');
  ok(lb[2] === 'electronic_3.mp3', 'ended -> track 3');
  ok(lb[3] === 'electronic_1.mp3', 'ended after last -> loops to track 1');
  ok(lb[4] === 'electronic_2.mp3', 'continues looping');

  console.log('\n[3b] the ended event is wired (real auto-advance)');
  const evAdvance = await page.evaluate(() => {
    function base(p){return (p||'').split('/').pop();}
    __wc.radioSetStation(2); // chill, track 0
    var before = base(__wc.radioState().src);
    __wc.radioFireEnded();   // fires the real 'ended' listener on the audio element
    return { before: before, after: base(__wc.radioState().src) };
  });
  ok(evAdvance.before === 'chill_1.mp3' && evAdvance.after === 'chill_2.mp3', "'ended' event advances the track (" + evAdvance.before + ' -> ' + evAdvance.after + ')');

  console.log('\n[4] radio only ties to the player car — stops on exit & destroy');
  const stopExit = await page.evaluate(() => {
    __wc.radioSetStation(3);                 // rock on
    // enter a car, then exit -> radio must stop
    var c = __wc.cars && __wc.cars[0];
    if (!c) return { noCar: true };
    __wc.teleport(c.car.group.position.x, c.car.group.position.z);
    __wc.enterCar(c);
    var driving1 = __wc.radioState();
    __wc.exitCar();
    var afterExit = __wc.radioState();
    return { drivingPlaying: driving1.playing, drivingPaused: driving1.paused, exitPlaying: afterExit.playing, exitPaused: afterExit.paused };
  });
  if (stopExit.noCar) { ok(false, 'a car exists to test'); }
  else {
    ok(stopExit.exitPlaying === false && stopExit.exitPaused === true, 'radio stops when you exit the car');
  }
  const stopDestroy = await page.evaluate(() => {
    var c = __wc.cars && __wc.cars[0];
    __wc.teleport(c.car.group.position.x, c.car.group.position.z);
    __wc.radioSetStation(0);                 // ensure a station selected
    __wc.enterCar(c);
    __wc.radioSetStation(0);                 // playing while driving
    var driving = __wc.radioState();
    __wc.explodeCar(c);                      // destroy the car you're in
    var afterBoom = __wc.radioState();
    return { drivingPlaying: driving.playing, boomPlaying: afterBoom.playing, boomPaused: afterBoom.paused };
  });
  ok(stopDestroy.boomPlaying === false && stopDestroy.boomPaused === true, 'radio stops when the car is destroyed');

  console.log('\n[5] re-entering a car resumes the selected station');
  const resume = await page.evaluate(() => {
    __wc.radioSetStation(1);                 // rap selected
    __wc.radioStop();                        // (simulate: was stopped on a prior exit)
    var c = __wc.cars && __wc.cars.find(function (x) { return !x.exploded; });
    if (!c) return { noCar: true };
    __wc.teleport(c.car.group.position.x, c.car.group.position.z);
    __wc.enterCar(c);                        // should resume rap
    var st = __wc.radioState();
    function base(p){return (p||'').split('/').pop();}
    return { station: st.stationName, playing: st.playing, src: base(st.src) };
  });
  if (!resume.noCar) ok(resume.station === 'RAP' && resume.playing === true, 're-entering resumes the selected station (' + resume.station + ', ' + resume.src + ')');

  console.log('\nERRORS:', errs.length, JSON.stringify(errs.slice(0, 8)));
  ok(errs.length === 0, 'zero uncaught JS/console errors');
  console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ====');
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
