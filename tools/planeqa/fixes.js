// tools/planeqa/fixes.js — verify the v1.68.2 follow-up fixes:
//   1. plane +30% bigger (SPAN/LENGTH scaled)
//   2. A=yaw-left / D=yaw-right (opposite signs); mouse roll direction
//   3. gradual acceleration (throttle spools slowly, low thrust)
//   4. no car shove/damage while piloting
//   5. E re-boards a parked plane
// Run: NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node tools/planeqa/fixes.js
const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  PASS', msg); } else { fail++; console.log('  FAIL', msg); } }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate(() => { __wc.start(); __wc.setWanted(0); __wc.state.hp = 100; __wc.setClock(60); });

  // ---- 1. bigger model ----
  console.log('\n[1] +30% model scale');
  const dims = await page.evaluate(() => ({ span: WC_PLANE.SPAN, len: WC_PLANE.LENGTH, clr: WC_PLANE.GROUND_CLEARANCE }));
  ok(dims.span > 14.5 && dims.span < 16, 'SPAN scaled ~+30% (=' + dims.span.toFixed(2) + ', was 11.8)');
  ok(dims.len > 18 && dims.len < 20, 'LENGTH scaled ~+30% (=' + dims.len.toFixed(2) + ', was 14.6)');

  // ---- 3. gradual acceleration ----
  console.log('\n[3] gradual throttle + acceleration');
  const accel = await page.evaluate(() => {
    __wc.teleport(0, 60); __wc.setYaw(0); __wc.spawnPlane();
    __wc.pressKey('KeyW', true);
    var thrAt1s, spdAt1s;
    for (var i = 0; i < 100; i++) { __wc.stepLite(0.03); if (i === 33) { var s = __wc.planeState(); thrAt1s = s.throttle; spdAt1s = s.spd; } }
    var full = __wc.planeState();
    __wc.pressKey('KeyW', false);
    return { thrAt1s: thrAt1s, spdAt1s: spdAt1s, thrFull: full.throttle };
  });
  console.log('  throttle@1s=' + accel.thrAt1s.toFixed(2) + '  spd@1s=' + accel.spdAt1s.toFixed(1) + '  throttle@3s=' + accel.thrFull.toFixed(2));
  ok(accel.thrAt1s < 0.55, 'throttle spools gradually (not maxed in 1s, =' + accel.thrAt1s.toFixed(2) + ')');
  ok(accel.spdAt1s < 24, 'below takeoff speed after 1s of W (gradual, spd=' + accel.spdAt1s.toFixed(1) + ')');

  // ---- 2. A=left / D=right (opposite yaw) + mouse roll direction ----
  console.log('\n[2] A/D yaw direction + mouse roll');
  const dir = await page.evaluate(() => {
    // put the plane airborne directly (isolates yaw/roll direction from the
    // takeoff roll, which needs clear runway). level flight, cruise speed.
    __wc.teleport(0, 0); __wc.setYaw(0); __wc.spawnPlane();
    var p = __wc.plane();
    p.onGround = false; p.group.position.set(0, 80, 0);
    p.group.quaternion.setFromEuler(new THREE.Euler(0, 0, 0, 'YXZ'));   // nose +Z, wings level
    var nose = new THREE.Vector3(0, 0, 1).applyQuaternion(p.group.quaternion);
    p.vel.copy(nose).multiplyScalar(45); p.throttle = 0.6;
    var i;
    for (i = 0; i < 20; i++) __wc.stepLite(0.03);   // settle
    function heading() { var p = __wc.plane(); var n = new THREE.Vector3(0,0,1).applyQuaternion(p.group.quaternion); return Math.atan2(n.x, n.z); }
    function norm(a){ while(a>Math.PI)a-=2*Math.PI; while(a<-Math.PI)a+=2*Math.PI; return a; }
    // press A a few frames, measure heading delta
    var h0 = heading();
    __wc.pressKey('KeyA', true); for (i=0;i<25;i++) __wc.stepLite(0.03); __wc.pressKey('KeyA', false);
    var dA = norm(heading() - h0);
    var rudA = __wc.planeState().controls.rudder;
    for (i=0;i<40;i++) __wc.stepLite(0.03);     // settle
    var h1 = heading();
    __wc.pressKey('KeyD', true); for (i=0;i<25;i++) __wc.stepLite(0.03); __wc.pressKey('KeyD', false);
    var dD = norm(heading() - h1);
    var rudD = __wc.planeState().controls.rudder;
    return { dA: dA, dD: dD, rudA: rudA, rudD: rudD };
  });
  console.log('  A: rud=' + dir.rudA.toFixed(2) + ' dHeading=' + dir.dA.toFixed(3) + '   D: rud=' + dir.rudD.toFixed(2) + ' dHeading=' + dir.dD.toFixed(3));
  ok(dir.rudA > 0.2, 'A gives +rudder (=' + dir.rudA.toFixed(2) + ')');
  ok(dir.rudD < -0.2, 'D gives -rudder (=' + dir.rudD.toFixed(2) + ')');
  ok(Math.sign(dir.dA) !== Math.sign(dir.dD) && Math.abs(dir.dA) > 0.02 && Math.abs(dir.dD) > 0.02, 'A and D yaw the plane opposite ways');

  // Roll correctness is anchored to the VERIFIED A=turn-left result: a left roll
  // must, through the game's banked-turn coupling, drift the heading the SAME way
  // pressing A (rudder-left) does. So mouse-LEFT drift sign == A drift sign, and
  // mouse-RIGHT is the opposite. (Absolute "left" here = sign(dir.dA), which the
  // user confirmed is A's turn direction.)
  const leftSign = Math.sign(dir.dA);
  function measureRoll(dx) {
    return page.evaluate((dx) => {
      __wc.teleport(0, 0); __wc.setYaw(0); __wc.spawnPlane();
      var p = __wc.plane();
      p.onGround = false; p.group.position.set(0, 120, 0);
      p.group.quaternion.setFromEuler(new THREE.Euler(0, 0, 0, 'YXZ'));
      var nose = new THREE.Vector3(0, 0, 1).applyQuaternion(p.group.quaternion);
      p.vel.copy(nose).multiplyScalar(45); p.throttle = 0.6;
      var i;
      for (i = 0; i < 15; i++) __wc.stepLite(0.03);
      function heading() { var pp = __wc.plane(); var n = new THREE.Vector3(0,0,1).applyQuaternion(pp.group.quaternion); return Math.atan2(n.x, n.z); }
      function norm(a){ while(a>Math.PI)a-=2*Math.PI; while(a<-Math.PI)a+=2*Math.PI; return a; }
      var h0 = heading();
      // hold the roll, then let the bank drive a coordinated turn
      for (i = 0; i < 60; i++) { __wc.planeMouse(dx, 0); var s = __wc.planeState(); if (!s) return { dead: true }; __wc.stepLite(0.03); }
      var ail = __wc.planeState().controls.aileron;
      return { dHeading: norm(heading() - h0), ail: ail };
    }, dx);
  }
  const ml = await measureRoll(-60);   // mouse LEFT
  const mr = await measureRoll(60);    // mouse RIGHT
  console.log('  mouse-left: ail=' + (ml.ail||0).toFixed(2) + ' dHeading=' + (ml.dHeading||0).toFixed(3) + '   mouse-right: ail=' + (mr.ail||0).toFixed(2) + ' dHeading=' + (mr.dHeading||0).toFixed(3) + '   (A-left sign=' + leftSign + ')');
  ok(!ml.dead && Math.sign(ml.dHeading) === leftSign && Math.abs(ml.dHeading) > 0.03, 'mouse-LEFT rolls+turns the same way A does (left)');
  ok(!mr.dead && Math.sign(mr.dHeading) === -leftSign && Math.abs(mr.dHeading) > 0.03, 'mouse-RIGHT rolls+turns opposite (right)');

  // ---- 4. no car damage while piloting ----
  console.log('\n[4] no car shove/damage while piloting');
  const carDmg = await page.evaluate(() => {
    var cars = __wc.cars;
    if (!cars || !cars.length) return { noCar: true };
    function overlapCar(piloting) {
      __wc.state.dead = false; __wc.state.hp = 100; __wc.setWanted(0); __wc.state.lastCarHit = -999;
      var c = cars[0], gp = c.car.group.position;
      __wc.teleport(gp.x, gp.z); __wc.setYaw(0);
      if (piloting) { __wc.spawnPlane(); }
      else if (__wc.plane()) { /* leave whatever */ }
      var hp0 = __wc.state.hp;
      for (var i = 0; i < 30; i++) {
        gp = c.car.group.position;
        __wc.player.x = gp.x; __wc.player.z = gp.z;   // sit right on the car
        var p = __wc.plane(); if (piloting && p) { p.group.position.x = gp.x; p.group.position.z = gp.z; }
        __wc.updateCars(0.03);
      }
      return { hp0: hp0, hp: __wc.state.hp };
    }
    var flying = overlapCar(true);
    // control: remove the plane so the player is a normal pedestrian on the car
    __wc.removePlane();
    var onFoot = overlapCar(false);
    return { flying: flying, onFoot: onFoot };
  });
  if (carDmg.noCar) { console.log('  (no car available to test)'); ok(false, 'a car exists to test against'); }
  else {
    console.log('  piloting hp ' + carDmg.flying.hp0 + '->' + carDmg.flying.hp + (carDmg.onFoot ? '   on-foot control hp ' + carDmg.onFoot.hp0 + '->' + carDmg.onFoot.hp : ''));
    ok(carDmg.flying.hp === carDmg.flying.hp0, 'piloting over a car dealt NO damage (hp ' + carDmg.flying.hp0 + '->' + carDmg.flying.hp + ')');
    if (carDmg.onFoot) ok(carDmg.onFoot.hp < carDmg.onFoot.hp0, 'control: on foot the same overlap DID hurt (hp ' + carDmg.onFoot.hp0 + '->' + carDmg.onFoot.hp + ') — proves the guard is what protects the pilot');
  }

  // ---- 5. E re-boards a parked plane ----
  console.log('\n[5] E re-boards a parked plane');
  const reboard = await page.evaluate(() => {
    __wc.state.dead = false; __wc.state.hp = 100; __wc.setWanted(0);
    __wc.teleport(0, 60); __wc.setYaw(0); __wc.spawnPlane();
    for (var i = 0; i < 5; i++) __wc.stepLite(0.03);
    __wc.exitPlane();                                   // safe park -> not piloting
    var wasPiloting = __wc.plane() && __wc.plane().piloting;
    // player is beside the nose (~3.2u away). fire a real E keydown so the
    // document keydown handler (where the re-board logic lives) runs.
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    var nowPiloting = __wc.plane() && __wc.plane().piloting;
    return { wasPiloting: wasPiloting, nowPiloting: nowPiloting };
  });
  ok(reboard.wasPiloting === false, 'not piloting right after a parked exit');
  ok(reboard.nowPiloting === true, 'E re-boarded the parked plane (piloting again)');

  console.log('\nERRORS:', errs.length, JSON.stringify(errs.slice(0, 8)));
  console.log('\n==== RESULT: ' + pass + ' passed, ' + fail + ' failed ====');
  await browser.close();
  process.exit(fail > 0 || errs.length > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
