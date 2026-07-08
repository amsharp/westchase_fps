// exp_density.js — experiment 2: how dense can the texture grid go?
// Tests 3x3 / 4x4 / 4x2 grids at 1536x1024 and 1024x1024, medium + low
// quality, against the verified 2x2 baseline (work/exp/). Writes raw grids,
// sliced cells and 256px PSX-crunched cells into work/exp2/.
//   OPENAI_API_KEY=... node exp_density.js [configId ...]
// Then VIEW work/exp2/<cfg>_crunch_*.jpg and count adherence failures per
// tile (results recorded in TILING.md).
'use strict';
const fs = require('fs');
const path = require('path');
const { gptImage, withChromium, toDataUrl, writeDataUrl, SLICE_FN, CRUNCH_FN } = require('./lib');

const DIR = path.join(__dirname, 'work', 'exp2');
fs.mkdirSync(DIR, { recursive: true });

const STYLE = 'Retro PS1 / PSX era video game texture: flat shading, posterized muted colors, crisp low-resolution painted look, no photorealism, seen straight-on (orthographic, no perspective), evenly lit, no shadows of external objects.';

// 16 short, distinctive, house-pipeline-relevant tile descriptions.
// Each config uses the first rows*cols of these, so tile N is comparable
// across configs.
const TILES = [
  'beige stucco house wall with two white-framed windows',           // 1
  'gray asphalt shingle roof, uniform overlapping shingle rows',     // 2
  'white sectional garage door with recessed square panels',         // 3
  'dark blue paneled front door with brass handle',                  // 4
  'tan vinyl siding wall with horizontal siding lines',              // 5
  'terracotta red barrel-tile roof, rows of curved clay tiles',      // 6
  'white vertical board-and-batten gable siding',                    // 7
  'poured gray concrete surface, lightly weathered',                 // 8
  'red brick wall in running bond pattern',                          // 9
  'weathered wooden fence planks, vertical boards',                  // 10
  'green house wall with one small square window',                   // 11
  'black asphalt road surface with fine gravel speckle',             // 12
  'rusty ribbed metal air-conditioner unit side panel',              // 13
  'white painted wooden soffit boards with one round vent',          // 14
  'pebbledash gray stucco wall, coarse texture',                     // 15
  'dark brown wooden shutter with horizontal louvers',               // 16
];

const CONFIGS = [
  { id: '3x3_1536_med', rows: 3, cols: 3, size: '1536x1024', quality: 'medium', cost: 0.063 },
  { id: '3x3_1024_med', rows: 3, cols: 3, size: '1024x1024', quality: 'medium', cost: 0.042 },
  { id: '3x3_1024_low', rows: 3, cols: 3, size: '1024x1024', quality: 'low', cost: 0.011 },
  { id: '4x4_1536_med', rows: 4, cols: 4, size: '1536x1024', quality: 'medium', cost: 0.063 },
  { id: '4x4_1024_med', rows: 4, cols: 4, size: '1024x1024', quality: 'medium', cost: 0.042 },
  { id: '4x2_1536_med', rows: 2, cols: 4, size: '1536x1024', quality: 'medium', cost: 0.063 },
  // second samples for retry-rate confidence on the contenders:
  { id: '3x3_1536_med_b', rows: 3, cols: 3, size: '1536x1024', quality: 'medium', cost: 0.063 },
  { id: '4x2_1536_med_b', rows: 2, cols: 4, size: '1536x1024', quality: 'medium', cost: 0.063 },
];

function gridPrompt(rows, cols) {
  const n = rows * cols;
  const names = ['top', 'second', 'third', 'fourth'];
  let p = STYLE +
    ' The image is a ' + cols + 'x' + rows + ' GRID of ' + n + ' SEPARATE independent game textures,' +
    ' divided by solid pure-black gutter lines about 16 pixels thick (also a black border around the outside edge).' +
    ' Each tile completely fills its grid cell with its own texture, edge to edge.' +
    ' The ' + n + ' tiles, left-to-right then top-to-bottom, are:';
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    p += ' TILE ' + (i + 1) + ' (' + (names[r] || 'row ' + (r + 1)) + ' row, column ' + (c + 1) + '): ' + TILES[i] + '.';
  }
  p += ' Do not blend the tiles; each is a distinct unrelated texture.';
  return p;
}

async function main() {
  const only = process.argv.slice(2);
  const todo = CONFIGS.filter((c) => !only.length || only.includes(c.id));
  for (const cfg of todo) {
    const gridF = path.join(DIR, cfg.id + '_grid.png');
    if (!fs.existsSync(gridF)) {
      console.log(cfg.id + ': generating (' + cfg.size + ' ' + cfg.quality + ', ' + cfg.rows * cfg.cols + ' tiles)...');
      const buf = await gptImage({ prompt: gridPrompt(cfg.rows, cfg.cols), size: cfg.size, quality: cfg.quality });
      fs.writeFileSync(gridF, buf);
    } else console.log(cfg.id + ': reusing grid');
  }
  await withChromium(async (page) => {
    for (const cfg of todo) {
      const gridF = path.join(DIR, cfg.id + '_grid.png');
      const cells = await page.evaluate(eval('(' + SLICE_FN + ')'), { src: toDataUrl(gridF), rows: cfg.rows, cols: cfg.cols });
      for (let i = 0; i < cells.length; i++) {
        writeDataUrl(cells[i], path.join(DIR, cfg.id + '_cell' + (i + 1) + '.png'));
        const crunched = await page.evaluate(eval('(' + CRUNCH_FN + ')'), { src: cells[i], w: 256, h: 256, levels: 24, jq: 0.85 });
        writeDataUrl(crunched, path.join(DIR, cfg.id + '_crunch' + (i + 1) + '.jpg'));
      }
      console.log(cfg.id + ': sliced ' + cells.length + ' cells');
    }
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
