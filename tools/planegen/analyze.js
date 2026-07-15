// Analyze the original GLB geometry to find paint landmarks: fuselage profile,
// engine nacelles, gear wheel/strut split. Model space: nose +Y, up -Z, wings +-X.
const fs = require('fs');
function parse(file) {
  const b = fs.readFileSync(file); const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.slice(20, 20 + jl).toString('utf8'));
  let off = 20 + jl, bin = null;
  while (off < b.length) { const len = b.readUInt32LE(off), t = b.readUInt32LE(off + 4); if (t === 0x004E4942) { bin = b.slice(off + 8, off + 8 + len); break; } off += 8 + len; }
  function acc(i) { const a = json.accessors[i], bv = json.bufferViews[a.bufferView]; const s = (bv.byteOffset || 0) + (a.byteOffset || 0); const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], n = a.count * comps; const CT = { 5126: [Float32Array, 4], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5121: [Uint8Array, 1] }[a.componentType]; const by = Buffer.from(bin.subarray(s, s + n * CT[1])); return new CT[0](by.buffer, by.byteOffset, n); }
  function matTRS(n) { if (n.matrix) return n.matrix.slice(); const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1]; const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2; return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0, (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1]; }
  function mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++)for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++)s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
  function xf(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const objs = {};
  function walk(ni, parent) { const n = json.nodes[ni]; const w = mul(parent, matTRS(n)); if (n.mesh !== undefined) { const tris = []; for (const prim of json.meshes[n.mesh].primitives) { const P = acc(prim.attributes.POSITION); const Idx = prim.indices !== undefined ? acc(prim.indices) : null; const cnt = Idx ? Idx.length : P.length / 3; for (let k = 0; k < cnt; k += 3) { const a = Idx ? Idx[k] : k, b2 = Idx ? Idx[k + 1] : k + 1, c = Idx ? Idx[k + 2] : k + 2; tris.push([xf(w, [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]]), xf(w, [P[b2 * 3], P[b2 * 3 + 1], P[b2 * 3 + 2]]), xf(w, [P[c * 3], P[c * 3 + 1], P[c * 3 + 2]])]); } } objs[n.name] = tris; } for (const c of n.children || []) walk(c, w); }
  for (const ni of json.scenes[json.scene || 0].nodes) walk(ni, I);
  return objs;
}
const O = parse('/root/.claude/uploads/6762ca26-85bb-50ae-aa02-dab118a4400c/ec5d50fd-learjet.glb');
const R = v => Math.round(v * 100) / 100;
// BODY: slice by Y (fore-aft), report x/z extents per slice + centroid, to locate fuselage/wings/engines
const body = O.body;
let ymin = 1e9, ymax = -1e9; body.forEach(t => t.forEach(p => { ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); }));
console.log('BODY y-range', R(ymin), '..', R(ymax), '(nose=+Y)  tris=' + body.length);
console.log('\nY-slices (tail -> nose): for tris whose centroid falls in each band');
const NB = 16;
for (let s = 0; s < NB; s++) {
  const y0 = ymin + (ymax - ymin) * s / NB, y1 = ymin + (ymax - ymin) * (s + 1) / NB;
  let xmn = 1e9, xmx = -1e9, zmn = 1e9, zmx = -1e9, cnt = 0, absx = [];
  body.forEach(t => { const cy = (t[0][1] + t[1][1] + t[2][1]) / 3; if (cy >= y0 && cy < y1) { cnt++; t.forEach(p => { xmn = Math.min(xmn, p[0]); xmx = Math.max(xmx, p[0]); zmn = Math.min(zmn, p[2]); zmx = Math.max(zmx, p[2]); absx.push(Math.abs(p[0])); }); } });
  if (!cnt) continue;
  console.log('  y[' + R(y0) + ',' + R(y1) + '] tris=' + cnt + ' x[' + R(xmn) + ',' + R(xmx) + '] z[' + R(zmn) + ',' + R(zmx) + '] (up=-Z; top=' + R(zmn) + ')');
}
// GEARS: z distribution (wheel = lower/bigger |x-extent|? strut = upper). up=-Z, ground=+Z
['gearNose', 'gearL', 'gearR'].forEach(g => {
  const t = O[g]; let zmn = 1e9, zmx = -1e9; t.forEach(tr => tr.forEach(p => { zmn = Math.min(zmn, p[2]); zmx = Math.max(zmx, p[2]); }));
  // histogram of z to see wheel (round, at +Z bottom) vs strut
  console.log('\n' + g + ' z[' + R(zmn) + ',' + R(zmx) + '] (ground=+Z bottom). per-z-band x-extent:');
  for (let s = 0; s < 6; s++) { const z0 = zmn + (zmx - zmn) * s / 6, z1 = zmn + (zmx - zmn) * (s + 1) / 6; let xmn = 1e9, xmx = -1e9, ymn = 1e9, ymx = -1e9, c = 0; t.forEach(tr => { const cz = (tr[0][2] + tr[1][2] + tr[2][2]) / 3; if (cz >= z0 && cz < z1) { c++; tr.forEach(p => { xmn = Math.min(xmn, p[0]); xmx = Math.max(xmx, p[0]); ymn = Math.min(ymn, p[1]); ymx = Math.max(ymx, p[1]); }); } }); if (c) console.log('    z[' + R(z0) + ',' + R(z1) + '] tris=' + c + ' xspan=' + R(xmx - xmn) + ' yspan=' + R(ymx - ymn)); }
});
