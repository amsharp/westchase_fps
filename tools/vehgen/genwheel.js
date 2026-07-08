// Convert the Meshy wheel GLB (tools/vehgen/work/WHEEL.glb) into a
// MESHY_WHEEL block appended to meshyvehs.js (a separate top-level var —
// MESHY_VEHS itself is untouched). Same pipeline as genufo.js (gpt-image-1
// seed -> Meshy image-to-3d lowpoly+remesh -> this converter), but:
//   - INDEXED output ({p,u,i}): verts deduped by quantized pos+uv, Uint16
//     indices, so game code must geo.setIndex(...) before
//     computeVertexNormals (gives smooth tire shading too).
//   - Orientation is normalized to the game's wheelGeo convention
//     (THREE.CylinderGeometry): SPIN AXIS (axle) along local +Y, centered
//     at the origin on all three axes. The thinnest bbox axis of the GLB is
//     taken as the axle and rotated onto Y (90° axis swaps only, no
//     resampling). makeCar can then use it exactly like the cylinder:
//     mesh.rotation.x = PI/2 to stand it up (axle -> car-lateral z), spin
//     with mesh.rotation.y -= spin, steer via the pivot group.
//   - Texture downsampled to 64px, posterized, JPEG data-URL.
// Quantization divisor from POST-shift values (genprops.js lesson);
// baseColorTexture resolved through the material (images[0] is a normal map
// in Meshy GLBs). RAW glTF v stored — game loader applies the 1-v flip.
//   node genwheel.js
const fs = require('fs');
const path = require('path');

const GLB = path.join(__dirname, 'work', 'WHEEL.glb');
const OUT = '/home/user/westchase_fps/meshyvehs.js';

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
  // texture: the material's baseColorTexture (images[0] is NOT necessarily it)
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

async function main() {
  const g = parseGLB(GLB);
  const nv = g.pos.length / 3;
  console.log('corner verts', nv, '=', nv / 3, 'tris');

  // bbox
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let v = 0; v < nv; v++) for (let a = 0; a < 3; a++) {
    const c = g.pos[v * 3 + a];
    if (c < mn[a]) mn[a] = c; if (c > mx[a]) mx[a] = c;
  }
  const ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
  console.log('raw extents', ext.map(e => e.toFixed(4)).join(' x '));
  // axle = thinnest bbox axis; rotate it onto +Y (CylinderGeometry frame)
  let axle = 0;
  if (ext[1] < ext[axle]) axle = 1;
  if (ext[2] < ext[axle]) axle = 2;
  console.log('axle axis detected:', 'xyz'[axle]);
  const ctr = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  const pts = new Float64Array(nv * 3);
  for (let v = 0; v < nv; v++) {
    let x = g.pos[v * 3] - ctr[0], y = g.pos[v * 3 + 1] - ctr[1], z = g.pos[v * 3 + 2] - ctr[2];
    let o;
    if (axle === 2) o = [x, z, -y];        // Rx(-90): z -> y
    else if (axle === 0) o = [y, x, -z];   // Rz swap: x -> y (mirror-safe via -z)
    else o = [x, y, z];
    pts[v * 3] = o[0]; pts[v * 3 + 1] = o[1]; pts[v * 3 + 2] = o[2];
  }
  const dims = axle === 2 ? [ext[0], ext[2], ext[1]] :
    axle === 0 ? [ext[1], ext[0], ext[2]] : ext;

  // quantize from POST-shift values, then dedupe into indexed form
  let maxE = 0;
  for (let i = 0; i < pts.length; i++) maxE = Math.max(maxE, Math.abs(pts[i]));
  const Q = 32000 / (maxE + 1e-6);
  const seen = new Map(), P = [], U = [], IDX = [];
  for (let v = 0; v < nv; v++) {
    const qx = Math.round(pts[v * 3] * Q), qy = Math.round(pts[v * 3 + 1] * Q), qz = Math.round(pts[v * 3 + 2] * Q);
    const qu = Math.max(0, Math.min(65535, Math.round(g.uv[v * 2] * 8192)));
    const qv = Math.max(0, Math.min(65535, Math.round(g.uv[v * 2 + 1] * 8192)));
    const key = qx + ',' + qy + ',' + qz + ',' + qu + ',' + qv;
    let idx = seen.get(key);
    if (idx === undefined) {
      idx = P.length / 3;
      seen.set(key, idx);
      P.push(qx, qy, qz); U.push(qu, qv);
    }
    IDX.push(idx);
  }
  console.log('deduped to', P.length / 3, 'verts +', IDX.length, 'indices');
  if (P.length / 3 > 65535) throw new Error('too many verts for Uint16 indices');

  // texture: 64px posterized JPEG via headless chromium
  const pw = require('/opt/node22/lib/node_modules/playwright');
  const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const jpeg = await page.evaluate(function (src) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        // 128px, not 64: the Meshy atlas puts each rim face on ~40% of the
        // sheet, so 64px leaves ~25 texels across the spokes (mush)
        var c = document.createElement('canvas');
        c.width = c.height = 128;
        var ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, 0, 0, 128, 128);
        var d = ctx.getImageData(0, 0, 128, 128);
        for (var i = 0; i < d.data.length; i++) if ((i & 3) !== 3) d.data[i] = Math.round(d.data[i] / 12) * 12;
        ctx.putImageData(d, 0, 0);
        res(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = function () { rej(new Error('img decode failed')); };
      img.src = src;
    });
  }, g.tex);
  await browser.close();

  const b64 = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
  const entry = {
    n: 'wheel', tex: jpeg, q: +Q.toFixed(4),
    p: b64(new Int16Array(P)), u: b64(new Uint16Array(U)), i: b64(new Uint16Array(IDX)),
    dims: dims.map(d => +d.toFixed(4))
  };

  // append after MESHY_VEHS (replace an existing MESHY_WHEEL block if present)
  let src = fs.readFileSync(OUT, 'utf8');
  src = src.replace(/\n\/\/ AI-generated PSX car wheel[\s\S]*?var MESHY_WHEEL = \{[\s\S]*?\};\n/, '\n');
  src = src.replace(/\s*$/, '\n') +
    '// AI-generated PSX car wheel (tire + 5-spoke rim; gpt-image-1 seed ->\n' +
    '// Meshy image-to-3d; see tools/vehgen/genwheel.js). INDEXED geometry:\n' +
    '// decode p (Int16/q) + u (Uint16/8192, 1-v flip) like MESHY_UFO, then\n' +
    '// geo.setIndex(Uint16 from i) BEFORE computeVertexNormals. Spin axis =\n' +
    '// local +Y (CylinderGeometry frame, centered at origin): stand it up\n' +
    '// with rotation.x = PI/2, roll with rotation.y -= spin, like wheelGeo.\n' +
    '// dims = [diameter, width, diameter] meters.\n' +
    'var MESHY_WHEEL = ' + JSON.stringify(entry) + ';\n';
  new Function(src);   // syntax gate before writing
  fs.writeFileSync(OUT, src);
  console.log('wheel:', IDX.length / 3, 'tris,', P.length / 3, 'verts, q', entry.q,
    'dims [' + entry.dims.join(', ') + '], tex ~' + Math.round(jpeg.length / 1024) + 'KB');
  console.log('wrote', OUT, '~' + Math.round(fs.statSync(OUT).size / 1024) + 'KB');
}

main().catch(e => { console.error(e); process.exit(1); });
