// footskate_meshy.js — foot-skate metric for the SKINNED (meshy) NPCs. Their
// animPerson path advances the walk clip by distance/st (stride-matched), so
// this should already be low. Build each of several models, drive one walk
// cycle via the REAL animPerson, track the deepest foot bone's world-Z through
// its stance half, report slip per model (high = st miscalibrated).
// Run: NODE_PATH=... node tools/animqa/footskate_meshy.js
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
    var LIST = (typeof MESHY_CHARS !== 'undefined') ? MESHY_CHARS : (window.MESHY_CHARS || []);
    // MESHY_LIST isn't global; probe indices via buildMeshySkinned until it fails
    var results = [], RATE = 3.4;
    function deepFootBone(legBone) {
      var deepest = legBone, maxDepth = 0;
      (function rec(b, d) { if (b.isBone && d > maxDepth) { maxDepth = d; deepest = b; } if (b.children) b.children.forEach(function (c) { rec(c, d + 1); }); })(legBone, 0);
      return deepest;
    }
    for (var idx = 0; idx < 12; idx++) {
      var m;
      try { m = __wc.buildMeshySkinned(__wc.randomCharConfig(), idx); } catch (e) { continue; }
      if (!m || !m.userData.skin || !m.userData.limbs || !m.userData.limbs.legL) continue;
      __wc.scene.add(m); m.position.set(idx * 3, 0, 0); m.updateMatrixWorld(true);
      var name = (m.userData.skin.d && m.userData.skin.d.name) || ('#' + idx);
      var st = null;
      try { var c = m.userData.skin.d.clips.walk; st = c && c.st; } catch (e) {}
      var foot = deepFootBone(m.userData.limbs.legL);
      var wv = new T.Vector3();
      function footZ() { m.updateMatrixWorld(true); foot.getWorldPosition(wv); return wv.z; }
      // stance half sampling
      var N = 40, min = 1e9, max = -1e9;
      for (var i = 0; i <= N; i++) {
        var frac = i / N;                 // sample a full cycle; find the min-range half below
        var ph = frac * 2 * Math.PI;
        __wc.animPerson(m, 1.5, 1 / 60, ph);
        var fw = (ph / RATE) + footZ();
        // store
        (results._tmp = results._tmp || []); results._tmp[i] = fw;
      }
      // slip = smallest max-min over any contiguous half-cycle window (the stance)
      var arr = results._tmp, best = 1e9;
      for (var s = 0; s <= N / 2; s++) { var mn = 1e9, mx = -1e9; for (var j = s; j <= s + N / 2; j++) { if (arr[j] < mn) mn = arr[j]; if (arr[j] > mx) mx = arr[j]; } if (mx - mn < best) best = mx - mn; }
      results.push({ name: name, idx: idx, st: st, slip: Math.round(best * 1000) / 1000 });
      results._tmp = null;
      m.visible = false;
    }
    return results.filter(function (r) { return r && r.name; });
  });
  console.log('model'.padEnd(14), 'idx', 'st', 'stance-slip (world units; <~0.3 good)');
  out.sort(function (a, b) { return b.slip - a.slip; });
  out.forEach(function (r) { console.log(String(r.name).padEnd(14), String(r.idx).padStart(3), String(r.st).padStart(5), r.slip); });
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
