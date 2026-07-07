// Re-source the SHARED walk/run clips from hand-picked reference characters
// (user-approved gaits) instead of the original source rig, and recompute
// every character's per-clip FK ground clamp against the new clips.
//
//   node reshare_clips.js WALK_REF.glb RUN_REF.glb
//   (e.g. node reshare_clips.js work/BECCA_walk.glb work/DEALER_run.glb)
//
// Each re-sourced clip carries its OWN source bind (`bind`) — the runtime
// retarget delta q_clip * inv(bindSrc) * bindTgt must use the bind of the
// rig the clip was sampled from, or every other character inherits that
// rig's lean/stride errors. Updates work/shared_clips.json entries in place
// (walk/run only; idle/chat/etc keep the top-level bind) and rewrites both
// work/meshyskins_v3.json (per-char gy) and the game's meshychars.js.
const fs = require('fs');
const path = require('path');
const WORK = path.join(__dirname, 'work');
const FPS = 15;

const WALK_GLB = process.argv[2], RUN_GLB = process.argv[3];
if (!WALK_GLB || !RUN_GLB) { console.error('usage: node reshare_clips.js walkref.glb runref.glb'); process.exit(1); }

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

// ---- rig introspection (mirrors genskin.js) --------------------------------
function rigInfo(G) {
  const skin = G.json.skins[0];
  const joints = skin.joints;
  const jname = joints.map(n => G.json.nodes[n].name);
  const jIndexOfNode = {}; joints.forEach((n, i) => { jIndexOfNode[n] = i; });
  const parentOf = new Array(joints.length).fill(-1);
  G.json.nodes.forEach((node, ni) => {
    for (const c of node.children || []) {
      if (jIndexOfNode[c] !== undefined && jIndexOfNode[ni] !== undefined) parentOf[jIndexOfNode[c]] = jIndexOfNode[ni];
    }
  });
  let ARM_SCALE = 1;
  {
    const rootJointNode = joints[parentOf.indexOf(-1)];
    const parentChain = [];
    (function findPath(ni, p) {
      if (ni === rootJointNode) { parentChain.push(...p); return true; }
      for (const c of G.json.nodes[ni].children || []) if (findPath(c, p.concat(ni))) return true;
      return false;
    })(G.json.scenes[G.json.scene || 0].nodes[0], []);
    for (const ni of parentChain) {
      const n = G.json.nodes[ni];
      if (n.scale) ARM_SCALE *= n.scale[0];
    }
  }
  const meshNode = G.json.nodes.find(n => n.mesh !== undefined && n.skin !== undefined);
  const P = G.acc(G.json.meshes[meshNode.mesh].primitives[0].attributes.POSITION);
  let minY = 1e9, maxY = -1e9;
  for (let v = 0; v < P.length / 3; v++) { if (P[v * 3 + 1] < minY) minY = P[v * 3 + 1]; if (P[v * 3 + 1] > maxY) maxY = P[v * 3 + 1]; }
  const SCALE = 1.78 / (maxY - minY), YOFF = -minY;
  const bindT = [], bindR = [];
  joints.forEach((ni, i) => {
    const n = G.json.nodes[ni];
    const t = n.translation || [0, 0, 0], r = n.rotation || [0, 0, 0, 1];
    const isRoot = parentOf[i] < 0;
    bindT.push([t[0] * ARM_SCALE * SCALE, (t[1] * ARM_SCALE + (isRoot ? YOFF : 0)) * SCALE, t[2] * ARM_SCALE * SCALE]);
    bindR.push(r.slice());
  });
  return { joints, jname, jIndexOfNode, parentOf, ARM_SCALE, SCALE, YOFF, bindT, bindR };
}

// ---- clip resampling (mirrors genskin.js packClip) --------------------------
function packClip(G, rig, label) {
  const anim = G.json.animations[0];
  let dur = 0;
  for (const sm of anim.samplers) { const t = G.acc(sm.input); dur = Math.max(dur, t[t.length - 1]); }
  const frames = Math.max(2, Math.round(dur * FPS) + 1);
  const chans = {};
  for (const ch of anim.channels) {
    const ji = rig.jIndexOfNode[ch.target.node];
    if (ji === undefined) continue;
    const sm = anim.samplers[ch.sampler];
    (chans[ji] = chans[ji] || {})[ch.target.path === 'rotation' ? 'r' : ch.target.path === 'translation' ? 't' : 's'] =
      { times: G.acc(sm.input), vals: G.acc(sm.output) };
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
  const nj = rig.joints.length;
  const rq = new Int16Array(frames * nj * 4);
  const rootY = new Int16Array(frames);
  const rootJi = rig.parentOf.indexOf(-1);
  for (let fI = 0; fI < frames; fI++) {
    const t = fI / (frames - 1) * dur;
    for (let ji = 0; ji < nj; ji++) {
      const q = (chans[ji] && chans[ji].r) ? sample(chans[ji].r, 4, t) : rig.bindR[ji];
      for (let c = 0; c < 4; c++) rq[(fI * nj + ji) * 4 + c] = Math.round(q[c] * 16383);
    }
    if (chans[rootJi] && chans[rootJi].t) {
      const p = sample(chans[rootJi].t, 3, t);
      rootY[fI] = Math.round(((p[1] * rig.ARM_SCALE + rig.YOFF) * rig.SCALE - rig.bindT[rootJi][1]) * 2000);
    }
  }
  console.log(label, dur.toFixed(2) + 's', frames, 'frames');
  return {
    d: +dur.toFixed(3), f: frames,
    q: Buffer.from(rq.buffer, rq.byteOffset, rq.byteLength).toString('base64'),
    y: Buffer.from(rootY.buffer, rootY.byteOffset, rootY.byteLength).toString('base64'),
    bind: Buffer.from(new Int16Array(rig.bindR.flat().map(v => Math.round(v * 16383))).buffer).toString('base64'),
  };
}

// ---- quat helpers -----------------------------------------------------------
function qMul(a, b) {   // a * b
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] + a[1] * b[3] + a[2] * b[0] - a[0] * b[2],
    a[3] * b[2] + a[2] * b[3] + a[0] * b[1] - a[1] * b[0],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}
function qInv(a) { return [-a[0], -a[1], -a[2], a[3]]; }
function quatMat(q) {
  const [qx, qy, qz, qw] = q;
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2, wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return [1 - (yy + zz), xy + wz, xz - wy, xy - wz, 1 - (xx + zz), yz + wx, xz + wy, yz - wx, 1 - (xx + yy)];
}

// ---- per-character FK ground clamp against a retargeted shared clip --------
// bones = target skeleton; rotations = clip (source-local) * inv(bindSrc) * bindTgt
function fkGroundClamp(entry, clip, srcBindQ, srcNames) {
  const names = entry.skel.names, parents = entry.skel.parents, nj = names.length;
  const btB = Buffer.from(entry.skel.t, 'base64'), brB = Buffer.from(entry.skel.r, 'base64');
  const btQ = new Int16Array(btB.buffer, btB.byteOffset, btB.length / 2);
  const brQ = new Int16Array(brB.buffer, brB.byteOffset, brB.length / 2);
  const bindT = [], bindR = [];
  for (let i = 0; i < nj; i++) {
    bindT.push([btQ[i * 3] / 2000, btQ[i * 3 + 1] / 2000, btQ[i * 3 + 2] / 2000]);
    bindR.push([brQ[i * 4] / 16383, brQ[i * 4 + 1] / 16383, brQ[i * 4 + 2] / 16383, brQ[i * 4 + 3] / 16383]);
  }
  // map: shared joint order -> target joint index; post-delta per shared joint
  const map = srcNames.map(n => names.indexOf(n));
  const post = srcNames.map((n, si) => {
    const bi = map[si];
    return qMul(qInv(srcBindQ[si]), bi >= 0 ? bindR[bi] : [0, 0, 0, 1]);
  });
  const qb = Buffer.from(clip.q, 'base64'), yb = Buffer.from(clip.y, 'base64');
  const cq = new Int16Array(qb.buffer, qb.byteOffset, qb.length / 2);
  const cy = new Int16Array(yb.buffer, yb.byteOffset, yb.length / 2);
  const rootJi = parents.indexOf(-1);
  const toeIdx = [];
  names.forEach((n, i) => { if (/ToeBase|Foot/.test(n)) toeIdx.push(i); });

  function fkMinY(rotOf, rootYExtra) {
    const world = new Array(nj).fill(null);
    function calc(i) {
      if (world[i]) return world[i];
      const R = quatMat(rotOf(i));
      const t = bindT[i].slice();
      if (i === rootJi) t[1] += rootYExtra;
      if (parents[i] < 0) { world[i] = { R, t }; return world[i]; }
      const P = calc(parents[i]);
      const wt = [
        P.R[0] * t[0] + P.R[3] * t[1] + P.R[6] * t[2] + P.t[0],
        P.R[1] * t[0] + P.R[4] * t[1] + P.R[7] * t[2] + P.t[1],
        P.R[2] * t[0] + P.R[5] * t[1] + P.R[8] * t[2] + P.t[2]];
      const WR = [];
      for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) {
        WR[c * 3 + r] = P.R[r] * R[c * 3] + P.R[3 + r] * R[c * 3 + 1] + P.R[6 + r] * R[c * 3 + 2];
      }
      world[i] = { R: WR, t: wt };
      return world[i];
    }
    let m = 1e9;
    for (const ti of toeIdx) m = Math.min(m, calc(ti).t[1]);
    return m;
  }
  const bindMin = fkMinY(i => bindR[i], 0);
  let clipMin = 1e9;
  const nsrc = srcNames.length;
  for (let f = 0; f < clip.f; f++) {
    // target-joint rotation for this frame (bind pose where unmapped)
    const rot = bindR.map(r => r);
    const frameRot = new Array(nj).fill(null);
    for (let si = 0; si < nsrc; si++) {
      const bi = map[si];
      if (bi < 0) continue;
      const o = (f * nsrc + si) * 4;
      frameRot[bi] = qMul([cq[o] / 16383, cq[o + 1] / 16383, cq[o + 2] / 16383, cq[o + 3] / 16383], post[si]);
    }
    clipMin = Math.min(clipMin, fkMinY(i => frameRot[i] || bindR[i], cy[f] / 2000));
  }
  return +(bindMin - clipMin).toFixed(4);
}

// ---- main -------------------------------------------------------------------
const sharedFile = path.join(WORK, 'shared_clips.json');
const shared = JSON.parse(fs.readFileSync(sharedFile, 'utf8'));

const WG = loadGLB(WALK_GLB), RG = loadGLB(RUN_GLB);
const walkRig = rigInfo(WG), runRig = rigInfo(RG);
if (JSON.stringify(walkRig.jname) !== JSON.stringify(shared.names)) throw new Error('walk ref bone names differ from shared set');
if (JSON.stringify(runRig.jname) !== JSON.stringify(shared.names)) throw new Error('run ref bone names differ from shared set');

shared.clips.walk = packClip(WG, walkRig, 'walk <- ' + path.basename(WALK_GLB));
shared.clips.run = packClip(RG, runRig, 'run  <- ' + path.basename(RUN_GLB));
fs.writeFileSync(sharedFile, JSON.stringify(shared));
console.log('shared_clips.json updated (walk/run carry their own bind)');

// per-character ground clamps against the NEW clips
function bindQOf(b64) {
  const b = Buffer.from(b64, 'base64');
  const q = new Int16Array(b.buffer, b.byteOffset, b.length / 2);
  const out = [];
  for (let i = 0; i < q.length / 4; i++) out.push([q[i * 4] / 16383, q[i * 4 + 1] / 16383, q[i * 4 + 2] / 16383, q[i * 4 + 3] / 16383]);
  return out;
}
const walkBindQ = bindQOf(shared.clips.walk.bind);
const runBindQ = bindQOf(shared.clips.run.bind);
const listFile = path.join(WORK, 'meshyskins_v3.json');
const list = JSON.parse(fs.readFileSync(listFile, 'utf8'));
for (const e of list) {
  if (!e.clips || !e.clips.walk || !e.clips.walk.shared) continue;
  e.clips.walk = { d: shared.clips.walk.d, f: shared.clips.walk.f, gy: fkGroundClamp(e, shared.clips.walk, walkBindQ, shared.names), shared: 1 };
  e.clips.run = { d: shared.clips.run.d, f: shared.clips.run.f, gy: fkGroundClamp(e, shared.clips.run, runBindQ, shared.names), shared: 1 };
  console.log(e.n.padEnd(15), 'gy walk', e.clips.walk.gy, 'run', e.clips.run.gy);
}
fs.writeFileSync(listFile, JSON.stringify(list));

// rebuild the game data file
const TARGET = path.join(__dirname, '..', '..', 'meshychars.js');
const packed = { names: shared.names, bind: shared.bindR, clips: {} };
for (const k in shared.clips) {
  const c = shared.clips[k];
  packed.clips[k] = { d: c.d, f: c.f, q: c.q, y: c.y };
  if (c.bind) packed.clips[k].bind = c.bind;
}
const out = '// AI-generated PSX characters (gpt-image-1 seed -> Meshy image-to-3D ->\n' +
  '// rigging -> skinned conversion; see tools/chargen/). Loaded\n' +
  '// before game.js; safe to omit — the game checks typeof MESHY_CHARS.\n' +
  'var MESHY_SHARED_CLIPS = ' + JSON.stringify(packed) + ';\n' +
  'var MESHY_CHARS = ' + JSON.stringify(list) + ';\n';
new Function(out);
fs.writeFileSync(TARGET, out);
console.log('wrote', TARGET, '-', list.length, 'characters, ~' + Math.round(out.length / 1024) + 'KB');
