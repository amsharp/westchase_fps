// street-level confirmation: pick a few city buildings, stand on their road side
// (in front of the +X face) and shoot the storefront — verifies facing + foundation.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const OUT = path.resolve(__dirname, 'shots');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage(); await p.setViewportSize({ width: 900, height: 720 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '../../index.html'), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.__wc && window.__wc.cityBuildings, { timeout: 300000 });
  await p.evaluate(() => { __wc.start(); if (__wc.setClock) __wc.setClock(180); });
  await p.evaluate(async () => { for (let i = 0; i < 20; i++) { __wc.setClock && __wc.setClock(180); __wc.tick(1 / 30); await new Promise(r => setTimeout(r, 25)); } });
  // choose a few varied buildings (a brick, a biz, an office)
  const picks = await p.evaluate(() => {
    var cb = __wc.cityBuildings(), out = [];
    function firstOf(pref) { for (var i = 0; i < cb.length; i++) if (cb[i].model.indexOf(pref) === 0) return cb[i]; return null; }
    ['citybiz', 'brick', 'office', 'highrise'].forEach(function (pref) {
      var r = firstOf(pref); if (!r) return;
      var th = r.mb && r.mb.rot !== undefined ? r.mb.rot * Math.PI / 180 : 0;
      out.push({ model: r.model, x: r.x, z: r.z, H: r.H, foundH: r.foundH });
    });
    return out;
  });
  for (var idx = 0; idx < picks.length; idx++) {
    const info = picks[idx];
    const url = await p.evaluate((a) => {
      // recover the building's front direction from its rec rot via mapBuildings
      var cb = __wc.cityBuildings(); var rec = null;
      for (var i = 0; i < cb.length; i++) if (cb[i].x === a.x && cb[i].z === a.z) { rec = cb[i]; break; }
      var th = rec && rec.group ? rec.group.rotation.y : 0;   // actual placed yaw
      var fx = Math.cos(th), fz = -Math.sin(th);            // +X world dir (front)
      var d = Math.max(18, a.H * 0.9);
      const T = window.THREE, cam = new T.PerspectiveCamera(48, 900 / 720, 0.4, 4000);
      cam.position.set(a.x + fx * d, Math.max(3, a.H * 0.32), a.z + fz * d);
      cam.up.set(0, 1, 0); cam.lookAt(a.x, a.H * 0.34, a.z);
      const sf = __wc.scene.fog; __wc.scene.fog = null; __wc.renderer.render(__wc.scene, cam); __wc.scene.fog = sf;
      return __wc.renderer.domElement.toDataURL('image/png');
    }, info);
    fs.writeFileSync(path.join(OUT, 'shot_' + info.model + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote shot_' + info.model, 'H', info.H.toFixed(1), 'foundH', info.foundH);
  }
  console.log('pageerrors', errs.length);
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
