const fs = require('fs');
function parse(file) {
  const b = fs.readFileSync(file); const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.slice(20, 20 + jl).toString('utf8'));
  let off = 20 + jl, bin = null;
  while (off < b.length) { const len = b.readUInt32LE(off), t = b.readUInt32LE(off + 4); if (t === 0x004E4942) { bin = b.slice(off + 8, off + 8 + len); break; } off += 8 + len; }
  function acc(i) { const a = json.accessors[i], bv = json.bufferViews[a.bufferView]; const s = (bv.byteOffset || 0) + (a.byteOffset || 0); const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], n = a.count * comps; const CT = { 5126: [Float32Array, 4], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5121: [Uint8Array, 1] }[a.componentType]; const by = Buffer.from(bin.subarray(s, s + n * CT[1])); return new CT[0](by.buffer, by.byteOffset, n); }
  function mTRS(n) { if (n.matrix) return n.matrix.slice(); const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1]; const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2; return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0, (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1]; }
  function mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++)for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++)s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
  function xf(m, p) { return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12], m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]]; }
  function xfN(m, p) { return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2], m[1]*p[0]+m[5]*p[1]+m[9]*p[2], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]]; }
  const I = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const out = {};
  function walk(ni, parent) { const nd = json.nodes[ni]; const w = mul(parent, mTRS(nd)); if (nd.mesh !== undefined) { const p=[],nn=[],u=[],idx=[]; let base=0; for (const prim of json.meshes[nd.mesh].primitives) { const P=acc(prim.attributes.POSITION); const N=prim.attributes.NORMAL!==undefined?acc(prim.attributes.NORMAL):null; const U=acc(prim.attributes.TEXCOORD_0); const Idx=prim.indices!==undefined?acc(prim.indices):null; const nv=P.length/3; for(let k=0;k<nv;k++){ const wp=xf(w,[P[k*3],P[k*3+1],P[k*3+2]]); p.push(wp[0],wp[1],wp[2]); if(N){const wn=xfN(w,[N[k*3],N[k*3+1],N[k*3+2]]);const L=Math.hypot(wn[0],wn[1],wn[2])||1;nn.push(wn[0]/L,wn[1]/L,wn[2]/L);} else nn.push(0,0,0); u.push(U[k*2],U[k*2+1]); } const cnt=Idx?Idx.length:nv; for(let k=0;k<cnt;k++){ idx.push(base+(Idx?Idx[k]:k)); } base+=nv; } out[nd.name]={p:p,n:nn,u:u,i:idx,pivot:xf(w,[0,0,0])}; } for (const c of nd.children||[]) walk(c, w); }
  for (const ni of json.scenes[json.scene||0].nodes) walk(ni, I);
  return out;
}
const O = parse('tools/planegen/learjet.glb');
const R = v => Math.round(v*100000)/100000;
for (const k in O){ O[k].p=O[k].p.map(R); O[k].n=O[k].n.map(v=>Math.round(v*1000)/1000); O[k].u=O[k].u.map(v=>Math.round(v*100000)/100000); O[k].pivot=O[k].pivot.map(R); }
fs.writeFileSync('tools/planegen/planegeo.json', JSON.stringify(O));
console.log('extracted', Object.keys(O).length, 'objects:');
for (const k in O) console.log('  '+k.padEnd(10)+' tris='+O[k].i.length/3+' verts='+O[k].p.length/3+' pivot=['+O[k].pivot+']');
