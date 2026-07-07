// Convert static GLB props (trees, bushes — e.g. the retro nature pack) into
// embeddable quantized data + PNG data-URL textures (alpha preserved).
// Node transforms are applied (naive parsers clip branches into trunks).
//   node genprops.js out.json name1:file1.glb[:texture.png] name2:file2.glb ...
// Positions are normalized: ground at y=0, quantized 1/512 of max extent.
const fs = require('fs');
const path = require('path');

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
    const [x, y, z, w] = q;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    return [
      (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
      (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
      (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
      t[0], t[1], t[2], 1];
  }
  function mul(a, b2) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b2[c * 4 + k];
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
  const pos = [], uv = [];
  function walk(ni, parent) {
    const n = json.nodes[ni];
    const world = mul(parent, matFromTRS(n));
    if (n.mesh !== undefined) {
      for (const prim of json.meshes[n.mesh].primitives) {
        const P = acc(prim.attributes.POSITION);
        const U = prim.attributes.TEXCOORD_0 !== undefined ? acc(prim.attributes.TEXCOORD_0) : null;
        const Idx = prim.indices !== undefined ? acc(prim.indices) : null;
        const cnt = Idx ? Idx.length : P.length / 3;
        for (let k = 0; k < cnt; k++) {
          const vi = Idx ? Idx[k] : k;
          const p = xf(world, [P[vi * 3], P[vi * 3 + 1], P[vi * 3 + 2]]);
          pos.push(p[0], p[1], p[2]);
          uv.push(U ? U[vi * 2] : 0, U ? U[vi * 2 + 1] : 0);
        }
      }
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

const OUT = process.argv[2];
const entries = [];
for (const spec of process.argv.slice(3)) {
  const [name, file, texFile] = spec.split(':');
  const g = parseGLB(file);
  let minY = 1e9, maxE = 0;
  for (let v = 0; v < g.pos.length / 3; v++) minY = Math.min(minY, g.pos[v * 3 + 1]);
  // extents measured on the values actually quantized (y is shifted by -minY),
  // otherwise shifted y can exceed int16 and wrap negative
  for (let v = 0; v < g.pos.length / 3; v++) {
    maxE = Math.max(maxE, Math.abs(g.pos[v * 3]), g.pos[v * 3 + 1] - minY, Math.abs(g.pos[v * 3 + 2]));
  }
  const Q = 32000 / (maxE + 1e-6);   // fit int16 with headroom
  const n = g.pos.length / 3;
  const qp = new Int16Array(n * 3), qu = new Uint16Array(n * 2);
  for (let v = 0; v < n; v++) {
    qp[v * 3] = Math.round(g.pos[v * 3] * Q);
    qp[v * 3 + 1] = Math.round((g.pos[v * 3 + 1] - minY) * Q);
    qp[v * 3 + 2] = Math.round(g.pos[v * 3 + 2] * Q);
    qu[v * 2] = Math.max(0, Math.min(65535, Math.round(g.uv[v * 2] * 8192)));
    qu[v * 2 + 1] = Math.max(0, Math.min(65535, Math.round(g.uv[v * 2 + 1] * 8192)));
  }
  let tex = g.tex;
  if (texFile) {
    const standalone = 'data:image/png;base64,' + fs.readFileSync(texFile).toString('base64');
    if (!tex || standalone.length < tex.length) tex = standalone;
  }
  const b64 = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
  entries.push({ n: name, q: +Q.toFixed(4), tris: n / 3, p: b64(qp), u: b64(qu), tex });
  console.log(name, n / 3, 'tris, tex', tex ? Math.round(tex.length / 1024) + 'KB' : 'NONE');
}
fs.writeFileSync(OUT, JSON.stringify(entries));
console.log('wrote', OUT, '~' + Math.round(fs.statSync(OUT).size / 1024) + 'KB');
