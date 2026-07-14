// Faithful one-way-barrier repro: drives the REAL updatePlayer (via __wc.stepLite)
// with movement input, at 60fps AND 30fps, walking the player from the door to
// targets around each interior and back. A target reached going out but not
// reachable coming back = a one-way barrier (tunneling). Reports the stuck spot.
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
  for (const fps of [60, 30]) {
    console.log('\n================ ' + fps + ' FPS (dt=' + (1 / fps).toFixed(4) + ') ================');
    for (const id of interiors) {
      const res = await p.evaluate(({ id, fps }) => {
        var dt = 1 / fps;
        if (id === 'gas') { __wc.enterStore(); } else { __wc.enterInterior(id); }
        var ci = __wc.curInteriorRef();
        var list = (id === 'gas') ? __wc.intCollidersRef() : (ci ? ci.colliders : []);
        if (!list.length) return { id: id, err: 'no colliders' };
        // door/start = current player position after enter; bounds from collider union
        var X0 = 1e9, X1 = -1e9, Z0 = 1e9, Z1 = -1e9;
        list.forEach(function (c) { if (c.obb) { X0 = Math.min(X0, c.x - c.hx - c.hz); X1 = Math.max(X1, c.x + c.hx + c.hz); Z0 = Math.min(Z0, c.z - c.hx - c.hz); Z1 = Math.max(Z1, c.z + c.hx + c.hz); } else { X0 = Math.min(X0, c.x0); X1 = Math.max(X1, c.x1); Z0 = Math.min(Z0, c.z0); Z1 = Math.max(Z1, c.z1); } });
        var start = { x: __wc.player.x, z: __wc.player.z };
        // targets: the 4 inset corners + the room center
        var m = 1.2;
        var targets = [
          { x: X0 + m, z: Z0 + m }, { x: X1 - m, z: Z0 + m }, { x: X0 + m, z: Z1 - m }, { x: X1 - m, z: Z1 - m },
          { x: (X0 + X1) / 2, z: (Z0 + Z1) / 2 }
        ];
        function po(x, z) { return __wc.pushOut(x, z, 0.55, list); }
        function walkPath(waypts, maxFramesPer) {
          // steer through each waypoint in order; record the actual path taken
          __wc.pressKey('KeyW', true);
          var path = [];
          for (var w = 0; w < waypts.length; w++) {
            var bx = waypts[w].x, bz = waypts[w].z, lastx = __wc.player.x, lastz = __wc.player.z, stuck = 0, reached = false;
            for (var k = 0; k < maxFramesPer; k++) {
              var dx = bx - __wc.player.x, dz = bz - __wc.player.z, d = Math.hypot(dx, dz);
              if (d < 0.5) { reached = true; break; }
              __wc.setYaw(Math.atan2(-dx, -dz));
              __wc.stepLite(dt);
              path.push({ x: __wc.player.x, z: __wc.player.z });
              var moved = Math.hypot(__wc.player.x - lastx, __wc.player.z - lastz);
              if (moved < 0.008) { stuck++; if (stuck > 25) break; } else stuck = 0;
              lastx = __wc.player.x; lastz = __wc.player.z;
            }
            if (!reached) { __wc.pressKey('KeyW', false); return { ok: false, path: path, failAt: { x: Math.round(__wc.player.x * 100) / 100, z: Math.round(__wc.player.z * 100) / 100 } }; }
          }
          __wc.pressKey('KeyW', false);
          return { ok: true, path: path, failAt: null };
        }
        var oneway = [];
        for (var t = 0; t < targets.length; t++) {
          __wc.player.x = start.x; __wc.player.z = start.z; __wc.player.y = (ci ? ci.box.y : -60) + 1.6;
          var out = walkPath([targets[t]], 1500);
          if (!out.ok || out.path.length < 3) continue;   // couldn't get there -> blocked both ways, not one-way
          // replay the EXACT outbound path in reverse (same corridor, opposite direction)
          var rev = [], step = Math.max(1, Math.floor(out.path.length / 40));
          for (var r = out.path.length - 1; r >= 0; r -= step) rev.push(out.path[r]);
          rev.push(start);
          var back = walkPath(rev, 400);
          if (!back.ok) oneway.push({ target: { x: Math.round(targets[t].x * 100) / 100, z: Math.round(targets[t].z * 100) / 100 }, gotStuckAt: back.failAt });
        }
        __wc.exitInterior && __wc.exitInterior();
        return { id: id, oneway: oneway, start: { x: Math.round(start.x * 100) / 100, z: Math.round(start.z * 100) / 100 } };
      }, { id, fps });
      if (res.err) { console.log('  ' + id.toUpperCase() + ': ' + res.err); continue; }
      const tag = res.oneway.length ? 'ONE-WAY x' + res.oneway.length : 'ok';
      console.log('  ' + id.toUpperCase().padEnd(12) + ' ' + tag);
      if (res.oneway.length) res.oneway.forEach(o => console.log('      out to ' + JSON.stringify(o.target) + ' OK, but stuck returning at ' + JSON.stringify(o.gotStuckAt) + ' (door ' + JSON.stringify(res.start) + ')'));
    }
  }
  console.log('\nerrors:', errs.length, JSON.stringify(errs.slice(0, 4)));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
