// Convert GGBot "PSX Style Cars" OBJs into the MESHY_VEHS quantized-embed
// format (see tools/vehgen/genvehs.js + game.js getVehGeo/getMeshyWheel).
// Writes the SHIPPING repo-root ggbotvehs.js (loaded by index.html before
// game.js) plus a prototype copy in tools/ggbotveh/out/ for the harness.
//
// Adopted set (MIX decision — bodies the Meshy fleet lacks): Car 01 station
// wagon, Car 05 full-size sedan + POLICE + TAXI liveries, Car 08 step van
// (+ MAIL livery texture), Car 06 burned-out wreck (explosion husk prop).
// Each entry embeds ALL shipped color-variant PNGs (`texs`, snow variants
// skipped) — GGBot entries do NOT use the game's VEH_COLS hue-swap. The
// step van's MAIL livery index is flagged via `mail` so the game can make
// it a rare roll instead of an even pick.
//
// Key discovery (verified by connected-component analysis + renders): each
// drivable body ships with FOUR BAKED 3D WHEELS, each a separate 28-tri
// connected component (an instanced copy of the pack's Wheel.obj, but
// UV-mapped into the car's own 128px atlas). So the converter:
//   1. welds verts by position, union-finds components,
//   2. detects wheel components (28-40 tris, square in Y/Z, thin axle X,
//      low, offset to a side — this also correctly skips Car 07's vertical
//      rear SPARE wheel and round headlamps),
//   3. STRIPS them from the body and emits true pivots in `wheels`
//      ([x,y,z,r] per corner, car space: +x nose, axle = Z),
//   4. re-centers one wheel component as the car's own wheel mesh `wg`
//      (indexed, axle rotated to local +Y like MESHY_WHEEL; textured by
//      the same car atlas — no separate wheel texture needed).
// Car 06 is a burned-out wreck: no wheels, converted as a static prop.
//
// OBJ uv v is bottom-up; the game loader applies v'=1-v_stored on top of a
// flipY=true texture, so we store v_stored = 1 - vt (glTF top-down
// convention). Textures are already 128x128 PNGs: embedded as-is.
//
//   node genggbot.js [packDir]
const fs = require('fs');
const path = require('path');

const PACK = process.argv[2] ||
  '/tmp/claude-0/-home-user-westchase-fps/6762ca26-85bb-50ae-aa02-dab118a4400c/scratchpad/ggbot_cars';
const OUTDIR = path.join(__dirname, 'out');

// name, obj path, texture paths (variant list), optional extras
const MODELS = [
  ['GG_WAGON', 'Car 01/Car.obj',
    ['Car 01/car.png', 'Car 01/car_blue.png', 'Car 01/car_gray.png', 'Car 01/car_red.png']],
  ['GG_SEDAN', 'Car 05/Car5.obj',
    ['Car 05/car5.png', 'Car 05/car5_green.png', 'Car 05/car5_grey.png']],
  ['GG_TAXI', 'Car 05/Car5_Taxi.obj', ['Car 05/car5_taxi.png']],
  ['GG_POLICE', 'Car 05/Car5_Police.obj', ['Car 05/car5_police.png']],
  ['GG_STEPVAN', 'Car 08/Car8.obj',
    ['Car 08/Car8.png', 'Car 08/Car8_grey.png', 'Car 08/Car8_purple.png', 'Car 08/Car8_mail.png'],
    { mail: 3 }],   // texs[3] = MAIL livery (rare roll in-game)
  ['GG_WRECK', 'Car 06/Car6.obj', ['Car 06/car6.png']],
];

function parseOBJ(file) {
  const v = [], vt = [], tris = []; // tris: [[vi,ti]x3]
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

const b64 = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const texURL = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');

// quantize a {pos:[[x,y,z]..], uv:[[u,v]..], idx:[..]|null} bundle
function quantize(pos, uv, idx) {
  let maxE = 0;
  for (const p of pos) maxE = Math.max(maxE, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
  const Q = 32000 / (maxE + 1e-6);
  const qp = new Int16Array(pos.length * 3), qu = new Uint16Array(uv.length * 2);
  for (let i = 0; i < pos.length; i++) {
    qp[i * 3] = Math.round(pos[i][0] * Q);
    qp[i * 3 + 1] = Math.round(pos[i][1] * Q);
    qp[i * 3 + 2] = Math.round(pos[i][2] * Q);
  }
  for (let i = 0; i < uv.length; i++) {
    qu[i * 2] = Math.max(0, Math.min(65535, Math.round(uv[i][0] * 8192)));
    qu[i * 2 + 1] = Math.max(0, Math.min(65535, Math.round((1 - uv[i][1]) * 8192))); // OBJ->glTF v
  }
  const out = { q: +Q.toFixed(4), p: b64(qp), u: b64(qu) };
  if (idx) out.i = b64(new Uint16Array(idx));
  return out;
}

function processCar(name, objFile, texFiles, extra) {
  const o = parseOBJ(path.join(PACK, objFile));

  // ---- weld by position + union-find into connected components
  const wmap = new Map(), remap = [];
  for (let i = 0; i < o.v.length; i++) {
    const k = o.v[i].map(x => x.toFixed(5)).join(',');
    if (!wmap.has(k)) wmap.set(k, i);
    remap[i] = wmap.get(k);
  }
  const par = [...Array(o.v.length).keys()];
  const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (const t of o.tris) {
    const a = find(remap[t[0][0]]);
    for (const k of [1, 2]) par[find(remap[t[k][0]])] = a;
  }
  const comps = new Map();
  o.tris.forEach((t, ti) => {
    const r = find(remap[t[0][0]]);
    if (!comps.has(r)) comps.set(r, []);
    comps.get(r).push(ti);
  });

  // full-model bbox (original space: length = Z, width = X, axle = X)
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const p of o.v) for (let i = 0; i < 3; i++) {
    if (p[i] < mn[i]) mn[i] = p[i]; if (p[i] > mx[i]) mx[i] = p[i];
  }
  const hgt = mx[1] - mn[1], halfW = (mx[0] - mn[0]) / 2;

  // ---- detect baked-wheel components
  const wheelComps = [];
  for (const [root, tlist] of comps) {
    if (tlist.length < 20 || tlist.length > 40) continue;
    let cmn = [1e9, 1e9, 1e9], cmx = [-1e9, -1e9, -1e9];
    for (const ti of tlist) for (const [vi] of o.tris[ti]) {
      const p = o.v[vi];
      for (let i = 0; i < 3; i++) { if (p[i] < cmn[i]) cmn[i] = p[i]; if (p[i] > cmx[i]) cmx[i] = p[i]; }
    }
    const d = [cmx[0] - cmn[0], cmx[1] - cmn[1], cmx[2] - cmn[2]];
    const ctr = [(cmn[0] + cmx[0]) / 2, (cmn[1] + cmx[1]) / 2, (cmn[2] + cmx[2]) / 2];
    const roundYZ = Math.abs(d[1] - d[2]) < 0.08 * Math.max(d[1], d[2]);
    const thinX = d[0] < 0.6 * d[1];
    const low = (ctr[1] - mn[1]) < 0.5 * hgt;
    const offside = Math.abs(ctr[0]) > 0.4 * halfW; // skips Car 07's centered spare
    if (roundYZ && thinX && low && offside && d[1] > 0.4 && d[1] < 1.6)
      wheelComps.push({ tris: tlist, ctr, r: d[1] / 2, w: d[0], zOut: Math.max(Math.abs(cmn[0]), Math.abs(cmx[0])) });
  }
  if (wheelComps.length !== 4 && wheelComps.length !== 0)
    console.log('WARNING ' + name + ': found ' + wheelComps.length + ' wheel components (expected 4 or 0)');

  // ---- car-space transform: length Z -> X ((x,z)->(z,-x), nose lands +x),
  // shift full-model minY -> 0, center on full-model XZ bbox center
  const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2;
  const toCar = p => [p[2] - cz, p[1] - mn[1], -(p[0] - cx)];

  const dimsFull = [mx[2] - mn[2], hgt, mx[0] - mn[0]]; // len, h, w in car space

  // ---- body = everything except wheel components
  const wheelTris = new Set();
  for (const wc of wheelComps) for (const ti of wc.tris) wheelTris.add(ti);
  const bpos = [], buv = [];
  o.tris.forEach((t, ti) => {
    if (wheelTris.has(ti)) return;
    for (const [vi, tvi] of t) {
      bpos.push(toCar(o.v[vi]));
      buv.push(tvi >= 0 ? o.vt[tvi] : [0, 0]);
    }
  });

  // ---- wheels: pivots (car space) + one re-centered wheel mesh (axle X in
  // original space -> rotate to local +Y: (x,y,z)->(y,-x,z), matching the
  // MESHY_WHEEL mount contract where mesh.rotation.x = +-PI/2 per side)
  const wheels = wheelComps.map(wc => {
    const c = toCar(wc.ctr);
    return [c[0], c[1], c[2], wc.r].map(v => +v.toFixed(4));
  }).sort((a, b) => (b[0] - a[0]) || (b[2] - a[2]));
  let wg = null;
  if (wheelComps.length) {
    const wc = wheelComps[0];
    const seen = new Map(), wpos = [], wuv = [], widx = [];
    for (const ti of wc.tris) {
      for (const [vi, tvi] of o.tris[ti]) {
        const key = vi + '_' + tvi;
        if (!seen.has(key)) {
          seen.set(key, wpos.length);
          const p = o.v[vi];
          wpos.push([p[1] - wc.ctr[1], -(p[0] - wc.ctr[0]), p[2] - wc.ctr[2]]);
          wuv.push(tvi >= 0 ? o.vt[tvi] : [0, 0]);
        }
        widx.push(seen.get(key));
      }
    }
    wg = quantize(wpos, wuv, widx);
    wg.tris = wc.tris.length;
    wg.dims = [wc.r * 2, wc.w, wc.r * 2].map(v => +v.toFixed(4));
  }

  const entry = Object.assign({ n: name }, quantize(bpos, buv, null), {
    tris: bpos.length / 3,
    texs: texFiles.map(f => texURL(path.join(PACK, f))),
    dims: dimsFull.map(v => +v.toFixed(4)),
    wheels: wheels.length ? wheels : null,
    wg: wg
  }, extra || {});
  console.log('  ' + name + ': body ' + entry.tris + ' tris, ' + wheelComps.length +
    ' baked wheels stripped' + (wheels.length ?
      ', pivots ' + wheels.map(w => '(' + w[0] + ',' + w[1] + ',' + w[2] + ' r' + w[3] + ')').join(' ') : ''));
  return entry;
}

fs.mkdirSync(OUTDIR, { recursive: true });
const entries = MODELS.map(m => processCar(m[0], m[1], m[2], m[3]));
const out = '// GGBot "PSX Style Cars" (CC0 1.0, https://ggbot.itch.io/psx-style-cars)\n' +
  '// converted by tools/ggbotveh/genggbot.js. Optional: game checks typeof GGBOT_VEHS.\n' +
  '// Same decode contract as MESHY_VEHS, but: bodies are wheel-LESS (baked\n' +
  '// wheels stripped), wheels[] are TRUE pivots ([x,y,z,r], car space, nose +x),\n' +
  '// each entry carries its own wheel mesh `wg` (indexed, axle local +Y,\n' +
  '// textured by the car atlas), and `texs` holds the shipped color-variant\n' +
  '// PNGs verbatim (no VEH_COLS hue-swap; `mail` = rare-livery index).\n' +
  'var GGBOT_VEHS = [\n' + entries.map(e => ' ' + JSON.stringify(e)).join(',\n') + '\n];\n';
new Function(out); // syntax gate
const SHIP = '/home/user/westchase_fps/ggbotvehs.js';
fs.writeFileSync(SHIP, out);
fs.writeFileSync(path.join(OUTDIR, 'ggbotvehs.js'), out);
for (const e of entries) {
  console.log(e.n + ': ' + e.tris + ' body tris, dims [' + e.dims.join(', ') + '], ' +
    e.texs.length + ' tex, wheels ' +
    (e.wheels ? 'r=[' + e.wheels.map(w => w[3]).join(', ') + '] + own ' + e.wg.tris + '-tri mesh' : 'none'));
}
console.log('wrote ' + SHIP + ' ~' + Math.round(fs.statSync(SHIP).size / 1024) + 'KB');
