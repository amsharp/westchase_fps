// functional test: tower registry, roof-walkability, foundations, small-building
// rubble swap, and skyscraper chain-collapse.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '../../index.html'), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.__wc && window.__wc.scene && window.__wc.cityBuildings, { timeout: 300000 });
  const r = await p.evaluate(() => {
    __wc.start();
    var cb = __wc.cityBuildings(), tw = __wc.towers();
    var out = { total: cb.length, towers: tw.length };
    // classify towers vs small
    var towerRecs = cb.filter(function (c) { return c.tower; }).length;
    out.towerRecs = towerRecs; out.small = cb.length - towerRecs;
    // pick a tall tower rec for roof test
    var tall = null; for (var i = 0; i < cb.length; i++) { if (cb[i].tower && cb[i].H > 40) { tall = cb[i]; break; } }
    if (tall) {
      var roofY = tall.H + tall.foundH;
      // stand on the roof: feet just above roof -> surfaceHeightAt should return ~roofY
      var s = __wc.surfAt(tall.x, tall.z, roofY + 0.3);
      out.roof = { H: +tall.H.toFixed(1), foundH: +tall.foundH.toFixed(2), roofY: +roofY.toFixed(1), surfAtRoof: +s.toFixed(1), roofWalkable: Math.abs(s - roofY) < 1.5 };
      // foundation: stand at building edge on the street (feet at 0) -> lifted to ~foundH
      var fs = __wc.surfAt(tall.x, tall.z, 0.2);   // inside footprint at ground -> plinth top
      out.foundLift = +fs.toFixed(2);
    }
    // small-building rubble swap
    var si = -1; for (var j = 0; j < cb.length; j++) { if (!cb[j].tower) { si = j; break; } }
    if (si >= 0) {
      var rec = cb[si]; var wasVisible = rec.group.visible;
      __wc.rubbleSwap(si);
      out.smallRubble = { wasVisible: wasVisible, nowHidden: rec.group.visible === false, destroyed: rec.destroyed, hasRubble: !!rec.rubble };
    }
    // chain collapse: collapse a big tower, count neighbours flattened
    var ti = -1; for (var k = 0; k < tw.length; k++) { if (tw[k].W > 25 && tw[k].state === 'up') { ti = k; break; } }
    if (ti >= 0) {
      var before = cb.filter(function (c) { return c.destroyed; }).length;
      __wc.collapseTower(ti);
      var after = cb.filter(function (c) { return c.destroyed; }).length;
      out.chain = { tower: tw[ti].model, W: +tw[ti].W.toFixed(0), flattenedNeighbours: after - before };
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('pageerrors:', errs.length); errs.slice(0, 4).forEach(e => console.log(' ERR', e));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
