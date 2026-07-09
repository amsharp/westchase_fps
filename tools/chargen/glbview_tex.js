// Render a GLB (with full node-transform handling) in the game's three.js.
// Usage: node glbview.js <file.glb> <out.png> [targetHeight]
const path = require('path');
const http = require('http');
const fs = require('fs');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(require('path').join('/opt/node22/lib/node_modules', 'playwright'))); }
const ROOT = path.join(__dirname, '..', '..');   // repo root (serves index.html + three.min.js)

function parseGLB(file) {
  const b = fs.readFileSync(file);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.slice(20, 20 + jsonLen).toString('utf8'));
  let off = 20 + jsonLen, bin = null;
  while (off < b.length) {
    const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4);
    if (type === 0x004E4942) { bin = b.slice(off + 8, off + 8 + len); break; }
    off += 8 + len;
  }
  function acc(i) {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
    const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const n = a.count * { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
    const C = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array, 5122: Int16Array, 5120: Int8Array }[a.componentType];
    return new C(bin.buffer, bin.byteOffset + start, n);
  }
  // matrix helpers
  function matFromTRS(n) {
    const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
    const [x, y, z, w] = q;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    const m = [
      (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
      (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
      (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
      t[0], t[1], t[2], 1];
    return n.matrix ? n.matrix.slice() : m;
  }
  function mul(a, b) { // column-major a*b
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  }
  function xf(m, p) {
    return [
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  }
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const prims = []; // {pos, uv, texIdx}
  function walk(ni, parent) {
    const n = json.nodes[ni];
    const world = mul(parent, matFromTRS(n));
    if (n.mesh !== undefined) {
      for (const prim of json.meshes[n.mesh].primitives) {
        const P = acc(prim.attributes.POSITION);
        const U = prim.attributes.TEXCOORD_0 !== undefined ? acc(prim.attributes.TEXCOORD_0) : null;
        const Idx = prim.indices !== undefined ? acc(prim.indices) : null;
        const cnt = Idx ? Idx.length : P.length / 3;
        const pos = [], uv = [];
        for (let k = 0; k < cnt; k++) {
          const vi = Idx ? Idx[k] : k;
          const p = xf(world, [P[vi * 3], P[vi * 3 + 1], P[vi * 3 + 2]]);
          pos.push(p[0], p[1], p[2]);
          if (U) uv.push(U[vi * 2], 1 - U[vi * 2 + 1]); else uv.push(0, 0);
        }
        let texIdx = -1;
        if (prim.material !== undefined) {
          const mat = json.materials[prim.material];
          const bct = mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorTexture;
          if (bct) texIdx = json.textures[bct.index].source;
        }
        prims.push({ pos, uv, texIdx });
      }
    }
    for (const c of n.children || []) walk(c, world);
  }
  const sceneDef = json.scenes[json.scene || 0];
  for (const ni of sceneDef.nodes) walk(ni, I);
  const images = (json.images || []).map(img => {
    if (img.bufferView === undefined) return null;
    const bv = json.bufferViews[img.bufferView];
    return 'data:' + (img.mimeType || 'image/png') + ';base64,' + bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength).toString('base64');
  });
  return { prims, images, stats: { nodes: (json.nodes || []).length, skins: (json.skins || []).length, anims: (json.animations || []).map(a => a.name || '?'), tris: prims.reduce((s, p) => s + p.pos.length / 9, 0) } };
}

const file = process.argv[2], out = process.argv[3] || "aigen/glbview.png";
const TEXOVR = process.argv[5];
const target = +(process.argv[4] || 1.8);
const model = parseGLB(file);
if (TEXOVR) { const tb = fs.readFileSync(TEXOVR); model.images[0] = "data:image/jpeg;base64," + tb.toString("base64"); }
console.log('stats:', JSON.stringify(model.stats));

const MIME = { '.html': 'text/html', '.js': 'application/javascript' };
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  if (p === '/model.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(model)); return; }
  const f = path.join(ROOT, p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); }
  else { res.statusCode = 404; res.end(); }
});
(async () => {
  await new Promise(r => server.listen(8123, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  page.on('pageerror', e => console.log('ERR', String(e)));
  await page.goto('http://localhost:8123/', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(async (target) => {
    const model = await (await fetch('/model.json')).json();
    const sc = new THREE.Scene();
    sc.background = new THREE.Color(0x87b7dc);
    sc.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dl = new THREE.DirectionalLight(0xffffff, 0.5); dl.position.set(2, 4, 3); sc.add(dl);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: 0x6aa84f }));
    ground.rotation.x = -Math.PI / 2; sc.add(ground);
    const texes = await Promise.all(model.images.map(src => new Promise(res => {
      if (!src) return res(null);
      const img = new Image(); img.src = src;
      img.onload = () => {
        const t = new THREE.Texture(img);
        t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
        t.generateMipmaps = false; t.needsUpdate = true;
        res(t);
      };
      img.onerror = () => res(null);
    })));
    const group = new THREE.Group();
    let minY = 1e9, maxY = -1e9;
    for (const pr of model.prims) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pr.pos), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pr.uv), 2));
      geo.computeVertexNormals();
      geo.computeBoundingBox();
      minY = Math.min(minY, geo.boundingBox.min.y); maxY = Math.max(maxY, geo.boundingBox.max.y);
      const mat = new THREE.MeshLambertMaterial({ map: texes[pr.texIdx] || null, color: texes[pr.texIdx] ? 0xffffff : 0xbbbbbb });
      group.add(new THREE.Mesh(geo, mat));
    }
    const s = target / (maxY - minY);
    // three angled copies: front, 3/4, back
    for (let i = 0; i < 3; i++) {
      const g = group.clone();
      g.scale.setScalar(s);
      g.position.set(-1.6 + i * 1.6, -minY * s, 0);
      g.rotation.y = [0, 0.8, Math.PI][i];
      sc.add(g);
    }
    const cam = new THREE.PerspectiveCamera(38, 1200 / 700, 0.1, 100);
    cam.position.set(0, target * 0.62, 3.4);
    cam.lookAt(0, target * 0.52, 0);
    const r = new THREE.WebGLRenderer({ antialias: true });
    r.setSize(1200, 700);
    document.body.appendChild(r.domElement);
    r.render(sc, cam);
    window.__shot = r.domElement.toDataURL('image/png');
  }, target);
  const dataUrl = await page.evaluate(() => window.__shot);
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('saved', out);
  await browser.close(); server.close();
})();
