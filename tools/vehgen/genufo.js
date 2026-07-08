// Convert the Meshy UFO GLBs (tools/vehgen/work/UFO.glb + UFO_DEAD.glb) into
// meshyufo.js: quantized Int16 positions + Uint16 uvs + 128px PNG data-URL
// textures. Same pipeline as genvehs.js / tools/chargen/genprops.js:
// gpt-image-1 seed -> Meshy image-to-3D (lowpoly, remeshed) -> this converter.
// GLB parsing walks the node hierarchy applying transforms (non-indexed
// expansion); quantization divisor computed from POST-shift values so shifted
// y can't exceed int16 and wrap negative; texture resolved through
// material.pbrMetallicRoughness.baseColorTexture (Meshy GLBs also embed a
// normal map, images[0] is NOT the base color). No wheel detection — saucers
// don't have wheels.
//   node genufo.js
const fs = require('fs');
const path = require('path');

const WORK = path.join(__dirname, 'work');
const OUT = '/home/user/westchase_fps/meshyufo.js';
const MODELS = [{ file: 'UFO', n: 'ufo' }, { file: 'UFO_DEAD', n: 'ufo_dead' }, { file: 'RAYGUN', n: 'raygun' }];

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
    tex = 'data:' + (im.mimeType || 'image/png') + ';base64,' +
      bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength).toString('base64');
  }
  return { pos, uv, tex };
}

function processModel(spec) {
  const g = parseGLB(path.join(WORK, spec.file + '.glb'));
  const n = g.pos.length / 3;
  if (n / 3 > 3000) console.log('WARNING: ' + spec.file + ' has ' + (n / 3) + ' tris (>3000)');

  // bbox; shift minY=0, center x/z on bbox center (no long-axis rotation —
  // a saucer is radially symmetric)
  let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9, mnz = 1e9, mxz = -1e9;
  for (let v = 0; v < n; v++) {
    const x = g.pos[v * 3], y = g.pos[v * 3 + 1], z = g.pos[v * 3 + 2];
    if (x < mnx) mnx = x; if (x > mxx) mxx = x;
    if (y < mny) mny = y; if (y > mxy) mxy = y;
    if (z < mnz) mnz = z; if (z > mxz) mxz = z;
  }
  const cx = (mnx + mxx) / 2, cz = (mnz + mxz) / 2;
  const pts = new Float64Array(n * 3);
  for (let v = 0; v < n; v++) {
    pts[v * 3] = g.pos[v * 3] - cx;
    pts[v * 3 + 1] = g.pos[v * 3 + 1] - mny;
    pts[v * 3 + 2] = g.pos[v * 3 + 2] - cz;
  }
  const dims = [mxx - mnx, mxy - mny, mxz - mnz];

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
      n: spec.n, q: +Q.toFixed(4), tris: n / 3, p: b64(qp), u: b64(qu),
      tex: null,   // filled in after playwright downscale
      dims: dims.map(v2 => +v2.toFixed(4))
    },
    rawTex: g.tex
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
  const out = '// AI-generated PSX UFO — intact + crash-damaged (gpt-image-1 seed ->\n' +
    '// Meshy image-to-3D; see tools/vehgen/genufo.js). Optional: game checks\n' +
    '// typeof MESHY_UFO.\n' +
    'var MESHY_UFO = [\n' + lines.join(',\n') + '\n];\n';
  new Function(out);   // syntax gate before writing
  fs.writeFileSync(OUT, out);

  for (const r of results) {
    console.log(r.entry.n,
      r.entry.tris + ' tris,',
      'dims [' + r.entry.dims.join(', ') + '],',
      'tex ' + (r.entry.tex ? Math.round(r.entry.tex.length / 1024) + 'KB' : 'NONE'));
  }
  console.log('wrote ' + OUT + ' ~' + Math.round(fs.statSync(OUT).size / 1024) + 'KB');
}

main().catch(e => { console.error(e); process.exit(1); });
