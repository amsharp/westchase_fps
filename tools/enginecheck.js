const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader','--no-sandbox'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  const r = await p.evaluate(() => {
    __wc.start(); __wc.setWanted(0);
    // unlock the AudioContext the way a real keypress would (initAudio is gated on a gesture)
    __wc.initAudio();
    
    var c = __wc.cars && __wc.cars[0]; if (!c) return { noCar: true };
    __wc.teleport(c.car.group.position.x, c.car.group.position.z);
    __wc.enterCar(c);
    for (var i = 0; i < 40; i++) __wc.tick(0.03);   // drive/idle a bit so engineTick runs
    var e = c.eng || {};
    return { hasEng: !!c.eng, syn: !!e.syn, smp: !!e.smp, hasO2: (e.o2 !== undefined), hasO: (e.o !== undefined), hasSub: (e.sub !== undefined), gain: e.g ? Math.round(e.g.gain.value*1000)/1000 : null };
  });
  console.log('engine:', JSON.stringify(r));
  console.log('errors:', errs.length, JSON.stringify(errs.slice(0,5)));
  const ok = r.hasEng && r.syn && !r.smp && !r.hasO2 && r.hasO && r.hasSub && errs.length === 0;
  console.log(ok ? 'PASS simplified synth engine (single osc + sub, no detuned o2, no samples), no errors' : 'FAIL');
  await b.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
