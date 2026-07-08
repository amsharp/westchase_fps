const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const outdir = '/tmp/claude-0/-home-user-westchase-fps/efaef73e-76aa-5d75-8d6c-935e41bd5d2d/scratchpad';
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const p = await (await browser.newContext({ viewport: { width: 900, height: 900 } })).newPage();
  const errors = [];
  p.on('pageerror', e => errors.push('PAGEERROR: ' + (e.stack || e.message)));
  p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('ERR: ' + m.text()); });
  await p.goto('http://127.0.0.1:8155/wctest.html', { waitUntil: 'load', timeout: 40000 });
  await p.waitForTimeout(3500);

  // start + run 200 ticks, sampling traffic-car positions to prove lane-graph motion
  const traffic = await p.evaluate(() => {
    const wc = window.__wc;
    (wc.startGame || wc.start)();
    const tCars = wc.cars.filter(c => !c.parked && !c.stolen);
    function snap() { return tCars.map(c => [c.car.group.position.x, c.car.group.position.z]); }
    for (let i = 0; i < 60; i++) wc.tick(1/30);
    const a = snap();
    for (let i = 0; i < 140; i++) wc.tick(1/30);
    const b = snap();
    let moved = 0, offAxis = 0;
    for (let i = 0; i < a.length; i++) {
      const d = Math.hypot(b[i][0]-a[i][0], b[i][1]-a[i][1]);
      if (d > 1) moved++;
      if (Math.abs(b[i][1]) > 6) offAxis++;   // not stuck on the z~0 axis line
    }
    return { trafficCars: tCars.length, moved, offAxis,
             sampleB: b.slice(0, 8).map(q => [Math.round(q[0]), Math.round(q[1])]) };
  });

  // aerial of the two X-crossing sidewalk sites
  await p.evaluate(() => {
    const wc = window.__wc;
    wc.state.running = false;
    ['hud','minimap','crosshair','startScreen','pauseScreen','charPanel'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none';});
    document.querySelectorAll('.overlay').forEach(e=>e.style.display='none');
    wc.scene.fog = null;
  });
  async function aerial(name, cx, cz, h) {
    await p.evaluate(([cx,cz,h])=>{const c=window.__wc.camera;c.up.set(0,0,-1);c.position.set(cx,h,cz);c.far=5000;c.updateProjectionMatrix();c.lookAt(cx,0,cz);},[cx,cz,h]);
    await p.waitForTimeout(250);
    fs.writeFileSync(outdir + '/' + name + '.png', await p.screenshot());
  }
  await aerial('fix_xcross_sw', 72, 115, 120);
  await aerial('fix_xcross_swpp', -125, -270, 120);
  await aerial('fix_venue', -40, -10, 380);

  console.log(JSON.stringify({ traffic, errors }, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
