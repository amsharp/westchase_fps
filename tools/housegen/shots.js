// shots.js — render work/test.html headlessly and save screenshots.
//   node shots.js   (expects a static server for the REPO ROOT on :8155,
//                    e.g. /opt/node22/bin/http-server -p 8155 <repo root>)
// Writes work/shot_street/porch/aerial/compare/front/recolor.png — VIEW THEM.
'use strict';
const path = require('path');
const { withChromium } = require('./lib');

const PORT = process.env.PORT || 8155;
const BASE = 'http://127.0.0.1:' + PORT + '/tools/housegen/work/test.html';
const OUT = (n) => path.join(__dirname, 'work', n);

withChromium(async (page) => {
  await page.setViewportSize({ width: 960, height: 540 });
  page.on('console', (m) => console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(BASE);
  await page.waitForFunction('window.__ready === true');
  await page.waitForTimeout(2500); // texture Images decode async
  console.log('tris:', await page.evaluate('JSON.stringify(window.__tris)'));
  const views = [
    ['shot_street.png', [8, 1.7, 24, 30, 3.5, -2]],       // pedestrian view down the row
    ['shot_porch.png', [27.5, 1.8, 12.5, 24.3, 2.2, 5.5]], // close-up: two-story porch + door
    ['shot_garage.png', [-25, 1.7, 11, -25.5, 1.8, 6]],   // recolored ranch garage inset
    ['shot_aerial.png', [-8, 26, 42, 30, 0, -2]],         // 3/4 aerial
    ['shot_compare.png', [-61, 2.2, 22, -61, 4.5, 0]],    // flat (right) vs depth (left)
    ['shot_front.png', [-22, 2.0, 20, -22, 3, 0]],        // straight-on ranch
    ['shot_recolor.png', [44, 2.2, 22, 60, 4, 0]],        // recolored pair up close
  ];
  for (const [name, v] of views) {
    await page.evaluate('shot(' + v.join(',') + ')');
    await page.screenshot({ path: OUT(name) });
    console.log('wrote work/' + name);
  }
}).catch((e) => { console.error(e); process.exit(1); });
