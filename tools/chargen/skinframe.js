// CPU-skin an animated Meshy GLB at time t and emit a static mesh JSON
// (positions/uv/tex) for glbview-style rendering. Proves the clip drives the
// mesh correctly without any runtime loader.
// Usage: node skinframe.js <anim.glb> <t seconds> <out.json>
const fs = require('fs');
const file = process.argv[2], T = +(process.argv[3] || 0.4), out = process.argv[4];

const b = fs.readFileSync(file);
const jsonLen = b.readUInt32LE(12);
const j = JSON.parse(b.slice(20, 20 + jsonLen).toString('utf8'));
let off = 20 + jsonLen, bin = null;
while (off < b.length) {
  const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4);
  if (type === 0x004E4942) { bin = b.slice(off + 8, off + 8 + len); break; }
  off += 8 + len;
}
function acc(i) {
  const a = j.accessors[i], bv = j.bufferViews[a.bufferView];
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const n = a.count * { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
  const C = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType];
  return new C(bin.buffer, bin.byteOffset + start, n);
}
// sample animation channels at T into node-local TRS
const anim = j.animations[0];
const local = j.nodes.map(n => ({ t: (n.translation || [0, 0, 0]).slice(), r: (n.rotation || [0, 0, 0, 1]).slice(), s: (n.scale || [1, 1, 1]).slice() }));
for (const ch of anim.channels) {
  const sm = anim.samplers[ch.sampler];
  const times = acc(sm.input), vals = acc(sm.output);
  let k = 0;
  while (k < times.length - 1 && times[k + 1] < T) k++;
  const k2 = Math.min(k + 1, times.length - 1);
  const f = k2 === k ? 0 : Math.max(0, Math.min(1, (T - times[k]) / (times[k2] - times[k])));
  const path = ch.target.path, ni = ch.target.node;
  if (path === 'translation' || path === 'scale') {
    const o = [];
    for (let c = 0; c < 3; c++) o[c] = vals[k * 3 + c] * (1 - f) + vals[k2 * 3 + c] * f;
    local[ni][path === 'translation' ? 't' : 's'] = o;
  } else if (path === 'rotation') {
    const a = vals.slice(k * 4, k * 4 + 4), c = vals.slice(k2 * 4, k2 * 4 + 4);
    let dot = a[0] * c[0] + a[1] * c[1] + a[2] * c[2] + a[3] * c[3];
    const sgn = dot < 0 ? -1 : 1;
    const o = [];
    for (let i2 = 0; i2 < 4; i2++) o[i2] = a[i2] * (1 - f) + c[i2] * f * sgn;
    const L = Math.hypot(o[0], o[1], o[2], o[3]);
    local[ni].r = o.map(v => v / L);
  }
}
function matTRS(l) {
  const [x, y, z, w] = l.r, s = l.s, t = l.t;
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
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const world = new Array(j.nodes.length).fill(null);
function walk(ni, parent) {
  world[ni] = mul(parent, matTRS(local[ni]));
  for (const c of j.nodes[ni].children || []) walk(c, world[ni]);
}
for (const ni of j.scenes[j.scene || 0].nodes) walk(ni, I);

const skin = j.skins[0];
const ibm = acc(skin.inverseBindMatrices);
const jointMat = skin.joints.map((ni, k) => mul(world[ni], Array.from(ibm.slice(k * 16, k * 16 + 16))));

// find the skinned mesh node (to apply its own world too, usually identity)
let meshNode = j.nodes.findIndex(n => n.mesh !== undefined && n.skin !== undefined);
const prims = [];
for (const prim of j.meshes[j.nodes[meshNode].mesh].primitives) {
  const P = acc(prim.attributes.POSITION), U = acc(prim.attributes.TEXCOORD_0);
  const JN = acc(prim.attributes.JOINTS_0), W = acc(prim.attributes.WEIGHTS_0);
  const Idx = prim.indices !== undefined ? acc(prim.indices) : null;
  const cnt = Idx ? Idx.length : P.length / 3;
  const pos = [], uv = [];
  function xf(m, p) {
    return [
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  }
  for (let k = 0; k < cnt; k++) {
    const vi = Idx ? Idx[k] : k;
    const p = [P[vi * 3], P[vi * 3 + 1], P[vi * 3 + 2]];
    let o = [0, 0, 0];
    for (let s4 = 0; s4 < 4; s4++) {
      const w = W[vi * 4 + s4];
      if (!w) continue;
      const q = xf(jointMat[JN[vi * 4 + s4]], p);
      o[0] += q[0] * w; o[1] += q[1] * w; o[2] += q[2] * w;
    }
    pos.push(o[0], o[1], o[2]);
    uv.push(U[vi * 2], 1 - U[vi * 2 + 1]);
  }
  let texIdx = -1;
  if (prim.material !== undefined) {
    const mat = j.materials[prim.material];
    const bct = mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorTexture;
    if (bct) texIdx = j.textures[bct.index].source;
  }
  prims.push({ pos, uv, texIdx });
}
const images = (j.images || []).map(img => {
  if (img.bufferView === undefined) return null;
  const bv = j.bufferViews[img.bufferView];
  return 'data:' + (img.mimeType || 'image/png') + ';base64,' + bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength).toString('base64');
});
fs.writeFileSync(out, JSON.stringify({ prims, images, stats: { t: T, tris: prims.reduce((s, p) => s + p.pos.length / 9, 0) } }));
console.log('skinned frame at t=' + T + ' ->', out);
