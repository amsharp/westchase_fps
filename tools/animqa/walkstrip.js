// walkstrip.js — render a procedural (preset 0) character through one walk cycle
// via the REAL animPerson, side view, as a filmstrip, to confirm the planted
// gait reads as walking (feet plant, swing forward) and isn't moonwalking/broken.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
const OUT = path.join(__dirname, 'arms');
var _pa = process.argv[2] || '0';
const PRESET = _pa.indexOf('meshy:') === 0 ? _pa : parseInt(_pa, 10);
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 400 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate(() => { try { __wc.startGame(); } catch (e) { __wc.start(); } });
  const url = await page.evaluate(async (preset) => {
    var T = window.THREE;
    var m;
    if (typeof preset === 'string' && preset.indexOf('meshy:') === 0) {
      m = __wc.buildMeshySkinned(__wc.randomCharConfig(), parseInt(preset.slice(6), 10));
    } else {
      var cfg = __wc.randomCharConfig ? __wc.randomCharConfig() : {}; cfg.preset = preset;
      m = __wc.buildCharacter(cfg);
    }
    __wc.scene.add(m); m.position.set(0, 0, 0);
    var NF = 8, CW = 150, CH = 400, sheet = document.createElement('canvas'); sheet.width = CW * NF; sheet.height = CH;
    var sx = sheet.getContext('2d'); var gl = __wc.renderer.domElement;
    var cam = new T.PerspectiveCamera(30, gl.width / gl.height, 0.01, 50);
    for (var i = 0; i < NF; i++) {
      var ph = i / NF * 2 * Math.PI;
      __wc.animPerson(m, 1.5, 1 / 60, ph); m.updateMatrixWorld(true);
      // side view (character faces +z; camera on +x looking at it)
      cam.position.set(4.2, 0.9, 0.0); cam.lookAt(0, 0.85, 0); cam.updateMatrixWorld(true);
      __wc.renderer.render(__wc.scene, cam);
      // crop the center CW/CH-aspect column (where the character stands)
      var colW = gl.height * CW / CH;
      try { sx.drawImage(gl, (gl.width - colW) / 2, 0, colW, gl.height, i * CW, 0, CW, CH); } catch (e) {}
      sx.fillStyle = '#0f0'; sx.font = 'bold 15px monospace'; sx.fillText('ph' + (i / NF).toFixed(2), i * CW + 4, 18);
    }
    return sheet.toDataURL('image/png');
  }, PRESET);
  fs.writeFileSync(path.join(OUT, 'walkstrip.png'), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote walkstrip.png');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
