// quick: confirm gear still auto-retracts with the bigger/gentler plane + grab a
// chase-cam screenshot of the +30% Learjet in flight.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate(() => { __wc.start(); __wc.setWanted(0); __wc.state.hp = 100; __wc.setClock(70); });
  const r = await page.evaluate(() => {
    // put it airborne cleanly, cruise + gentle climb, then read gear
    __wc.teleport(0, 0); __wc.setYaw(0); __wc.spawnPlane();
    var p = __wc.plane();
    p.onGround = false; p.group.position.set(0, 6, 0);
    var nose = new THREE.Vector3(0,0,1).applyQuaternion(p.group.quaternion);
    p.vel.copy(nose).multiplyScalar(40); p.throttle = 1;
    var gearLow = null;
    for (var i = 0; i < 200; i++) { __wc.planeMouse(0, 12); __wc.stepLite(0.03); var s = __wc.planeState(); if (!s) break; if (i === 10) gearLow = s.gearT; if (s.alt > 30) break; }
    var s2 = __wc.planeState();
    __wc.updatePlaneCam ? 0 : 0;
    return { gearLow: gearLow, gearHigh: s2 && s2.gearT, alt: s2 && s2.alt };
  });
  console.log('gear near ground:', r.gearLow, ' gear at alt', r.alt, ':', r.gearHigh);
  console.log(r.gearHigh > 0.6 ? 'PASS gear auto-retracted with the bigger plane' : 'FAIL gear did not retract');
  const url = await page.evaluate(() => { __wc.renderer.render(__wc.scene, __wc.camera); return __wc.renderer.domElement.toDataURL('image/jpeg', 0.85); });
  fs.writeFileSync(path.join(__dirname, 'bigplane.jpg'), Buffer.from(url.split(',')[1], 'base64'));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
