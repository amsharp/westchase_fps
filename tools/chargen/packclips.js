// Pack additional animation GLBs (same rig as the shared set) into
// work/shared_clips.json. Usage: node packclips.js anim_idle.glb:idle anim_chat.glb:chat ...
const fs = require('fs');
const path = require('path');
const SHARED = path.join(__dirname, 'work', 'shared_clips.json');
const shared = JSON.parse(fs.readFileSync(SHARED, 'utf8'));
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
for (const arg of process.argv.slice(2)) {
  const [file, name] = arg.split(':');
  const G = loadGLB(path.join(__dirname, 'work', file));
  const skin = G.json.skins[0];
  const joints = skin.joints;
  const jname = joints.map(n => G.json.nodes[n].name);
  if (JSON.stringify(jname) !== JSON.stringify(shared.names)) { console.error(name + ': bone names differ from shared set — SKIP'); continue; }
  const jIndexOfNode = {}; joints.forEach((n, i) => { jIndexOfNode[n] = i; });
  const parentOf = new Array(joints.length).fill(-1);
  G.json.nodes.forEach((node, ni) => {
    for (const c of node.children || []) if (jIndexOfNode[c] !== undefined && jIndexOfNode[ni] !== undefined) parentOf[jIndexOfNode[c]] = jIndexOfNode[ni];
  });
  const rootJi = parentOf.indexOf(-1);
  // armature scale (Meshy: 0.01) + model scale from mesh height (match walk)
  let ARM = 1;
  for (const n of G.json.nodes) if (n.scale && !n.translation && !n.rotation && n.children && n.children.length) ARM = n.scale[0];
  const meshNode = G.json.nodes.find(n => n.mesh !== undefined);
  const P = G.acc(G.json.meshes[meshNode.mesh].primitives[0].attributes.POSITION);
  let minY = 1e9, maxY = -1e9;
  for (let v = 0; v < P.length / 3; v++) { if (P[v * 3 + 1] < minY) minY = P[v * 3 + 1]; if (P[v * 3 + 1] > maxY) maxY = P[v * 3 + 1]; }
  const SCALE = 1.78 / (maxY - minY);
  const bindRootY = ((G.json.nodes[joints[rootJi]].translation || [0, 0, 0])[1] * ARM + -minY) * SCALE;
  const anim = G.json.animations[0];
  let dur = 0;
  for (const sm of anim.samplers) { const t = G.acc(sm.input); dur = Math.max(dur, t[t.length - 1]); }
  const frames = Math.max(2, Math.round(dur * FPS) + 1);
  const chans = {};
  for (const ch of anim.channels) {
    const ji = jIndexOfNode[ch.target.node];
    if (ji === undefined) continue;
    (chans[ji] = chans[ji] || {})[ch.target.path === 'rotation' ? 'r' : 't'] = { times: G.acc(anim.samplers[ch.sampler].input), vals: G.acc(anim.samplers[ch.sampler].output) };
  }
  function sample(tr, comp, t) {
    const { times, vals } = tr;
    let k = 0;
    while (k < times.length - 1 && times[k + 1] < t) k++;
    const k2 = Math.min(k + 1, times.length - 1);
    const f = k2 === k ? 0 : Math.max(0, Math.min(1, (t - times[k]) / (times[k2] - times[k])));
    if (comp === 4) {
      let dot = 0;
      for (let c = 0; c < 4; c++) dot += vals[k * 4 + c] * vals[k2 * 4 + c];
      const s = dot < 0 ? -1 : 1, o = [];
      for (let c = 0; c < 4; c++) o.push(vals[k * 4 + c] * (1 - f) + vals[k2 * 4 + c] * f * s);
      const L = Math.hypot(o[0], o[1], o[2], o[3]) || 1;
      return o.map(v => v / L);
    }
    const o = [];
    for (let c = 0; c < comp; c++) o.push(vals[k * comp + c] * (1 - f) + vals[k2 * comp + c] * f);
    return o;
  }
  const nj = joints.length;
  const rq = new Int16Array(frames * nj * 4);
  const rootY = new Int16Array(frames);
  // Meshy animation exports carry the root translation channel in METERS
  // while node bind translations are in cm under the Armature scale — auto
  // calibrate the channel unit so frame-0 root height matches the bind.
  const rootBindT = (G.json.nodes[joints[rootJi]].translation || [0, 0, 0])[1] * ARM;
  let unit = ARM;
  if (chans[rootJi] && chans[rootJi].t) {
    const p0 = sample(chans[rootJi].t, 3, 0);
    if (Math.abs(p0[1]) > 1e-4) unit = rootBindT / p0[1];
  }
  for (let fI = 0; fI < frames; fI++) {
    const t = fI / (frames - 1) * dur;
    for (let ji = 0; ji < nj; ji++) {
      const bind = G.json.nodes[joints[ji]].rotation || [0, 0, 0, 1];
      const q = (chans[ji] && chans[ji].r) ? sample(chans[ji].r, 4, t) : bind;
      for (let c = 0; c < 4; c++) rq[(fI * nj + ji) * 4 + c] = Math.round(q[c] * 16383);
    }
    if (chans[rootJi] && chans[rootJi].t) {
      const p = sample(chans[rootJi].t, 3, t);
      rootY[fI] = Math.round((p[1] * unit - rootBindT) * SCALE * 2000);
    }
  }
  shared.clips[name] = {
    d: +dur.toFixed(3), f: frames,
    q: Buffer.from(rq.buffer, rq.byteOffset, rq.byteLength).toString('base64'),
    y: Buffer.from(rootY.buffer, rootY.byteOffset, rootY.byteLength).toString('base64'),
  };
  console.log('packed', name, dur.toFixed(2) + 's', frames, 'frames');
}
fs.writeFileSync(SHARED, JSON.stringify(shared));
console.log('shared clips now:', Object.keys(shared.clips).join(', '));
