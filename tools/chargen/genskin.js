// Build a SKINNED character entry from Meshy's animated GLBs (the walking
// clip GLB carries mesh + skin + skeleton; the running GLB adds the second
// clip). Output: skeleton bind pose, skin weights, quantized geometry and
// 15 fps quaternion clips (root XZ motion stripped — the game moves
// characters itself). Appends to a meshyskins data JSON for
// merge_meshyskins.js.
//   node genskin.js NAME walk.glb run.glb [out.json]
const fs = require('fs');
const path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(require('path').join('/opt/node22/lib/node_modules', 'playwright'))); }

const NAME = process.argv[2], WALK = process.argv[3], RUN = process.argv[4];
const OUTJS = process.argv[5] || path.join(__dirname, 'work', 'meshyskins_data.json');
const FPS = 15;

function loadGLB(file) {
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
  return { json, bin, acc };
}

const W = loadGLB(WALK);
const skin = W.json.skins[0];
const joints = skin.joints;                       // node indices
const jname = joints.map(n => W.json.nodes[n].name);
const jIndexOfNode = {}; joints.forEach((n, i) => { jIndexOfNode[n] = i; });

// parent index (within joint list) per joint
const parentOf = new Array(joints.length).fill(-1);
W.json.nodes.forEach((node, ni) => {
  for (const c of node.children || []) {
    if (jIndexOfNode[c] !== undefined && jIndexOfNode[ni] !== undefined) parentOf[jIndexOfNode[c]] = jIndexOfNode[ni];
  }
});

// transforms ABOVE the root joint (Meshy: an "Armature" node with scale 0.01
// — joints are authored in centimeters, the mesh in meters). Only a plain
// uniform scale is supported; bake it into every joint-local translation.
let ARM_SCALE = 1;
{
  const rootJointNode = joints[parentOf.indexOf(-1)];
  const parentChain = [];
  (function findPath(ni, path) {
    if (ni === rootJointNode) { parentChain.push(...path); return true; }
    for (const c of W.json.nodes[ni].children || []) if (findPath(c, path.concat(ni))) return true;
    return false;
  })(W.json.scenes[W.json.scene || 0].nodes[0], []);
  for (const ni of parentChain) {
    const n = W.json.nodes[ni];
    if (n.rotation && n.rotation.some((v, i) => Math.abs(v - [0, 0, 0, 1][i]) > 1e-4)) throw new Error('armature rotation unsupported: node ' + (n.name || ni));
    if (n.translation && n.translation.some(v => Math.abs(v) > 1e-4)) throw new Error('armature translation unsupported: node ' + (n.name || ni));
    if (n.scale) {
      if (Math.abs(n.scale[0] - n.scale[1]) > 1e-6 || Math.abs(n.scale[0] - n.scale[2]) > 1e-6) throw new Error('non-uniform armature scale');
      ARM_SCALE *= n.scale[0];
    }
  }
  console.log('armature scale', ARM_SCALE);
}

// mesh + scale
const meshNode = W.json.nodes.find(n => n.mesh !== undefined && n.skin !== undefined);
const mesh = W.json.meshes[meshNode.mesh];
const prim = mesh.primitives[0];
const P = W.acc(prim.attributes.POSITION), U = W.acc(prim.attributes.TEXCOORD_0);
const JN = W.acc(prim.attributes.JOINTS_0), WT = W.acc(prim.attributes.WEIGHTS_0);
const IDX = W.acc(prim.indices);
let minY = 1e9, maxY = -1e9;
for (let v = 0; v < P.length / 3; v++) { if (P[v * 3 + 1] < minY) minY = P[v * 3 + 1]; if (P[v * 3 + 1] > maxY) maxY = P[v * 3 + 1]; }
const SCALE = 1.78 / (maxY - minY), YOFF = -minY;
console.log(NAME, 'height', (maxY - minY).toFixed(3), 'scale', SCALE.toFixed(4), 'verts', P.length / 3, 'tris', IDX.length / 3, 'joints', joints.length);

// bind-pose local TRS per joint (scaled translations; the whole model is
// uniformly rescaled, so bone translations scale too)
const bindT = [], bindR = [];
joints.forEach((ni, i) => {
  const n = W.json.nodes[ni];
  const t = n.translation || [0, 0, 0], r = n.rotation || [0, 0, 0, 1];
  // joint translations live in armature units (cm for Meshy) — bake the
  // armature scale in; the root also gets the ground offset (model units)
  const isRoot = parentOf[i] < 0;
  bindT.push([
    t[0] * ARM_SCALE * SCALE,
    (t[1] * ARM_SCALE + (isRoot ? YOFF : 0)) * SCALE,
    t[2] * ARM_SCALE * SCALE]);
  bindR.push(r.slice());
});

// clip resampling: uniform FPS, rotation for every joint + root Y position
function packClip(glb, label) {
  const anim = glb.json.animations[0];
  let dur = 0;
  for (const sm of anim.samplers) { const t = glb.acc(sm.input); dur = Math.max(dur, t[t.length - 1]); }
  const frames = Math.max(2, Math.round(dur * FPS) + 1);
  // channel lookup: joint -> {r:{times,vals}, t:{times,vals}}
  const chans = {};
  for (const ch of anim.channels) {
    const ji = jIndexOfNode[ch.target.node];
    if (ji === undefined) continue;
    const sm = anim.samplers[ch.sampler];
    (chans[ji] = chans[ji] || {})[ch.target.path === 'rotation' ? 'r' : ch.target.path === 'translation' ? 't' : 's'] =
      { times: glb.acc(sm.input), vals: glb.acc(sm.output) };
  }
  function sample(tr, comp, t) {
    const { times, vals } = tr;
    let k = 0;
    while (k < times.length - 1 && times[k + 1] < t) k++;
    const k2 = Math.min(k + 1, times.length - 1);
    const f = k2 === k ? 0 : Math.max(0, Math.min(1, (t - times[k]) / (times[k2] - times[k])));
    const o = [];
    if (comp === 4) {
      let dot = 0;
      for (let c = 0; c < 4; c++) dot += vals[k * 4 + c] * vals[k2 * 4 + c];
      const s = dot < 0 ? -1 : 1;
      for (let c = 0; c < 4; c++) o.push(vals[k * 4 + c] * (1 - f) + vals[k2 * 4 + c] * f * s);
      const L = Math.hypot(o[0], o[1], o[2], o[3]) || 1;
      return o.map(v => v / L);
    }
    for (let c = 0; c < comp; c++) o.push(vals[k * comp + c] * (1 - f) + vals[k2 * comp + c] * f);
    return o;
  }
  // rotations: Int16 quat per joint per frame; root Y offset: Int16 mm
  const rq = new Int16Array(frames * joints.length * 4);
  const rootY = new Int16Array(frames);
  const rootJi = parentOf.indexOf(-1);
  for (let fI = 0; fI < frames; fI++) {
    const t = fI / (frames - 1) * dur;
    for (let ji = 0; ji < joints.length; ji++) {
      const q = (chans[ji] && chans[ji].r) ? sample(chans[ji].r, 4, t) : bindR[ji];
      for (let c = 0; c < 4; c++) rq[(fI * joints.length + ji) * 4 + c] = Math.round(q[c] * 16383);
    }
    if (chans[rootJi] && chans[rootJi].t) {
      const p = sample(chans[rootJi].t, 3, t);
      // keep only vertical bob relative to bind (XZ root motion stripped);
      // clip translations are in armature units like the bind pose
      rootY[fI] = Math.round(((p[1] * ARM_SCALE + YOFF) * SCALE - bindT[rootJi][1]) * 2000);
    }
  }
  console.log(' ', label, dur.toFixed(2) + 's', frames, 'frames');
  return { d: +dur.toFixed(3), f: frames, q: Buffer.from(rq.buffer, rq.byteOffset, rq.byteLength).toString('base64'), y: Buffer.from(rootY.buffer, rootY.byteOffset, rootY.byteLength).toString('base64') };
}
const clips = { walk: packClip(W, 'walk'), run: packClip(loadGLB(RUN), 'run') };

// geometry: absolute quantized (no per-part pivots), weights normalized u8
const nv = P.length / 3;
const qp = new Int16Array(nv * 3), qu = new Uint16Array(nv * 2);
const si = new Uint8Array(nv * 4), sw = new Uint8Array(nv * 4);
for (let v = 0; v < nv; v++) {
  qp[v * 3] = Math.round(P[v * 3] * SCALE * 2000);
  qp[v * 3 + 1] = Math.round((P[v * 3 + 1] + YOFF) * SCALE * 2000);
  qp[v * 3 + 2] = Math.round(P[v * 3 + 2] * SCALE * 2000);
  qu[v * 2] = Math.max(0, Math.min(65535, Math.round(U[v * 2] * 8192)));
  qu[v * 2 + 1] = Math.max(0, Math.min(65535, Math.round(U[v * 2 + 1] * 8192)));
  let tot = 0;
  for (let s = 0; s < 4; s++) tot += WT[v * 4 + s];
  for (let s = 0; s < 4; s++) {
    si[v * 4 + s] = JN[v * 4 + s];
    sw[v * 4 + s] = Math.round(WT[v * 4 + s] / (tot || 1) * 255);
  }
}
const b64 = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');

(async () => {
  // texture -> 256px posterized JPEG
  const img0 = W.json.images[0];
  const bv = W.json.bufferViews[img0.bufferView];
  const texBuf = W.bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const jpeg = await page.evaluate(async (src) => {
    const img = new Image(); img.src = src;
    await new Promise(r => img.onload = r);
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, 256, 256);
    const d = g.getImageData(0, 0, 256, 256);
    for (let i = 0; i < d.data.length; i++) if ((i & 3) !== 3) d.data[i] = Math.round(d.data[i] / 12) * 12;
    g.putImageData(d, 0, 0);
    return c.toDataURL('image/jpeg', 0.85);
  }, 'data:' + (img0.mimeType || 'image/png') + ';base64,' + texBuf.toString('base64'));
  await browser.close();

  const entry = {
    n: NAME, tex: jpeg,
    skel: {
      names: jname, parents: parentOf,
      t: b64(new Int16Array(bindT.flat().map(v => Math.round(v * 2000)))),
      r: b64(new Int16Array(bindR.flat().map(v => Math.round(v * 16383)))),
    },
    geo: { nv, p: b64(qp), u: b64(qu), i: b64(IDX instanceof Uint16Array ? IDX : new Uint16Array(IDX)), si: b64(si), sw: b64(sw) },
    clips,
  };
  fs.mkdirSync(path.dirname(OUTJS), { recursive: true });
  let list = [];
  if (fs.existsSync(OUTJS)) list = JSON.parse(fs.readFileSync(OUTJS, 'utf8'));
  const i = list.findIndex(e => e.n === NAME);
  if (i >= 0) list[i] = entry; else list.push(entry);
  fs.writeFileSync(OUTJS, JSON.stringify(list));
  console.log('entry ~' + Math.round(JSON.stringify(entry).length / 1024) + 'KB ->', OUTJS, '(' + list.length + ' chars)');
})();
