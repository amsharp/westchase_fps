// Convert Meshy vehicle GLBs (tools/vehgen/work/*.glb) into meshyvehs.js:
// quantized Int16 positions + Uint16 uvs + 128px PNG data-URL textures +
// wheel anchors. GLB parsing pattern copied from tools/chargen/genprops.js
// (walks node hierarchy applying transforms, non-indexed expansion,
// quantization divisor computed from POST-shift values so shifted y can't
// exceed int16 and wrap negative).
//   node genvehs.js
const fs = require('fs');
const path = require('path');

const WORK = path.join(__dirname, 'work');
const OUT = '/home/user/westchase_fps/meshyvehs.js';
const MODELS = ['COMPACT', 'HATCH', 'MINIVAN', 'PICKUP_BIG', 'PICKUP_FS',
  'PICKUP_HD', 'SEDAN_FULL', 'SEDAN_MID', 'SEDAN_SPORT', 'SUV_MID'];

function parseGLB(file) {
  const b = fs.readFileSync(file);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.slice(20, 20 + jsonLen).toString('utf8'));
  let off = 20 + jsonLen, bin = null;
  while (off < b.length) {
    const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4);
    if (type === 0x004E4942) { bin = b.slice(off + 8, off + 8 + len); break; }
    off += 8 + len;
  }
  function acc(i) {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
    const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const n = a.count * { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
    const C = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType];
    // Buffer pooling: MUST use (buf.buffer, buf.byteOffset + start, n) form
    return new C(bin.buffer, bin.byteOffset + start, n);
  }
  function matFromTRS(n) {
    if (n.matrix) return n.matrix.slice();
    const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
    const [x, y, z, w] = q;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    return [
      (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
      (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
      (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
      t[0], t[1], t[2], 1];
  }
  function mul(a, b2) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b2[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  }
  function xf(m, p) {
    return [
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  }
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const pos = [], uv = [];
  function walk(ni, parent) {
    const n = json.nodes[ni];
    const world = mul(parent, matFromTRS(n));
    if (n.mesh !== undefined) {
      for (const prim of json.meshes[n.mesh].primitives) {
        const P = acc(prim.attributes.POSITION);
        const U = prim.attributes.TEXCOORD_0 !== undefined ? acc(prim.attributes.TEXCOORD_0) : null;
        const Idx = prim.indices !== undefined ? acc(prim.indices) : null;
        const cnt = Idx ? Idx.length : P.length / 3;
        for (let k = 0; k < cnt; k++) {
          const vi = Idx ? Idx[k] : k;
          const p = xf(world, [P[vi * 3], P[vi * 3 + 1], P[vi * 3 + 2]]);
          pos.push(p[0], p[1], p[2]);
          uv.push(U ? U[vi * 2] : 0, U ? U[vi * 2 + 1] : 0);
        }
      }
    }
    for (const c of n.children || []) walk(c, world);
  }
  for (const ni of json.scenes[json.scene || 0].nodes) walk(ni, I);
  // texture: resolve the material's baseColorTexture (Meshy GLBs also embed
  // a normal map, so images[0] is NOT necessarily the base color)
  let imgIdx = -1;
  if (json.materials) {
    for (const m of json.materials) {
      const bt = m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorTexture;
      if (bt && json.textures && json.textures[bt.index]) { imgIdx = json.textures[bt.index].source; break; }
    }
  }
  if (imgIdx < 0 && json.images) {
    imgIdx = json.images.findIndex(im => /basecolor|albedo|diffuse/i.test(im.name || ''));
    if (imgIdx < 0) imgIdx = 0;
  }
  let tex = null;
  if (imgIdx >= 0 && json.images && json.images[imgIdx] && json.images[imgIdx].bufferView !== undefined) {
    const im = json.images[imgIdx], bv = json.bufferViews[im.bufferView];
    // mime may be image/png or image/jpeg — canvas decode handles either
    tex = 'data:' + (im.mimeType || 'image/png') + ';base64,' +
      bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength).toString('base64');
  }
  return { pos, uv, tex };
}

function percentile(arr, p) {
  const s = arr.slice().sort((a, b) => a - b);
  if (!s.length) return 0;
  const i = Math.min(s.length - 1, Math.max(0, (s.length - 1) * p));
  const lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

function processModel(name) {
  const g = parseGLB(path.join(WORK, name + '.glb'));
  const n = g.pos.length / 3;
  if (n / 3 > 3000) console.log('WARNING: ' + name + ' has ' + (n / 3) + ' tris (>3000)');

  // bbox in raw space
  let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9, mnz = 1e9, mxz = -1e9;
  for (let v = 0; v < n; v++) {
    const x = g.pos[v * 3], y = g.pos[v * 3 + 1], z = g.pos[v * 3 + 2];
    if (x < mnx) mnx = x; if (x > mxx) mxx = x;
    if (y < mny) mny = y; if (y > mxy) mxy = y;
    if (z < mnz) mnz = z; if (z > mxz) mxz = z;
  }
  // normalize orientation: long horizontal axis -> X (front-vs-back unknown;
  // an optional in-game `flip` correction handles that later)
  const rotated = (mxz - mnz) > (mxx - mnx);
  const pts = new Float64Array(n * 3);
  for (let v = 0; v < n; v++) {
    let x = g.pos[v * 3], y = g.pos[v * 3 + 1], z = g.pos[v * 3 + 2];
    if (rotated) { const t = x; x = z; z = -t; }   // rotate +90 deg about Y
    pts[v * 3] = x; pts[v * 3 + 1] = y; pts[v * 3 + 2] = z;
  }
  // bbox after rotation; shift minY=0, center x/z on bbox center
  mnx = 1e9; mxx = -1e9; mny = 1e9; mxy = -1e9; mnz = 1e9; mxz = -1e9;
  for (let v = 0; v < n; v++) {
    const x = pts[v * 3], y = pts[v * 3 + 1], z = pts[v * 3 + 2];
    if (x < mnx) mnx = x; if (x > mxx) mxx = x;
    if (y < mny) mny = y; if (y > mxy) mxy = y;
    if (z < mnz) mnz = z; if (z > mxz) mxz = z;
  }
  const cx = (mnx + mxx) / 2, cz = (mnz + mxz) / 2;
  for (let v = 0; v < n; v++) {
    pts[v * 3] -= cx; pts[v * 3 + 1] -= mny; pts[v * 3 + 2] -= cz;
  }
  const len = mxx - mnx, height = mxy - mny, width = mxz - mnz;

  // wheel anchors: low verts (y < 0.35*height), away from center along x,
  // clustered by corner (sign x, sign z); centroid = center, radius = p90 y
  // (max y overshoots — the wheel top blends into the body)
  const clusters = { '00': [], '01': [], '10': [], '11': [] };
  for (let v = 0; v < n; v++) {
    const x = pts[v * 3], y = pts[v * 3 + 1], z = pts[v * 3 + 2];
    if (y >= 0.35 * height) continue;
    if (Math.abs(x) <= 0.15 * len) continue;
    clusters[(x >= 0 ? '1' : '0') + (z >= 0 ? '1' : '0')].push([x, y, z]);
  }
  const wheels = [];
  for (const k of ['00', '01', '10', '11']) {
    const c = clusters[k];
    if (!c.length) { console.log('WARNING: ' + name + ' empty wheel cluster ' + k); wheels.push([0, 0, 0, 0]); continue; }
    let sx = 0, sy = 0, sz = 0;
    for (const p of c) { sx += p[0]; sy += p[1]; sz += p[2]; }
    const r = percentile(c.map(p => p[1]), 0.9);
    wheels.push([sx / c.length, sy / c.length, sz / c.length, r].map(v2 => +v2.toFixed(4)));
  }

  // quantize — divisor from POST-shift values (genprops.js lesson)
  let maxE = 0;
  for (let v = 0; v < n; v++) {
    maxE = Math.max(maxE, Math.abs(pts[v * 3]), pts[v * 3 + 1], Math.abs(pts[v * 3 + 2]));
  }
  const Q = 32000 / (maxE + 1e-6);   // fit int16 with headroom
  const qp = new Int16Array(n * 3), qu = new Uint16Array(n * 2);
  for (let v = 0; v < n; v++) {
    qp[v * 3] = Math.round(pts[v * 3] * Q);
    qp[v * 3 + 1] = Math.round(pts[v * 3 + 1] * Q);
    qp[v * 3 + 2] = Math.round(pts[v * 3 + 2] * Q);
    // RAW glTF v — no flip (game loader applies 1-v); clamp uv*8192
    qu[v * 2] = Math.max(0, Math.min(65535, Math.round(g.uv[v * 2] * 8192)));
    qu[v * 2 + 1] = Math.max(0, Math.min(65535, Math.round(g.uv[v * 2 + 1] * 8192)));
  }
  const b64 = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
  return {
    entry: {
      n: name, q: +Q.toFixed(4), tris: n / 3, p: b64(qp), u: b64(qu),
      tex: null,   // filled in after playwright downscale
      dims: [len, height, width].map(v2 => +v2.toFixed(4)),
      wheels: wheels
    },
    rawTex: g.tex, rotated: rotated
  };
}

async function main() {
  const results = MODELS.map(processModel);

  // downscale textures 128x128 nearest-neighbor via headless chromium
  const pw = require('/opt/node22/lib/node_modules/playwright');
  const browser = await pw.chromium.launch({
    executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  for (const r of results) {
    if (!r.rawTex) { console.log('WARNING: no texture for ' + r.entry.n); continue; }
    r.entry.tex = await page.evaluate(function (src) {
      return new Promise(function (res, rej) {
        var img = new Image();
        img.onload = function () {
          var c = document.createElement('canvas');
          c.width = 128; c.height = 128;
          var ctx = c.getContext('2d');
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0, 128, 128);
          res(c.toDataURL('image/png'));
        };
        img.onerror = function (e) { rej(new Error('img decode failed')); };
        img.src = src;
      });
    }, r.rawTex);
  }
  await browser.close();

  const lines = results.map(r => ' ' + JSON.stringify(r.entry));
  const out = '// AI-generated PSX vehicles (gpt-image-1 seed -> Meshy image-to-3D; see\n' +
    '// tools/vehgen/). Optional: game checks typeof MESHY_VEHS.\n' +
    'var MESHY_VEHS = [\n' + lines.join(',\n') + '\n];\n';
  new Function(out);   // syntax gate before writing
  fs.writeFileSync(OUT, out);

  for (const r of results) {
    console.log(r.entry.n,
      r.entry.tris + ' tris,',
      'dims [' + r.entry.dims.join(', ') + '],',
      'wheels r=[' + r.entry.wheels.map(w => w[3]).join(', ') + '],',
      'tex ' + (r.entry.tex ? Math.round(r.entry.tex.length / 1024) + 'KB,' : 'NONE,'),
      r.rotated ? 'long axis was Z (rotated)' : 'long axis was X');
  }
  console.log('wrote ' + OUT + ' ~' + Math.round(fs.statSync(OUT).size / 1024) + 'KB');
}

main().catch(e => { console.error(e); process.exit(1); });
