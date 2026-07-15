// Inspect a plane GLB offline: per-object names, pivots (origins), bounds, tris,
// UVs, and whether it's already textured. No Meshy, no cost — just verification.
const fs = require('fs');
const file = process.argv[2];
const b = fs.readFileSync(file);
const jsonLen = b.readUInt32LE(12);
const json = JSON.parse(b.slice(20, 20 + jsonLen).toString('utf8'));
let off = 20 + jsonLen, bin = null;
while (off < b.length) { const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4); if (type === 0x004E4942) { bin = b.slice(off + 8, off + 8 + len); break; } off += 8 + len; }

function acc(i) {
  const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const n = a.count * { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
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
function mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
function xf(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const R = v => Math.round(v * 1000) / 1000;

const objs = [];
function walk(ni, parent, parentName) {
  const n = json.nodes[ni];
  const world = mul(parent, matFromTRS(n));
  if (n.mesh !== undefined) {
    let vtot = 0, ttot = 0, hasUV = true, uvmin = [9, 9], uvmax = [-9, -9];
    const wmin = [1e9, 1e9, 1e9], wmax = [-1e9, -1e9, -1e9];
    for (const prim of json.meshes[n.mesh].primitives) {
      const P = acc(prim.attributes.POSITION);
      const U = prim.attributes.TEXCOORD_0 !== undefined ? acc(prim.attributes.TEXCOORD_0) : null;
      if (!U) hasUV = false;
      const Idx = prim.indices !== undefined ? acc(prim.indices) : null;
      vtot += P.length / 3; ttot += (Idx ? Idx.length : P.length / 3) / 3;
      for (let k = 0; k < P.length / 3; k++) {
        const wp = xf(world, [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]]);
        for (let d = 0; d < 3; d++) { if (wp[d] < wmin[d]) wmin[d] = wp[d]; if (wp[d] > wmax[d]) wmax[d] = wp[d]; }
      }
      if (U) for (let k = 0; k < U.length / 2; k++) { for (let d = 0; d < 2; d++) { if (U[k * 2 + d] < uvmin[d]) uvmin[d] = U[k * 2 + d]; if (U[k * 2 + d] > uvmax[d]) uvmax[d] = U[k * 2 + d]; } }
    }
    const pivot = xf(world, [0, 0, 0]);   // object origin in world space = the in-game rotation pivot
    let tex = null;
    const prim0 = json.meshes[n.mesh].primitives[0];
    if (prim0.material !== undefined) { const mat = json.materials[prim0.material]; const bct = mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorTexture; tex = bct ? 'baseColorTex' : (mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorFactor ? 'flatColor' : 'material'); }
    objs.push({ name: n.name || ('node' + ni), pivot: pivot.map(R), wmin: wmin.map(R), wmax: wmax.map(R), size: [R(wmax[0] - wmin[0]), R(wmax[1] - wmin[1]), R(wmax[2] - wmin[2])], verts: vtot, tris: ttot, hasUV, uv: hasUV ? { min: uvmin.map(R), max: uvmax.map(R) } : null, tex });
  }
  for (const c of n.children || []) walk(c, world, n.name);
}
const scene = json.scenes[json.scene || 0];
for (const ni of scene.nodes) walk(ni, I, 'root');

console.log('=== glTF asset ===', JSON.stringify(json.asset));
console.log('nodes:', json.nodes.length, '| meshes:', (json.meshes || []).length, '| materials:', (json.materials || []).length, '| images:', (json.images || []).length, '| textures:', (json.textures || []).length);
console.log('\n=== OBJECTS (', objs.length, ') ===');
let TB = [1e9, 1e9, 1e9], Tb = [-1e9, -1e9, -1e9], totTris = 0;
for (const o of objs) {
  totTris += o.tris;
  for (let d = 0; d < 3; d++) { TB[d] = Math.min(TB[d], o.wmin[d]); Tb[d] = Math.max(Tb[d], o.wmax[d]); }
  console.log(`\n• ${o.name}`);
  console.log(`    pivot(origin) x=${o.pivot[0]} y=${o.pivot[1]} z=${o.pivot[2]}`);
  console.log(`    world AABB min=[${o.wmin}] max=[${o.wmax}]  size(XxYxZ)=[${o.size}]`);
  console.log(`    tris=${o.tris}  verts=${o.verts}  UVs=${o.hasUV ? 'yes ' + JSON.stringify(o.uv) : 'NO'}  material=${o.tex}`);
}
console.log('\n=== WHOLE MODEL ===');
console.log('overall AABB min=[' + TB.map(R) + '] max=[' + Tb.map(R) + ']  size=[' + [R(Tb[0] - TB[0]), R(Tb[1] - TB[1]), R(Tb[2] - TB[2])] + ']');
console.log('total tris:', totTris);
console.log('span X(wings):', R(Tb[0] - TB[0]), ' length Z(nose-tail):', R(Tb[2] - TB[2]), ' height Y:', R(Tb[1] - TB[1]));
