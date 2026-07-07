// verify.js — decode meshyarms.js and sanity-check the data.
//   node verify.js [meshyarms.js]
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = process.argv[2] || path.join(__dirname, '..', '..', 'meshyarms.js');
const src = fs.readFileSync(FILE, 'utf8');

// must load as a plain script
new Function(src)();
// pull the object literal out for inspection
const m = /var MESHY_ARMS = (\{[\s\S]*\});\s*$/.exec(src);
if (!m) throw new Error('MESHY_ARMS literal not found');
const A = JSON.parse(m[1]);

// GOTCHA: pooled Buffer views — always pass byteOffset/length
function f32(b64) { const b = Buffer.from(b64, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); }
function i16(b64) { const b = Buffer.from(b64, 'base64'); return new Int16Array(b.buffer, b.byteOffset, b.length / 2); }
function u16(b64) { const b = Buffer.from(b64, 'base64'); return new Uint16Array(b.buffer, b.byteOffset, b.length / 2); }
function u8(b64) { const b = Buffer.from(b64, 'base64'); return new Uint8Array(b.buffer, b.byteOffset, b.length); }

let fails = 0;
function assert(ok, what) { console.log((ok ? 'PASS' : 'FAIL'), what); if (!ok) fails++; }

const nj = A.skel.names.length;
const bt = f32(A.skel.t), br = f32(A.skel.r), bs = f32(A.skel.s);
assert(nj === 52 && A.skel.parents.length === nj && bt.length === nj * 3 && br.length === nj * 4 && bs.length === nj * 3, 'skel arrays sized for ' + nj + ' joints');
assert(A.skel.parents.every(p => p >= -1 && p < nj), 'parents in range');
let nan = false;
for (const a of [bt, br, bs]) for (const v of a) if (!isFinite(v)) nan = true;
assert(!nan, 'skel has no NaN/Inf');
let bq = true;
for (let j = 0; j < nj; j++) { const n = Math.hypot(br[j * 4], br[j * 4 + 1], br[j * 4 + 2], br[j * 4 + 3]); if (Math.abs(n - 1) > 0.01) bq = false; }
assert(bq, 'bind quats normalized');

// geometry
const g = A.geo;
const p = i16(g.p), u = u16(g.u), idx = g.i32 ? (b => { const bb = Buffer.from(b, 'base64'); return new Uint32Array(bb.buffer, bb.byteOffset, bb.length / 4); })(g.i) : u16(g.i);
const si = u8(g.si), sw = u8(g.sw);
assert(p.length === g.nv * 3 && u.length === g.nv * 2 && si.length === g.nv * 4 && sw.length === g.nv * 4, 'geo arrays sized for nv=' + g.nv);
let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
for (let v = 0; v < g.nv; v++) {
  const x = p[v * 3] / g.q, y = p[v * 3 + 1] / g.q;
  if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
}
const W = maxX - minX, H = maxY - minY;
console.log('  extents: width ' + W.toFixed(3) + ' height ' + H.toFixed(3) + ' (y ' + minY.toFixed(2) + '..' + maxY.toFixed(2) + ')');
assert(W > 1.5 && W < 1.9 && H > 0.4 && H < 0.6, 'position extents sane (~1.7 wide, ~0.5 tall)');
assert(Array.from(idx).every(i => i < g.nv), 'all indices < nv');
assert(Array.from(si).every(i => i < nj), 'all skinIndex < ' + nj);
let swOK = true;
for (let v = 0; v < g.nv; v++) { let s = 0; for (let k = 0; k < 4; k++) s += sw[v * 4 + k]; if (Math.abs(s - 255) > 2) swOK = false; }
assert(swOK, 'skin weights sum to 255±2 per vert');

// clips
const want = ['idle', 'jabL', 'jabR', 'relax', 'grab', 'push'];
assert(want.every(k => A.clips[k]), 'all 6 clips present');
for (const k of want) {
  const c = A.clips[k];
  const q = i16(c.q), t = i16(c.t);
  const ts = c.ts || 1024;
  let ok = q.length === c.f * nj * 4 && t.length === c.f * nj * 3;
  // quat norms at frame 0
  let qn = true;
  for (let j = 0; j < nj; j++) {
    const n = Math.hypot(q[j * 4] / 16384, q[j * 4 + 1] / 16384, q[j * 4 + 2] / 16384, q[j * 4 + 3] / 16384);
    if (Math.abs(n - 1) > 0.02) qn = false;
  }
  let maxT = 0;
  for (const v of t) maxT = Math.max(maxT, Math.abs(v) / ts);
  assert(ok && qn, 'clip ' + k + ': f=' + c.f + ' d=' + c.d + 's sized, frame-0 quats ~1 (max|t| ' + maxT.toFixed(2) + ')');
}

console.log(fails ? 'FAILURES: ' + fails : 'ALL CHECKS PASSED', '| file', Math.round(src.length / 1024) + 'KB');
process.exit(fails ? 1 : 0);
