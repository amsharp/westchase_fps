// Analyze GGBot PSX car pack OBJs: bbox/dims, wheel-arch circle fits (the
// pack ships wheels as a SEPARATE shared mesh with no placement data — the
// .blend files contain only the body object), axle axis of the wheel mesh.
//   node analyze.js <packDir>
const fs = require('fs');
const path = require('path');

const PACK = process.argv[2] ||
  '/tmp/claude-0/-home-user-westchase-fps/6762ca26-85bb-50ae-aa02-dab118a4400c/scratchpad/ggbot_cars';

function parseOBJ(file) {
  const v = [], vt = [], tris = []; // tris: [vi,ti]x3
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim().split(/\s+/);
    if (t[0] === 'v') v.push([+t[1], +t[2], +t[3]]);
    else if (t[0] === 'vt') vt.push([+t[1], +t[2]]);
    else if (t[0] === 'f') {
      const idx = t.slice(1).map(s => {
        const p = s.split('/');
        return [(+p[0]) - 1, p[1] ? (+p[1]) - 1 : -1];
      });
      for (let k = 2; k < idx.length; k++) tris.push([idx[0], idx[k - 1], idx[k]]);
    }
  }
  return { v, vt, tris };
}

// Kasa least-squares circle fit on (a,b) points
function circleFit(pts) {
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, saaa = 0, sbbb = 0, saab = 0, sabb = 0;
  const n = pts.length;
  for (const [a, b] of pts) {
    sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
    saaa += a * a * a; sbbb += b * b * b; saab += a * a * b; sabb += a * b * b;
  }
  const C = n * saa - sa * sa, D = n * sab - sa * sb, E = n * sbb - sb * sb;
  const G = 0.5 * (n * saaa + n * sabb - (saa + sbb) * sa);
  const H = 0.5 * (n * sbbb + n * saab - (saa + sbb) * sb);
  const det = C * E - D * D;
  if (Math.abs(det) < 1e-12) return null;
  const ca = (G * E - D * H) / det, cb = (C * H - D * G) / det;
  let r = 0;
  for (const [a, b] of pts) r += Math.hypot(a - ca, b - cb);
  return { ca, cb, r: r / n };
}

function analyzeCar(name, file) {
  const o = parseOBJ(file);
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const p of o.v) for (let i = 0; i < 3; i++) {
    if (p[i] < mn[i]) mn[i] = p[i]; if (p[i] > mx[i]) mx[i] = p[i];
  }
  const dims = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
  // long horizontal axis
  const longZ = dims[2] > dims[0];
  const L = longZ ? 2 : 0, W = longZ ? 0 : 2; // length axis, width axis
  const len = dims[L], wid = dims[W], hgt = dims[1];
  const cl = (mn[L] + mx[L]) / 2;
  // arch clusters: verts in lower 45% of height, in outer 60% along length
  const q = { fl: [], fr: [], rl: [], rr: [] };
  for (const p of o.v) {
    const y = p[1] - mn[1];
    if (y > 0.45 * hgt) continue;
    const l = p[L] - cl;
    if (Math.abs(l) < 0.18 * len) continue;
    const key = (l > 0 ? 'f' : 'r') + (p[W] > (mn[W] + mx[W]) / 2 ? 'l' : 'r');
    q[key].push([l, p[1], p[W]]);
  }
  const fits = {};
  for (const k of Object.keys(q)) {
    // fit circle in (length, y) plane on the arch verts; drop the lowest
    // verts (rocker bottom) by iterating: fit, drop >1.4r outliers, refit
    let pts = q[k].map(p => [p[0], p[1]]);
    let f = circleFit(pts);
    for (let it = 0; it < 3 && f; it++) {
      const keep = pts.filter(p => Math.abs(Math.hypot(p[0] - f.ca, p[1] - f.cb) - f.r) < 0.35 * f.r);
      if (keep.length < 5 || keep.length === pts.length) break;
      pts = keep; f = circleFit(pts);
    }
    const zs = q[k].map(p => Math.abs(p[2]));
    fits[k] = f ? {
      n: q[k].length, cx: +f.ca.toFixed(3), cy: +f.cb.toFixed(3), r: +f.r.toFixed(3),
      zOuter: +Math.max(...zs).toFixed(3)
    } : null;
  }
  console.log('== ' + name + ' ==');
  console.log('  tris ' + o.tris.length + '  dims L/H/W ' +
    [len, hgt, wid].map(v => v.toFixed(2)).join(' / ') +
    '  minY ' + mn[1].toFixed(3) + '  longAxis ' + (longZ ? 'Z' : 'X'));
  for (const k of ['fl', 'fr', 'rl', 'rr']) {
    const f = fits[k];
    console.log('  arch ' + k + ': ' + (f ?
      'center(l=' + f.cx + ', y=' + f.cy + ') r=' + f.r + ' zOut=' + f.zOuter + ' (' + f.n + 'v)' : 'NONE'));
  }
}

const cars = [
  ['Car01', 'Car 01/Car.obj'], ['Car02', 'Car 02/Car2.obj'], ['Car03', 'Car 03/Car3.obj'],
  ['Car04', 'Car 04/Car4.obj'], ['Car05', 'Car 05/Car5.obj'], ['Car05_Police', 'Car 05/Car5_Police.obj'],
  ['Car05_Taxi', 'Car 05/Car5_Taxi.obj'], ['Car06', 'Car 06/Car6.obj'],
  ['Car07', 'Car 07/Car7.obj'], ['Car08', 'Car 08/Car8.obj']];
for (const [n, f] of cars) analyzeCar(n, path.join(PACK, f));

// wheel mesh: bbox + axle axis (thin axis)
const w = parseOBJ(path.join(PACK, 'Wheel/Wheel.obj'));
let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (const p of w.v) for (let i = 0; i < 3; i++) {
  if (p[i] < mn[i]) mn[i] = p[i]; if (p[i] > mx[i]) mx[i] = p[i];
}
console.log('== Wheel == tris ' + w.tris.length + ' dims ' +
  [0, 1, 2].map(i => (mx[i] - mn[i]).toFixed(3)).join(' / ') +
  '  center ' + [0, 1, 2].map(i => ((mx[i] + mn[i]) / 2).toFixed(3)).join(' / '));
