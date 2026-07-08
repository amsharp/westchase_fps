// genfacade.js — turn Street View reference photos into a PS1 texture SET
// (front wall / side wall / back wall / roof) for one building cluster,
// using ONE tiled gpt-image-1 call per cluster (see TILING.md).
//
//   OPENAI_API_KEY=... node genfacade.js <clusters.json> [onlyId]
//
// clusters.json: [{ id, refs:[paths relative to housegen/], desc, roofDesc }]
// For each cluster writes into work/:
//   <id>_tiled.png                 raw 1536x1024 2x2 grid from gpt-image-1
//   <id>_front|side|back|roof.png  sliced cells
//   <id>_tex.json                  { front, side, back, roof } JPEG data-URLs
//                                  (walls 256x170, roof 256x256, posterized)
'use strict';
const fs = require('fs');
const path = require('path');
const { gptImage, withChromium, toDataUrl, writeDataUrl, SLICE_FN, CRUNCH_FN } = require('./lib');

const [, , clustersFile, onlyId] = process.argv;
if (!clustersFile) { console.error('usage: node genfacade.js clusters.json [onlyId]'); process.exit(1); }
const clusters = JSON.parse(fs.readFileSync(clustersFile, 'utf8'));
const DIR = path.join(__dirname, 'work');

const STYLE = 'Retro PS1 / PSX era video game texture set: flat shading, posterized muted colors, crisp low-resolution painted look, no photorealism, orthographic straight-on views with NO perspective, evenly lit, no shadows cast by external objects, no trees, no sky, no lawn, no people, no cars.';

function prompt(c) {
  return STYLE +
    ' Using the attached reference photos of a real suburban house (' + c.desc + '),' +
    ' create a single image that is a 2x2 GRID of four SEPARATE game textures of THIS house,' +
    ' divided by solid pure-black gutter lines about 16 pixels thick, with a black border around the outside edge.' +
    ' Each tile completely fills its grid cell edge to edge. The four tiles, left-to-right then top-to-bottom:' +
    ' TILE 1 (top-left): the FRONT WALL of the house as a plain RECTANGULAR wall texture filling the whole tile,' +
    ' matching the photo - same wall color and trim, its garage door, front door and windows in roughly their real positions,' +
    ' scaled so the garage door top nearly reaches the top edge of the tile.' +
    ' Absolutely NO roofline, NO gable triangle, NO eaves and NO sky inside the tile - flat wall surface edge to edge.' +
    ' TILE 2 (top-right): the SIDE WALL of the house - mostly plain wall texture in the same color with one small window.' +
    ' TILE 3 (bottom-left): the BACK WALL - plain wall in the same color with two windows, no door.' +
    ' TILE 4 (bottom-right): a seamless MATERIAL SWATCH of ' + (c.roofDesc || 'its roof shingles') + ' seen straight down from above, uniform rows of shingles covering the ENTIRE tile edge to edge, matching the photo roof color - NO wall, NO eave, NO trim, nothing but shingles.' +
    ' Do not blend the tiles; each is a distinct texture.';
}

async function main() {
  for (const c of clusters) {
    if (onlyId && c.id !== onlyId) continue;
    const tiledF = path.join(DIR, c.id + '_tiled.png');
    if (!fs.existsSync(tiledF)) {
      console.log(c.id + ': generating tiled texture set...');
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
      const cells = await page.evaluate(eval('(' + SLICE_FN + ')'), { src: toDataUrl(tiledF), rows: 2, cols: 2 });
      const names = ['front', 'side', 'back', 'roof'];
      const tex = {};
      for (let i = 0; i < 4; i++) {
        const cellF = path.join(DIR, c.id + '_' + names[i] + '.png');
        writeDataUrl(cells[i], cellF);
        const wall = names[i] !== 'roof';
        tex[names[i]] = await page.evaluate(eval('(' + CRUNCH_FN + ')'), {
          src: cells[i], w: 256, h: wall ? 170 : 256, levels: 24, jq: 0.85,
        });
      }
      fs.writeFileSync(path.join(DIR, c.id + '_tex.json'), JSON.stringify(tex));
      console.log(c.id + ': wrote ' + c.id + '_tex.json (' +
        Math.round(JSON.stringify(tex).length / 1024) + 'KB)');
    });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
