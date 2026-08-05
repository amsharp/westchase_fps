// verify v1.122.8 removals: no showcase towers (z=-240), no test garage (~-245,585),
// no striped canopy plaza (~61,217).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '../../index.html'), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 300000 });
  const r = await p.evaluate(() => {
    var out = {};
    // 1) showcase towers stood in a row at z=-240
    var tw = __wc.towers ? __wc.towers() : [];
    out.showcaseTowers = tw.filter(t => Math.abs(t.z + 240) < 1).length;   // expect 0
    out.totalTowers = tw.length;
    // 2) test garage raised a walkable concrete deck ~ y 3+ near (-245,585);
    //    with it gone, the surface there is just grass (~0)
    out.garageSurf = +__wc.surfAt(-245, 585, 5).toFixed(2);   // expect ~0
    // 3) the striped canopy plaza had a solid footprint at ~(61,217); gone -> free
    out.canopyFree = __wc.pointFree(61, 217, 1.5) && __wc.pointFree(62, 217, 1.5) && __wc.pointFree(55, 217, 1.5);
    return out;
  });
  console.log('pageerrors:', errs.length); errs.slice(0, 5).forEach(e => console.log('  ERR:', e));
  console.log(JSON.stringify(r, null, 2));
  let ok = true;
  function chk(n, v) { console.log((v ? 'PASS' : 'FAIL') + ' - ' + n); if (!v) ok = false; }
  chk('no showcase towers at z=-240', r.showcaseTowers === 0);
  chk('test garage gone (grass surface ~0)', r.garageSurf < 1.0);
  chk('striped canopy plaza footprint cleared', r.canopyFree === true);
  chk('0 pageerrors', errs.length === 0); if (errs.length) ok = false;
  await b.close();
  process.exit(ok ? 0 : 1);
})();
