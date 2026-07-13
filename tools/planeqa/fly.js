// tools/planeqa/fly.js — headless verification for the flyable Learjet.
//
// Drives the plane through window.__wc under swiftshader and asserts the flight
// physics / crash / bail behavior via state inspection. Stepping is done with
// __wc.stepLite (physics only, no scene render) inside single page.evaluate
// batches so it stays fast; the scene is only rendered for the screenshots.
//
// Run:  NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node tools/planeqa/fly.js
// Out:  tools/planeqa/shots/*.png  + PASS/FAIL log to stdout
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const W = 900, H = 560;
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  PASS', msg); } else { fail++; console.log('  FAIL', msg); } }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  // resource-load noise is expected here (plane.js is owned by another agent and
  // absent in this worktree -> inline fallback; PeerJS signaling resets offline).
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate(() => { __wc.start(); __wc.setWanted(0); __wc.state.hp = 100; __wc.setClock(60); });

  async function shot(name) {
    const url = await page.evaluate(() => { __wc.renderer.render(__wc.scene, __wc.camera); return __wc.renderer.domElement.toDataURL('image/png'); });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  }
  async function st() { return await page.evaluate(() => __wc.planeState()); }

  console.log('WC_PLANE present:', await page.evaluate(() => typeof WC_PLANE !== 'undefined' && !!WC_PLANE.build));

  // ---- 1. spawn: sits on ground, gear down, piloting ----
  console.log('\n[1] spawn + board');
  await page.evaluate(() => { __wc.teleport(0, 60); __wc.setYaw(0); __wc.spawnPlane(); });
  let s = await st();
  ok(s !== null, 'plane exists after spawnPlane');
  ok(s.piloting === true, 'player is piloting immediately');
  ok(s.onGround === true, 'plane on ground');
  ok(Math.abs(s.spd) < 1, 'plane starts at rest (spd=' + s.spd + ')');
  ok(s.gearT < 0.05, 'gear down (gearT=' + s.gearT + ')');
  ok(s.alt > 0.5 && s.alt < 4, 'CG rests at ground clearance (alt=' + s.alt + ')');
  await shot('1_spawn');

  // ---- 2a. below takeoff speed it does NOT climb ----
  console.log('\n[2a] taxi at low throttle -> stays grounded, no climb');
  s = await page.evaluate(() => {
    __wc.pressKey('KeyW', true);
    for (var i = 0; i < 30; i++) __wc.stepLite(0.03);   // ~0.9s throttle, no elevator
    __wc.pressKey('KeyW', false);
    return __wc.planeState();
  });
  ok(s.onGround === true && s.alt < 4, 'still on ground below takeoff speed (spd=' + s.spd + ' alt=' + s.alt + ')');

  // ---- 2b. full throttle + pull up -> LIFTOFF above takeoff speed ----
  console.log('\n[2b] full throttle + elevator up -> liftoff');
  const lift = await page.evaluate(() => {
    __wc.pressKey('KeyW', true);
    var startAlt = __wc.planeState().alt, liftFrame = -1, liftSpd = 0, liftAlt = 0;
    for (var i = 0; i < 300; i++) {
      __wc.planeMouse(0, 40);                            // mouse-down => climb
      __wc.stepLite(0.03);
      var c = __wc.planeState(); if (!c) break;
      if (liftFrame < 0 && !c.onGround) { liftFrame = i; liftSpd = c.spd; liftAlt = c.alt; }
      if (liftFrame >= 0 && c.alt > startAlt + 25) break;
    }
    __wc.pressKey('KeyW', false);
    return { startAlt: startAlt, liftFrame: liftFrame, liftSpd: liftSpd, cur: __wc.planeState() };
  });
  console.log('  liftoff frame', lift.liftFrame, 'liftSpd', lift.liftSpd, 'alt now', lift.cur && lift.cur.alt);
  ok(lift.liftFrame >= 0, 'plane left the ground');
  ok(lift.liftSpd >= 20, 'reached ~takeoff speed before liftoff (spd=' + lift.liftSpd + ')');
  ok(lift.cur && lift.cur.alt > lift.startAlt + 8, 'gained altitude after liftoff (alt=' + (lift.cur && lift.cur.alt) + ')');
  await shot('2_climb');

  // ---- 3. gear retract above ~15 + control surfaces deflect ----
  console.log('\n[3] gear retract + control-surface deflection');
  s = await page.evaluate(() => {
    __wc.pressKey('KeyW', true);
    for (var i = 0; i < 200 && __wc.planeState().alt < 32; i++) { __wc.planeMouse(0, 20); __wc.stepLite(0.03); }
    __wc.pressKey('KeyW', false);
    return __wc.planeState();
  });
  ok(s.alt > 15, 'climbed above gear-up altitude (alt=' + s.alt + ')');
  ok(s.gearT > 0.6, 'gear retracted at altitude (gearT=' + s.gearT + ')');
  const surf = await page.evaluate(() => {
    for (var i = 0; i < 8; i++) { __wc.planeMouse(60, 0); __wc.stepLite(0.03); }
    var ail = __wc.planeState().controls.aileron;
    __wc.pressKey('KeyD', true); for (i = 0; i < 8; i++) __wc.stepLite(0.03);
    var rud = __wc.planeState().controls.rudder;
    __wc.pressKey('KeyD', false);
    return { ail: ail, rud: rud };
  });
  ok(Math.abs(surf.ail) > 0.2, 'aileron deflects on roll input (ail=' + surf.ail + ')');
  ok(Math.abs(surf.rud) > 0.2, 'rudder deflects on A/D (rud=' + surf.rud + ')');
  // gear re-deploys when we come back down below ~12
  const redeploy = await page.evaluate(() => {
    __wc.pressKey('KeyS', true);                          // cut throttle
    __wc.planeMouse(0, -80);                              // nose down, descend
    for (var i = 0; i < 400 && __wc.planeState() && __wc.planeState().alt > 8; i++) { __wc.planeMouse(0, -30); __wc.stepLite(0.03); }
    __wc.pressKey('KeyS', false);
    return __wc.planeState();
  });
  ok(redeploy && redeploy.gearT < 0.5, 'gear re-deployed near the ground (gearT=' + (redeploy && redeploy.gearT) + ' alt=' + (redeploy && redeploy.alt) + ')');
  await shot('3_airborne');

  // ---- 4. chase cam frames the plane ----
  console.log('\n[4] chase cam frames the plane + world');
  await page.evaluate(() => { __wc.teleport(0, 40); __wc.spawnPlane(); __wc.pressKey('KeyW', true); for (var i = 0; i < 120; i++) { __wc.planeMouse(0, 20); __wc.stepLite(0.03); } __wc.pressKey('KeyW', false); });
  const camInfo = await page.evaluate(() => {
    var p = __wc.plane(); if (!p) return null;
    var cam = __wc.camera, gp = p.group.position;
    var d = Math.sqrt(Math.pow(cam.position.x - gp.x, 2) + Math.pow(cam.position.y - gp.y, 2) + Math.pow(cam.position.z - gp.z, 2));
    return { dist: Math.round(d * 10) / 10 };
  });
  ok(camInfo && camInfo.dist > 6 && camInfo.dist < 32, 'camera trails behind plane (dist=' + (camInfo && camInfo.dist) + ')');
  await shot('4_chasecam');

  // ---- 5. crash -> plane gone + pilot dead + debris + scorch ----
  console.log('\n[5] crash: explosion + debris + scorch + pilot death');
  const crash = await page.evaluate(() => {
    __wc.state.hp = 100; __wc.state.dead = false;
    __wc.crashPlane();
    for (var i = 0; i < 3; i++) __wc.updatePlaneWorld(0.03);
    return { plane: !!__wc.plane(), dead: __wc.state.dead, hp: __wc.state.hp, props: __wc.planeProps() };
  });
  ok(crash.plane === false, 'plane removed after crash');
  ok(crash.dead === true && crash.hp <= 0, 'pilot died in the crash (hp=' + crash.hp + ')');
  ok(crash.props.debris > 0, 'debris spawned on crash (n=' + crash.props.debris + ')');
  ok(crash.props.scorch > 0, 'scorch decal laid on crash (n=' + crash.props.scorch + ')');
  await shot('5_crash');

  // ---- 5b. debris + scorch despawn after 60s ----
  console.log('\n[5b] crash-prop despawn after 60s');
  const desp = await page.evaluate(() => {
    for (var i = 0; i < 65; i++) __wc.updatePlaneWorld(1.0);   // fast-forward > 60s
    return __wc.planeProps();
  });
  ok(desp.debris === 0, 'debris despawned after 60s (n=' + desp.debris + ')');
  ok(desp.scorch === 0, 'scorch despawned after 60s (n=' + desp.scorch + ')');

  // ---- 6. bail out at altitude -> lethal fall damage ----
  console.log('\n[6] bail-out fall damage');
  const bail = await page.evaluate(() => {
    __wc.state.dead = false; __wc.state.hp = 100; __wc.setWanted(0);
    __wc.teleport(0, 40); __wc.setYaw(0); __wc.spawnPlane();
    __wc.pressKey('KeyW', true);
    for (var i = 0; i < 250 && __wc.planeState().alt < 45; i++) { __wc.planeMouse(0, 24); __wc.stepLite(0.03); }
    __wc.pressKey('KeyW', false);
    var pre = __wc.planeState();
    __wc.exitPlane();                                     // bail at altitude
    var startHp = __wc.state.hp;
    for (i = 0; i < 300 && !__wc.state.dead && !__wc.player.grounded; i++) __wc.stepLite(0.03);
    return { preAlt: pre.alt, preSpd: pre.spd, startHp: startHp, dead: __wc.state.dead, hp: __wc.state.hp, grounded: __wc.player.grounded };
  });
  console.log('  bailed at alt', bail.preAlt, 'spd', bail.preSpd, '-> hp', bail.hp, 'dead', bail.dead);
  ok(bail.preAlt > 15, 'bailed from real altitude (alt=' + bail.preAlt + ')');
  ok(bail.dead === true || bail.hp <= 0, 'bailing from altitude was lethal (hp=' + bail.hp + ' dead=' + bail.dead + ')');
  await shot('6_bail');

  // ---- 7. safe low-speed touchdown does NOT crash ----
  console.log('\n[7] gentle low-and-slow exit is safe (no death)');
  const safe = await page.evaluate(() => {
    __wc.state.dead = false; __wc.state.hp = 100; __wc.setWanted(0);
    __wc.teleport(0, 60); __wc.setYaw(0); __wc.spawnPlane();   // on ground, at rest
    for (var i = 0; i < 5; i++) __wc.stepLite(0.03);
    var beforeHp = __wc.state.hp;
    __wc.exitPlane();                                     // slow + grounded => safe park
    return { dead: __wc.state.dead, hp: __wc.state.hp, beforeHp: beforeHp, planeStill: !!__wc.plane() };
  });
  ok(safe.dead === false && safe.hp === safe.beforeHp, 'safe ground exit did not hurt the pilot (hp=' + safe.hp + ')');
  ok(safe.planeStill === true, 'plane stays parked after a safe exit');

  console.log('\nERRORS:', errs.length, JSON.stringify(errs.slice(0, 8)));
  console.log('\n==== RESULT: ' + pass + ' passed, ' + fail + ' failed ====');
  await browser.close();
  process.exit(fail > 0 || errs.length > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
