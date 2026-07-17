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
  const pos = g.pos.slice(); const n = pos.length / 3;
  let bb = bbox(pos);
  const rotated = (bb.mx[2] - bb.mn[2]) > (bb.mx[0] - bb.mn[0]);
  for (let v = 0; v < n; v++) { let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2]; if (rotated) { const t = x; x = z; z = -t; } if (flipNose) { x = -x; z = -z; } pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z; }
  bb = bbox(pos);
  const cx = (bb.mn[0] + bb.mx[0]) / 2, cz = (bb.mn[2] + bb.mx[2]) / 2;
  for (let v = 0; v < n; v++) { pos[v * 3] -= cx; pos[v * 3 + 1] -= bb.mn[1]; pos[v * 3 + 2] -= cz; }
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
  let deckY = -1e9;
  for (let v = 0; v < n; v++) { const x = pos[v * 3], y = pos[v * 3 + 1]; if (x < -0.28 * L && x > -0.45 * L && Math.abs(pos[v * 3 + 2]) < 0.3 * W && y > deckY) deckY = y; }
  const mount = [rd(-0.34 * L), rd(deckY), 0];
  return { q, wheels, mount, rawTex: g.tex, rotated, L, H, W, r, pos, uv: g.uv };
}

// --- tail texel projection: find rearward-facing triangles at the tail, raster
// them in UV space at S px, and map each texel's interpolated 3D (z,y) into
// tail-design space (du across the tail, dv top->bottom). The taillight band +
// Carrera 2 script are then BAKED into the atlas per colour variant (the old
// floating decal quad never sat right on the curved tail). ---
function collectTailTexels(body, S) {
  const { pos, uv, L, H, W } = body;
  const nTri = pos.length / 9;
  const keep = [];
  let yMin = 1e9, yMax = -1e9;
  for (let t = 0; t < nTri; t++) {
    const o = t * 9;
    const ax = pos[o], ay = pos[o + 1], az = pos[o + 2];
    const bx = pos[o + 3], by = pos[o + 4], bz = pos[o + 5];
    const cx2 = pos[o + 6], cy = pos[o + 7], cz = pos[o + 8];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az, e2x = cx2 - ax, e2y = cy - ay, e2z = cz - az;
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl;
    const mx2 = (ax + bx + cx2) / 3, my = (ay + by + cy) / 3;
    // fascia tris face hard rearward; the engine-lid slope (where the Carrera 2
    // script sits, above the band) tilts up so its nx is softer — accept it in
    // the upper zone only, so flat deck tris (nx~0) stay out
    if (mx2 < -0.40 * L && my < 0.70 * H && (nx < -0.30 || (nx < -0.13 && my > 0.28))) {
      keep.push(t);
      yMin = Math.min(yMin, ay, by, cy); yMax = Math.max(yMax, ay, by, cy);
    }
  }
  const texels = [];   // flat [px,py,duQ,dvQ,...] (du/dv quantized *4096)
  for (const t of keep) {
    const o = t * 9, u0 = uv[t * 6] * S, v0 = uv[t * 6 + 1] * S, u1 = uv[t * 6 + 2] * S, v1 = uv[t * 6 + 3] * S, u2 = uv[t * 6 + 4] * S, v2 = uv[t * 6 + 5] * S;
    const x0 = Math.max(0, Math.floor(Math.min(u0, u1, u2)) - 1), x1 = Math.min(S - 1, Math.ceil(Math.max(u0, u1, u2)) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(v0, v1, v2)) - 1), y1 = Math.min(S - 1, Math.ceil(Math.max(v0, v1, v2)) + 1);
    const den = (v1 - v2) * (u0 - u2) + (u2 - u1) * (v0 - v2);
    if (Math.abs(den) < 1e-9) continue;
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const fx = px + 0.5, fy = py + 0.5;
      const w0 = ((v1 - v2) * (fx - u2) + (u2 - u1) * (fy - v2)) / den;
      const w1 = ((v2 - v0) * (fx - u2) + (u0 - u2) * (fy - v2)) / den;
      const w2 = 1 - w0 - w1;
      const eps = -1.2 / Math.sqrt(Math.abs(den));            // ~1px tolerance to close seams
      if (w0 < eps || w1 < eps || w2 < eps) continue;
      const y3 = w0 * pos[o + 1] + w1 * pos[o + 4] + w2 * pos[o + 7];
      const z3 = w0 * pos[o + 2] + w1 * pos[o + 5] + w2 * pos[o + 8];
      const du = (z3 + W / 2) / W, dv = 1 - (y3 - yMin) / (yMax - yMin || 1);
      texels.push(px, py, Math.max(0, Math.min(4095, du * 4096 | 0)), Math.max(0, Math.min(4095, dv * 4096 | 0)));
    }
  }
  console.log('tail bake:', keep.length, 'tris,', texels.length / 4, 'texels, y', yMin.toFixed(3), '..', yMax.toFixed(3));
  return texels;
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
  const body = processBody(FLIP), wheel = processWheel(), spoiler = processSpoiler();
  const BODY_S = 512;   // body atlas res: tail text must stay legible after the bake
  const tailTexels = collectTailTexels(body, BODY_S);
  // textures via headless canvas: body -> 512px recolor variants + tail bake; wheel 128 / spoiler 256
  const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  async function down(src, size) { return src ? page.evaluate(o => new Promise((res, rej) => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = o.s; c.height = o.s; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, o.s, o.s); res(c.toDataURL('image/png')); }; img.onerror = () => rej(new Error('decode')); img.src = o.src; }), { src, s: size }) : null; }
  // recolor: mask blue body paint -> target color (game getVehMat logic), keep windows/tires/lights.
  // For the body (o.tail set) also BAKE the taillight band + Carrera 2 design:
  // each tail texel is overwritten with the design sampled at its projected (du,dv).
  async function recolor(src, tgt, size, tail, dark) {
    return page.evaluate(o => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const S = o.s, c = document.createElement('canvas'); c.width = S; c.height = S;
        const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, S, S);
        const d = g.getImageData(0, 0, S, S), px = d.data;
        for (let j = 0; j < px.length; j += 4) {
          const r = px[j], gg = px[j + 1], b = px[j + 2];
          if (b > r * 1.15 && b > gg * 1.1 && b > 50) {
            const lum = (r * 0.35 + gg * 0.45 + b * 0.35) / 148;
            px[j] = Math.min(255, o.t[0] * lum); px[j + 1] = Math.min(255, o.t[1] * lum); px[j + 2] = Math.min(255, o.t[2] * lum);
          }
        }
        if (o.tail && o.tail.length) {
          // ---- tail design canvas (512x256): field + Carrera 2 + light band ----
          const DW = 512, DH = 256, D = document.createElement('canvas'); D.width = DW; D.height = DH;
          const q = D.getContext('2d');
          const shade = (t2, f) => 'rgb(' + Math.min(255, t2[0] * f | 0) + ',' + Math.min(255, t2[1] * f | 0) + ',' + Math.min(255, t2[2] * f | 0) + ')';
          const gr = q.createLinearGradient(0, 0, 0, DH);
          gr.addColorStop(0, shade(o.t, 1.05)); gr.addColorStop(0.7, shade(o.t, 0.92)); gr.addColorStop(1, shade(o.t, 0.72));
          q.fillStyle = gr; q.fillRect(0, 0, DW, DH);
          // layout, dv top->bottom: 0-0.25 lid slope (script), 0.25-0.46 band, rest bumper
          q.fillStyle = o.dark ? '#e2ded8' : '#160a08';
          q.font = 'italic bold 30px cursive'; q.textAlign = 'center';
          q.fillText('Carrera 2', 256, 44);
          const sx = 8, sw = 496, sy = 64, sh = 52, ac = 84;
          q.fillStyle = '#0a0606'; q.fillRect(sx - 4, sy - 4, sw + 8, sh + 8);
          q.fillStyle = '#e0851a'; q.fillRect(sx, sy, ac, sh); q.fillRect(sx + sw - ac, sy, ac, sh);
          q.strokeStyle = 'rgba(110,55,0,0.55)'; q.lineWidth = 2;
          for (let i = 1; i < 4; i++) {
            const a = sx + ac * i / 4, b2 = sx + sw - ac + ac * i / 4;
            q.beginPath(); q.moveTo(a, sy); q.lineTo(a, sy + sh); q.moveTo(b2, sy); q.lineTo(b2, sy + sh); q.stroke();
          }
          q.fillStyle = '#6e1210'; q.fillRect(sx + ac, sy, sw - ac * 2, sh);
          q.strokeStyle = 'rgba(0,0,0,0.35)'; q.lineWidth = 1;
          for (let hy = sy + 8; hy < sy + sh; hy += 9) { q.beginPath(); q.moveTo(sx + ac, hy); q.lineTo(sx + sw - ac, hy); q.stroke(); }
          q.font = 'bold 30px Arial'; q.textAlign = 'center';
          q.fillStyle = 'rgba(0,0,0,0.6)'; q.fillText('P O R S C H E', 258, sy + sh / 2 + 11);
          q.fillStyle = '#dcd2c6'; q.fillText('P O R S C H E', 256, sy + sh / 2 + 10);
          q.fillStyle = '#17110f'; q.fillRect(8, 226, 496, 9);   // bumper rub strip
          const dd = q.getImageData(0, 0, DW, DH).data;
          const T = o.tail;
          for (let k = 0; k < T.length; k += 4) {
            const tx2 = T[k], ty2 = T[k + 1];
            const dx2 = Math.min(DW - 1, (T[k + 2] / 4096 * DW) | 0), dy2 = Math.min(DH - 1, (T[k + 3] / 4096 * DH) | 0);
            const si = (dy2 * DW + dx2) * 4, di = (ty2 * S + tx2) * 4;
            px[di] = dd[si]; px[di + 1] = dd[si + 1]; px[di + 2] = dd[si + 2];
          }
        }
        g.putImageData(d, 0, 0);
        res(c.toDataURL('image/png'));
      };
      img.onerror = () => rej(new Error('decode'));
      img.src = o.src;
    }), { src, t: tgt, s: size || 256, tail: tail || null, dark: !!dark });
  }
  const RED = [200, 32, 30], SILVER = [176, 180, 186], BLACK = [30, 32, 36], WHITE = [225, 226, 224], YELLOW = [226, 190, 30];
  const COLS = [RED, RED, RED, SILVER, BLACK, WHITE, YELLOW];   // RED x3 = prevalent
  const texs = [];
  for (const c of COLS) texs.push(await recolor(body.rawTex, c, BODY_S, tailTexels, c === BLACK));
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
