// Porsche 964 GLBs -> porsche.js (PORSCHE_VEH). Self-contained hero-car format:
//   body {q,p,u,tris,dims} + texs[] (red-prevalent hue-swap variants) +
//   wheel {q,p,u,tris,dims} (Cup1, axle local +Y, centered) +
//   wheels[[x,y,z,r]x4] (964-proportion pivots, nose +x) +
//   spoiler {q,p,u,tris,dims,mount:[x,y,z]}.
// Non-indexed p/u like MESHY_VEHS; game builds via custom buildPorsche().
//   node genporsche.js
const fs = require('fs'); const path = require('path');
const WORK = path.join(__dirname, 'work');
const OUT = path.join(__dirname, '..', '..', 'porsche.js');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }

function parseGLB(file) {
  const b = fs.readFileSync(file); const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.slice(20, 20 + jsonLen).toString('utf8'));
  let off = 20 + jsonLen, bin = null;
  while (off < b.length) { const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4); if (type === 0x004E4942) { bin = b.slice(off + 8, off + 8 + len); break; } off += 8 + len; }
  function acc(i) { const a = json.accessors[i], bv = json.bufferViews[a.bufferView]; const start = (bv.byteOffset || 0) + (a.byteOffset || 0); const n = a.count * { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type]; const C = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array, 5122: Int16Array, 5120: Int8Array }[a.componentType]; return new C(bin.buffer, bin.byteOffset + start, n); }
  function matFromTRS(n) { if (n.matrix) return n.matrix.slice(); const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1]; const [x, y, z, w] = q; const x2 = x + x, y2 = y + y, z2 = z + z; const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2; return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0, (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1]; }
  function mul(a, b2) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b2[c * 4 + k]; o[c * 4 + r] = s; } return o; }
  function xf(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; const pos = [], uv = [];
  function walk(ni, parent) { const n = json.nodes[ni]; const world = mul(parent, matFromTRS(n)); if (n.mesh !== undefined) { for (const prim of json.meshes[n.mesh].primitives) { const P = acc(prim.attributes.POSITION); const U = prim.attributes.TEXCOORD_0 !== undefined ? acc(prim.attributes.TEXCOORD_0) : null; const Idx = prim.indices !== undefined ? acc(prim.indices) : null; const cnt = Idx ? Idx.length : P.length / 3; for (let k = 0; k < cnt; k++) { const vi = Idx ? Idx[k] : k; const p = xf(world, [P[vi * 3], P[vi * 3 + 1], P[vi * 3 + 2]]); pos.push(p[0], p[1], p[2]); uv.push(U ? U[vi * 2] : 0, U ? U[vi * 2 + 1] : 0); } } } for (const c of n.children || []) walk(c, world); }
  for (const ni of json.scenes[json.scene || 0].nodes) walk(ni, I);
  let imgIdx = -1;
  if (json.materials) for (const m of json.materials) { const bt = m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorTexture; if (bt && json.textures && json.textures[bt.index]) { imgIdx = json.textures[bt.index].source; break; } }
  if (imgIdx < 0 && json.images) imgIdx = 0;
  let tex = null;
  if (imgIdx >= 0 && json.images && json.images[imgIdx] && json.images[imgIdx].bufferView !== undefined) { const im = json.images[imgIdx], bv = json.bufferViews[im.bufferView]; tex = 'data:' + (im.mimeType || 'image/png') + ';base64,' + bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength).toString('base64'); }
  return { pos, uv, tex };
}
function bbox(pos) { let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let v = 0; v < pos.length; v += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], pos[v + a]); mx[a] = Math.max(mx[a], pos[v + a]); } return { mn, mx }; }
const b64 = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');

// quantize a pos/uv float arrays -> {q,p,u,tris,dims}
function quant(pos, uv) {
  const n = pos.length / 3; let maxE = 0;
  for (let v = 0; v < n * 3; v++) maxE = Math.max(maxE, Math.abs(pos[v]));
  const Q = 32000 / (maxE + 1e-6);
  const qp = new Int16Array(n * 3), qu = new Uint16Array(n * 2);
  for (let v = 0; v < n; v++) { qp[v * 3] = Math.round(pos[v * 3] * Q); qp[v * 3 + 1] = Math.round(pos[v * 3 + 1] * Q); qp[v * 3 + 2] = Math.round(pos[v * 3 + 2] * Q); qu[v * 2] = Math.max(0, Math.min(65535, Math.round(uv[v * 2] * 8192))); qu[v * 2 + 1] = Math.max(0, Math.min(65535, Math.round(uv[v * 2 + 1] * 8192))); }
  const bb = bbox(pos);
  return { q: +Q.toFixed(4), p: b64(qp), u: b64(qu), tris: n / 3, dims: [bb.mx[0] - bb.mn[0], bb.mx[1] - bb.mn[1], bb.mx[2] - bb.mn[2]].map(x => +x.toFixed(4)) };
}

// --- BODY: orient long axis -> X, center x/z, minY=0 ---
// Wheel pivots are MEASURED from the mesh (arch cutouts), not guessed from 964
// proportions — the guess left the wheels misaligned & undersized. Arch spans =
// x-bins along the side shells whose lowest vertex is lifted well above the
// rocker line; axle x = span centre, radius from the opening width, track z
// from the fender edge over the span.
function processBody(flipNose) {
  const g = parseGLB(path.join(WORK, 'PORSCHEBODY.glb'));
  let pos = g.pos.slice(); let n = pos.length / 3;
  let bb = bbox(pos);
  const rotated = (bb.mx[2] - bb.mn[2]) > (bb.mx[0] - bb.mn[0]);
  for (let v = 0; v < n; v++) { let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2]; if (rotated) { const t = x; x = z; z = -t; } if (flipNose) { x = -x; z = -z; } pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z; }
  bb = bbox(pos);
  const cx = (bb.mn[0] + bb.mx[0]) / 2, cz = (bb.mn[2] + bb.mx[2]) / 2;
  for (let v = 0; v < n; v++) { pos[v * 3] -= cx; pos[v * 3 + 1] -= bb.mn[1]; pos[v * 3 + 2] -= cz; }
  // squash the junk fins Meshy raised around the spoiler recess: flatten the
  // whole deck zone onto a smooth plane (recess level at the tail rising to
  // the window base) so nothing pokes up beside the black void + spoiler
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], az = Math.abs(pos[v * 3 + 2]);
    if (false) {   // spin-4 mesh has no deck fins; clamp retired (kept for reference)
      const cap = x < -0.50 ? (0.34 + (x + 0.80) * 0.1806) : 0.380;
      if (y > cap) pos[v * 3 + 1] = cap;
    }
  }
  // ...and DELETE any triangle living entirely inside the fin box beside the
  // recess (x -0.54..-0.36, |z| 0.16..0.35, y > 0.39) — the black void quad
  // covers that patch of deck from above, so holes there are invisible
  {
    const keepTri = [];
    const nT = pos.length / 9;
    for (let t = 0; t < nT; t++) {
      let touches = false;
      for (let k = 0; k < 3; k++) {
        const x = pos[t * 9 + k * 3], y = pos[t * 9 + k * 3 + 1], az = Math.abs(pos[t * 9 + k * 3 + 2]);
        if (false && x > -0.54 && x < -0.36 && az > 0.15 && az < 0.35 && y > 0.402) { touches = true; break; }   // retired with the v1 mesh (cuts window corners on others)
      }
      if (!touches) keepTri.push(t);
    }
    if (keepTri.length < nT) {
      console.log('fin surgery: deleted', nT - keepTri.length, 'tris');
      const np = new Float32Array(keepTri.length * 9), nu = new Float32Array(keepTri.length * 6);
      keepTri.forEach((t, i) => { np.set(pos.slice(t * 9, t * 9 + 9), i * 9); nu.set(g.uv.slice(t * 6, t * 6 + 6), i * 6); });
      pos = np; g.uv = nu; n = pos.length / 3;
    }
  }
  const q = quant(pos, g.uv);
  const L = q.dims[0], H = q.dims[1], W = q.dims[2];
  // ---- arch detection ----
  const NB = 64, half = L / 2, binW = L / NB;
  const minY = new Array(NB).fill(1e9), fz = new Array(NB).fill(0);
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    if (Math.abs(z) < 0.30 * W) continue;                    // side shells only
    const bi = Math.max(0, Math.min(NB - 1, ((x + half) / binW) | 0));
    if (y < minY[bi]) minY[bi] = y;
    if (y < 0.55 * H && Math.abs(z) > fz[bi]) fz[bi] = Math.abs(z);
  }
  // arch bin = lifted bottom rim; empty bins continue a span, end bins excluded.
  // Candidate spans are then filtered to wheel-plausible width (0.09–0.27 L) and
  // axle-plausible position (0.15–0.42 L from centre) — the mid-body has no low
  // side verts at all on this mesh and otherwise reads as one giant fake span.
  const endEx = Math.round(0.05 * NB), lift = 0.10 * H;
  const spans = [];
  let a = -1;
  for (let i = endEx; i < NB - endEx; i++) {
    const empty = minY[i] > 1e8, isArch = empty ? a >= 0 : minY[i] > lift;
    if (isArch && a < 0) a = i;
    else if (!isArch && a >= 0) { spans.push({ a, b: i - 1 }); a = -1; }
  }
  if (a >= 0) spans.push({ a, b: NB - endEx - 1 });
  function spanInfo(s2) {
    const cxs = -half + (s2.a + s2.b + 1) / 2 * binW, width = (s2.b - s2.a + 1) * binW;
    let fzz = 0, rim = 0;
    for (let i = s2.a; i <= s2.b; i++) { fzz = Math.max(fzz, fz[i]); if (minY[i] < 1e8) rim = Math.max(rim, minY[i]); }
    return { cx: cxs, width, fz: fzz, rim };
  }
  const cand = spans.map(spanInfo)
    .filter(si => si.width > 0.09 * L && si.width < 0.27 * L && Math.abs(si.cx) > 0.15 * L && Math.abs(si.cx) < 0.42 * L)
    .sort((p, qq) => qq.rim - p.rim).slice(0, 2)              // tallest rims = the real arches
    .sort((p, qq) => qq.cx - p.cx);                           // front (bigger x) first
  let fx, rx, r, tzF, tzR;
  if (cand.length === 2 && cand[0].cx > 0 && cand[1].cx < 0) {
    const F = cand[0], R = cand[1];
    // wheel fills the opening: diameter ≈ arch-rim top height (tyre tucks a hair under)
    r = Math.max(0.11, Math.min(0.15, (F.rim + R.rim) / 2 * 0.51));
    fx = F.cx; rx = R.cx;
    tzF = (F.fz || 0.42 * W) - 0.30 * r;                     // outer sidewall ~flush with fender
    tzR = (R.fz || 0.42 * W) - 0.30 * r;
    console.log('arches: front', F, 'rear', R);
  } else {
    console.log('ARCH DETECTION FELL BACK, cand:', JSON.stringify(cand));
    r = 0.24 * H; fx = 0.30 * L; rx = -0.27 * L; tzF = tzR = 0.42 * W;
  }
  const rd = x2 => +x2.toFixed(4);
  const wheels = [[rd(fx), rd(r), rd(tzF), rd(r)], [rd(fx), rd(r), rd(-tzF), rd(r)], [rd(rx), rd(r), rd(tzR), rd(r)], [rd(rx), rd(r), rd(-tzR), rd(r)]];
  // spoiler mount = top of the ENGINE LID (tail deck, x in [-0.45L,-0.28L]) —
  // scanning too close to centre used to catch the roof/glass and float the wing
  // spoiler mount: centred over the REAR HALF of the engine lid (real 964:
  // stowed blade's rear edge sits just shy of the tail). Deck height sampled
  // at the mount zone itself — sampling near the window base floated the
  // stowed spoiler above the sloping lid.
  const mountX = -0.40 * L;
  let deckY = -1e9, dWin = -1e9, dTail = -1e9;
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1];
    if (Math.abs(pos[v * 3 + 2]) > 0.3 * W) continue;
    if (x < mountX + 0.06 * L && x > mountX - 0.06 * L && y > deckY) deckY = y;
    if (x < mountX + 0.06 * L && x > mountX && y > dWin) dWin = y;
    if (x < mountX && x > mountX - 0.06 * L && y > dTail) dTail = y;
  }
  // lid pitch at the mount (rad, + = falls toward the tail): the stowed tray
  // must LIE ON the sloping lid — laid level it stands proud at the rear like
  // a deployed ducktail
  const slope = Math.max(0, Math.min(0.45, Math.atan2(dWin - dTail, 0.06 * L)));   // true lid pitch (the 0.20 clamp flattened the stowed line)
  const mount = [rd(mountX), rd(deckY), 0, rd(slope)];
  // re-island the tail onto the atlas strip, then re-quantize with the new UVs
  // (skipped in --plain mode: original UVs + Meshy texture ship untouched)
  if (!processBody.plain) {
    remapTailUVs(pos, g.uv, L, H, W);
    const q2 = quant(pos, g.uv);
    return { q: q2, wheels, mount, rawTex: g.tex, rotated, L, H, W, r, pos, uv: g.uv };
  }
  return { q, wheels, mount, rawTex: g.tex, rotated, L, H, W, r, pos, uv: g.uv };
}

// --- tail re-UV: Meshy shattered the tail across dozens of tiny atlas islands,
// so any overlay through that layout stays crunchy. Instead the tail-facing
// triangles get a CLEAN planar UV island of their own on a strip appended below
// the atlas (512 wide x TAIL_H tall at y 512..; texture becomes 512x704), and
// the taillight design is drawn ONCE into that strip at 1:1 texels — crisp
// canvas text/lines, no per-texel resampling, no island seams. ---
const ATLAS_S = 512, TAIL_H = 192, ATLAS_TOT = ATLAS_S + TAIL_H;
function remapTailUVs(pos, uv, L, H, W) {
  const nTri = pos.length / 9;
  const keep = [];
  let yMin = 1e9, yMax = -1e9;
  for (let t = 0; t < nTri; t++) {
    const o = t * 9;
    const ax = pos[o], ay = pos[o + 1], az = pos[o + 2];
    const bx = pos[o + 3], by = pos[o + 4], bz = pos[o + 5];
    const cx2 = pos[o + 6], cy = pos[o + 7], cz = pos[o + 8];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az, e2x = cx2 - ax, e2y = cy - ay, e2z = cz - az;
    let nx = e1y * e2z - e1z * e2y;
    const nyy = e1z * e2x - e1x * e2z, nzz = e1x * e2y - e1y * e2x;
    const nl = Math.hypot(nx, nyy, nzz) || 1; nx /= nl;
    const mx2 = (ax + bx + cx2) / 3, my = (ay + by + cy) / 3;
    if (mx2 < -0.38 * L && my < 0.70 * H && nx < -0.18) {
      keep.push(t);
      yMin = Math.min(yMin, ay, by, cy); yMax = Math.max(yMax, ay, by, cy);
    }
  }
  const yr = yMax - yMin || 1;
  // Build the strip->ORIGINAL-uv resample map first (before mutating uvs): each
  // strip texel inside a tail triangle's planar footprint remembers where that
  // surface point sampled the original atlas. The strip is then filled from the
  // recoloured atlas itself, so the tail blends seamlessly with the baked paint
  // (real shading, no flat colour field) and only the design draws on top.
  const map = new Int32Array(ATLAS_S * TAIL_H).fill(-1);
  function stripXY(y3, z3) {
    return [4 + (z3 + W / 2) / W * (ATLAS_S - 8), 4 + (1 - (y3 - yMin) / yr) * (TAIL_H - 8)];
  }
  for (const t of keep) {
    const o = t * 9, p0 = stripXY(pos[o + 1], pos[o + 2]), p1 = stripXY(pos[o + 4], pos[o + 5]), p2 = stripXY(pos[o + 7], pos[o + 8]);
    const den = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1]);
    if (Math.abs(den) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])) - 1), x1 = Math.min(ATLAS_S - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])) - 1), y1 = Math.min(TAIL_H - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])) + 1);
    for (let py = y0; py <= y1; py++) for (let px2 = x0; px2 <= x1; px2++) {
      const fx = px2 + 0.5, fy = py + 0.5;
      const w0 = ((p1[1] - p2[1]) * (fx - p2[0]) + (p2[0] - p1[0]) * (fy - p2[1])) / den;
      const w1 = ((p2[1] - p0[1]) * (fx - p2[0]) + (p0[0] - p2[0]) * (fy - p2[1])) / den;
      const w2 = 1 - w0 - w1;
      if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
      const ou = w0 * uv[t * 6] + w1 * uv[t * 6 + 2] + w2 * uv[t * 6 + 4];
      const ov = w0 * uv[t * 6 + 1] + w1 * uv[t * 6 + 3] + w2 * uv[t * 6 + 5];
      map[py * ATLAS_S + px2] = ((Math.max(0, Math.min(4095, ou * 4096 | 0))) << 12) | Math.max(0, Math.min(4095, ov * 4096 | 0));
    }
  }
  // dilate so margins/gaps inherit their nearest surface sample
  for (let pass = 0; pass < 6; pass++) {
    const prev = map.slice();
    for (let py = 0; py < TAIL_H; py++) for (let px2 = 0; px2 < ATLAS_S; px2++) {
      const i = py * ATLAS_S + px2;
      if (prev[i] >= 0) continue;
      const nb = [prev[i - 1], prev[i + 1], prev[i - ATLAS_S], prev[i + ATLAS_S]];
      for (const v2 of nb) if (v2 !== undefined && v2 >= 0) { map[i] = v2; break; }
    }
  }
  // the texture grows from 512 to 704 tall: every existing v must rescale first
  for (let i = 1; i < uv.length; i += 2) uv[i] = uv[i] * ATLAS_S / ATLAS_TOT;
  for (const t of keep) {
    const o = t * 9;
    for (let k = 0; k < 3; k++) {
      const y3 = pos[o + k * 3 + 1], z3 = pos[o + k * 3 + 2];
      const du = (z3 + W / 2) / W, dv = 1 - (y3 - yMin) / yr;
      uv[t * 6 + k * 2] = (4 + du * (ATLAS_S - 8)) / ATLAS_S;
      uv[t * 6 + k * 2 + 1] = (ATLAS_S + 4 + dv * (TAIL_H - 8)) / ATLAS_TOT;
    }
  }
  console.log('tail re-UV:', keep.length, 'tris -> strip island, y', yMin.toFixed(3), '..', yMax.toFixed(3));
  remapTailUVs.map = map;
  // per-mesh design placement (strip px): anchored to REAL-car ratios instead
  // of fixed canvas fractions — band centre at 42% of body height, script just
  // under the deck edge, rub strip near the bumper bottom
  const toPy = yy => 4 + (1 - (yy - yMin) / yr) * (TAIL_H - 8);
  remapTailUVs.layout = {
    scriptPy: Math.max(14, Math.round(toPy(yMax - 0.045 * H))),
    bandSy: Math.round(toPy(0.42 * H + 0.022 * H)),
    bandSh: Math.max(20, Math.round(0.044 * H / yr * (TAIL_H - 8))),
    rubPy: Math.round(toPy(yMin + 0.055 * (yMax - yMin))),
  };
  console.log('tail layout:', JSON.stringify(remapTailUVs.layout));
  return keep.length;
}
// --- WHEEL: axle (thin axis) -> +Y, center ---
function processWheel() {
  const g = parseGLB(path.join(WORK, 'PORSCHEWHEEL.glb'));
  const pos = g.pos.slice(); const n = pos.length / 3; let bb = bbox(pos);
  const ext = [bb.mx[0] - bb.mn[0], bb.mx[1] - bb.mn[1], bb.mx[2] - bb.mn[2]];
  const axle = ext.indexOf(Math.min(...ext));   // thin axis = axle
  for (let v = 0; v < n; v++) { let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2]; if (axle === 0) { const t = y; y = x; x = -t; } else if (axle === 2) { const t = y; y = z; z = -t; } pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z; }
  bb = bbox(pos); for (let v = 0; v < n; v++) { pos[v * 3] -= (bb.mn[0] + bb.mx[0]) / 2; pos[v * 3 + 1] -= (bb.mn[1] + bb.mx[1]) / 2; pos[v * 3 + 2] -= (bb.mn[2] + bb.mx[2]) / 2; }
  return { q: quant(pos, g.uv), rawTex: g.tex };
}
// --- SPOILER: orient WIDTH (long horizontal axis) -> Z (car width), center x/z,
//     rest at min y. Also report lipY = where the blue lip sits above the black
//     riser box, so the game can seat the box into the deck void with the lip proud. ---
function processSpoiler() {
  const g = parseGLB(path.join(WORK, 'PORSCHESPOILER.glb'));
  const pos = g.pos.slice(); const n = pos.length / 3; let bb = bbox(pos);
  const needRot = (bb.mx[0] - bb.mn[0]) > (bb.mx[2] - bb.mn[2]);   // long axis on X -> rotate to Z
  for (let v = 0; v < n; v++) { let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2]; if (needRot) { const nx = -z, nz = x; x = nx; z = nz; } pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z; }
  bb = bbox(pos); for (let v = 0; v < n; v++) { pos[v * 3] -= (bb.mn[0] + bb.mx[0]) / 2; pos[v * 3 + 1] -= bb.mn[1]; pos[v * 3 + 2] -= (bb.mn[2] + bb.mx[2]) / 2; }
  // lipY: the black riser box is the lower solid mass; find the y where the wide
  // blue lip begins (widest z-span jumps) — approximate as 0.6 of height.
  const q = quant(pos, g.uv);
  return { q, rawTex: g.tex, lipY: +(0.58 * q.dims[1]).toFixed(4) };
}

(async () => {
  const FLIP = process.argv.includes('--flip');
  const PLAIN = process.argv.includes('--plain');   // first-cut mode: Meshy texture untouched, no tail machinery
  processBody.plain = PLAIN;
  const body = processBody(FLIP), wheel = processWheel(), spoiler = processSpoiler();
  // textures via headless canvas: body -> 512px recolor variants + tail bake; wheel 128 / spoiler 256
  const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  async function down(src, size) { return src ? page.evaluate(o => new Promise((res, rej) => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = o.s; c.height = o.s; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, o.s, o.s); res(c.toDataURL('image/png')); }; img.onerror = () => rej(new Error('decode')); img.src = o.src; }), { src, s: size }) : null; }
  // recolor: mask blue body paint -> target colour (game getVehMat logic), keep
  // windows/tyres/lights. For the body (strip=true) the canvas grows to 512x704
  // and the taillight design — band with amber corner clusters + ribbed red
  // reflector + PORSCHE lettering, Carrera 2 cursive above, bumper rub strip —
  // is drawn ONCE into the appended strip at 1:1 texels. The tail triangles'
  // UVs were re-islanded onto that strip by remapTailUVs, so the design lands
  // on the tail crisp, with no island seams and no per-texel resampling.
  async function recolor(src, tgt, size, strip, dark) {
    return page.evaluate(o => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const S = o.s, TOT = o.strip ? S + 192 : S;
        const c = document.createElement('canvas'); c.width = S; c.height = TOT;
        const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, S, S);
        const d = g.getImageData(0, 0, S, S), px = d.data;
        for (let j = 0; j < px.length; j += 4) {
          const r = px[j], gg = px[j + 1], b = px[j + 2];
          if (b > r * 1.15 && b > gg * 1.1 && b > 50) {
            const lum = (r * 0.35 + gg * 0.45 + b * 0.35) / 148;
            px[j] = Math.min(255, o.t[0] * lum); px[j + 1] = Math.min(255, o.t[1] * lum); px[j + 2] = Math.min(255, o.t[2] * lum);
          }
        }
        g.putImageData(d, 0, 0);
        if (o.strip) {
          const oy = S;   // strip occupies y 512..704; design dv space maps py 516..700
          const LY = o.layout;
          // fill the strip by resampling the recoloured atlas through the tail
          // geometry — the panel keeps its real baked shading and blends with
          // the neighbouring paint; only the design elements draw on top
          const atl = g.getImageData(0, 0, S, S).data;
          const st = g.createImageData(S, 192), sd = st.data;
          for (let i = 0; i < o.map.length; i++) {
            const m = o.map[i], di = i * 4;
            if (m < 0) { sd[di] = o.t[0] * 0.9; sd[di + 1] = o.t[1] * 0.9; sd[di + 2] = o.t[2] * 0.9; sd[di + 3] = 255; continue; }
            const su = ((m >> 12) & 4095) / 4096 * S | 0, sv = (m & 4095) / 4096 * S | 0;
            const si = (sv * S + su) * 4;
            sd[di] = atl[si]; sd[di + 1] = atl[si + 1]; sd[di + 2] = atl[si + 2]; sd[di + 3] = 255;
          }
          // junk filter: the original bake had black wedges + amber blob lights
          // on the tail; replace those outliers with the panel's median tone so
          // only genuine paint shading survives the resample
          const smp = [];
          for (let i = 0; i < sd.length; i += 4) {
            const r = sd[i], gg2 = sd[i + 1], b2 = sd[i + 2];
            const dark = Math.max(r, gg2, b2) < 60, amber = (r > 140 && gg2 > 70 && gg2 < 180 && b2 < 80 && r > gg2 * 1.35) || (r > 170 && gg2 > 140 && b2 < 130 && b2 < gg2 * 0.75) || (r > 165 && gg2 > 105 && b2 > 95);
            if (!dark && !amber) smp.push(i);
          }
          const mid = smp.length ? smp[(smp.length / 2) | 0] : 0;
          const mr = sd[mid], mg = sd[mid + 1], mb = sd[mid + 2];
          for (let i = 0; i < sd.length; i += 4) {
            const py2 = (i / 4 / S) | 0;
            const r = sd[i], gg2 = sd[i + 1], b2 = sd[i + 2];
            const dark = Math.max(r, gg2, b2) < 60, amber = (r > 140 && gg2 > 70 && gg2 < 180 && b2 < 80 && r > gg2 * 1.35) || (r > 170 && gg2 > 140 && b2 < 130 && b2 < gg2 * 0.75) || (r > 165 && gg2 > 105 && b2 > 95);
            if (py2 > o.layout.bandSy + o.layout.bandSh + 4 && (dark || amber)) {   // bumper zone only: clear baked marker ambers + dark dot artifacts
              const f = 1.03 - py2 / 192 * 0.18;   // slight top-lit gradient
              sd[i] = Math.min(255, mr * f); sd[i + 1] = Math.min(255, mg * f); sd[i + 2] = Math.min(255, mb * f);
            }
          }
          g.putImageData(st, 0, oy);
          // Carrera 2 script on the upper tail panel
          g.fillStyle = o.dark ? '#e2ded8' : '#160a08';
          g.font = 'italic bold 27px cursive'; g.textAlign = 'center';
          g.fillText('Carrera 2', 256, oy + LY.scriptPy + 9);
          // full-width light band: black surround, amber corner clusters, ribbed
          // red reflector centre with PORSCHE lettering. SLIM like the real one —
          // ~10cm on a 1.31m car (~8% of body height), band centre at ~36% height
          const sx = 0, sw = 512, sy = oy + LY.bandSy, sh = LY.bandSh, ac = 76;
          g.fillStyle = '#0a0606'; g.fillRect(0, sy - 3, 512, sh + 6);
          g.fillStyle = '#9c1a16'; g.fillRect(sx, sy, ac, sh); g.fillRect(sx + sw - ac, sy, ac, sh);   // uniform red across the whole band (964 lenses read red)
          g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2;
          for (let i = 1; i < 4; i++) {
            const a = sx + ac * i / 4, b2 = sx + sw - ac + ac * i / 4;
            g.beginPath(); g.moveTo(a, sy); g.lineTo(a, sy + sh); g.moveTo(b2, sy); g.lineTo(b2, sy + sh); g.stroke();
          }
          g.fillStyle = '#9c1a16'; g.fillRect(sx + ac, sy, sw - ac * 2, sh);
          g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
          for (let hy = sy + 6; hy < sy + sh; hy += 6) { g.beginPath(); g.moveTo(sx + ac, hy); g.lineTo(sx + sw - ac, hy); g.stroke(); }
          g.font = 'bold 17px Arial'; g.textAlign = 'center';
          g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText('P O R S C H E', 257, sy + sh / 2 + 7);
          g.fillStyle = '#e04a3e'; g.fillText('P O R S C H E', 256, sy + sh / 2 + 6);   // raised red letters, brighter than the reflector
          // bumper rub strip
          g.fillStyle = '#17110f'; g.fillRect(8, oy + LY.rubPy, 496, 8);
        }
        res(c.toDataURL('image/png'));
      };
      img.onerror = () => rej(new Error('decode'));
      img.src = o.src;
    }), { src, t: tgt, s: size || 256, strip: !!strip, dark: !!dark, map: strip ? Array.from(remapTailUVs.map) : null, layout: strip ? remapTailUVs.layout : null });
  }
  const RED = [200, 32, 30], SILVER = [176, 180, 186], BLACK = [30, 32, 36], WHITE = [225, 226, 224], YELLOW = [226, 190, 30];
  const COLS = [RED, RED, RED, SILVER, BLACK, WHITE, YELLOW];   // RED x3 = prevalent
  const texs = [];
  for (const c of COLS) texs.push(await recolor(body.rawTex, c, 512, !PLAIN, c === BLACK));
  const wheelTex = await down(wheel.rawTex, 128);
  // spoiler recolored to match each body variant (blue paint -> color, black grille stays)
  const stexs = [];
  for (const c of COLS) stexs.push(await recolor(spoiler.rawTex, c, 256));
  await browser.close();

  const V = {
    n: 'PORSCHE964', flip: FLIP ? 1 : 0,
    body: body.q, texs: texs,
    wheel: wheel.q, wtex: wheelTex,
    wheels: body.wheels,
    spoiler: Object.assign({}, spoiler.q, { mount: body.mount, lipY: spoiler.lipY }), stexs: stexs,
  };
  const out = '// AI-generated Porsche 964 hero car (gpt-image-1 multi-view -> Meshy -> ' +
    'tools/vehgen/genporsche.js).\n// Wheel-less body + separate Cup1 wheel + retractable spoiler. ' +
    'Game guards typeof PORSCHE_VEH.\nvar PORSCHE_VEH = ' + JSON.stringify(V) + ';\n';
  new Function(out); fs.writeFileSync(OUT, out);
  console.log('wrote', OUT, '~' + Math.round(fs.statSync(OUT).size / 1024) + 'KB');
  console.log('body dims', body.q.dims, 'rotated', body.rotated, 'flip', FLIP);
  console.log('wheels', JSON.stringify(body.wheels), 'mount', body.mount, 'wheelR', body.r);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
