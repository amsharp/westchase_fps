// Convert building GLBs -> SKYSCRAPERS {id,name,dims,q,tris,p,u,i,tex} entries.
// Matches decodeAirModel: base@y=0, X/Z centered, q=32767/maxAbs, UV raw-v (game
// applies 1-v flip), Uint16 indices. Texture -> native-res high-quality JPEG
// (no resize, honoring the no-downscale building-texture policy) via chromium.
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

function parseGLB(file) {
  const b = fs.readFileSync(file);
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.slice(20, 20 + jl).toString('utf8'));
  let off = 20 + jl, bin = null;
  while (off < b.length) { const len = b.readUInt32LE(off), t = b.readUInt32LE(off + 4); if (t === 0x004E4942) { bin = b.slice(off + 8, off + 8 + len); break; } off += 8 + len; }
  function acc(i) {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
    const s = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const comp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
    const C = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array, 5122: Int16Array, 5120: Int8Array }[a.componentType];
    return new C(bin.buffer, bin.byteOffset + s, a.count * comp);
  }
  function mul(a, c) { const o = new Array(16); for (let r = 0; r < 4; r++) for (let cc = 0; cc < 4; cc++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * c[cc * 4 + k]; o[cc * 4 + r] = s; } return o; }
  function trs(n) { if (n.matrix) return n.matrix.slice(); const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1]; const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2; return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0, (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1]; }
  const P = [], U = [], I = []; let base = 0;
  const scene = json.scenes[json.scene || 0];
  function walk(ni, parent) {
    const n = json.nodes[ni]; const m = mul(parent, trs(n));
    if (n.mesh != null) for (const pr of json.meshes[n.mesh].primitives) {
      const pos = acc(pr.attributes.POSITION), uv = pr.attributes.TEXCOORD_0 != null ? acc(pr.attributes.TEXCOORD_0) : null, idx = pr.indices != null ? acc(pr.indices) : null, vc = pos.length / 3;
      for (let v = 0; v < vc; v++) { const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
        P.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
        U.push(uv ? uv[v * 2] : 0, uv ? uv[v * 2 + 1] : 0); }
      if (idx) for (let k = 0; k < idx.length; k++) I.push(base + idx[k]); else for (let k = 0; k < vc; k++) I.push(base + k);
      base += vc;
    }
    if (n.children) for (const c of n.children) walk(c, m);
  }
  for (const ni of scene.nodes) walk(ni, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  // texture PNG bytes
  let png = null, mime = 'image/png';
  const mat = json.materials && json.materials[0];
  let imgIdx = 0;
  if (mat && mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorTexture) imgIdx = json.textures[mat.pbrMetallicRoughness.baseColorTexture.index].source;
  const im = json.images[imgIdx] || json.images[0];
  if (im) { const bv = json.bufferViews[im.bufferView]; mime = im.mimeType || 'image/png'; png = bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength); }
  return { P, U, I, png, mime };
}

function b64(u8) { return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64'); }

function buildEntry(id, name, m, texDataUrl) {
  const { P, U, I } = m;
  // bbox
  let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9, mnz = 1e9, mxz = -1e9;
  for (let i = 0; i < P.length; i += 3) { mnx = Math.min(mnx, P[i]); mxx = Math.max(mxx, P[i]); mny = Math.min(mny, P[i + 1]); mxy = Math.max(mxy, P[i + 1]); mnz = Math.min(mnz, P[i + 2]); mxz = Math.max(mxz, P[i + 2]); }
  const cx = (mnx + mxx) / 2, cz = (mnz + mxz) / 2, baseY = mny;  // center X/Z, base->0
  const dims = [mxx - mnx, mxy - mny, mxz - mnz];
  // translate + find maxAbs for q
  const tp = new Float32Array(P.length); let maxAbs = 0;
  for (let i = 0; i < P.length; i += 3) { const x = P[i] - cx, y = P[i + 1] - baseY, z = P[i + 2] - cz; tp[i] = x; tp[i + 1] = y; tp[i + 2] = z; maxAbs = Math.max(maxAbs, Math.abs(x), Math.abs(y), Math.abs(z)); }
  const q = 32760 / maxAbs;  // full Int16 range, tiny margin under 32767
  const qp = new Int16Array(tp.length);
  for (let i = 0; i < tp.length; i++) qp[i] = Math.max(-32767, Math.min(32767, Math.round(tp[i] * q)));
  // UV -> Uint16 (raw v; game does 1-v). clamp to [0,1] guard (atlas UVs)
  const qu = new Uint16Array(U.length);
  let uvOut = 0;
  for (let i = 0; i < U.length; i++) { let val = U[i]; if (val < 0) { val = 0; uvOut++; } if (val > 1) { val = 1; uvOut++; } qu[i] = Math.round(val * 8192); }
  const qi = new Uint16Array(I.length);
  for (let i = 0; i < I.length; i++) qi[i] = I[i];
  return {
    entry: { id, name, q, dims, tris: I.length / 3, p: b64(qp), u: b64(qu), i: b64(qi), tex: texDataUrl },
    stats: { verts: P.length / 3, tris: I.length / 3, dims, maxAbs, q, uvOut, maxVertIdx: Math.max.apply(null, I) }
  };
}

(async () => {
  const jobs = [
    { id: 'bbt', name: 'BB&T Building', file: '/root/.claude/uploads/6762ca26-85bb-50ae-aa02-dab118a4400c/282b8456-BBandTBuilding.glb' },
    { id: 'suntrust', name: 'SunTrust Skyscraper', file: '/root/.claude/uploads/6762ca26-85bb-50ae-aa02-dab118a4400c/4aa6e6f2-SuntrustSkyscraper.glb' }
  ];
  const parsed = jobs.map(j => ({ ...j, m: parseGLB(j.file) }));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const out = [];
  for (const j of parsed) {
    const srcPng = 'data:' + j.m.mime + ';base64,' + j.m.png.toString('base64');
    // native-resolution JPEG transcode (no resize) in the browser
    const jpeg = await page.evaluate(async (src) => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      return { url: c.toDataURL('image/jpeg', 0.92), w: img.naturalWidth, h: img.naturalHeight };
    }, srcPng);
    const { entry, stats } = buildEntry(j.id, j.name, j.m, jpeg.url);
    console.log(j.id, 'verts', stats.verts, 'tris', stats.tris, 'dims', stats.dims.map(d => d.toFixed(2)).join(' x '),
      'q', stats.q.toFixed(1), 'maxVertIdx', stats.maxVertIdx, 'uvClamped', stats.uvOut,
      'tex', jpeg.w + 'x' + jpeg.h, 'jpegKB', (entry.tex.length / 1024).toFixed(0));
    out.push(entry);
  }
  await browser.close();
  fs.writeFileSync('/tmp/claude-0/-home-user-westchase-fps/6762ca26-85bb-50ae-aa02-dab118a4400c/scratchpad/sky_entries.json', JSON.stringify(out));
  console.log('wrote sky_entries.json');
})();
