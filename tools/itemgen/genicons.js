// genicons.js — generate ~45 transparent-alpha PS1-style inventory item icons.
// Offline build-time only. Reads OPENAI_API_KEY from env; NEVER hardcodes it.
//
//   node genicons.js gen [--only=N]     generate raw 3x3 grids (PNG w/ alpha)
//   node genicons.js proc               slice+key+crunch existing grids -> icons
//   node genicons.js all                gen all grids then process (default)
//
// Raw grids land in work/gridN.png, per-icon PNGs in work/icons/<id>.png,
// and the final catalog in ../../itemicons.js
'use strict';

const fs = require('fs');
const path = require('path');
const { withChromium, SLICE_FN } = require('../housegen/lib');
const { GRIDS } = require('./items');

const WORK = path.join(__dirname, 'work');
const ICONS = path.join(WORK, 'icons');
fs.mkdirSync(ICONS, { recursive: true });

const STYLE =
  'Pixel-art style video game inventory item icons, PS1 / PSX low-resolution ' +
  'chunky look, each object drawn with a bold thick dark outline, flat ' +
  'cel-shaded coloring with hard shadows, high contrast, simple bold shapes, ' +
  'no gradients. Straight-on front view, no perspective, evenly lit.';

function gridPrompt(items) {
  let s = STYLE + ' The image is a 3x3 GRID of nine SEPARATE item icons, ' +
    'divided by solid pure-black gutter lines about 18 pixels thick, with a ' +
    'black border around the outside edge. Inside every grid cell the ' +
    'background is a SOLID FLAT BRIGHT MAGENTA (pure #FF00FF), a completely ' +
    'uniform magenta fill with NO gradient and NO shadow — the item sits ' +
    'centered on this flat magenta, filling most of the cell, with a thick ' +
    'dark outline. Never use magenta anywhere on the items themselves. The ' +
    'nine items, left-to-right then top-to-bottom:';
  items.forEach((it, i) => { s += ' ITEM ' + (i + 1) + ': ' + it.p + '.'; });
  s += ' Each cell holds exactly one distinct object; do not blend the tiles.';
  return s;
}

// ---- gpt-image-1 with transparent background --------------------------------
async function genGrid(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) { console.error('set OPENAI_API_KEY'); process.exit(1); }
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      size: '1536x1024',
      quality: 'medium',
      output_format: 'png',
      n: 1,
    }),
  });
  const j = await res.json();
  if (!j.data || !j.data[0] || !j.data[0].b64_json) {
    throw new Error('gpt-image-1 error: ' + JSON.stringify(j).slice(0, 600));
  }
  if (j.usage) console.log('  usage:', JSON.stringify(j.usage));
  return Buffer.from(j.data[0].b64_json, 'base64');
}

// ---- in-page: magenta-key one sliced cell into a clean 64px alpha icon ------
// Input is a single cell PNG (from SLICE_FN, black gutters removed) with a flat
// magenta background. We key the whole magenta family (incl. dark purple outline
// fringe), flood-fill from the borders so only edge-connected background dies
// (magenta *inside* an item is kept), bbox-trim, center on 64px, posterize RGB,
// harden alpha for crisp pixel edges.
const KEY_FN = `async (arg) => {
  const img = new Image();
  await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = arg.src; });
  const cw = img.width, ch = img.height;
  const cell = document.createElement('canvas'); cell.width = cw; cell.height = ch;
  const cg = cell.getContext('2d'); cg.drawImage(img, 0, 0);
  const im = cg.getImageData(0, 0, cw, ch), d = im.data;
  const OUT = arg.out || 64, PAD = arg.pad || 3;

  // magenta-family test: high R & B, low G, R~=B (covers #FF00FF and its
  // purple blends with the black outline). Also kill near-black gutter residue.
  const isBg = (i) => {
    const R = d[i], G = d[i+1], B = d[i+2];
    if (R > 60 && B > 60 && G < 95 && Math.abs(R - B) < 70 && (R - G) > 45 && (B - G) > 45) return true;
    return false;
  };
  // flood fill from all border pixels; only remove connected background
  const N = cw * ch, seen = new Uint8Array(N), stack = [];
  const push = (x, y) => { if (x>=0&&x<cw&&y>=0&&y<ch){ const p=y*cw+x; if(!seen[p]){ seen[p]=1; stack.push(p); } } };
  for (let x = 0; x < cw; x++) { push(x, 0); push(x, ch-1); }
  for (let y = 0; y < ch; y++) { push(0, y); push(cw-1, y); }
  let bgcnt = 0;
  while (stack.length) {
    const p = stack.pop(), i = p * 4;
    if (!isBg(i)) continue;      // stop at the item's dark outline
    d[i+3] = 0; bgcnt++;
    const x = p % cw, y = (p / cw) | 0;
    push(x+1,y); push(x-1,y); push(x,y+1); push(x,y-1);
  }
  const opFrac = 1 - bgcnt / N;

  // alpha bbox
  let minX = cw, minY = ch, maxX = -1, maxY = -1;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    if (d[(y*cw+x)*4+3] > 40) { if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; }
  }
  if (maxX < 0) return { src: null, empty: true };
  minX = Math.max(0, minX-PAD); minY = Math.max(0, minY-PAD);
  maxX = Math.min(cw-1, maxX+PAD); maxY = Math.min(ch-1, maxY+PAD);
  cg.putImageData(im, 0, 0);
  const bw = maxX-minX+1, bh = maxY-minY+1;

  const inner = OUT - 4, sc = Math.min(inner/bw, inner/bh);
  const dw = Math.max(1, Math.round(bw*sc)), dh = Math.max(1, Math.round(bh*sc));
  const oc = document.createElement('canvas'); oc.width = OUT; oc.height = OUT;
  const og = oc.getContext('2d'); og.imageSmoothingEnabled = true;
  og.drawImage(cell, minX, minY, bw, bh, (OUT-dw)/2, (OUT-dh)/2, dw, dh);

  const od = og.getImageData(0, 0, OUT, OUT), p = od.data;
  const lv = arg.levels || 6, qz = 255/(lv-1);
  for (let i = 0; i < p.length; i += 4) {
    p[i]   = Math.round(Math.round(p[i]  /qz)*qz);
    p[i+1] = Math.round(Math.round(p[i+1]/qz)*qz);
    p[i+2] = Math.round(Math.round(p[i+2]/qz)*qz);
    p[i+3] = p[i+3] > 110 ? 255 : 0;
  }
  og.putImageData(od, 0, 0);
  let cov = 0; for (let i = 3; i < p.length; i += 4) if (p[i] === 255) cov++;
  return { src: oc.toDataURL('image/png'), opFrac, cov: cov/(OUT*OUT) };
}`;

async function doGen(only) {
  for (let gi = 0; gi < GRIDS.length; gi++) {
    if (only != null && gi !== only) continue;
    console.log('grid', gi, '(' + GRIDS[gi].map(i=>i.id).join(', ') + ')');
    const buf = await genGrid(gridPrompt(GRIDS[gi]));
    fs.writeFileSync(path.join(WORK, 'grid' + gi + '.png'), buf);
    console.log('  -> work/grid' + gi + '.png', (buf.length/1024|0)+'KB');
  }
}

async function doProc() {
  const map = {};
  const stats = [];
  await withChromium(async (page) => {
    await page.setContent('<html><body></body></html>');
    for (let gi = 0; gi < GRIDS.length; gi++) {
      const f = path.join(WORK, 'grid' + gi + '.png');
      if (!fs.existsSync(f)) { console.log('skip grid', gi, '(no png)'); continue; }
      const src = 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
      // 1) slice by black gutters into 9 cell PNGs
      const cellSrcs = await page.evaluate('(' + SLICE_FN + ')(' + JSON.stringify({ src, rows: 3, cols: 3 }) + ')');
      // 2) magenta-key each cell -> clean 64px alpha icon
      for (let idx = 0; idx < 9; idx++) {
        const it = GRIDS[gi][idx];
        if (!it) continue;
        const c = await page.evaluate('(' + KEY_FN + ')(' + JSON.stringify({ src: cellSrcs[idx], out: 64, levels: 6 }) + ')');
        if (c.empty || !c.src) { console.log('  EMPTY', it.id); stats.push({ id: it.id, empty: true }); continue; }
        fs.writeFileSync(path.join(ICONS, it.id + '.png'), Buffer.from(c.src.split(',')[1], 'base64'));
        map[it.id] = c.src;
        stats.push({ id: it.id, opFrac: +c.opFrac.toFixed(2), cov: +c.cov.toFixed(2) });
      }
    }
  });
  // write itemicons.js + ITEM_DEFS
  writeCatalog(map);
  console.log('\nper-icon stats:');
  stats.forEach(s => console.log(' ', s.id.padEnd(13),
    s.empty ? 'EMPTY!' : ('opFrac=' + s.opFrac + ' cov=' + s.cov +
      (s.cov < 0.04 ? '  <-- tiny/legibility?' : '') +
      (s.opFrac > 0.9 ? '  <-- key may have failed' : ''))));
  return stats;
}

function writeCatalog(map) {
  const defs = [];
  for (const grid of GRIDS) for (const it of grid) {
    defs.push({ id: it.id, name: it.name, cat: it.cat, stackMax: it.stackMax,
      use: it.use, hp: it.hp, value: it.value, rarity: it.rarity });
  }
  let js = '// itemicons.js — generated by tools/itemgen/genicons.js (OFFLINE).\n';
  js += '// 2D pickup-item sprite icons (64px PNG, transparent alpha) +\n';
  js += '// suggested item definitions for the grid inventory / dumpster-dive systems.\n';
  js += '// Load BEFORE game.js in index.html when the inventory phase wires this in.\n';
  js += 'var ITEM_ICONS = {\n';
  for (const grid of GRIDS) for (const it of grid) {
    if (map[it.id]) js += '  ' + JSON.stringify(it.id) + ': ' + JSON.stringify(map[it.id]) + ',\n';
  }
  js += '};\n\n';
  js += '// use: eat|drink|med = restore hp (see hp); sell = sells for $value;\n';
  js += '// junk = sells low; tool = has a function; fun = flavor/collectible.\n';
  js += '// rarity 1 (common) .. 5 (rare). stackMax = grid stack size.\n';
  js += 'var ITEM_DEFS = ' + JSON.stringify(defs, null, 0)
    .replace(/\},\{/g, '},\n  {').replace(/^\[/, '[\n  ').replace(/\]$/, '\n]') + ';\n';
  js += '\nif (typeof module !== \'undefined\') module.exports = { ITEM_ICONS: ITEM_ICONS, ITEM_DEFS: ITEM_DEFS };\n';
  const outPath = path.join(__dirname, '..', '..', 'itemicons.js');
  fs.writeFileSync(outPath, js);
  const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log('\nwrote', outPath, kb + 'KB', '(' + defs.length + ' defs, ' + Object.keys(map).length + ' icons)');
}

(async () => {
  const cmd = process.argv[2] || 'all';
  const onlyArg = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1];
  const only = onlyArg != null && onlyArg !== '' ? +onlyArg : null;
  if (cmd === 'gen') await doGen(only);
  else if (cmd === 'proc') await doProc();
  else { await doGen(only); await doProc(); }
})().catch(e => { console.error(e); process.exit(1); });
