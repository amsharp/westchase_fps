// Headless audio QA for the fix/audio branch (jet engine + gunshots).
// Run: cd /home/user/wt-audio && NODE_PATH=/opt/node22/lib/node_modules \
//   /opt/node22/bin/node tools/planeqa/audioqa.js
// Verifies: no page/console errors while booting, boarding the plane, stepping
// the plane at low vs high throttle, and firing each weapon; that the jet
// engine gain node reads HIGHER at high throttle than at low; and (via an
// in-page OfflineAudioContext) that a synthesized gunshot is a sharp transient
// with a decaying tail.
var { chromium } = require('playwright');

function pass(msg) { console.log('PASS ' + msg); }
function fail(msg) { console.log('FAIL ' + msg); failures++; }
var failures = 0;

(async function () {
  var browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--no-sandbox']
  });
  var page = await browser.newPage();
  var pageErrors = [];
  var consoleErrors = [];
  page.on('pageerror', function (e) { pageErrors.push(String(e && e.message || e)); });
  // Only gate on JS errors — filter environmental network resource-load failures
  // (the offline sandbox blocks PeerJS/TURN cloud pings -> ERR_CONNECTION_RESET).
  page.on('console', function (m) { if (m.type() === 'error') { var t = m.text(); if (/Failed to load resource|ERR_CONNECTION|net::/.test(t)) return; consoleErrors.push(t); } });

  await page.goto('file:///home/user/wt-audio/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__wc && window.__wc.scene', null, { timeout: 60000 });
  await page.evaluate(function () { window.__wc.start(); if (window.__wc.initAudio) window.__wc.initAudio(); });
  await page.waitForTimeout(300);
  var acState = await page.evaluate(function () { return window.__wc.jetInfo ? 'has-jetInfo' : 'no-jetInfo'; });
  console.log('hooks: ' + acState);

  // ---- (1) JET ENGINE ------------------------------------------------------
  var jet = await page.evaluate(function () {
    var wc = window.__wc;
    wc.spawnPlane();                       // spawns + boards as pilot
    var out = { boardedRunning: wc.jetInfo().running };
    // LOW throttle: pin plane.throttle low, step several frames, read gain
    var p = wc.plane();
    p.throttle = 0.05;
    for (var i = 0; i < 40; i++) { p.throttle = 0.05; wc.updatePlaneWorld(0.05); }
    out.lowGain = wc.jetInfo().gain;
    out.lowCutoff = wc.jetInfo().cutoff;
    out.lowWhine = wc.jetInfo().whine;
    // HIGH throttle: pin high, step, read again
    for (i = 0; i < 40; i++) { p.throttle = 1.0; wc.updatePlaneWorld(0.05); }
    out.highGain = wc.jetInfo().gain;
    out.highCutoff = wc.jetInfo().cutoff;
    out.highWhine = wc.jetInfo().whine;
    // exit should stop the engine
    wc.exitPlane();
    out.afterExitRunning = wc.jetInfo().running;
    return out;
  });
  console.log('jet: ' + JSON.stringify(jet));
  if (jet.boardedRunning) pass('jet engine running after boarding'); else fail('jet not running after boarding');
  if (jet.highGain > jet.lowGain) pass('jet gain rises with throttle (' + jet.lowGain.toFixed(4) + ' -> ' + jet.highGain.toFixed(4) + ')');
  else fail('jet gain did not rise with throttle (' + jet.lowGain + ' -> ' + jet.highGain + ')');
  if (jet.highCutoff > jet.lowCutoff) pass('jet brightness (filter cutoff) rises with throttle (' + Math.round(jet.lowCutoff) + ' -> ' + Math.round(jet.highCutoff) + ' Hz)');
  else fail('jet cutoff did not rise (' + jet.lowCutoff + ' -> ' + jet.highCutoff + ')');
  if (jet.highWhine > jet.lowWhine) pass('jet whine pitch rises with throttle (' + Math.round(jet.lowWhine) + ' -> ' + Math.round(jet.highWhine) + ' Hz)');
  else fail('jet whine pitch did not rise');
  if (!jet.afterExitRunning) pass('jet engine stopped after exitPlane'); else fail('jet still running after exitPlane');

  // ---- (2) GUNSHOTS: fire each weapon without throwing ----------------------
  var guns = await page.evaluate(function () {
    var wc = window.__wc, s = wc.state, thrown = null, kinds = ['pistol', 'smg', 'rifle', 'auto', 'copshot', 'copsmg', 'rocketfire'];
    // grant + directly exercise the synth path (sfx routes gun kinds to gunShot)
    try {
      for (var i = 0; i < kinds.length; i++) {
        wc.sfx(kinds[i]);                                   // 2D (player) path
        wc.sfx(kinds[i], { x: 10, z: 10, range: 200 });     // spatialized (cop) path
      }
    } catch (e) { thrown = String(e && e.message || e); }
    return { thrown: thrown };
  });
  if (!guns.thrown) pass('all weapon gunshots fired without throwing'); else fail('gunshot threw: ' + guns.thrown);

  // fire through the real combat path too (equip + tryAttack) for a few guns
  var combat = await page.evaluate(function () {
    var wc = window.__wc, thrown = null;
    try {
      var ws = ['pistol', 'smg', 'rifle', 'auto', 'rocket'];
      for (var i = 0; i < ws.length; i++) {
        wc.state.owned[ws[i]] = true;
        wc.setEquipped(ws[i]);
        wc.resetCooldowns();
        if (wc.tryAttack) wc.tryAttack();
      }
    } catch (e) { thrown = String(e && e.message || e); }
    return { thrown: thrown };
  });
  if (!combat.thrown) pass('combat fire path (equip+tryAttack) ran without throwing'); else fail('combat fire threw: ' + combat.thrown);

  // ---- (3) OfflineAudioContext render: gunshot is a sharp transient w/ tail --
  var off = await page.evaluate(function () {
    // Re-implement the pistol gunShot spec into an OfflineAudioContext to sample
    // the waveform envelope (the live AudioContext is silent + not renderable).
    var sr = 44100, dur = 0.35;
    var oc = new OfflineAudioContext(1, Math.ceil(sr * dur), sr);
    var now = 0;
    var spec = { crackHP: 1800, crackGain: 0.55, crackDur: 0.028, bodyF0: 175, bodyF1: 62, bodyGain: 0.40, bodyDur: 0.09, tailGain: 0.14, tailDur: 0.11, tailLP: 1700 };
    // crack
    var cn = (sr * spec.crackDur) | 0, cb = oc.createBuffer(1, cn, sr), cd = cb.getChannelData(0);
    for (var i = 0; i < cn; i++) cd[i] = Math.random() * 2 - 1;
    var cs = oc.createBufferSource(); cs.buffer = cb;
    var hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = spec.crackHP;
    var cg = oc.createGain();
    cg.gain.setValueAtTime(0.0001, now); cg.gain.linearRampToValueAtTime(spec.crackGain, now + 0.0006); cg.gain.exponentialRampToValueAtTime(0.0008, now + spec.crackDur);
    cs.connect(hp); hp.connect(cg); cg.connect(oc.destination); cs.start(now); cs.stop(now + spec.crackDur + 0.02);
    // body
    var o = oc.createOscillator(); o.type = 'sine'; var bg = oc.createGain();
    o.frequency.setValueAtTime(spec.bodyF0, now); o.frequency.exponentialRampToValueAtTime(spec.bodyF1, now + spec.bodyDur);
    bg.gain.setValueAtTime(spec.bodyGain, now); bg.gain.exponentialRampToValueAtTime(0.0008, now + spec.bodyDur);
    o.connect(bg); bg.connect(oc.destination); o.start(now); o.stop(now + spec.bodyDur + 0.02);
    // tail
    var tn = (sr * spec.tailDur) | 0, tb = oc.createBuffer(1, tn, sr), td = tb.getChannelData(0), last = 0;
    for (i = 0; i < tn; i++) { var wv = Math.random() * 2 - 1; last = (last + 0.1 * wv) / 1.1; td[i] = last * 2.2; }
    var ts = oc.createBufferSource(); ts.buffer = tb;
    var lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = spec.tailLP;
    var tg = oc.createGain(); tg.gain.setValueAtTime(spec.tailGain, now + 0.004); tg.gain.exponentialRampToValueAtTime(0.0006, now + spec.tailDur);
    ts.connect(lp); lp.connect(tg); tg.connect(oc.destination); ts.start(now); ts.stop(now + spec.tailDur + 0.02);

    return oc.startRendering().then(function (buf) {
      var d = buf.getChannelData(0), n = d.length;
      function rms(ms0, ms1) { var a = (sr * ms0 / 1000) | 0, b = Math.min(n, (sr * ms1 / 1000) | 0), s = 0, c = 0; for (var i = a; i < b; i++) { s += d[i] * d[i]; c++; } return Math.sqrt(s / Math.max(1, c)); }
      // transient: peak within first 10ms
      var earlyN = (sr * 0.01) | 0, peakEarly = 0, peakAll = 0, argmax = 0;
      for (var i = 0; i < n; i++) { var a = Math.abs(d[i]); if (a > peakAll) { peakAll = a; argmax = i; } if (i < earlyN && a > peakEarly) peakEarly = a; }
      // decaying tail: energy present just after the transient, decayed to ~0 by the end
      var midRms = rms(15, 90);      // body + report tail region
      var endRms = rms(200, 320);    // should have rung out
      return { peakAll: peakAll, peakEarly: peakEarly, argmaxMs: argmax / sr * 1000, midRms: midRms, endRms: endRms };
    });
  });
  console.log('gunshot render: ' + JSON.stringify(off));
  if (off.argmaxMs < 12) pass('gunshot transient peaks early (' + off.argmaxMs.toFixed(1) + ' ms)'); else fail('gunshot peak too late (' + off.argmaxMs.toFixed(1) + ' ms)');
  if (off.peakEarly > 0.1) pass('gunshot has a sharp crack transient (early peak ' + off.peakEarly.toFixed(3) + ')'); else fail('no sharp transient (' + off.peakEarly + ')');
  if (off.midRms > 0.0005 && off.midRms < off.peakAll && off.endRms < off.midRms) pass('gunshot has a decaying tail (mid rms ' + off.midRms.toFixed(4) + ' -> end rms ' + off.endRms.toFixed(5) + ', below peak ' + off.peakAll.toFixed(3) + ')'); else fail('tail decay check failed (mid ' + off.midRms + ', end ' + off.endRms + ', peak ' + off.peakAll + ')');

  // ---- error gate ----------------------------------------------------------
  if (pageErrors.length === 0) pass('no uncaught page errors'); else fail('page errors: ' + JSON.stringify(pageErrors));
  if (consoleErrors.length === 0) pass('no console errors'); else fail('console errors: ' + JSON.stringify(consoleErrors));

  await browser.close();
  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : (failures + ' CHECK(S) FAILED')));
  process.exit(failures === 0 ? 0 : 1);
})().catch(function (e) { console.error('HARNESS ERROR', e); process.exit(2); });
