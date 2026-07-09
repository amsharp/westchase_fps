// Render a GLB with an OPTIONAL external texture override, in vendored
// three.js on a minimal page (fast; avoids loading the full game).
//   node glbview_tex.js <file.glb> <out.png> [targetHeight] [texOverride.jpg]
const path = require('path');
const http = require('http');
const fs = require('fs');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const ROOT = path.join(__dirname, '..', '..');
const { parseGLB } = require('./glbparse.js');

const file = process.argv[2], out = process.argv[3] || 'aigen/glbview.png';
const target = +(process.argv[4] || 1.8);
const TEXOVR = process.argv[5];
const model = parseGLB(file);
if (TEXOVR) { model.images[0] = 'data:image/jpeg;base64,' + fs.readFileSync(TEXOVR).toString('base64'); }
console.log('stats:', JSON.stringify(model.stats));

const PORT = 8100 + Math.floor(Math.random() * 800);
const PAGE = '<!doctype html><html><head><meta charset=utf8></head><body><script src="/three.min.js"></script></body></html>';
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') { res.setHeader('Content-Type', 'text/html'); res.end(PAGE); return; }
  if (p === '/model.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(model)); return; }
  const f = path.join(ROOT, p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.setHeader('Content-Type', 'application/javascript'); res.end(fs.readFileSync(f)); }
  else { res.statusCode = 404; res.end(); }
});
(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  page.on('pageerror', e => console.log('ERR', String(e)));
  await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof THREE !== 'undefined', { timeout: 15000 });
  await page.evaluate(async (target) => {
    const model = await (await fetch('/model.json')).json();
    const sc = new THREE.Scene();
    sc.background = new THREE.Color(0x87b7dc);
    sc.add(new THREE.AmbientLight(0xffffff, 0.85));
    const dl = new THREE.DirectionalLight(0xffffff, 0.45); dl.position.set(2, 4, 3); sc.add(dl);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: 0x6aa84f }));
    ground.rotation.x = -Math.PI / 2; sc.add(ground);
    const texes = await Promise.all(model.images.map(src => new Promise(res => {
      if (!src) return res(null);
      const img = new Image(); img.src = src;
      img.onload = () => { const t = new THREE.Texture(img); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; res(t); };
      img.onerror = () => res(null);
    })));
    const group = new THREE.Group();
    let minY = 1e9, maxY = -1e9;
    for (const pr of model.prims) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pr.pos), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pr.uv), 2));
      geo.computeVertexNormals(); geo.computeBoundingBox();
      minY = Math.min(minY, geo.boundingBox.min.y); maxY = Math.max(maxY, geo.boundingBox.max.y);
      const mat = new THREE.MeshLambertMaterial({ map: texes[pr.texIdx] || null, color: texes[pr.texIdx] ? 0xffffff : 0xbbbbbb });
      group.add(new THREE.Mesh(geo, mat));
    }
    const s = target / (maxY - minY);
    for (let i = 0; i < 3; i++) {
      const g = group.clone(); g.scale.setScalar(s);
      g.position.set(-1.6 + i * 1.6, -minY * s, 0); g.rotation.y = [0, 0.8, Math.PI][i];
      sc.add(g);
    }
    const cam = new THREE.PerspectiveCamera(38, 1200 / 700, 0.1, 100);
    cam.position.set(0, target * 0.62, 3.4); cam.lookAt(0, target * 0.52, 0);
    const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(1200, 700);
    document.body.appendChild(r.domElement); r.render(sc, cam);
    window.__shot = r.domElement.toDataURL('image/png');
  }, target);
  const dataUrl = await page.evaluate(() => window.__shot);
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('saved', out);
  await browser.close(); server.close();
})().catch(e => { console.error(String(e)); process.exit(1); });
