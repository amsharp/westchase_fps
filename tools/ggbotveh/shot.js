// Screenshot driver: serves the repo root on :8154, opens the harness in
// headless chromium (swiftshader), saves PNGs into tools/ggbotveh/out/.
//   node shot.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const pw = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '../..');
const PORT = 8154;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404); res.end('nope'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

async function main() {
  await new Promise(r => server.listen(PORT, r));
  const browser = await pw.chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1300, height: 740 } });
  page.on('console', m => console.log('[page]', m.text()));
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  const shots = ['front', 'steer', 'close',
    'close&car=GG_WAGON', 'close&car=GG_MINIVAN', 'close&car=GG_POLICE', 'close&car=GG_WRECK'];
  for (const shot of shots) {
    await page.goto('http://127.0.0.1:' + PORT + '/tools/ggbotveh/harness.html?shot=' + shot);
    await page.waitForFunction('window.__ready === true', null, { timeout: 20000 });
    const name = 'shot_' + shot.replace('&car=', '_').toLowerCase() + '.png';
    await page.screenshot({ path: path.join(__dirname, 'out', name) });
    console.log('saved out/' + name);
  }
  await browser.close();
  server.close();
}
main().catch(e => { console.error(e); process.exit(1); });
