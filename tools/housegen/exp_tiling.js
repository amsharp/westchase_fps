// exp_tiling.js — experiment: 4 dedicated texture images vs ONE 2x2 tiled
// image sliced apart. Writes results into work/exp/.
//   OPENAI_API_KEY=... node exp_tiling.js [quality]
'use strict';
const fs = require('fs');
const path = require('path');
const { gptImage } = require('./lib');

const Q = process.argv[2] || 'medium';
const DIR = path.join(__dirname, 'work', 'exp');
fs.mkdirSync(DIR, { recursive: true });

const STYLE = 'Retro PS1 / PSX era video game texture: flat shading, posterized muted colors, crisp low-resolution painted look, no photorealism, seen straight-on (orthographic, no perspective), evenly lit, no shadows of external objects.';

const TILES = [
  'beige stucco suburban house wall with two white-framed windows and a dark front door',
  'gray asphalt shingle roof texture, uniform overlapping shingle rows',
  'tan vinyl siding house wall with horizontal siding lines and one white door',
  'terracotta red barrel-tile roof texture, uniform rows of curved clay tiles',
];

async function main() {
  // (a) four dedicated images
  for (let i = 0; i < TILES.length; i++) {
    const f = path.join(DIR, 'single_' + i + '.png');
    if (fs.existsSync(f)) { console.log('skip', f); continue; }
    console.log('single', i, '...');
    const buf = await gptImage({ prompt: STYLE + ' Texture: ' + TILES[i] + '. The texture fills the ENTIRE image edge to edge.', size: '1024x1024', quality: Q });
    fs.writeFileSync(f, buf);
    console.log('  saved', f);
  }
  // (b) one 2x2 tiled image
  const tf = path.join(DIR, 'tiled_2x2.png');
  if (!fs.existsSync(tf)) {
    const prompt = STYLE +
      ' The image is a 2x2 GRID of four SEPARATE independent game textures, divided by solid pure-black gutter lines about 16 pixels thick (also a black border around the outside edge). Each tile completely fills its grid cell with its own texture, edge to edge. The four tiles, left-to-right then top-to-bottom, are:' +
      ' TILE 1 (top-left): ' + TILES[0] + '.' +
      ' TILE 2 (top-right): ' + TILES[1] + '.' +
      ' TILE 3 (bottom-left): ' + TILES[2] + '.' +
      ' TILE 4 (bottom-right): ' + TILES[3] + '.' +
      ' Do not blend the tiles; each is a distinct unrelated texture.';
    console.log('tiled 2x2 ...');
    const buf = await gptImage({ prompt, size: '1024x1024', quality: Q });
    fs.writeFileSync(tf, buf);
    console.log('  saved', tf);
  } else console.log('skip', tf);
  console.log('done — now run: node slice.js work/exp/tiled_2x2.png 2 2 work/exp/cell');
}

main().catch((e) => { console.error(e); process.exit(1); });
