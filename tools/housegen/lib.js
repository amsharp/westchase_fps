// lib.js — shared helpers for the housegen pipeline.
// Node 22, global fetch. API keys come ONLY from env vars — never hardcode.
'use strict';
const fs = require('fs');
const path = require('path');

function need(env) {
  const v = process.env[env];
  if (!v) { console.error('set ' + env); process.exit(1); }
  return v;
}

// ---- OpenAI gpt-image-1 -------------------------------------------------
// generate: text -> image.  edit: reference image(s) + text -> image.
// opts: { prompt, size='1024x1024', quality='low', refs=[pngPaths] }
// Returns a Buffer (PNG).
async function gptImage(opts) {
  const key = need('OPENAI_API_KEY');
  const url = 'https://api.openai.com/v1/images/' + (opts.refs && opts.refs.length ? 'edits' : 'generations');
  let res;
  if (opts.refs && opts.refs.length) {
    const fd = new FormData();
    fd.append('model', 'gpt-image-1');
    fd.append('prompt', opts.prompt);
    fd.append('size', opts.size || '1024x1024');
    fd.append('quality', opts.quality || 'low');
    for (const p of opts.refs) {
      const mime = p.match(/\.jpe?g$/i) ? 'image/jpeg' : 'image/png';
      fd.append('image[]', new Blob([fs.readFileSync(p)], { type: mime }), path.basename(p));
    }
    res = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: fd });
  } else {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-1', prompt: opts.prompt, size: opts.size || '1024x1024', quality: opts.quality || 'low' }),
    });
  }
  const j = await res.json();
  if (!j.data || !j.data[0] || !j.data[0].b64_json) {
    throw new Error('gpt-image-1 error: ' + JSON.stringify(j).slice(0, 500));
  }
  if (j.usage) console.log('  usage:', JSON.stringify(j.usage));
  return Buffer.from(j.data[0].b64_json, 'base64');
}

// ---- headless-canvas image ops (playwright chromium, ONE at a time) ------
// Runs fn(page) inside a fresh chromium and closes it. fn gets a blank page.
async function withChromium(fn) {
  const { chromium } = require('/opt/node22/lib/node_modules/playwright');
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    return await fn(page);
  } finally {
    await browser.close();
  }
}

function findChromium() {
  const root = '/opt/pw-browsers';
  const dirs = fs.readdirSync(root).filter((d) => d.startsWith('chromium'));
  for (const d of dirs) {
    const p = path.join(root, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('chromium not found under ' + root);
}

function toDataUrl(file) {
  const mime = file.match(/\.jpe?g$/i) ? 'image/jpeg' : 'image/png';
  return 'data:' + mime + ';base64,' + fs.readFileSync(file).toString('base64');
}

function writeDataUrl(dataUrl, file) {
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

// Slice a tiled grid image into cells, trimming gutters by scanning for
// near-black rows/columns. Returns array of PNG data-URLs (row-major).
// Runs in the page context. img: dataURL, rows/cols: grid shape.
const SLICE_FN = `async (arg) => {
  const img = new Image();
  await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = arg.src; });
  const W = img.width, H = img.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  const darkCol = new Float32Array(W), darkRow = new Float32Array(H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (lum < 48) { darkCol[x] += 1 / H; darkRow[y] += 1 / W; }
  }
  // expected gutter centers at k/cols etc.; find the darkest band near each
  function cuts(dark, n, len) {
    const out = [0];
    for (let k = 1; k < n; k++) {
      const guess = Math.round((len * k) / n); let best = guess, bestV = -1;
      for (let p = Math.max(0, guess - len * 0.08); p < Math.min(len, guess + len * 0.08); p++) {
        if (dark[Math.round(p)] > bestV) { bestV = dark[Math.round(p)]; best = Math.round(p); }
      }
      out.push(best);
    }
    out.push(len); return out;
  }
  const cx = cuts(darkCol, arg.cols, W), cy = cuts(darkRow, arg.rows, H);
  const cells = [];
  for (let r = 0; r < arg.rows; r++) for (let q = 0; q < arg.cols; q++) {
    let x0 = cx[q], x1 = cx[q + 1], y0 = cy[r], y1 = cy[r + 1];
    // shrink past the gutter: walk inward while the row/col is mostly dark
    const isDarkCol = (x, ya, yb) => { let n = 0; for (let y = ya; y < yb; y++) { const i = (y * W + x) * 4; if (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 48) n++; } return n > (yb - ya) * 0.6; };
    const isDarkRow = (y, xa, xb) => { let n = 0; for (let x = xa; x < xb; x++) { const i = (y * W + x) * 4; if (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 48) n++; } return n > (xb - xa) * 0.6; };
    while (x0 < x1 - 8 && isDarkCol(x0, y0, y1)) x0++;
    while (x1 > x0 + 8 && isDarkCol(x1 - 1, y0, y1)) x1--;
    while (y0 < y1 - 8 && isDarkRow(y0, x0, x1)) y0++;
    while (y1 > y0 + 8 && isDarkRow(y1 - 1, x0, x1)) y1--;
    // small safety inset
    const inset = 3; x0 += inset; x1 -= inset; y0 += inset; y1 -= inset;
    const cc = document.createElement('canvas'); cc.width = x1 - x0; cc.height = y1 - y0;
    cc.getContext('2d').drawImage(c, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
    cells.push(cc.toDataURL('image/png'));
  }
  return cells;
}`;

// Downscale to size px, posterize (PSX crunch), return JPEG data-URL.
// arg.crop (optional): [xFrac, yFrac, wFrac, hFrac] source crop before scaling.
const CRUNCH_FN = `async (arg) => {
  const img = new Image();
  await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = arg.src; });
  const s = arg.size || 256;
  const w = arg.w || s, h = arg.h || s;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = true;
  const cr = arg.crop || [0, 0, 1, 1];
  g.drawImage(img, cr[0] * img.width, cr[1] * img.height, cr[2] * img.width, cr[3] * img.height, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h);
  const lv = arg.levels || 24, q = 255 / (lv - 1);
  for (let i = 0; i < d.data.length; i++) if ((i & 3) !== 3) d.data[i] = Math.round(Math.round(d.data[i] / q) * q);
  g.putImageData(d, 0, 0);
  return c.toDataURL('image/jpeg', arg.jq || 0.85);
}`;

module.exports = { gptImage, withChromium, toDataUrl, writeDataUrl, SLICE_FN, CRUNCH_FN, need };
