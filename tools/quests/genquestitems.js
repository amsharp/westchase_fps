// genquestitems.js — generate transparent-alpha PS1-style QUEST item icons.
// Same magenta-key 3x3 tiling pipeline as itemgen/genicons.js, but reads
// quest_items.js and writes ../../questitems.js (QUEST_ITEMS + QUEST_ITEM_DEFS).
// Offline build-time only. Reads OPENAI_API_KEY from env; NEVER hardcodes it.
//
//   node genquestitems.js gen [--only=N]   generate raw 3x3 grids
//   node genquestitems.js proc             slice+key+crunch existing grids -> icons
//   node genquestitems.js all              gen all grids then process (default)
'use strict';

const fs = require('fs');
const path = require('path');
const { withChromium, SLICE_FN } = require('../housegen/lib');
const { GRIDS } = require('./quest_items');

const WORK = path.join(__dirname, 'work', 'items');
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

async function genGrid(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) { console.error('set OPENAI_API_KEY'); process.exit(1); }
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1536x1024', quality: 'medium', output_format: 'png', n: 1 }),
  });
  const j = await res.json();
  if (!j.data || !j.data[0] || !j.data[0].b64_json) throw new Error('gpt-image-1 error: ' + JSON.stringify(j).slice(0, 600));
  if (j.usage) console.log('  usage:', JSON.stringify(j.usage));
  return Buffer.from(j.data[0].b64_json, 'base64');
}

// identical magenta-key routine as genicons.js
const KEY_FN = `async (arg) => {
  const img = new Image();
  await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = arg.src; });
  const cw = img.width, ch = img.height;
  const cell = document.createElement('canvas'); cell.width = cw; cell.height = ch;
  const cg = cell.getContext('2d'); cg.drawImage(img, 0, 0);
  const im = cg.getImageData(0, 0, cw, ch), d = im.data;
  const OUT = arg.out || 64, PAD = arg.pad || 3;
  const isBg = (i) => {
    const R = d[i], G = d[i+1], B = d[i+2];
    if (R > 60 && B > 60 && G < 95 && Math.abs(R - B) < 70 && (R - G) > 45 && (B - G) > 45) return true;
    return false;
  };
  const N = cw * ch;
  let bgcnt = 0;
  for (let i = 0; i < d.length; i += 4) if (isBg(i)) { d[i+3] = 0; bgcnt++; }
  const EDGE = Math.max(3, Math.round(Math.min(cw, ch) * 0.06));
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    if (x < EDGE || y < EDGE || x >= cw - EDGE || y >= ch - EDGE) {
      const i = (y*cw+x)*4, lum = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
      if (lum < 80) d[i+3] = 0;
    }
  }
  const opFrac = 1 - bgcnt / N;
  const lbl = new Int32Array(N).fill(-1), comps = [];
  const fstack = [];
  for (let s = 0; s < N; s++) {
    if (d[s*4+3] <= 40 || lbl[s] !== -1) continue;
    const id = comps.length; lbl[s] = id; fstack.push(s);
    let cnt = 0, dark = 0, minx = cw, maxx = 0, miny = ch, maxy = 0;
    while (fstack.length) {
      const p = fstack.pop(); cnt++;
      const x = p % cw, y = (p / cw) | 0, i = p*4;
      if (0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2] < 80) dark++;
      if (x<minx)minx=x; if (x>maxx)maxx=x; if (y<miny)miny=y; if (y>maxy)maxy=y;
      if (x > 0 && d[(p-1)*4+3] > 40 && lbl[p-1]===-1){lbl[p-1]=id;fstack.push(p-1);}
      if (x < cw-1 && d[(p+1)*4+3] > 40 && lbl[p+1]===-1){lbl[p+1]=id;fstack.push(p+1);}
      if (y > 0 && d[(p-cw)*4+3] > 40 && lbl[p-cw]===-1){lbl[p-cw]=id;fstack.push(p-cw);}
      if (y < ch-1 && d[(p+cw)*4+3] > 40 && lbl[p+cw]===-1){lbl[p+cw]=id;fstack.push(p+cw);}
    }
    comps.push({ cnt, dark, minSide: Math.min(maxx-minx+1, maxy-miny+1) });
  }
  let big = 0; for (let k = 1; k < comps.length; k++) if (comps[k].cnt > comps[big].cnt) big = k;
  const minCell = Math.min(cw, ch);
  for (let p = 0; p < N; p++) {
    const id = lbl[p]; if (id === -1) continue;
    if (id === big) continue;
    const c = comps[id];
    const chunky = c.minSide > minCell * 0.10 && (c.dark / c.cnt) < 0.7;
    if (!chunky) d[p*4+3] = 0;
  }
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
    console.log('  -> work/items/grid' + gi + '.png', (buf.length/1024|0)+'KB');
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
      const cellSrcs = await page.evaluate('(' + SLICE_FN + ')(' + JSON.stringify({ src, rows: 3, cols: 3 }) + ')');
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
  writeCatalog(map);
  console.log('\nper-icon stats:');
  stats.forEach(s => console.log(' ', s.id.padEnd(18),
    s.empty ? 'EMPTY!' : ('opFrac=' + s.opFrac + ' cov=' + s.cov +
      (s.cov < 0.04 ? '  <-- tiny/legibility?' : '') +
      (s.opFrac > 0.9 ? '  <-- key may have failed' : ''))));
  return stats;
}

function writeCatalog(map) {
  const defs = [];
  for (const grid of GRIDS) for (const it of grid) {
    defs.push({ id: it.id, name: it.name, quest: it.quest, use: it.use, notes: it.notes });
  }
  let js = '// questitems.js — generated by tools/quests/genquestitems.js (OFFLINE).\n';
  js += '// 2D quest-item pickup icons (64px PNG, transparent alpha) + defs for the\n';
  js += '// quest system (wave #77). Load BEFORE game.js; guard typeof QUEST_ITEMS.\n';
  js += 'var QUEST_ITEMS = {\n';
  for (const grid of GRIDS) for (const it of grid) {
    if (map[it.id]) js += '  ' + JSON.stringify(it.id) + ': ' + JSON.stringify(map[it.id]) + ',\n';
  }
  js += '};\n\n';
  js += '// use: reward = quest-reward capability/weapon; clue = investigation clue;\n';
  js += '// key = unlocks a door/lock (q10 keys etc); tool = quest utility;\n';
  js += '// thread = Countryway Pact story tile; entry = triggers/enters a quest.\n';
  js += 'var QUEST_ITEM_DEFS = ' + JSON.stringify(defs, null, 0)
    .replace(/\},\{/g, '},\n  {').replace(/^\[/, '[\n  ').replace(/\]$/, '\n]') + ';\n';
  js += '\nif (typeof module !== \'undefined\') module.exports = { QUEST_ITEMS: QUEST_ITEMS, QUEST_ITEM_DEFS: QUEST_ITEM_DEFS };\n';
  new Function(js); // syntax gate
  const outPath = path.join(__dirname, '..', '..', 'questitems.js');
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
