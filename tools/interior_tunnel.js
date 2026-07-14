// Decisive test for the one-way-barrier CLASS: collision tunneling. At low fps /
// sprint, one frame's step can exceed a collider's thickness and strand you on
// the far side (you got in, can't get back = one-way). Drives real updatePlayer
// sprinting straight at each interior collider from both sides at a punishing
// framerate; asserts the player never ends up tunneled to the far side.
const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await p.evaluate(() => { __wc.start(); __wc.setWanted(0); __wc.state.hp = 100; });

  const interiors = ['gas', 'publix', 'dunkin', 'starbucks', 'sakura', 'dollar_tree', 'bank'];
  let totalTunnels = 0;
  for (const fps of [15, 10]) {
    console.log('\n===== sprint into colliders @ ' + fps + ' FPS (step≈' + (8.4 / fps).toFixed(2) + 'u) =====');
    for (const id of interiors) {
      const res = await p.evaluate(({ id, fps }) => {
        var dt = 1 / fps;
        if (id === 'gas') { __wc.enterStore(); } else { __wc.enterInterior(id); }
        var ci = __wc.curInteriorRef();
        var list = (id === 'gas') ? __wc.intCollidersRef() : (ci ? ci.colliders : []);
        var Y = (ci ? ci.box.y : -60) + 1.6;
        var tunnels = [];
        function sprintFrom(sx, sz, tx, tz) {
          __wc.player.x = sx; __wc.player.z = sz; __wc.player.y = Y;
          // hold shift(sprint)+W, aim at target, run ~ enough frames to cover 2x the gap
          __wc.pressKey('ShiftLeft', true); __wc.pressKey('KeyW', true);
          for (var k = 0; k < 30; k++) { __wc.setYaw(Math.atan2(-(tx - __wc.player.x), -(tz - __wc.player.z))); __wc.stepLite(dt); }
          __wc.pressKey('KeyW', false); __wc.pressKey('ShiftLeft', false);
          return { x: __wc.player.x, z: __wc.player.z };
        }
        for (var i = 0; i < list.length; i++) {
          var c = list[i]; if (c.obb) continue;   // AABB furniture/walls (the tunnelable ones)
          var cxc = (c.x0 + c.x1) / 2, czc = (c.z0 + c.z1) / 2, hw = (c.x1 - c.x0) / 2, hd = (c.z1 - c.z0) / 2;
          // approach along whichever axis is thinner (easiest to tunnel)
          if (hw <= hd) {
            var off = hw + 0.7;
            var end = sprintFrom(cxc - off, czc, cxc + off, czc);   // from -x toward +x
            if (end.x > cxc + hw) tunnels.push({ i: i, thick: Math.round(hw * 2 * 100) / 100, from: '-x', endX: Math.round(end.x * 100) / 100, cx: Math.round(cxc * 100) / 100 });
            var end2 = sprintFrom(cxc + off, czc, cxc - off, czc);
            if (end2.x < cxc - hw) tunnels.push({ i: i, thick: Math.round(hw * 2 * 100) / 100, from: '+x', endX: Math.round(end2.x * 100) / 100, cx: Math.round(cxc * 100) / 100 });
          } else {
            var offz = hd + 0.7;
            var e3 = sprintFrom(cxc, czc - offz, cxc, czc + offz);
            if (e3.z > czc + hd) tunnels.push({ i: i, thick: Math.round(hd * 2 * 100) / 100, from: '-z', endZ: Math.round(e3.z * 100) / 100, cz: Math.round(czc * 100) / 100 });
            var e4 = sprintFrom(cxc, czc + offz, cxc, czc - offz);
            if (e4.z < czc - hd) tunnels.push({ i: i, thick: Math.round(hd * 2 * 100) / 100, from: '+z', endZ: Math.round(e4.z * 100) / 100, cz: Math.round(czc * 100) / 100 });
          }
        }
        __wc.exitInterior && __wc.exitInterior();
        return { id: id, aabb: list.filter(function (c) { return !c.obb; }).length, tunnels: tunnels };
      }, { id, fps });
      totalTunnels += res.tunnels.length;
      console.log('  ' + res.id.toUpperCase().padEnd(12) + (res.tunnels.length ? 'TUNNELED x' + res.tunnels.length + '  ' + JSON.stringify(res.tunnels.slice(0, 3)) : 'ok (' + res.aabb + ' AABB colliders, none tunneled)'));
    }
  }
  console.log('\nTOTAL TUNNELS: ' + totalTunnels + (totalTunnels === 0 ? '  — PASS (no tunneling one-way barriers)' : '  — FAIL'));
  console.log('errors:', errs.length, JSON.stringify(errs.slice(0, 4)));
  await b.close();
  process.exit(totalTunnels === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
