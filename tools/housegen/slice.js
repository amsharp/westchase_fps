// slice.js — cut a tiled grid image into cells by finding the black gutters.
//   node slice.js <image.png> <rows> <cols> <outPrefix>
// Writes <outPrefix>_r<r>c<c>.png for each cell.
'use strict';
const fs = require('fs');
const { withChromium, toDataUrl, writeDataUrl, SLICE_FN } = require('./lib');

const [, , file, rowsS, colsS, prefix] = process.argv;
if (!prefix) { console.error('usage: node slice.js img rows cols outPrefix'); process.exit(1); }
const rows = +rowsS, cols = +colsS;

withChromium(async (page) => {
  const cells = await page.evaluate(eval('(' + SLICE_FN + ')'), { src: toDataUrl(file), rows, cols });
  let k = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const out = prefix + '_r' + r + 'c' + c + '.png';
    writeDataUrl(cells[k++], out);
    console.log('wrote', out);
  }
}).catch((e) => { console.error(e); process.exit(1); });
