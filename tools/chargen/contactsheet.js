// Montage image files into one labeled grid PNG for review.
//   node contactsheet.js out.png [cols] file1.png[:label] file2.png ...
const fs = require('fs');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const out = process.argv[2];
const cols = +process.argv[3] || 5;
const items = process.argv.slice(4).map(s => { const i = s.lastIndexOf(':'); const f = i > 1 ? s.slice(0, i) : s; const l = i > 1 ? s.slice(i + 1) : f.split('/').pop().replace(/\.(png|jpg)$/, ''); return { f, l }; }).filter(x => fs.existsSync(x.f));
const CELL = 260, PAD = 4, LBL = 18;
const rows = Math.ceil(items.length / cols);
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const srcs = items.map(it => ({ l: it.l, d: 'data:image/' + (it.f.endsWith('.jpg') ? 'jpeg' : 'png') + ';base64,' + fs.readFileSync(it.f).toString('base64') }));
  const dataUrl = await page.evaluate(async ({ srcs, cols, rows, CELL, PAD, LBL }) => {
    const c = document.createElement('canvas'); c.width = cols * (CELL + PAD) + PAD; c.height = rows * (CELL + LBL + PAD) + PAD;
    const g = c.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < srcs.length; i++) {
      const cx = i % cols, cy = Math.floor(i / cols);
      const x = PAD + cx * (CELL + PAD), y = PAD + cy * (CELL + LBL + PAD);
      const img = new Image(); img.src = srcs[i].d; await new Promise(r => { img.onload = r; img.onerror = r; });
      const ar = img.width && img.height ? img.width / img.height : 1;
      let w = CELL, h = CELL; if (ar > 1) h = CELL / ar; else w = CELL * ar;
      g.fillStyle = '#000'; g.fillRect(x, y, CELL, CELL);
      g.drawImage(img, x + (CELL - w) / 2, y + (CELL - h) / 2, w, h);
      g.fillStyle = '#fff'; g.font = '13px monospace'; g.fillText(srcs[i].l, x + 2, y + CELL + 13);
    }
    return c.toDataURL('image/png');
  }, { srcs, cols, rows, CELL, PAD, LBL });
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  await browser.close();
  console.log('saved', out, items.length, 'imgs');
})();
