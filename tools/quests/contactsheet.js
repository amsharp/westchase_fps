// Tile a set of images into one contact sheet PNG for review.
//   node contactsheet.js <out.png> <cols> <cellW> label1:img1.png label2:img2.png ...
const fs = require('fs');
const path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const [OUT, COLS, CELLW] = [process.argv[2], +process.argv[3] || 5, +process.argv[4] || 300];
const specs = process.argv.slice(5).map(s => { const i = s.indexOf(':'); return { label: s.slice(0, i), file: s.slice(i + 1) }; });

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const imgs = specs.filter(s => fs.existsSync(s.file)).map(s => ({
    label: s.label, src: 'data:image/png;base64,' + fs.readFileSync(s.file).toString('base64') }));
  const dataUrl = await page.evaluate(async (pay) => {
    const { imgs, COLS, CELLW } = pay;
    function load(src) { return new Promise(r => { const im = new Image(); im.onload = () => r(im); im.src = src; }); }
    const loaded = await Promise.all(imgs.map(i => load(i.src)));
    const rows = Math.ceil(imgs.length / COLS);
    const CH = Math.round(CELLW * 1.4), LB = 26;
    const c = document.createElement('canvas'); c.width = COLS * CELLW; c.height = rows * (CH + LB);
    const g = c.getContext('2d'); g.fillStyle = '#2b2b2b'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < loaded.length; i++) {
      const col = i % COLS, row = (i / COLS) | 0, x = col * CELLW, y = row * (CH + LB);
      const im = loaded[i]; const s = Math.min(CELLW / im.width, CH / im.height);
      const dw = im.width * s, dh = im.height * s;
      g.drawImage(im, x + (CELLW - dw) / 2, y + LB + (CH - dh) / 2, dw, dh);
      g.fillStyle = '#111'; g.fillRect(x, y, CELLW, LB);
      g.fillStyle = '#fff'; g.font = 'bold 15px monospace'; g.fillText(imgs[i].label, x + 6, y + 18);
    }
    return c.toDataURL('image/png');
  }, { imgs, COLS, CELLW });
  fs.writeFileSync(OUT, Buffer.from(dataUrl.split(',')[1], 'base64'));
  await browser.close();
  console.log('wrote', OUT);
})().catch(e => { console.error(String(e)); process.exit(1); });
