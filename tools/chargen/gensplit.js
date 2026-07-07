// Split a Meshy rigged GLB (Mixamo-style bones, JOINTS_0/WEIGHTS_0) into the
// game's rigid-part format (same contract as PSX_MESH): head/torso/armL/armR/
// legL/legR with true bone pivots, quantized + base64. Downsamples the 4K
// texture to 256px with posterization for the PSX look, encodes JPEG via a
// headless canvas, and appends an entry to meshychars.js.
// Usage: node gensplit.js <rigged.glb> <NAME> [outJs]
const fs = require('fs');
const path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(require('path').join('/opt/node22/lib/node_modules', 'playwright'))); }

const file = process.argv[2], NAME = process.argv[3];
const OUTJS = process.argv[4] || 'meshychars_data.json';

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
const skin = json.skins[0];
const jointName = skin.joints.map(n => json.nodes[n].name);
// bind-pose joint positions via full affine IBM inversion (genpsx method)
const ibm = acc(skin.inverseBindMatrices);
const jointPos = {};
skin.joints.forEach((nodeIdx, j) => {
  const m = Array.from(ibm.slice(j * 16, j * 16 + 16));
  const R = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]];
  const det = R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1]) - R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0]) + R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]);
  const inv = [
    [(R[1][1] * R[2][2] - R[1][2] * R[2][1]) / det, (R[0][2] * R[2][1] - R[0][1] * R[2][2]) / det, (R[0][1] * R[1][2] - R[0][2] * R[1][1]) / det],
    [(R[1][2] * R[2][0] - R[1][0] * R[2][2]) / det, (R[0][0] * R[2][2] - R[0][2] * R[2][0]) / det, (R[0][2] * R[1][0] - R[0][0] * R[1][2]) / det],
    [(R[1][0] * R[2][1] - R[1][1] * R[2][0]) / det, (R[0][1] * R[2][0] - R[0][0] * R[2][1]) / det, (R[0][0] * R[1][1] - R[0][1] * R[1][0]) / det]
  ];
  const t = [m[12], m[13], m[14]];
  jointPos[jointName[j]] = [
    -(inv[0][0] * t[0] + inv[0][1] * t[1] + inv[0][2] * t[2]),
    -(inv[1][0] * t[0] + inv[1][1] * t[1] + inv[1][2] * t[2]),
    -(inv[2][0] * t[0] + inv[2][1] * t[1] + inv[2][2] * t[2])];
});
function partOfJoint(j) {
  const n = jointName[j];
  if (/^(neck|Head|head_end|headfront)$/i.test(n)) return 'head';
  if (/^Left(Arm|ForeArm|Hand)/.test(n)) return 'armL';
  if (/^Right(Arm|ForeArm|Hand)/.test(n)) return 'armR';
  if (/^Left(UpLeg|Leg|Foot|ToeBase)/.test(n)) return 'legL';
  if (/^Right(UpLeg|Leg|Foot|ToeBase)/.test(n)) return 'legR';
  return 'torso'; // Hips, Spine*, Shoulders
}

// mesh (single skinned primitive set expected)
const meshNodeIdx = json.nodes.findIndex(n => n.mesh !== undefined);
const mesh = json.meshes[json.nodes[meshNodeIdx].mesh];

// scale + ground: measure model bounds first
let minY = 1e9, maxY = -1e9;
for (const prim of mesh.primitives) {
  const P = acc(prim.attributes.POSITION);
  for (let v = 0; v < P.length / 3; v++) { const y = P[v * 3 + 1]; if (y < minY) minY = y; if (y > maxY) maxY = y; }
}
const SCALE = 1.78 / (maxY - minY);
const YOFF = -minY;
console.log('height', (maxY - minY).toFixed(3), '-> scale', SCALE.toFixed(4));

const parts = {};
function getPart(name) {
  if (!parts[name]) parts[name] = { pos: [], uv: [], idx: [], map: new Map() };
  return parts[name];
}
for (const prim of mesh.primitives) {
  const P = acc(prim.attributes.POSITION), U = acc(prim.attributes.TEXCOORD_0);
  const JN = acc(prim.attributes.JOINTS_0), W = acc(prim.attributes.WEIGHTS_0);
  const Idx = prim.indices !== undefined ? acc(prim.indices) : null;
  const vertPart = [];
  for (let v = 0; v < P.length / 3; v++) {
    let best = 0, bw = -1;
    for (let s = 0; s < 4; s++) if (W[v * 4 + s] > bw) { bw = W[v * 4 + s]; best = JN[v * 4 + s]; }
    vertPart.push(partOfJoint(best));
  }
  const triCount = (Idx ? Idx.length : P.length / 3) / 3;
  for (let t = 0; t < triCount; t++) {
    const vs = [0, 1, 2].map(k => Idx ? Idx[t * 3 + k] : t * 3 + k);
    // majority vote for the triangle's part
    const votes = {};
    for (const v of vs) votes[vertPart[v]] = (votes[vertPart[v]] || 0) + 1;
    const part = Object.keys(votes).sort((a, c) => votes[c] - votes[a])[0];
    const p = getPart(part);
    for (const v of vs) {
      const key = v;
      if (!p.map.has(key)) {
        p.map.set(key, p.pos.length / 3);
        p.pos.push(P[v * 3] * SCALE, (P[v * 3 + 1] + YOFF) * SCALE, P[v * 3 + 2] * SCALE);
        p.uv.push(U[v * 2], U[v * 2 + 1]);
      }
      p.idx.push(p.map.get(key));
    }
  }
}

// rig sanity: a healthy humanoid rig puts a solid chunk of the mesh on the
// torso bones. Meshy auto-rigging occasionally fails (torso weighted to an
// arm bone) — refuse to emit a broken character.
{
  const total = Object.values(parts).reduce((s, p) => s + p.idx.length / 3, 0);
  const missing = ['head', 'torso', 'armL', 'armR', 'legL', 'legR'].filter(k => !parts[k]);
  const torsoFrac = parts.torso ? (parts.torso.idx.length / 3) / total : 0;
  if (missing.length || torsoFrac < 0.12) {
    console.error('RIG SANITY FAILED: missing=[' + missing.join(',') + '] torsoFrac=' + torsoFrac.toFixed(2));
    console.error('The rigging task produced bad weights — re-run rigging (or remesh at a higher polycount and re-rig).');
    process.exit(1);
  }
}

// pivots (scaled, ground-offset)
function jp(n) { const p = jointPos[n]; return [p[0] * SCALE, (p[1] + YOFF) * SCALE, p[2] * SCALE]; }
const pivots = {
  head: [0, 0, 0], torso: [0, 0, 0],
  armL: jp('LeftArm'), armR: jp('RightArm'),
  legL: jp('LeftUpLeg'), legR: jp('RightUpLeg'),
};

// quantize + pack (same scheme as PSX_MESH: pos mm Int16 relative to pivot, uv ×8192 Uint16)
function b64(buf) { return Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength).toString('base64'); }
const packed = {};
for (const k in parts) {
  const p = parts[k], pv = pivots[k], n = p.pos.length / 3;
  const pos = new Int16Array(n * 3), uv = new Uint16Array(n * 2);
  for (let v = 0; v < n; v++) {
    pos[v * 3] = Math.round((p.pos[v * 3] - pv[0]) * 2000);
    pos[v * 3 + 1] = Math.round((p.pos[v * 3 + 1] - pv[1]) * 2000);
    pos[v * 3 + 2] = Math.round((p.pos[v * 3 + 2] - pv[2]) * 2000);
    // store raw GLB v — the game's loader applies the 1-v flip itself
    uv[v * 2] = Math.max(0, Math.min(65535, Math.round(p.uv[v * 2] * 8192)));
    uv[v * 2 + 1] = Math.max(0, Math.min(65535, Math.round(p.uv[v * 2 + 1] * 8192)));
  }
  const idx = new Uint16Array(p.idx);
  packed[k] = { pv: pv.map(x => +x.toFixed(4)), n, p: b64(pos), u: b64(uv), i: b64(idx) };
  console.log(k, n, 'verts', p.idx.length / 3, 'tris');
}

// texture: first image → 256px posterized JPEG via headless canvas
(async () => {
  const img0 = json.images[0];
  const bv = json.bufferViews[img0.bufferView];
  const texBuf = bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const jpeg = await page.evaluate(async (src) => {
    const img = new Image(); img.src = src;
    await new Promise(r => img.onload = r);
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(img, 0, 0, 256, 256);
    // slight posterize for the PSX crunch
    const d = g.getImageData(0, 0, 256, 256);
    for (let i = 0; i < d.data.length; i++) if ((i & 3) !== 3) d.data[i] = Math.round(d.data[i] / 12) * 12;
    g.putImageData(d, 0, 0);
    return c.toDataURL('image/jpeg', 0.85);
  }, 'data:' + (img0.mimeType || 'image/png') + ';base64,' + texBuf.toString('base64'));
  await browser.close();
  console.log('tex jpeg ~', Math.round(jpeg.length * 3 / 4 / 1024) + 'KB');

  const entry = { n: NAME, tex: jpeg, parts: packed };
  let list = [];
  if (fs.existsSync(OUTJS)) list = JSON.parse(fs.readFileSync(OUTJS, 'utf8'));
  const i = list.findIndex(e => e.n === NAME);
  if (i >= 0) list[i] = entry; else list.push(entry);
  fs.writeFileSync(OUTJS, JSON.stringify(list));
  const total = JSON.stringify(list).length;
  console.log('wrote', OUTJS, '(' + list.length + ' chars, ~' + Math.round(total / 1024) + 'KB total)');
})();
