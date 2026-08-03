// Split multi-object building GLBs -> CITY_BUILDINGS catalog (citybuildings.js).
// Each scene object becomes one {id,name,dims,q,tris,p,u,i,tex} entry (same scheme
// as SKYSCRAPERS), re-origined: X/Z centered, base dropped to y=0. Blender->glTF
// puts the modelled FRONT on +Z. Per-file atlas -> native-res JPEG (no downscale).
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const U = 'tools/citygen/glbs/';   // in-repo, revert-proof

// file -> {obj-name-prefix, id-prefix, startIndex}
const JOBS = [
  { file: U + 'GenericBrickBuildings.glb', idp: 'brick', start: 1 },
  { file: U + 'GenericCityBusinessesWithApartments.glb', idp: 'citybiz', start: 1 },
  { file: U + 'GenericCityBusinessesWithApartments2.glb', idp: 'citybiz', start: 6 },
  { file: U + 'GenericOfficeBuildings.glb', idp: 'office', start: 1 },
  { file: U + 'HighriseApartment.glb', idp: 'highrise', start: 1 }
];

function mul(a, c) { const o = new Array(16); for (let r = 0; r < 4; r++)for (let cc = 0; cc < 4; cc++) { let s = 0; for (let k = 0; k < 4; k++)s += a[k * 4 + r] * c[cc * 4 + k]; o[cc * 4 + r] = s; } return o; }
function trs(n) { if (n.matrix) return n.matrix.slice(); const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1]; const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2; return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0, (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1]; }

function parse(file) {
  const b = fs.readFileSync(file);
  const jl = b.readUInt32LE(12), json = JSON.parse(b.slice(20, 20 + jl).toString('utf8'));
  let off = 20 + jl, bin = null;
  while (off < b.length) { const len = b.readUInt32LE(off), t = b.readUInt32LE(off + 4); if (t === 0x004E4942) { bin = b.slice(off + 8, off + 8 + len); break; } off += 8 + len; }
  function acc(i) { const a = json.accessors[i], bv = json.bufferViews[a.bufferView]; const s = (bv.byteOffset || 0) + (a.byteOffset || 0); const comp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type]; const C = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array, 5122: Int16Array, 5120: Int8Array }[a.componentType]; return new C(bin.buffer, bin.byteOffset + s, a.count * comp); }
  const objs = [];
  const scene = json.scenes[json.scene || 0];
  (function walk(list, parent) {
    for (const ni of list) {
      const n = json.nodes[ni]; const m = mul(parent, trs(n));
      if (n.mesh != null) {
        const P = [], UV = [], I = []; let base = 0;
        for (const pr of json.meshes[n.mesh].primitives) {
          const pos = acc(pr.attributes.POSITION), uv = pr.attributes.TEXCOORD_0 != null ? acc(pr.attributes.TEXCOORD_0) : null, idx = pr.indices != null ? acc(pr.indices) : null, vc = pos.length / 3;
          for (let v = 0; v < vc; v++) { const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2]; P.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]); UV.push(uv ? uv[v * 2] : 0, uv ? uv[v * 2 + 1] : 0); }
          if (idx) for (let k = 0; k < idx.length; k++) I.push(base + idx[k]); else for (let k = 0; k < vc; k++) I.push(base + k);
          base += vc;
        }
        objs.push({ name: n.name, P, UV, I });
      }
      if (n.children) walk(n.children, m);
    }
  })(scene.nodes, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  // texture
  let png = null, mime = 'image/png';
  const mat = json.materials && json.materials[0];
  let imgIdx = 0;
  if (mat && mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorTexture) imgIdx = json.textures[mat.pbrMetallicRoughness.baseColorTexture.index].source;
  const im = json.images[imgIdx] || json.images[0];
  if (im) { const bv = json.bufferViews[im.bufferView]; mime = im.mimeType || 'image/png'; png = bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength); }
  return { objs, png, mime };
}
function b64(u8) { return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64'); }
function encObj(o, id, tex) {
  const P = o.P;
  let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9, mnz = 1e9, mxz = -1e9;
  for (let i = 0; i < P.length; i += 3) { mnx = Math.min(mnx, P[i]); mxx = Math.max(mxx, P[i]); mny = Math.min(mny, P[i + 1]); mxy = Math.max(mxy, P[i + 1]); mnz = Math.min(mnz, P[i + 2]); mxz = Math.max(mxz, P[i + 2]); }
  const cx = (mnx + mxx) / 2, cz = (mnz + mxz) / 2, baseY = mny;
  const dims = [mxx - mnx, mxy - mny, mxz - mnz];
  const tp = new Float32Array(P.length); let maxAbs = 0;
  for (let i = 0; i < P.length; i += 3) { const x = P[i] - cx, y = P[i + 1] - baseY, z = P[i + 2] - cz; tp[i] = x; tp[i + 1] = y; tp[i + 2] = z; maxAbs = Math.max(maxAbs, Math.abs(x), Math.abs(y), Math.abs(z)); }
  const q = 32760 / maxAbs;
  const qp = new Int16Array(tp.length); for (let i = 0; i < tp.length; i++) qp[i] = Math.max(-32767, Math.min(32767, Math.round(tp[i] * q)));
  const qu = new Uint16Array(o.UV.length); for (let i = 0; i < o.UV.length; i++) { let v = o.UV[i]; if (v < 0) v = 0; if (v > 1) v = 1; qu[i] = Math.round(v * 8192); }
  const qi = new Uint16Array(o.I.length); for (let i = 0; i < o.I.length; i++) qi[i] = o.I[i];
  return { id, name: id, q, dims: dims.map(d => +d.toFixed(4)), tris: o.I.length / 3, p: b64(qp), u: b64(qu), i: b64(qi), texRef: tex };
}

(async () => {
  const parsed = JOBS.map(j => ({ ...j, ...parse(j.file) }));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const out = []; const texArr = [];
  for (const j of parsed) {
    const src = 'data:' + j.mime + ';base64,' + j.png.toString('base64');
    const jpeg = await page.evaluate(async (s) => { const img = new Image(); img.src = s; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); return { url: c.toDataURL('image/jpeg', 0.9), w: img.naturalWidth, h: img.naturalHeight }; }, src);
    const ti = texArr.push(jpeg.url) - 1; j.objs.forEach((o, k) => { const id = j.idp + (j.start + k); out.push(encObj(o, id, ti)); });
    console.log(j.idp + ' x' + j.objs.length, 'tex', jpeg.w + 'x' + jpeg.h, (jpeg.url.length / 1024).toFixed(0) + 'KB');
  }
  await browser.close();
  const body = 'var CITY_TEX = ' + JSON.stringify(texArr) + ';\nvar CITY_BUILDINGS = ' + JSON.stringify(out) + ';\nfor (var _i = 0; _i < CITY_BUILDINGS.length; _i++) CITY_BUILDINGS[_i].tex = CITY_TEX[CITY_BUILDINGS[_i].texRef];\n';
  fs.writeFileSync('/home/user/westchase_fps/citybuildings.js',
    '// citybuildings.js — CITY_BUILDINGS: user-imported generic city buildings for downtown.\n' +
    '// Categories: brick1-5 (rowhouses), citybiz1-10 (businesses+apartments), office1-5\n' +
    '// (mid-rises), highrise1. Same {q,dims,p,u,i,tex} scheme as SKYSCRAPERS; front on +Z.\n' +
    '// Placed via REMAP_MODELS (footprint-width uniform scale). Generated by tools/citygen.\n' + body);
  const kb = (body.length / 1024).toFixed(0);
  console.log('wrote citybuildings.js', kb + 'KB', '| entries', out.length);
  out.forEach(e => console.log('  ', e.id, 'dims', e.dims.join('x'), 'tris', e.tris));
})();
