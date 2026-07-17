// Minimal GLB previewer: parse a Meshy GLB and render it from a few angles in
// the vendored three.min.js (no game boot). node porschepreview.js NAME.glb outPrefix
const path = require('path'); const fs = require('fs');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const ROOT = path.join(__dirname, '..', '..');
function parseGLB(file) {
  const b = fs.readFileSync(file); const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.slice(20, 20 + jsonLen).toString('utf8'));
  let off = 20 + jsonLen, bin = null;
  while (off < b.length) { const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4); if (type === 0x004E4942) { bin = b.slice(off + 8, off + 8 + len); break; } off += 8 + len; }
  function acc(i) { const a = json.accessors[i], bv = json.bufferViews[a.bufferView]; const start = (bv.byteOffset || 0) + (a.byteOffset || 0); const n = a.count * { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type]; const C = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array, 5122: Int16Array, 5120: Int8Array }[a.componentType]; return new C(bin.buffer, bin.byteOffset + start, n); }
  function matFromTRS(n) { if (n.matrix) return n.matrix.slice(); const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1]; const [x, y, z, w] = q; const x2 = x + x, y2 = y + y, z2 = z + z; const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2; return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0, (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1]; }
  function mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
  function xf(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; const prims = [];
  function walk(ni, parent) { const n = json.nodes[ni]; const world = mul(parent, matFromTRS(n)); if (n.mesh !== undefined) { for (const prim of json.meshes[n.mesh].primitives) { const P = acc(prim.attributes.POSITION); const U = prim.attributes.TEXCOORD_0 !== undefined ? acc(prim.attributes.TEXCOORD_0) : null; const Idx = prim.indices !== undefined ? acc(prim.indices) : null; const cnt = Idx ? Idx.length : P.length / 3; const pos = [], uv = []; for (let k = 0; k < cnt; k++) { const vi = Idx ? Idx[k] : k; const p = xf(world, [P[vi * 3], P[vi * 3 + 1], P[vi * 3 + 2]]); pos.push(p[0], p[1], p[2]); if (U) uv.push(U[vi * 2], 1 - U[vi * 2 + 1]); else uv.push(0, 0); } let texIdx = -1; if (prim.material !== undefined) { const mat = json.materials[prim.material]; const bct = mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorTexture; if (bct) texIdx = json.textures[bct.index].source; } prims.push({ pos, uv, texIdx }); } } for (const c of n.children || []) walk(c, world); }
  const sceneDef = json.scenes[json.scene || 0]; for (const ni of sceneDef.nodes) walk(ni, I);
  const images = (json.images || []).map(img => { if (img.bufferView === undefined) return null; const bv = json.bufferViews[img.bufferView]; return 'data:' + (img.mimeType || 'image/png') + ';base64,' + bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength).toString('base64'); });
  return { prims, images, stats: { tris: prims.reduce((s, p) => s + p.pos.length / 9, 0) } };
}

const FILE = process.argv[2], OUTP = process.argv[3] || 'work/preview';
const model = parseGLB(FILE);
console.log('parsed', FILE, model.stats.tris, 'tris', model.images.length, 'img');
const three = fs.readFileSync(path.join(ROOT, 'three.min.js'), 'utf8');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  await page.setContent('<canvas id=c></canvas>');
  await page.addScriptTag({ content: three });
  // yaw angles to render
  const views = [{ n: 'a', yaw: 0.7, pitch: 0.35 }, { n: 'b', yaw: 2.4, pitch: 0.3 }, { n: 'c', yaw: 3.8, pitch: 0.5 }];
  for (const v of views) {
    const data = await page.evaluate(async (o) => {
      const { model, view } = o;
      const rnd = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      rnd.setSize(640, 480); rnd.setClearColor(0xb8c4cc, 1);
      const sc = new THREE.Scene();
      sc.add(new THREE.AmbientLight(0xffffff, 0.85));
      const dl = new THREE.DirectionalLight(0xffffff, 0.6); dl.position.set(3, 5, 4); sc.add(dl);
      const texes = await Promise.all(model.images.map(src => src ? new Promise(res => { const im = new Image(); im.src = src; im.onload = () => { const t = new THREE.Texture(im); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; res(t); }; im.onerror = () => res(null); }) : Promise.resolve(null)));
      const grp = new THREE.Group();
      let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      for (const pr of model.prims) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pr.pos), 3));
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pr.uv), 2));
        g.computeVertexNormals();
        const tex = pr.texIdx >= 0 ? texes[pr.texIdx] : null;
        const m = new THREE.MeshLambertMaterial(tex ? { map: tex } : { color: 0x3366bb });
        grp.add(new THREE.Mesh(g, m));
        for (let i = 0; i < pr.pos.length; i += 3) { for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], pr.pos[i + a]); mx[a] = Math.max(mx[a], pr.pos[i + a]); } }
      }
      const cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2, cz = (mn[2] + mx[2]) / 2;
      const r = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
      grp.position.set(-cx, -cy, -cz); sc.add(grp);
      const cam = new THREE.PerspectiveCamera(35, 640 / 480, 0.01, 1000);
      const d = r * 2.2;
      cam.position.set(Math.sin(view.yaw) * d * Math.cos(view.pitch), Math.sin(view.pitch) * d, Math.cos(view.yaw) * d * Math.cos(view.pitch));
      cam.lookAt(0, 0, 0);
      rnd.render(sc, cam);
      return rnd.domElement.toDataURL('image/png');
    }, { model, view: v });
    fs.writeFileSync(OUTP + '_' + v.n + '.png', Buffer.from(data.split(',')[1], 'base64'));
    console.log('wrote', OUTP + '_' + v.n + '.png');
  }
  await browser.close();
})();
