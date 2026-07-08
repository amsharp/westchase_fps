// shots.js — render work/test.html headlessly and save screenshots.
//   node shots.js   (expects a static server for the REPO ROOT on :8151,
//                    e.g. /opt/node22/bin/http-server -p 8151 <repo root>)
// Writes work/shot_street.png, work/shot_aerial.png, work/shot_recolor.png.
'use strict';
const path = require('path');
const { withChromium } = require('./lib');

const BASE = 'http://127.0.0.1:8151/tools/housegen/work/test.html';
const OUT = (n) => path.join(__dirname, 'work', n);

withChromium(async (page) => {
  await page.setViewportSize({ width: 960, height: 540 });
  await page.goto(BASE);
  await page.waitForFunction('window.__ready === true');
  await page.waitForTimeout(2500); // texture Images decode async
  const views = [
    ['shot_street.png', [10, 1.7, 26, 22, 3.5, 0]],       // pedestrian view down the row
    ['shot_aerial.png', [-8, 26, 42, 30, 0, -2]],         // 3/4 aerial
    ['shot_recolor.png', [44, 2.2, 22, 60, 4, 0]],        // recolored pair up close
    ['shot_front.png', [0, 2.0, 18, 0, 3, 0]],            // straight-on recolored ranch
  ];
  for (const [name, v] of views) {
    await page.evaluate('shot(' + v.join(',') + ')');
    await page.screenshot({ path: OUT(name) });
    console.log('wrote work/' + name);
  }
}).catch((e) => { console.error(e); process.exit(1); });
