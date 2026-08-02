// Build CIV_HELI_MODEL (civheli.js) from the re-UV'd civilian helicopter GLB.
// SAME mesh as the police HELI_MODEL — only UVs + texture changed. So we map the
// new GLB (nose +Z, Blender scale) onto the old model's sim space (nose +X, skids
// at y=-skid) via a similarity transform (Ry90 + uniform scale + translate) fit to
// the body bbox, then REUSE the old part pivots. Geometry ends up identical to the
// police heli; only `u` (UVs) + `texCivilian` differ. Texture -> native-res JPEG.
const fs = require('fs'), vm = require('vm');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const GLB = '/root/.claude/uploads/6762ca26-85bb-50ae-aa02-dab118a4400c/9378527b-CivilianHelicopter.glb';
// node name in the new GLB -> part name in the model
const NODE2PART = { main: 'body', mainrotor: 'mainRotor', tailrotor: 'tailRotor' };

function parseGLB(file) {
  const b = fs.readFileSync(file);
  const jl = b.readUInt32LE(12), json = JSON.parse(b.slice(20, 20 + jl).toString('utf8'));
  let off = 20 + jl, bin = null;
  while (off < b.length) { const len = b.readUInt32LE(off), t = b.readUInt32LE(off + 4); if (t === 0x004E4942) { bin = b.slice(off + 8, off + 8 + len); break; } off += 8 + len; }
  function acc(i) { const a = json.accessors[i], bv = json.bufferViews[a.bufferView]; const s = (bv.byteOffset || 0) + (a.byteOffset || 0); const comp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type]; const C = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array, 5122: Int16Array, 5120: Int8Array }[a.componentType]; return new C(bin.buffer, bin.byteOffset + s, a.count * comp); }
  function trs(n) { if (n.matrix) return n.matrix.slice(); const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1]; const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2; return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0, (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1]; }
  const parts = {};
  const scene = json.scenes[json.scene || 0];
  (function walk(list, parent) {
    for (const ni of list) {
      const n = json.nodes[ni]; const m = mul(parent, trs(n));
      if (n.mesh != null && NODE2PART[n.name]) {
        const pr = json.meshes[n.mesh].primitives[0];
        const pos = acc(pr.attributes.POSITION), uv = pr.attributes.TEXCOORD_0 != null ? acc(pr.attributes.TEXCOORD_0) : null, idx = pr.indices != null ? acc(pr.indices) : null;
        const vc = pos.length / 3, P = new Float32Array(vc * 3), U = new Float32Array(vc * 2);
        for (let v = 0; v < vc; v++) { const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2]; P[v * 3] = m[0] * x + m[4] * y + m[8] * z + m[12]; P[v * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; P[v * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]; U[v * 2] = uv ? uv[v * 2] : 0; U[v * 2 + 1] = uv ? uv[v * 2 + 1] : 0; }
        const I = idx ? Array.from(idx) : Array.from({ length: vc }, (_, k) => k);
        parts[NODE2PART[n.name]] = { P, U, I };
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
  return { parts, png, mime };
}
function mul(a, c) { const o = new Array(16); for (let r = 0; r < 4; r++)for (let cc = 0; cc < 4; cc++) { let s = 0; for (let k = 0; k < 4; k++)s += a[k * 4 + r] * c[cc * 4 + k]; o[cc * 4 + r] = s; } return o; }

function bboxOf(P) { let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) { const v = P[i + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; } return { mn, mx, c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], s: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] }; }
const R = (p) => [p[2], p[1], -p[0]];   // Ry(+90): new +Z(nose) -> +X, +X -> -Z, +Y -> +Y

(async () => {
  // old model reference (pivots + body bbox for the fit)
  const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync('/home/user/westchase_fps/heli.js', 'utf8'), ctx);
  const OLD = ctx.HELI_MODEL;
  function oldWorld(name) { const e = OLD.parts[name]; const bb = Buffer.from(e.p, 'base64'); const qp = new Int16Array(bb.buffer, bb.byteOffset, Math.floor(bb.length / 2)); const P = new Float32Array(qp.length); for (let i = 0; i < qp.length; i += 3) { P[i] = qp[i] / OLD.q + e.pivot[0]; P[i + 1] = qp[i + 1] / OLD.q + e.pivot[1]; P[i + 2] = qp[i + 2] / OLD.q + e.pivot[2]; } return P; }
  const oldBody = bboxOf(oldWorld('body'));

  const NEW = parseGLB(GLB);
  // fit similarity to the BODY: R-space new-body bbox -> old-body bbox
  const nbRP = new Float32Array(NEW.parts.body.P.length);
  { const P = NEW.parts.body.P; for (let i = 0; i < P.length; i += 3) { const r = R([P[i], P[i + 1], P[i + 2]]); nbRP[i] = r[0]; nbRP[i + 1] = r[1]; nbRP[i + 2] = r[2]; } }
  const nbR = bboxOf(nbRP);
  const s = (oldBody.s[0] / nbR.s[0] + oldBody.s[1] / nbR.s[1] + oldBody.s[2] / nbR.s[2]) / 3;
  const t = [oldBody.c[0] - s * nbR.c[0], oldBody.c[1] - s * nbR.c[1], oldBody.c[2] - s * nbR.c[2]];
  const xform = (p) => { const r = R(p); return [s * r[0] + t[0], s * r[1] + t[1], s * r[2] + t[2]]; };
  console.log('fit: scale', s.toFixed(4), 't', t.map(v => v.toFixed(3)).join(','));

  // transform every part to sim space, keep OLD pivots, localGeo = sim - pivot
  const localParts = {}; let maxAbs = 0;
  for (const name of ['body', 'mainRotor', 'tailRotor']) {
    const src = NEW.parts[name], piv = OLD.parts[name].pivot;
    const P = src.P, L = new Float32Array(P.length);
    for (let i = 0; i < P.length; i += 3) { const w = xform([P[i], P[i + 1], P[i + 2]]); L[i] = w[0] - piv[0]; L[i + 1] = w[1] - piv[1]; L[i + 2] = w[2] - piv[2]; for (let a = 0; a < 3; a++) maxAbs = Math.max(maxAbs, Math.abs(L[i + a])); }
    localParts[name] = { L, U: src.U, I: src.I, pivot: piv, axis: OLD.parts[name].axis };
    // report vs old for sanity
    const nb = bboxOf(L);
    console.log(name.padEnd(10), 'localGeo x[' + nb.mn[0].toFixed(2) + ',' + nb.mx[0].toFixed(2) + '] y[' + nb.mn[1].toFixed(2) + ',' + nb.mx[1].toFixed(2) + '] z[' + nb.mn[2].toFixed(2) + ',' + nb.mx[2].toFixed(2) + ']', 'verts', P.length / 3, 'tris', src.I.length / 3);
  }
  const q = 32760 / maxAbs;
  function b64(u8) { return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64'); }
  function encPart(pp) {
    const qp = new Int16Array(pp.L.length); for (let i = 0; i < pp.L.length; i++) qp[i] = Math.max(-32767, Math.min(32767, Math.round(pp.L[i] * q)));
    const qu = new Uint16Array(pp.U.length); for (let i = 0; i < pp.U.length; i++) { let v = pp.U[i]; if (v < 0) v = 0; if (v > 1) v = 1; qu[i] = Math.round(v * 8192); }
    const qi = new Uint16Array(pp.I.length); for (let i = 0; i < pp.I.length; i++) qi[i] = pp.I[i];
    return { pivot: pp.pivot, axis: pp.axis, p: b64(qp), u: b64(qu), i: b64(qi) };
  }

  // texture: native-res JPEG (no resize)
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const srcPng = 'data:' + NEW.mime + ';base64,' + NEW.png.toString('base64');
  const jpeg = await page.evaluate(async (src) => { const img = new Image(); img.src = src; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); return { url: c.toDataURL('image/jpeg', 0.92), w: img.naturalWidth, h: img.naturalHeight }; }, srcPng);
  await browser.close();
  console.log('tex', jpeg.w + 'x' + jpeg.h, 'jpegKB', (jpeg.url.length / 1024).toFixed(0), 'q', q.toFixed(1));

  const model = { q: q, scale: OLD.scale, skid: OLD.skid, dims: OLD.dims, parts: { body: encPart(localParts.body), mainRotor: encPart(localParts.mainRotor), tailRotor: encPart(localParts.tailRotor) }, texCivilian: jpeg.url };
  const out = '// civheli.js — CIV_HELI_MODEL: player-flyable civilian helicopter.\n' +
    '// SAME AS350 mesh as heli.js HELI_MODEL, but with a re-authored UV layout +\n' +
    '// its own baked atlas (texCivilian). Geometry is mapped onto the same sim space\n' +
    '// as the police heli (nose +X, skids at y=-skid) and reuses the same part pivots,\n' +
    '// so it sits/flies/spins identically — only the skin differs. Loaded before\n' +
    '// game.js; game guards typeof CIV_HELI_MODEL. Same {q,parts:{pivot,axis,p,u,i}} scheme.\n' +
    'var CIV_HELI_MODEL = ' + JSON.stringify(model) + ';\n';
  fs.writeFileSync('/home/user/westchase_fps/civheli.js', out);
  console.log('wrote civheli.js', (out.length / 1024).toFixed(0) + 'KB');
})();
