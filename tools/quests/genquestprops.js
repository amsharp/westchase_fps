// genquestprops.js — convert the 8 static quest-prop GLBs (work/props/<n>.glb)
// into ENV_PROPS-format entries in ../../questprops.js.
//   node genquestprops.js
// Per prop: flatten node transforms, scale so the roster `axis` extent == `m`
// meters, ground at y=0, center on x/z, quantize pos->Int16 (q divisor) + uv->
// Uint16 (RAW glTF v; loader applies 1-v), posterize the baked texture to 128px
// JPEG. Emits {n,cat,tex,q,tris,p,u,dims,solid,notes}. Non-indexed (no i).
const fs = require('fs');
const path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const roster = require('./quest_props.json').props;
const WORK = path.join(__dirname, 'work', 'props');

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
    const C = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType];
    return new C(bin.buffer, bin.byteOffset + start, n);
  }
  function matFromTRS(n) {
    if (n.matrix) return n.matrix.slice();
    const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
    const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0, (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1];
  }
  function mul(a, b2) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b2[c * 4 + k]; o[c * 4 + r] = s; } return o; }
  function xf(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const pos = [], uv = [];
  function walk(ni, parent) {
    const n = json.nodes[ni], world = mul(parent, matFromTRS(n));
    if (n.mesh !== undefined) for (const prim of json.meshes[n.mesh].primitives) {
      const P = acc(prim.attributes.POSITION);
      const U = prim.attributes.TEXCOORD_0 !== undefined ? acc(prim.attributes.TEXCOORD_0) : null;
      const Idx = prim.indices !== undefined ? acc(prim.indices) : null;
      const cnt = Idx ? Idx.length : P.length / 3;
      for (let k = 0; k < cnt; k++) { const vi = Idx ? Idx[k] : k; const p = xf(world, [P[vi * 3], P[vi * 3 + 1], P[vi * 3 + 2]]); pos.push(p[0], p[1], p[2]); uv.push(U ? U[vi * 2] : 0, U ? U[vi * 2 + 1] : 0); }
    }
    for (const c of n.children || []) walk(c, world);
  }
  for (const ni of json.scenes[json.scene || 0].nodes) walk(ni, I);
  let tex = null;
  if (json.images && json.images.length && json.images[0].bufferView !== undefined) {
    const bv = json.bufferViews[json.images[0].bufferView];
    tex = 'data:' + (json.images[0].mimeType || 'image/png') + ';base64,' + bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength).toString('base64');
  }
  return { pos, uv, tex };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  const entries = [];
  for (const n of Object.keys(roster)) {
    const file = path.join(WORK, n + '.glb');
    if (!fs.existsSync(file)) { console.log('SKIP (no glb):', n); continue; }
    const cfg = roster[n];
    const g = parseGLB(file);
    const nv = g.pos.length / 3;
    // bbox
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let v = 0; v < nv; v++) for (let a = 0; a < 3; a++) { const c = g.pos[v * 3 + a]; if (c < mn[a]) mn[a] = c; if (c > mx[a]) mx[a] = c; }
    const ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
    const ai = { x: 0, y: 1, z: 2 }[cfg.axis];
    const scale = cfg.m / (ext[ai] || 1e-6);
    const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2;
    // scaled + centered coords
    const P = new Float32Array(nv * 3);
    let maxC = 0;
    for (let v = 0; v < nv; v++) {
      const x = (g.pos[v * 3] - cx) * scale, y = (g.pos[v * 3 + 1] - mn[1]) * scale, z = (g.pos[v * 3 + 2] - cz) * scale;
      P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
      maxC = Math.max(maxC, Math.abs(x), Math.abs(y), Math.abs(z));
    }
    const Q = 32000 / (maxC + 1e-6);
    const qp = new Int16Array(nv * 3), qu = new Uint16Array(nv * 2);
    for (let v = 0; v < nv; v++) {
      qp[v * 3] = Math.round(P[v * 3] * Q); qp[v * 3 + 1] = Math.round(P[v * 3 + 1] * Q); qp[v * 3 + 2] = Math.round(P[v * 3 + 2] * Q);
      qu[v * 2] = Math.max(0, Math.min(65535, Math.round(g.uv[v * 2] * 8192)));
      qu[v * 2 + 1] = Math.max(0, Math.min(65535, Math.round(g.uv[v * 2 + 1] * 8192)));
    }
    const dims = [ext[0] * scale, ext[1] * scale, ext[2] * scale].map(x => +x.toFixed(3));
    // posterize texture -> 128px JPEG
    let tex = g.tex;
    if (tex) {
      tex = await page.evaluate(async (src) => {
        const img = new Image(); img.src = src; await new Promise(r => img.onload = r);
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const gx = c.getContext('2d'); gx.imageSmoothingEnabled = true; gx.drawImage(img, 0, 0, 128, 128);
        const d = gx.getImageData(0, 0, 128, 128);
        for (let i = 0; i < d.data.length; i++) if ((i & 3) !== 3) d.data[i] = Math.round(d.data[i] / 16) * 16;
        gx.putImageData(d, 0, 0); return c.toDataURL('image/jpeg', 0.85);
      }, tex);
    }
    const b64 = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
    entries.push({ n, cat: cfg.cat, tex, q: +Q.toFixed(4), tris: nv / 3, p: b64(qp), u: b64(qu), dims, solid: !!cfg.solid, notes: cfg.notes });
    console.log(n, nv / 3, 'tris, dims', dims.join('x') + 'm, tex', tex ? Math.round(tex.length / 1024) + 'KB' : 'NONE');
  }
  await browser.close();
  const header = '// questprops.js — 8 static quest 3D props for Westchase FPS (wave #77).\n' +
    '// OFFLINE: gpt-image-1 seed -> Meshy image-to-3d lowpoly (no rig) ->\n' +
    '// genquestprops.js. ENV_PROPS schema: build like getStreetProp() — decode\n' +
    '// p/q + u (1-v flip), NON-indexed, computeVertexNormals, NearestFilter map.\n' +
    '// `solid` -> AABB collider from `dims` (true meters). Guard typeof QUEST_PROPS.\n';
  const body = header + 'var QUEST_PROPS = ' + JSON.stringify(entries) + ';\n' +
    "if (typeof module !== 'undefined') module.exports = { QUEST_PROPS: QUEST_PROPS };\n";
  new Function(body);
  const out = path.join(__dirname, '..', '..', 'questprops.js');
  fs.writeFileSync(out, body);
  console.log('wrote', out, '~' + Math.round(body.length / 1024) + 'KB,', entries.length, 'props');
})().catch(e => { console.error(String(e)); process.exit(1); });
