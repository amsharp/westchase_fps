// genfacade.js — turn Street View reference photos into a PS1 texture SET for
// one building cluster, using ONE tiled gpt-image-1 call per cluster.
// v2: 3x3 grid = NINE textures per call (see TILING.md density experiment):
//   front wall (PLAIN — front detail is now geometry, see runtime_buildhouse)
//   side wall (one painted window), back wall (two painted windows),
//   roof swatch, garage door, front door, trim boards, board-and-batten
//   siding (gable ends / dormer faces), concrete (stoop/steps/pads).
//
//   OPENAI_API_KEY=... node genfacade.js <clusters.json> [onlyId]
//
// clusters.json: [{ id, refs:[paths relative to housegen/], desc, roofDesc,
//                   trimDesc?, doorDesc?, garageDesc?, gableDesc? }]
// For each cluster writes into work/:
//   <id>_tiled.png                    raw 1536x1024 3x3 grid from gpt-image-1
//   <id>_<tile>.png                   sliced cells (9)
//   <id>_tex.json                     { front, side, back, roof, garage, door,
//                                       trim, gable, concrete } JPEG data-URLs
'use strict';
const fs = require('fs');
const path = require('path');
const { gptImage, withChromium, toDataUrl, writeDataUrl, SLICE_FN, CRUNCH_FN } = require('./lib');

const [, , clustersFile, onlyId] = process.argv;
if (!clustersFile) { console.error('usage: node genfacade.js clusters.json [onlyId]'); process.exit(1); }
const clusters = JSON.parse(fs.readFileSync(clustersFile, 'utf8'));
const DIR = path.join(__dirname, 'work');

const STYLE = 'Retro PS1 / PSX era video game texture set: flat shading, posterized muted colors, crisp low-resolution painted look, no photorealism, orthographic straight-on views with NO perspective, evenly lit, no shadows cast by external objects, no trees, no sky, no lawn, no people, no cars.';

// NOTE (density experiment, TILING.md): 3x3 holds the grid shape reliably;
// keep ONE short sentence per tile, avoid the word "gable" in swatch tiles
// (the model draws a literal gable triangle), and describe the roof tile as a
// seamless MATERIAL SWATCH or it paints an eave/siding strip under it.
function prompt(c) {
  return STYLE +
    ' Using the attached reference photos of a real suburban house (' + c.desc + '),' +
    ' create a single image that is a 3x3 GRID of nine SEPARATE game textures of THIS house,' +
    ' divided by solid pure-black gutter lines about 16 pixels thick, with a black border around the outside edge.' +
    ' Each tile completely fills its grid cell edge to edge. The nine tiles, left-to-right then top-to-bottom:' +
    ' TILE 1 (top row, left): the house wall as a PLAIN FLAT wall texture in the exact wall color and material of the photo -' +
    ' absolutely NO windows, NO doors, NO garage door, NO roofline, NO eaves, just the bare wall surface edge to edge.' +
    ' TILE 2 (top row, middle): the SIDE wall - the same plain wall texture with ONE small white-framed window left of center.' +
    ' TILE 3 (top row, right): the BACK wall - the same plain wall texture with TWO windows, no door.' +
    ' TILE 4 (middle row, left): a seamless MATERIAL SWATCH of ' + (c.roofDesc || 'its roof shingles') + ' seen straight down from above,' +
    ' uniform rows covering the ENTIRE tile edge to edge, matching the photo roof color - NO wall, NO eave, NO trim, nothing but roof material.' +
    ' TILE 5 (middle row, middle): ' + (c.garageDesc || 'the house garage door with recessed rectangular panels') + ', the garage door alone filling the ENTIRE tile edge to edge.' +
    ' TILE 6 (middle row, right): ' + (c.doorDesc || 'the front door of this house') + ', the door centered and spanning the full height of the tile, narrow strips of wall on either side.' +
    ' TILE 7 (bottom row, left): a seamless swatch of plain painted ' + (c.trimDesc || 'white') + ' wooden trim boards with subtle wood grain, covering the whole tile.' +
    ' TILE 8 (bottom row, middle): a seamless swatch of vertical board-and-batten siding painted ' + (c.gableDesc || 'the trim color') + ', evenly spaced vertical battens covering the whole tile.' +
    ' TILE 9 (bottom row, right): a seamless swatch of smooth poured light-gray concrete, lightly weathered.' +
    ' Do not blend the tiles; each is a distinct texture.';
}

// tile name, crunch size, optional source crop [x,y,w,h fracs]
// 'auto' on the door tile = find the dark door rectangle (the model rarely
// centers it exactly); garage gets a mild inset to trim the painted wall
// margin so the door fills its geometry face.
const TILE_SPECS = [
  ['front', 256, 170, null],
  ['side', 256, 170, null],
  ['back', 256, 170, null],
  ['roof', 256, 256, null],
  ['garage', 256, 128, [0.05, 0.12, 0.9, 0.88]],
  ['door', 128, 256, 'auto'],
  ['trim', 128, 128, null],
  ['gable', 256, 256, null],
  ['concrete', 128, 128, null],
];

// Locate the door (largest dark region vs the wall) in a cell; returns
// [x,y,w,h] fractions with a margin that keeps the painted trim.
const DOORCROP_FN = `async (arg) => {
  const img = new Image();
  await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = arg.src; });
  const W = img.width, H = img.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  const colLum = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let y = Math.floor(H * 0.3); y < H * 0.9; y++) {
      const i = (y * W + x) * 4; s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    colLum[x] = s / (H * 0.6);
  }
  const sorted = Array.from(colLum).sort((a, b) => a - b);
  const med = sorted[Math.floor(W / 2)], dark = sorted[Math.floor(W * 0.08)];
  const thr = dark + (med - dark) * 0.5;
  if (med - dark < 25) return [0.275, 0, 0.45, 1]; // no clear door: center crop
  let x0 = -1, x1 = -1, best = 0, run0 = -1;
  for (let x = 0; x <= W; x++) {
    const isDark = x < W && colLum[x] < thr;
    if (isDark && run0 < 0) run0 = x;
    if (!isDark && run0 >= 0) { if (x - run0 > best) { best = x - run0; x0 = run0; x1 = x; } run0 = -1; }
  }
  if (x0 < 0) return [0.275, 0, 0.45, 1];
  const m = W * 0.045; x0 = Math.max(0, x0 - m); x1 = Math.min(W, x1 + m);
  return [x0 / W, 0.02, (x1 - x0) / W, 0.98];
}`;

async function main() {
  for (const c of clusters) {
    if (onlyId && c.id !== onlyId) continue;
    const tiledF = path.join(DIR, c.id + '_tiled.png');
    if (!fs.existsSync(tiledF)) {
      console.log(c.id + ': generating tiled texture set (3x3)...');
      const buf = await gptImage({
        prompt: prompt(c),
        refs: c.refs.map((r) => path.join(__dirname, r)),
        size: '1536x1024',
        quality: 'medium',
      });
      fs.writeFileSync(tiledF, buf);
    } else console.log(c.id + ': reusing ' + tiledF);

    console.log(c.id + ': slicing + crunching...');
    await withChromium(async (page) => {
      const cells = await page.evaluate(eval('(' + SLICE_FN + ')'), { src: toDataUrl(tiledF), rows: 3, cols: 3 });
      const tex = {};
      for (let i = 0; i < TILE_SPECS.length; i++) {
        const [name, w, h, cropSpec] = TILE_SPECS[i];
        writeDataUrl(cells[i], path.join(DIR, c.id + '_' + name + '.png'));
        let crop = cropSpec;
        if (cropSpec === 'auto') {
          crop = await page.evaluate(eval('(' + DOORCROP_FN + ')'), { src: cells[i] });
          console.log('  ' + name + ' auto-crop: [' + crop.map((v) => v.toFixed(3)).join(', ') + ']');
        }
        tex[name] = await page.evaluate(eval('(' + CRUNCH_FN + ')'), {
          src: cells[i], w, h, crop: crop || undefined, levels: 24, jq: 0.85,
        });
      }
      fs.writeFileSync(path.join(DIR, c.id + '_tex.json'), JSON.stringify(tex));
      console.log(c.id + ': wrote ' + c.id + '_tex.json (' +
        Math.round(JSON.stringify(tex).length / 1024) + 'KB)');
    });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
