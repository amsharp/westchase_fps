// contactsheet.js — render all generated icons on a MID-GRAY and a DARK panel
// (to confirm the alpha reads on both) into work/contact.png. Read-only view.
'use strict';
const fs = require('fs');
const path = require('path');
const { withChromium } = require('../housegen/lib');
const { GRIDS } = require('./items');

const ICONS = path.join(__dirname, 'work', 'icons');
const OUT = path.join(__dirname, 'work', 'contact.png');

(async () => {
  const items = [];
  for (const grid of GRIDS) for (const it of grid) {
    const f = path.join(ICONS, it.id + '.png');
    if (fs.existsSync(f)) items.push({ id: it.id, name: it.name, cat: it.cat,
      src: 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') });
  }
  const cell = (it) => '<figure><img src="' + it.src + '"><figcaption>' + it.name +
    '<br><span>' + it.cat + '</span></figcaption></figure>';
  const panel = (bg, label) => '<section style="background:' + bg + '">' +
    '<h2>' + label + '</h2><div class="grid">' + items.map(cell).join('') + '</div></section>';
  const html = '<html><head><style>' +
    '*{margin:0;box-sizing:border-box;font-family:monospace}' +
    'body{background:#000}' +
    'section{padding:16px}' +
    'h2{color:#fff;font-size:20px;margin-bottom:10px;text-shadow:0 0 3px #000}' +
    '.grid{display:grid;grid-template-columns:repeat(9,1fr);gap:8px}' +
    'figure{text-align:center}' +
    'img{width:80px;height:80px;image-rendering:pixelated;display:block;margin:0 auto}' +
    'figcaption{color:#fff;font-size:11px;margin-top:3px;text-shadow:0 1px 2px #000,0 0 2px #000}' +
    'figcaption span{color:#9cf;font-size:9px}' +
    '</style></head><body>' +
    panel('#808080', 'MID-GRAY panel (#808080)') +
    panel('#1a1a1a', 'DARK panel (#1a1a1a)') +
    '</body></html>';

  await withChromium(async (page) => {
    await page.setViewportSize({ width: 9 * 88 + 40, height: 1400 });
    await page.setContent(html);
    await page.waitForTimeout(200);
    const full = await page.$('body');
    await full.screenshot({ path: OUT });
  });
  console.log('wrote', OUT, (items.length) + ' icons');
})().catch(e => { console.error(e); process.exit(1); });
