// footskate.js — objective foot-skate metric for the procedural (preset 0-3)
// walk. phase advances at spd*3.4, so distance walked = phase/3.4. The stance
// foot's WORLD z must stay constant through its stance half-cycle; slip = its
// z range over that half. Sweep the leg-swing amplitude for the min-slip value.
// Run: NODE_PATH=... node tools/animqa/footskate.js
const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate(() => { try { __wc.startGame(); } catch (e) { __wc.start(); } });
  const out = await page.evaluate(async () => {
    var T = window.THREE;
    // build a procedural (preset 0) character
    var cfg = __wc.randomCharConfig ? __wc.randomCharConfig() : {};
    cfg.preset = 0;
    var m = __wc.buildCharacter(cfg);
    __wc.scene.add(m); m.position.set(0, 0, 0); m.updateMatrixWorld(true);
    var L = m.userData.limbs;
    if (!L || !L.legL) return { err: 'no procedural limbs (skinned?)', hasSkin: !!m.userData.skin };
    // lowest-y world z of the legL subtree = the foot
    function footZ() {
      m.updateMatrixWorld(true);
      var lowY = 1e9, fz = 0, v = new T.Vector3();
      L.legL.traverse(function (o) {
        if (o.isMesh && o.geometry && o.geometry.attributes.position) {
          var p = o.geometry.attributes.position;
          for (var i = 0; i < p.count; i += Math.max(1, (p.count / 60) | 0)) {
            v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
            if (v.y < lowY) { lowY = v.y; fz = v.z; }
          }
        }
      });
      return fz;
    }
    var RATE = 3.4;
    function slip(amp) {
      // stance half: phase pi/2..3pi/2 (foot front->back). foot_world_z = dist + foot_local_z
      var N = 40, min = 1e9, max = -1e9;
      for (var i = 0; i <= N; i++) {
        var ph = Math.PI / 2 + Math.PI * i / N;
        var a = amp * Math.sin(ph);
        L.legL.rotation.x = a;
        var dist = ph / RATE;               // world advance (spd cancels)
        var fw = dist + footZ();            // foot world z
        if (fw < min) min = fw; if (fw > max) max = fw;
      }
      return max - min;                     // world-z travel of the "planted" foot = skate distance
    }
    var rows = [];
    [0.65, 0.55, 0.45, 0.40, 0.35, 0.33, 0.30, 0.25, 0.20].forEach(function (amp) {
      rows.push({ amp: amp, slip: Math.round(slip(amp) * 1000) / 1000 });
    });
    // ---- PLANTED-STANCE profile: solve leg angle so the stance foot stays put.
    // Measure legLen from the rest foot (hip pivot y - foot y ~ leg length).
    var LEGLEN = 0.85, HALF = (Math.PI / RATE);   // ground advance per stance half
    function planted(ph) {
      var frac = (((ph % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI);
      var amax = Math.asin(Math.min(1, (HALF / 2) / LEGLEN));
      if (frac < 0.5) { var d = frac / 0.5 * HALF; return Math.asin(Math.max(-1, Math.min(1, (d - HALF / 2) / LEGLEN))); }
      var sw = (frac - 0.5) / 0.5, e = sw * sw * (3 - 2 * sw); return amax * (1 - 2 * e);
    }
    function slipPlanted() {
      var N = 40, min = 1e9, max = -1e9;
      for (var i = 0; i <= N; i++) {
        var ph = Math.PI / 2 + Math.PI * i / N;   // legL stance window is frac 0..0.5 => shift so we sample its stance
        var a = planted(ph - Math.PI / 2);         // align stance to this window
        L.legL.rotation.x = a;
        var fw = (ph / RATE) + footZ();
        if (fw < min) min = fw; if (fw > max) max = fw;
      }
      return max - min;
    }
    rows.push({ amp: 'PLANTED', slip: Math.round(slipPlanted() * 1000) / 1000 });

    // also report leg length (hip y - foot y at rest)
    L.legL.rotation.x = 0; var restFootZ = footZ();
    rows.sort(function (a, b) { return a.slip - b.slip; });
    return { rows: rows };
  });
  if (out.err) { console.log('ERR', out.err, JSON.stringify(out)); }
  else { console.log('amp    slip(world units the planted foot slides; lower=better)');
    out.rows.forEach(function (r) { console.log(String(r.amp).padEnd(6), r.slip); }); }
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
