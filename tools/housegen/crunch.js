// crunch.js — downscale + posterize an image to PSX game-texture size.
//   node crunch.js <in.png> <out.jpg> [size=256] [levels=24]
// Writes a JPEG file; the pipeline embeds these as data-URLs.
'use strict';
const fs = require('fs');
const { withChromium, toDataUrl, writeDataUrl, CRUNCH_FN } = require('./lib');

const [, , inF, outF, sizeS, levS] = process.argv;
if (!outF) { console.error('usage: node crunch.js in out [size] [levels]'); process.exit(1); }

withChromium(async (page) => {
  const jpg = await page.evaluate(eval('(' + CRUNCH_FN + ')'), {
    src: toDataUrl(inF), size: +(sizeS || 256), levels: +(levS || 24),
  });
  writeDataUrl(jpg, outF);
  console.log('wrote', outF, Math.round(fs.statSync(outF).size / 1024) + 'KB');
}).catch((e) => { console.error(e); process.exit(1); });
