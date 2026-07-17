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
  return { q, wheels, mount, rawTex: g.tex, rotated, L, H, W, r };
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
  // textures via headless canvas: body -> 256px + recolor variants; wheel/spoiler -> 256px as-is
  const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  async function down(src, size) { return src ? page.evaluate(o => new Promise((res, rej) => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = o.s; c.height = o.s; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, o.s, o.s); res(c.toDataURL('image/png')); }; img.onerror = () => rej(new Error('decode')); img.src = o.src; }), { src, s: size }) : null; }
  // recolor: mask blue body paint -> target color (game getVehMat logic), keep windows/tires/lights
  async function recolor(src, tgt) { return page.evaluate(o => new Promise((res, rej) => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, 256, 256); const d = g.getImageData(0, 0, 256, 256), px = d.data; for (let j = 0; j < px.length; j += 4) { const r = px[j], gg = px[j + 1], b = px[j + 2]; if (b > r * 1.15 && b > gg * 1.1 && b > 50) { const lum = (r * 0.35 + gg * 0.45 + b * 0.35) / 148; px[j] = Math.min(255, o.t[0] * lum); px[j + 1] = Math.min(255, o.t[1] * lum); px[j + 2] = Math.min(255, o.t[2] * lum); } } g.putImageData(d, 0, 0); res(c.toDataURL('image/png')); }; img.onerror = () => rej(new Error('decode')); img.src = o.src; }), { src, t: tgt }); }
  const RED = [200, 32, 30], SILVER = [176, 180, 186], BLACK = [30, 32, 36], WHITE = [225, 226, 224], YELLOW = [226, 190, 30];
  const texs = [];
  for (const c of [RED, RED, RED, SILVER, BLACK, WHITE, YELLOW]) texs.push(await recolor(body.rawTex, c));   // RED x3 = prevalent
  const wheelTex = await down(wheel.rawTex, 128);
  // spoiler recolored to match each body variant (blue paint -> color, black grille stays)
  const stexs = [];
  for (const c of [RED, RED, RED, SILVER, BLACK, WHITE, YELLOW]) stexs.push(await recolor(spoiler.rawTex, c));
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
