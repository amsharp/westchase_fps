// decode the two user JPEGs to raw RGBA at 128x128 (power-of-two so RepeatWrapping
// tiles in WebGL1) and emit groundtex.js with base64 pixel data — lets game.js
// build the textures SYNCHRONOUSLY (no async image load, so cloned materials get
// the right pixels at load time).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const dir = '/tmp/claude-0/-home-user-westchase-fps/6762ca26-85bb-50ae-aa02-dab118a4400c/scratchpad/texcheck/';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setContent('<canvas id=c width=128 height=128></canvas>');
  async function dec(file) {
    const durl = 'data:image/jpeg;base64,' + fs.readFileSync(dir + file).toString('base64');
    return await p.evaluate(async (durl) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = durl; });
      const c = document.getElementById('c'), g = c.getContext('2d');
      g.clearRect(0, 0, 128, 128);
      g.drawImage(img, 0, 0, 128, 128);           // resize to 128x128 POT
      const d = g.getImageData(0, 0, 128, 128).data;
      let bin = ''; for (let i = 0; i < d.length; i++) bin += String.fromCharCode(d[i]);
      return btoa(bin);
    }, durl);
  }
  const grass = await dec('grass.jpg');
  const conc = await dec('concrete.jpg');
  await b.close();
  const out =
    '// Vendored ground textures (user-supplied), decoded to raw RGBA at 128x128 (POT\n' +
    '// so RepeatWrapping tiles) and base64-embedded so game.js builds them SYNCHRONOUSLY\n' +
    '// (cloned concrete/grass materials get the right pixels at load; file:// stays offline).\n' +
    'var GRASS_TEX_RGBA = "' + grass + '";\n' +
    'var CONCRETE_TEX_RGBA = "' + conc + '";\n' +
    'var GROUND_TEX_SIZE = 128;\n';
  fs.writeFileSync(path.resolve(__dirname, '../../groundtex.js'), out);
  console.log('wrote groundtex.js', (out.length / 1024).toFixed(0) + 'KB', '| grass b64', grass.length, 'conc b64', conc.length);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
