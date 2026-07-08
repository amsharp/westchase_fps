// Convert GGBot "PSX Style Cars" OBJs into the MESHY_VEHS quantized-embed
// format (see tools/vehgen/genvehs.js + game.js getVehGeo/getMeshyWheel).
// PROTOTYPE — output goes to tools/ggbotveh/out/ggbotvehs.js and is NOT
// wired into the game.
//
// Differences from the Meshy fleet worth knowing:
//  - Bodies ship WITHOUT wheels (open arches); the pack has one shared
//    28-tri wheel mesh. So `wheels` entries here are true PIVOT positions
//    derived from boundary-edge circle fits of the arch openings — no
//    VEH_WHEEL_TUNE-style hand cover-up needed.
//  - OBJ uv v is bottom-up; the game loader applies v'=1-v_stored on top of
//    a flipY=true texture, so we store v_stored = 1 - vt (glTF top-down
//    convention) to end up sampling the PNG correctly.
//  - Textures are already 128x128 PNGs: embedded as-is (no downscale pass).
//
//   node genggbot.js [packDir]
const fs = require('fs');
const path = require('path');

const PACK = process.argv[2] ||
  '/tmp/claude-0/-home-user-westchase-fps/6762ca26-85bb-50ae-aa02-dab118a4400c/scratchpad/ggbot_cars';
const OUTDIR = path.join(__dirname, 'out');

// name, obj path, texture path
const MODELS = [
  ['GG_WAGON', 'Car 01/Car.obj', 'Car 01/car.png'],
  ['GG_SALOON', 'Car 02/Car2.obj', 'Car 02/car2.png'],
  ['GG_MINIVAN', 'Car 04/Car4.obj', 'Car 04/car4.png'],
  ['GG_POLICE', 'Car 05/Car5_Police.obj', 'Car 05/car5_police.png'],
  ['GG_WRECK', 'Car 06/Car6.obj', 'Car 06/car6.png', true], // burned-out prop: no wheels
];

function parseOBJ(file) {
  const v = [], vt = [], tris = [];
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

function circleFit(pts) { // Kasa least squares in (a,b)
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

const b64 = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const texURL = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');

// GGBot wheel: width/diameter ratio (measured: 0.274 / 0.917)
const WHEEL_W_RATIO = 0.274 / 0.917;

function processCar(name, objFile, texFile, noWheels) {
  const o = parseOBJ(path.join(PACK, objFile));

  // ---- normalize: long axis (Z in this pack) -> X, minY -> 0, center XZ
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const p of o.v) for (let i = 0; i < 3; i++) {
    if (p[i] < mn[i]) mn[i] = p[i]; if (p[i] > mx[i]) mx[i] = p[i];
  }
  const rotated = (mx[2] - mn[2]) > (mx[0] - mn[0]);
  const pts = o.v.map(p => {
    let [x, y, z] = p;
    if (rotated) { const t = x; x = z; z = -t; }
    return [x, y, z];
  });
  mn = [1e9, 1e9, 1e9]; mx = [-1e9, -1e9, -1e9];
  for (const p of pts) for (let i = 0; i < 3; i++) {
    if (p[i] < mn[i]) mn[i] = p[i]; if (p[i] > mx[i]) mx[i] = p[i];
  }
  const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2;
  for (const p of pts) { p[0] -= cx; p[1] -= mn[1]; p[2] -= cz; }
  const len = mx[0] - mn[0], hgt = mx[1] - mn[1], wid = mx[2] - mn[2];

  // ---- wheel pivots from arch shapes. The arches are CLOSED geometry (no
  // boundary holes — verified by edge-count probing), so we cluster low
  // fender verts per corner and circle-fit in the (x, y) plane with
  // iterative outlier rejection, then sanity-gate the fit; models that fail
  // (e.g. the burned-out Car 06, which sits flat on the ground) get no
  // wheels at all.
  const clusters = { f: { l: [], r: [] }, r: { l: [], r: [] } };
  for (const p of pts) {
    if (p[1] > 0.45 * hgt) continue;            // arches live low
    if (Math.abs(p[0]) < 0.15 * len) continue;  // and near the ends
    if (Math.abs(p[2]) < 0.55 * wid / 2) continue; // fender/side verts only
    clusters[p[0] > 0 ? 'f' : 'r'][p[2] > 0 ? 'l' : 'r'].push(p);
  }
  function axleFit(ax) {
    const sides = [];
    for (const s of ['l', 'r']) {
      let c = clusters[ax][s];
      if (c.length < 6) continue;
      let f = circleFit(c.map(p => [p[0], p[1]]));
      for (let it = 0; it < 4 && f; it++) { // drop outliers (rockers, bumpers)
        const keep = c.filter(p => Math.abs(Math.hypot(p[0] - f.ca, p[1] - f.cb) - f.r) < 0.35 * f.r);
        if (keep.length < 6 || keep.length === c.length) break;
        c = keep; f = circleFit(c.map(p => [p[0], p[1]]));
      }
      // sanity: radius 4-14% of car length, center above ground & below 40% h
      if (f && f.r > 0.04 * len && f.r < 0.14 * len && f.cb > 0.02 * hgt && f.cb < 0.4 * hgt)
        sides.push({ cx: f.ca, cy: f.cb, r: f.r, zOut: Math.max(...c.map(p => Math.abs(p[2]))) });
    }
    if (!sides.length) return null;
    const m = k => sides.reduce((s2, v) => s2 + v[k], 0) / sides.length;
    return { cx: m('cx'), cy: m('cy'), r: m('r'), zOut: m('zOut') };
  }
  const F = noWheels ? null : axleFit('f'), R = noWheels ? null : axleFit('r');
  const wheels = [];
  for (const [fit, tag] of [[F, 'front'], [R, 'rear']]) {
    if (!fit) { if (!noWheels) console.log('NOTE ' + name + ': no ' + tag + ' arch fit (wheel-less)'); wheels.push(null, null); continue; }
    // wheel radius: touch ground from the arch-center pivot, but never
    // bigger than the arch opening itself (small ground-contact fudge ok)
    const r = Math.min(fit.cy, fit.r * 0.97);
    const halfW = r * WHEEL_W_RATIO;              // wheel scales as a whole
    const z = fit.zOut - halfW * 0.9;             // outer face ~flush with arch lip
    wheels.push([fit.cx, fit.cy, z, r], [fit.cx, fit.cy, -z, r]);
    console.log('  ' + name + ' ' + tag + ': pivot x=' + fit.cx.toFixed(3) + ' y=' + fit.cy.toFixed(3) +
      ' archR=' + fit.r.toFixed(3) + ' wheelR=' + r.toFixed(3) + ' z=+-' + z.toFixed(3));
  }

  // ---- expand + quantize (genvehs.js scheme; divisor from post-shift values)
  const n = o.tris.length * 3;
  let maxE = 0;
  for (const p of pts) maxE = Math.max(maxE, Math.abs(p[0]), p[1], Math.abs(p[2]));
  const Q = 32000 / (maxE + 1e-6);
  const qp = new Int16Array(n * 3), qu = new Uint16Array(n * 2);
  let k = 0;
  for (const t of o.tris) {
    for (const [vi, ti] of t) {
      const p = pts[vi];
      qp[k * 3] = Math.round(p[0] * Q);
      qp[k * 3 + 1] = Math.round(p[1] * Q);
      qp[k * 3 + 2] = Math.round(p[2] * Q);
      const u = ti >= 0 ? o.vt[ti][0] : 0, v = ti >= 0 ? o.vt[ti][1] : 0;
      qu[k * 2] = Math.max(0, Math.min(65535, Math.round(u * 8192)));
      qu[k * 2 + 1] = Math.max(0, Math.min(65535, Math.round((1 - v) * 8192))); // OBJ->glTF v
      k++;
    }
  }
  return {
    n: name, q: +Q.toFixed(4), tris: o.tris.length,
    p: b64(qp), u: b64(qu),
    tex: texURL(path.join(PACK, texFile)),
    dims: [len, hgt, wid].map(v => +v.toFixed(4)),
    wheels: wheels.map(w => w && w.map(v => +v.toFixed(4)))
  };
}

// ---- shared wheel -> MESHY_WHEEL-format entry (indexed, axle local +Y,
// spoke/hub face local -Y like the game expects)
function processWheel() {
  const o = parseOBJ(path.join(PACK, 'Wheel/Wheel.obj'));
  // axle is X (thin axis). Rotate about Z by +90deg: (x,y,z)->(-y,x,z),
  // mapping +X (hub cap side, verified in harness) to +Y... game wants the
  // face on -Y, so rotate by -90deg instead: (x,y,z)->(y,-x,z).
  const pts = o.v.map(p => [p[1], -p[0], p[2]]);
  // center (already origin-centered per analyze.js, but be safe)
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const p of pts) for (let i = 0; i < 3; i++) {
    if (p[i] < mn[i]) mn[i] = p[i]; if (p[i] > mx[i]) mx[i] = p[i];
  }
  for (const p of pts) for (let i = 0; i < 3; i++) p[i] -= (mn[i] + mx[i]) / 2;
  const dims = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
  // dedupe by (vi,ti) -> indexed
  const map = new Map(), P = [], U = [], I = [];
  for (const t of o.tris) {
    for (const [vi, ti] of t) {
      const key = vi + '_' + ti;
      if (!map.has(key)) {
        map.set(key, P.length / 3);
        P.push(...pts[vi]);
        U.push(ti >= 0 ? o.vt[ti][0] : 0, ti >= 0 ? 1 - o.vt[ti][1] : 0);
      }
      I.push(map.get(key));
    }
  }
  let maxE = 0;
  for (const v of P) maxE = Math.max(maxE, Math.abs(v));
  const Q = 32000 / (maxE + 1e-6);
  const qp = new Int16Array(P.length), qu = new Uint16Array(U.length);
  for (let i = 0; i < P.length; i++) qp[i] = Math.round(P[i] * Q);
  for (let i = 0; i < U.length; i++) qu[i] = Math.max(0, Math.min(65535, Math.round(U[i] * 8192)));
  return {
    n: 'GG_WHEEL', q: +Q.toFixed(4), tris: o.tris.length,
    p: b64(qp), u: b64(qu), i: b64(new Uint16Array(I)),
    tex: texURL(path.join(PACK, 'Wheel/wheel.png')),
    dims: dims.map(v => +v.toFixed(4))
  };
}

fs.mkdirSync(OUTDIR, { recursive: true });
const entries = MODELS.map(m => processCar(m[0], m[1], m[2], m[3]));
const wheel = processWheel();
const out = '// GGBot "PSX Style Cars" (CC0 1.0, https://ggbot.itch.io/psx-style-cars)\n' +
  '// converted by tools/ggbotveh/genggbot.js — PROTOTYPE, not loaded by the game.\n' +
  '// Same decode contract as MESHY_VEHS / MESHY_WHEEL, but wheels[] are TRUE\n' +
  '// pivots (bodies have open arches, no baked wheels).\n' +
  'var GGBOT_VEHS = [\n' + entries.map(e => ' ' + JSON.stringify(e)).join(',\n') + '\n];\n' +
  'var GGBOT_WHEEL = ' + JSON.stringify(wheel) + ';\n';
new Function(out); // syntax gate
fs.writeFileSync(path.join(OUTDIR, 'ggbotvehs.js'), out);
for (const e of entries) {
  console.log(e.n + ': ' + e.tris + ' tris, dims [' + e.dims.join(', ') + '], wheels r=[' +
    e.wheels.map(w => w ? w[3] : '-').join(', ') + ']');
}
console.log('GG_WHEEL: ' + wheel.tris + ' tris, dims [' + wheel.dims.join(', ') + ']');
console.log('wrote ' + path.join(OUTDIR, 'ggbotvehs.js') + ' ~' +
  Math.round(fs.statSync(path.join(OUTDIR, 'ggbotvehs.js')).size / 1024) + 'KB');
