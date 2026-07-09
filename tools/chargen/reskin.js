// Reskin an existing character's texture atlas with gpt-image-1 (recolor /
// re-dress while preserving the UV layout). Emits a 256px posterized JPEG.
//   OPENAI_API_KEY=... node reskin.js <inAtlas.jpg> <out.jpg> "<recolor instruction>" [quality]
// Render the result on the base mesh with glbview_tex.js to verify the layout
// survived before trusting it.
const fs = require('fs');
const path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error('set OPENAI_API_KEY'); process.exit(1); }
const [IN, OUT, INSTR, QUAL] = [process.argv[2], process.argv[3], process.argv[4], process.argv[5] || 'low'];

const PROMPT = 'This image is a 256x256 UV texture atlas for a low-poly 3D character model, made of many small irregular islands on a black background. CRITICAL: preserve the EXACT same layout — every island must keep its identical position, shape, size, rotation and the black background must stay black. Do NOT move, rearrange, add, remove, smooth or redraw any island; do NOT change the overall composition. This must remain a usable UV atlas that maps onto the same mesh. The ONLY change: ' + INSTR + ' Keep the flat, low-resolution, unshaded game-texture look with no added lighting or gradients.';

(async () => {
  const boundary = '----rk' + Math.random().toString(16).slice(2);
  const parts = [];
  function field(name, val) { parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="' + name + '"\r\n\r\n' + val + '\r\n')); }
  function file(name, fn, buf, mime) { parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="' + name + '"; filename="' + fn + '"\r\nContent-Type: ' + mime + '\r\n\r\n'), buf, Buffer.from('\r\n')); }
  field('model', 'gpt-image-1');
  field('prompt', PROMPT);
  field('size', '1024x1024');
  field('quality', QUAL);
  file('image[]', 'atlas.png', fs.readFileSync(IN), 'image/jpeg');
  parts.push(Buffer.from('--' + boundary + '--\r\n'));
  const body = Buffer.concat(parts);
  const r = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'multipart/form-data; boundary=' + boundary }, body,
  });
  const j = await r.json();
  if (!j.data) { console.error('API error:', JSON.stringify(j).slice(0, 500)); process.exit(1); }
  const raw = Buffer.from(j.data[0].b64_json, 'base64');
  // downsample to 256 + posterize (matches genskin texture crunch)
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const jpeg = await page.evaluate(async (src) => {
    const img = new Image(); img.src = src; await new Promise(r => img.onload = r);
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.drawImage(img, 0, 0, 256, 256);
    const d = g.getImageData(0, 0, 256, 256);
    for (let i = 0; i < d.data.length; i++) if ((i & 3) !== 3) d.data[i] = Math.round(d.data[i] / 12) * 12;
    g.putImageData(d, 0, 0);
    return c.toDataURL('image/jpeg', 0.85);
  }, 'data:image/png;base64,' + raw.toString('base64'));
  await browser.close();
  fs.writeFileSync(OUT, Buffer.from(jpeg.split(',')[1], 'base64'));
  console.log('saved', OUT, Math.round(fs.statSync(OUT).size / 1024) + 'KB');
})().catch(e => { console.error(String(e)); process.exit(1); });
