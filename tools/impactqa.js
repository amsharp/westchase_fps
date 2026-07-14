// impactqa.js — verify bullet-impact VFX: fire at ground/wall + at a car,
// render the frames just after impact, tile them into one PNG.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const OUT = path.join(__dirname, process.argv[2] || 'impact_before.png');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message.split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().split('\n')[0]); });
  await page.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!window.__wc, { timeout: 60000 });
  const report = await page.evaluate(async () => {
    var wc = window.__wc, T = window.THREE;
    wc.start();
    // let a few frames settle so materials/vfx sheets decode
    for (var i = 0; i < 30; i++) wc.tick(0.016);
    var out = [];
    function grab() {
      var gl = wc.renderer.domElement;
      var cv = document.createElement('canvas'); cv.width = gl.width; cv.height = gl.height;
      cv.getContext('2d').drawImage(gl, 0, 0);
      return cv.toDataURL('image/png');
    }
    function keepAlive() { try { wc.setWanted(0); wc.state.hp = 100; } catch (e) {} }

    // --- scenario A: fire straight down at the ground (impact kind path) ---
    wc.teleport(60, 70); keepAlive();
    wc.setEquipped('rifle'); wc.setYaw(0); wc.setPitch(-1.35);
    wc.tick(0.016); keepAlive();
    wc.resetCooldowns && wc.resetCooldowns();
    for (var s = 0; s < 5; s++) { wc.tryAttack(); wc.resetCooldowns && wc.resetCooldowns(); wc.tick(0.02); keepAlive(); }
    for (var gi = 0; gi < 5; gi++) { wc.tick(0.02); keepAlive(); }   // idle past the muzzle flash; show only impact dust
    var groundShot = grab();

    // --- scenario B: aim at the nearest car and shoot it ---
    var carShot = null, carInfo = 'no car';
    var cars = wc.cars || [];
    var best = null, bd = 1e9, px = wc.player.x, pz = wc.player.z;
    for (var c = 0; c < cars.length; c++) {
      var cc = cars[c]; if (cc.exploded) continue;
      var g = cc.car && cc.car.group; if (!g) continue;
      var dx = g.position.x - px, dz = g.position.z - pz, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = cc; }
    }
    if (best) {
      var g = best.car.group;
      // teleport near the car and aim at it
      var ang = Math.atan2(g.position.x - 0, 0); // unused
      wc.teleport(g.position.x + 6, g.position.z + 6); keepAlive();
      wc.tick(0.016);
      var pxx = wc.player.x, pzz = wc.player.z, pyy = wc.player.y;
      var ddx = g.position.x - pxx, ddz = g.position.z - pzz;
      var yaw = Math.atan2(-ddx, -ddz); // face the car
      wc.setYaw(yaw); wc.setPitch(-0.08);
      wc.resetCooldowns && wc.resetCooldowns();
      // SINGLE shot only: rifle dmgT=0.8 stays under the 1.5 goBerserk threshold,
      // so the car does NOT catch fire — isolates the per-hit impact VFX.
      wc.tryAttack(); wc.resetCooldowns && wc.resetCooldowns();
      // idle past the 0.07s muzzle-flash lifetime so the capture shows ONLY the
      // impact dust on the car body, not the barrel flash.
      for (var s2 = 0; s2 < 6; s2++) { wc.tick(0.02); keepAlive(); }
      carShot = grab();
      carInfo = 'car at ' + g.position.x.toFixed(1) + ',' + g.position.z.toFixed(1) + ' d=' + Math.sqrt(bd).toFixed(1) + ' burning=' + (!!best.burning) + ' dmgT=' + (best.dmgT || 0).toFixed(2);
    }
    // count fire vs smoke puffs currently alive
    var nFire = 0, nSmoke = 0, fireInfo = [];
    (wc.puffs || []).forEach(function (p) { if (p.fire) { nFire++; fireInfo.push('scl=' + p.mesh.scale.x.toFixed(2)); } else if (p.frames) nSmoke++; });
    return { groundShot: groundShot, carShot: carShot, carInfo: carInfo, nFire: nFire, nSmoke: nSmoke, fireInfo: fireInfo };
  });
  // tile the two shots side by side
  const shots = [['GROUND impact', report.groundShot], ['CAR hit', report.carShot]].filter(s => s[1]);
  console.log('carInfo:', report.carInfo, '| alive puffs fire=' + report.nFire + ' smoke=' + report.nSmoke + ' fireScales=[' + (report.fireInfo || []).join(',') + ']');
  console.log('errors:', errs.length ? errs.join(' ; ') : 'none');
  for (let i = 0; i < shots.length; i++) {
    fs.writeFileSync(OUT.replace(/\.png$/, '_' + shots[i][0].split(' ')[0].toLowerCase() + '.png'), Buffer.from(shots[i][1].split(',')[1], 'base64'));
  }
  console.log('wrote shots:', shots.map(s => s[0]).join(', '));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
