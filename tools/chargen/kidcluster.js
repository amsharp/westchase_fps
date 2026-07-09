// Analyze base kid atlases: k-means the non-black pixels, dump a montage of
// each atlas (upscaled) + its dominant color swatches (RGB + pixel share).
// Helps assign semantic labels (skin/hair/shirt/pants/shoe/graphic) so the
// programmatic recolor (kidrecolor.js) can target clusters deterministically.
//   node kidcluster.js
const fs = require('fs');
const path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const WORK = path.join(__dirname, 'work');
const BASES = ['LEO', 'MAYA', 'SOFIA', 'JAYDEN', 'EMMA', 'KAI', 'PRIYA', 'NOAH'];

const atlases = {};
for (const b of BASES) atlases[b] = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(WORK, 'tex_' + b + '.jpg')).toString('base64');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const dataUrl = await page.evaluate(async (pay) => {
    const { atlases, BASES } = pay;
    function load(src) { return new Promise(r => { const im = new Image(); im.onload = () => r(im); im.src = src; }); }
    // RGB->Lab
    function rgb2lab(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
      g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
      b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
      let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
      let y = (r * 0.2126 + g * 0.7152 + b * 0.0722);
      let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
      const f = t => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
      x = f(x); y = f(y); z = f(z);
      return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
    }
    const CELL = 256, SW = 30, K = 9;
    const rows = BASES.length;
    const W = CELL + SW * K + 200;
    const H = rows * CELL;
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const octx = out.getContext('2d'); octx.fillStyle = '#111'; octx.fillRect(0, 0, W, H);
    const report = {};
    for (let bi = 0; bi < BASES.length; bi++) {
      const b = BASES[bi];
      const im = await load(atlases[b]);
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(im, 0, 0, 256, 256);
      const d = g.getImageData(0, 0, 256, 256).data;
      // collect non-black pixels
      const pts = [];
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gg = d[i + 1], bb = d[i + 2];
        if (r + gg + bb < 36) continue; // background
        pts.push([r, gg, bb, ...rgb2lab(r, gg, bb)]);
      }
      // k-means in Lab
      let cents = [];
      for (let k = 0; k < K; k++) { const p = pts[(Math.random() * pts.length) | 0]; cents.push([p[3], p[4], p[5]]); }
      const assign = new Int32Array(pts.length);
      for (let it = 0; it < 25; it++) {
        for (let i = 0; i < pts.length; i++) {
          let best = 0, bd = 1e9;
          for (let k = 0; k < K; k++) { const dl = pts[i][3] - cents[k][0], da = pts[i][4] - cents[k][1], db = pts[i][5] - cents[k][2]; const dd = dl * dl + da * da + db * db; if (dd < bd) { bd = dd; best = k; } }
          assign[i] = best;
        }
        const sum = Array.from({ length: K }, () => [0, 0, 0, 0, 0, 0, 0]); // L a b R G B count
        for (let i = 0; i < pts.length; i++) { const k = assign[i]; const s = sum[k]; s[0] += pts[i][3]; s[1] += pts[i][4]; s[2] += pts[i][5]; s[3] += pts[i][0]; s[4] += pts[i][1]; s[5] += pts[i][2]; s[6]++; }
        for (let k = 0; k < K; k++) if (sum[k][6] > 0) cents[k] = [sum[k][0] / sum[k][6], sum[k][1] / sum[k][6], sum[k][2] / sum[k][6]];
        report[b + '_last'] = sum;
      }
      // final swatch RGB + share
      const sum = report[b + '_last'];
      const sw = [];
      for (let k = 0; k < K; k++) if (sum[k][6] > 0) sw.push({ rgb: [Math.round(sum[k][3] / sum[k][6]), Math.round(sum[k][4] / sum[k][6]), Math.round(sum[k][5] / sum[k][6])], share: sum[k][6] / pts.length });
      sw.sort((a, z) => z.share - a.share);
      report[b] = sw;
      delete report[b + '_last'];
      // draw atlas
      const y0 = bi * CELL;
      octx.imageSmoothingEnabled = false;
      octx.drawImage(c, 0, y0, CELL, CELL);
      // draw swatches
      for (let k = 0; k < sw.length; k++) {
        octx.fillStyle = 'rgb(' + sw[k].rgb.join(',') + ')';
        octx.fillRect(CELL + k * SW, y0 + 40, SW, SW * 2);
        octx.fillStyle = '#fff'; octx.font = '9px monospace';
        octx.save(); octx.translate(CELL + k * SW + 10, y0 + 110); octx.rotate(Math.PI / 2);
        octx.fillText(sw[k].rgb.join(',') + ' ' + (sw[k].share * 100).toFixed(0) + '%', 0, 0); octx.restore();
      }
      octx.fillStyle = '#fff'; octx.font = 'bold 16px monospace'; octx.fillText(b, CELL + 4, y0 + 20);
    }
    return { url: out.toDataURL('image/png'), report };
  }, { atlases, BASES });
  fs.writeFileSync(path.join(__dirname, 'aigen', 'kid_clusters.png'), Buffer.from(dataUrl.url.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(WORK, 'kid_clusters.json'), JSON.stringify(dataUrl.report, null, 1));
  console.log('wrote aigen/kid_clusters.png');
  for (const b of BASES) console.log(b, JSON.stringify(dataUrl.report[b].map(s => s.rgb.join(',') + '@' + (s.share * 100).toFixed(0))));
  await browser.close();
})().catch(e => { console.error(String(e)); process.exit(1); });
