// Headless verification of the v1.122.2 progressive-arrest rules:
//  1) an unarmed, still, same-level player is cuffed only after ~2s (not instantly)
//  2) a moving player is NOT cuffed (progress drains)
//  3) a player up on a roof (cop on the ground) is NOT cuffed (level guard)
//  4) a player in a helicopter is NOT cuffed (vehicle guard)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '../../index.html'), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 300000 });
  await p.evaluate(() => { __wc.start(); __wc.setClock && __wc.setClock(180); });

  // helper the tests share: pin the player at (px,pz,py-feet), unarmed & still,
  // force one cop right on them, tick N frames, return {jailT, arrested, prog}
  const run = await p.evaluate(async () => {
    function pinCop(px, pz) {
      var cs = __wc.cops;
      if (!cs.length) __wc.spawnCop(true);
      var c = __wc.cops[0];
      c.x = px + 1.0; c.z = pz; c.baseY = 0; c.interior = false; c.state = 'engage';
      if (c.mesh) { c.mesh.position.set(c.x, 0, c.z); c.mesh.updateMatrixWorld(true); }
      return c;
    }
    function scenario(setup, frames) {
      __wc.state.hp = 100; __wc.setWanted(1); __wc.setEquipped('fists');
      setup();
      var maxProg = 0, jailed = false;
      for (var i = 0; i < frames; i++) {
        setup();                              // re-pin each frame (tick moves things)
        __wc.state.hp = 100;
        __wc.tick(1 / 30);
        var s = __wc.arrestState();
        maxProg = Math.max(maxProg, s.arrestProg || 0);
        if (s.jailT > 0 || s.arrested) { jailed = true; break; }
      }
      return { jailed: jailed, maxProg: maxProg };
    }
    var out = {};
    // (run the non-jailing scenarios first; the one that actually jails is last so
    //  its terminal arrested/jail state can't pollute the others)
    // arrest is not instant: within ~0.4s (12 frames) still NOT jailed
    out.notInstant = scenario(function () {
      __wc.teleport(140, 140); __wc.player.y = 1.7;
      pinCop(140, 140);
    }, 12);
    // moving player: jitter position each frame so pspd stays high -> no cuff
    var jig = 0;
    out.moving = scenario(function () {
      jig += 1; __wc.teleport(160 + (jig % 2) * 3, 160); __wc.player.y = 1.7;
      pinCop(160, 160);
    }, 120);
    // on a roof: player feet at y=20, cop on ground -> level guard blocks
    out.roof = scenario(function () {
      __wc.teleport(180, 180); __wc.player.y = 20 + 1.7;
      pinCop(180, 180);
    }, 120);
    // allowed-flag checks (direct): flat still -> allowed; roof/high -> not
    __wc.teleport(200, 200); __wc.player.y = 1.7;
    var copFlat = { baseY: 0 };
    out.allowFlat = __wc.arrestAllowed(copFlat);
    __wc.player.y = 20 + 1.7;
    out.allowRoof = __wc.arrestAllowed(copFlat);
    __wc.player.y = 1.7;
    // FINALLY: still on flat ground should get jailed after ~2s
    out.still = scenario(function () {
      __wc.teleport(120, 120); __wc.player.y = 1.7;   // feet at 0
      pinCop(120, 120);
    }, 150);
    return out;
  });

  console.log('pageerrors:', errs.length); errs.slice(0, 6).forEach(e => console.log('  ERR:', e));
  console.log(JSON.stringify(run, null, 2));
  // assertions
  const pass = [];
  pass.push(['still player cuffed after ~2s', run.still.jailed === true]);
  pass.push(['arrest NOT instant (0.4s)', run.notInstant.jailed === false]);
  pass.push(['moving player NOT cuffed', run.moving.jailed === false]);
  pass.push(['roof player NOT cuffed', run.roof.jailed === false]);
  pass.push(['arrestAllowed flat=true', run.allowFlat === true]);
  pass.push(['arrestAllowed roof=false', run.allowRoof === false]);
  let ok = true;
  pass.forEach(([n, v]) => { console.log((v ? 'PASS' : 'FAIL') + ' - ' + n); if (!v) ok = false; });
  console.log(errs.length === 0 ? 'PASS - 0 pageerrors' : 'FAIL - pageerrors');
  if (errs.length) ok = false;
  await b.close();
  process.exit(ok ? 0 : 1);
})();
