// genarms.js — convert the "PSX First Person Arms" skinned GLB into
// meshyarms.js, a plain-script data file the game can load before game.js
// (game guards with `typeof MESHY_ARMS`). Node-only, no npm deps.
//
//   node genarms.js [arms_rig.glb] [arms_01.png] [out meshyarms.js]
//
// Output: MESHY_ARMS = { tex, skel{names,parents,t,r,s}, geo{nv,q,p,u,i,si,sw},
// clips{idle,jabL,jabR,relax,grab,push} } — see tools/armgen/README.md.
//
// Kept clips (GLB name -> key): guard_idle->idle, jab.L->jabL, jab.R->jabR,
// relax->relax, grab.R->grab, push.R->push. Channels carry BOTH translation
// and rotation per joint (IK was baked); both are sampled at 15 fps.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC = '/tmp/claude-0/-home-user-westchase-fps/6762ca26-85bb-50ae-aa02-dab118a4400c/scratchpad/assets/psxfirstpersonarmsfreegameassets';
const GLB = process.argv[2] || path.join(SRC, 'arms_rig.glb');
const TEX = process.argv[3] || path.join(SRC, 'arms_01.png');
const OUT = process.argv[4] || path.join(__dirname, '..', '..', 'meshyarms.js');
const FPS = 15;
const CLIP_MAP = { 'guard_idle': 'idle', 'jab.L': 'jabL', 'jab.R': 'jabR', 'relax': 'relax', 'grab.R': 'grab', 'push.R': 'push' };

// ---- GLB parsing (pattern from tools/chargen/genskin.js) -------------------
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
    // GOTCHA: bin is a pooled Buffer view — must honor byteOffset, and typed
    // arrays additionally require element alignment; copy when misaligned.
    const start2 = bin.byteOffset + start;
    if (start2 % C.BYTES_PER_ELEMENT === 0) return new C(bin.buffer, start2, n);
    const cp = new Uint8Array(n * C.BYTES_PER_ELEMENT);
    cp.set(new Uint8Array(bin.buffer, start2, cp.length));
    return new C(cp.buffer, 0, n);
  }
  return { json, bin, acc };
}

const G = loadGLB(GLB);
const skin = G.json.skins[0];
const joints = skin.joints;                                  // node indices
const jname = joints.map(n => G.json.nodes[n].name);
const jIndexOfNode = {}; joints.forEach((n, i) => { jIndexOfNode[n] = i; });

// node -> parent node map (whole graph, for armature-chain checks)
const nodeParent = {};
G.json.nodes.forEach((node, ni) => { for (const c of node.children || []) nodeParent[c] = ni; });

// parent index within the joint list; -1 = root (parent isn't a joint)
const parentOf = joints.map(ni => {
  const p = nodeParent[ni];
  return (p !== undefined && jIndexOfNode[p] !== undefined) ? jIndexOfNode[p] : -1;
});

// ---- armature transform above root joints (Meshy had scale 0.01; this is a
// Blender export so expect 1 — but VERIFY and bake any uniform scale) --------
let ARM_SCALE = 1, armChecked = false;
parentOf.forEach((p, i) => {
  if (p !== -1) return;
  let scale = 1;
  for (let ni = nodeParent[joints[i]]; ni !== undefined; ni = nodeParent[ni]) {
    const n = G.json.nodes[ni];
    if (n.rotation && n.rotation.some((v, k) => Math.abs(v - [0, 0, 0, 1][k]) > 1e-4)) throw new Error('armature rotation unsupported: ' + (n.name || ni));
    if (n.translation && n.translation.some(v => Math.abs(v) > 1e-4)) throw new Error('armature translation unsupported: ' + (n.name || ni));
    if (n.scale) {
      if (Math.abs(n.scale[0] - n.scale[1]) > 1e-4 || Math.abs(n.scale[0] - n.scale[2]) > 1e-4) throw new Error('non-uniform armature scale: ' + (n.name || ni));
      scale *= n.scale[0];
    }
  }
  if (!armChecked) { ARM_SCALE = scale; armChecked = true; }
  else if (Math.abs(scale - ARM_SCALE) > 1e-6) throw new Error('root joints under different armature scales');
});
console.log('joints', joints.length, '| armature scale', ARM_SCALE, ARM_SCALE === 1 ? '(nothing to bake)' : '(baked into translations)');

// ---- bind pose: node-local TRS per joint (Float32, scale baked into t) -----
const bindT = new Float32Array(joints.length * 3);
const bindR = new Float32Array(joints.length * 4);
const bindS = new Float32Array(joints.length * 3);
joints.forEach((ni, i) => {
  const n = G.json.nodes[ni];
  const t = n.translation || [0, 0, 0], r = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
  for (let c = 0; c < 3; c++) bindT[i * 3 + c] = t[c] * ARM_SCALE;
  for (let c = 0; c < 4; c++) bindR[i * 4 + c] = r[c];
  for (let c = 0; c < 3; c++) bindS[i * 3 + c] = s[c];
});

// ---- geometry ---------------------------------------------------------------
const meshNode = G.json.nodes.find(n => n.mesh !== undefined && n.skin !== undefined);
if (meshNode.translation || meshNode.rotation || meshNode.scale) throw new Error('skinned mesh node has a transform — bake it first');
const prim = G.json.meshes[meshNode.mesh].primitives[0];
const P = G.acc(prim.attributes.POSITION), U = G.acc(prim.attributes.TEXCOORD_0);
const JN = G.acc(prim.attributes.JOINTS_0), WT = G.acc(prim.attributes.WEIGHTS_0);
const IDX = G.acc(prim.indices);
const nv = P.length / 3;

// GOTCHA 3: quantization divisor from the values actually stored
let maxAbs = 0;
for (let k = 0; k < P.length; k++) if (Math.abs(P[k]) > maxAbs) maxAbs = Math.abs(P[k]);
const Q = 32000 / maxAbs;
const qp = new Int16Array(nv * 3), qu = new Uint16Array(nv * 2);
const si = new Uint8Array(nv * 4), sw = new Uint8Array(nv * 4);
for (let v = 0; v < nv; v++) {
  for (let c = 0; c < 3; c++) qp[v * 3 + c] = Math.round(P[v * 3 + c] * Q);
  qu[v * 2] = Math.max(0, Math.min(65535, Math.round(U[v * 2] * 8192)));
  qu[v * 2 + 1] = Math.max(0, Math.min(65535, Math.round(U[v * 2 + 1] * 8192)));
  let tot = 0;
  for (let s = 0; s < 4; s++) tot += WT[v * 4 + s];
  let sum = 0, maxK = 0;
  for (let s = 0; s < 4; s++) {
    si[v * 4 + s] = JN[v * 4 + s];
    sw[v * 4 + s] = Math.round(WT[v * 4 + s] / (tot || 1) * 255);
    sum += sw[v * 4 + s];
    if (sw[v * 4 + s] > sw[v * 4 + maxK]) maxK = s;
  }
  sw[v * 4 + maxK] += 255 - sum;                             // exact 255 sum
}
let maxIdx = 0;
for (const x of IDX) if (x > maxIdx) maxIdx = x;
const i32 = maxIdx > 65535;
const idxOut = i32 ? (IDX instanceof Uint32Array ? IDX : new Uint32Array(IDX))
                   : (IDX instanceof Uint16Array ? IDX : new Uint16Array(IDX));
console.log('verts', nv, '| tris', IDX.length / 3, '| pos maxAbs', maxAbs.toFixed(4), '| q', Q.toFixed(2), '| indices', i32 ? 'u32' : 'u16');

// ---- clip sampling (15 fps, translation lerp + rotation nlerp) --------------
function sample(tr, comp, t) {
  const times = tr.times, vals = tr.vals;
  let k = 0;
  while (k < times.length - 1 && times[k + 1] < t) k++;
  const k2 = Math.min(k + 1, times.length - 1);
  const f = k2 === k ? 0 : Math.max(0, Math.min(1, (t - times[k]) / (times[k2] - times[k])));
  const o = [];
  if (comp === 4) {                                          // hemisphere-corrected nlerp
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

function packClip(anim, key) {
  let dur = 0;
  for (const sm of anim.samplers) { const t = G.acc(sm.input); dur = Math.max(dur, t[t.length - 1]); }
  const frames = Math.max(2, Math.round(dur * FPS) + 1);
  const chans = {};                                          // joint -> {r,t}
  for (const ch of anim.channels) {
    const ji = jIndexOfNode[ch.target.node];
    if (ji === undefined || ch.target.path === 'scale') continue;
    const sm = anim.samplers[ch.sampler];
    (chans[ji] = chans[ji] || {})[ch.target.path === 'rotation' ? 'r' : 't'] =
      { times: G.acc(sm.input), vals: G.acc(sm.output) };
  }
  const nj = joints.length;
  const rq = new Int16Array(frames * nj * 4);
  const tf = new Float32Array(frames * nj * 3);              // pre-quantization
  let maxT = 0;
  for (let fI = 0; fI < frames; fI++) {
    const t = fI / (frames - 1) * dur;
    for (let ji = 0; ji < nj; ji++) {
      const c = chans[ji];
      const q = (c && c.r) ? sample(c.r, 4, t) : [bindR[ji * 4], bindR[ji * 4 + 1], bindR[ji * 4 + 2], bindR[ji * 4 + 3]];
      for (let k = 0; k < 4; k++) rq[(fI * nj + ji) * 4 + k] = Math.max(-32767, Math.min(32767, Math.round(q[k] * 16384)));
      const tr = (c && c.t) ? sample(c.t, 3, t).map(v => v * ARM_SCALE)
                            : [bindT[ji * 3], bindT[ji * 3 + 1], bindT[ji * 3 + 2]];
      for (let k = 0; k < 3; k++) {
        tf[(fI * nj + ji) * 3 + k] = tr[k];
        if (Math.abs(tr[k]) > maxT) maxT = Math.abs(tr[k]);
      }
    }
  }
  // GOTCHA 4: default *1024 fixed point; per-clip ts if it would overflow Int16
  let ts = 1024;
  if (maxT * 1024 > 32000) ts = Math.floor(32000 / maxT);
  const tq = new Int16Array(tf.length);
  for (let k = 0; k < tf.length; k++) tq[k] = Math.round(tf[k] * ts);
  console.log(' ', key.padEnd(6), dur.toFixed(3) + 's', frames, 'frames', '| max|t|', maxT.toFixed(3), ts !== 1024 ? '| ts ' + ts : '');
  const clip = { d: +dur.toFixed(3), f: frames, q: b64(rq), t: b64(tq) };
  if (ts !== 1024) clip.ts = ts;
  return clip;
}

const b64 = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const clips = {};
for (const anim of G.json.animations) {
  const key = CLIP_MAP[anim.name];
  if (key) clips[key] = packClip(anim, key);
}
for (const k of Object.values(CLIP_MAP)) if (!clips[k]) throw new Error('clip missing from GLB: ' + k);

// ---- texture: pick smaller of external png vs embedded, then re-encode the
// 16-bit RGBA source to 8-bit (browser precision anyway) with palette/filter
// optimization — pure zlib PNG codec below ------------------------------------
function pngDecode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504E47) throw new Error('not a png');
  let off = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.slice(off + 4, off + 8).toString('ascii');
    if (type === 'IHDR') { w = buf.readUInt32BE(off + 8); h = buf.readUInt32BE(off + 12); depth = buf[off + 16]; ctype = buf[off + 17]; interlace = buf[off + 20]; }
    if (type === 'IDAT') idat.push(buf.slice(off + 8, off + 8 + len));
    off += 12 + len;
    if (type === 'IEND') break;
  }
  if (interlace) throw new Error('interlaced png unsupported');
  if (!(depth === 8 || depth === 16) || !(ctype === 2 || ctype === 6)) throw new Error('png depth/ctype unsupported: ' + depth + '/' + ctype);
  const nch = ctype === 6 ? 4 : 3, bpp = nch * (depth / 8), stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const img = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? img[y * stride + x - bpp] : 0;
      const b = y > 0 ? img[(y - 1) * stride + x] : 0;
      const c = (x >= bpp && y > 0) ? img[(y - 1) * stride + x - bpp] : 0;
      let v = raw[y * (stride + 1) + 1 + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc) ? b : c; }
      img[y * stride + x] = v & 255;
    }
  }
  // -> 8-bit RGBA
  const rgba = Buffer.alloc(w * h * 4);
  const step = depth / 8;
  for (let p = 0; p < w * h; p++) {
    for (let c = 0; c < 3; c++) rgba[p * 4 + c] = img[(p * nch + c) * step];   // big-endian high byte
    rgba[p * 4 + 3] = nch === 4 ? img[(p * nch + 3) * step] : 255;
  }
  return { w, h, rgba };
}

const CRC_T = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const o = Buffer.alloc(12 + data.length);
  o.writeUInt32BE(data.length, 0); o.write(type, 4, 'ascii'); data.copy(o, 8);
  o.writeUInt32BE(crc32(o.slice(4, 8 + data.length)), 8 + data.length);
  return o;
}
function filterScan(pix, w, h, bpp) {                        // per-row min-sum-abs heuristic
  const stride = w * bpp, out = Buffer.alloc(h * (stride + 1));
  const cand = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    let best = -1, bestSum = Infinity, bestBuf = null;
    for (let f = 0; f < 5; f++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const cur = pix[y * stride + x];
        const a = x >= bpp ? pix[y * stride + x - bpp] : 0;
        const b = y > 0 ? pix[(y - 1) * stride + x] : 0;
        const c = (x >= bpp && y > 0) ? pix[(y - 1) * stride + x - bpp] : 0;
        let v;
        if (f === 0) v = cur; else if (f === 1) v = cur - a; else if (f === 2) v = cur - b;
        else if (f === 3) v = cur - ((a + b) >> 1);
        else { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = cur - ((pa <= pb && pa <= pc) ? a : (pb <= pc) ? b : c); }
        v &= 255; cand[x] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = f; bestBuf = Buffer.from(cand); }
    }
    out[y * (stride + 1)] = best;
    bestBuf.copy(out, y * (stride + 1) + 1);
  }
  return out;
}
function pngEncode(w, h, rgba) {
  let opaque = true;
  for (let p = 0; p < w * h && opaque; p++) if (rgba[p * 4 + 3] !== 255) opaque = false;
  const colors = new Map();
  for (let p = 0; p < w * h && colors.size <= 256; p++) {
    const k = ((rgba[p * 4] << 24) | (rgba[p * 4 + 1] << 16) | (rgba[p * 4 + 2] << 8) | rgba[p * 4 + 3]) >>> 0;
    if (!colors.has(k)) colors.set(k, colors.size);
  }
  let ctype, bpp, pix, plte = null, trns = null;
  if (colors.size <= 256) {                                  // palette
    ctype = 3; bpp = 1;
    pix = Buffer.alloc(w * h);
    plte = Buffer.alloc(colors.size * 3);
    let anyA = false;
    for (const [k, i] of colors) {
      plte[i * 3] = (k >>> 24) & 255; plte[i * 3 + 1] = (k >>> 16) & 255; plte[i * 3 + 2] = (k >>> 8) & 255;
      if ((k & 255) !== 255) anyA = true;
    }
    if (anyA) { trns = Buffer.alloc(colors.size); for (const [k, i] of colors) trns[i] = k & 255; }
    for (let p = 0; p < w * h; p++) pix[p] = colors.get(((rgba[p * 4] << 24) | (rgba[p * 4 + 1] << 16) | (rgba[p * 4 + 2] << 8) | rgba[p * 4 + 3]) >>> 0);
  } else if (opaque) {
    ctype = 2; bpp = 3;
    pix = Buffer.alloc(w * h * 3);
    for (let p = 0; p < w * h; p++) { pix[p * 3] = rgba[p * 4]; pix[p * 3 + 1] = rgba[p * 4 + 1]; pix[p * 3 + 2] = rgba[p * 4 + 2]; }
  } else { ctype = 6; bpp = 4; pix = Buffer.from(rgba); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = ctype;
  const idat = zlib.deflateSync(filterScan(pix, w, h, bpp), { level: 9, memLevel: 9 });
  const parts = [Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr)];
  if (plte) parts.push(chunk('PLTE', plte));
  if (trns) parts.push(chunk('tRNS', trns));
  parts.push(chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

// external file vs embedded glb image — use whichever is smaller (task spec)
let texSrc = fs.readFileSync(TEX), texFrom = path.basename(TEX);
const img0 = (G.json.images || [])[0];
if (img0 && img0.bufferView !== undefined) {
  const bv = G.json.bufferViews[img0.bufferView];
  const emb = G.bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  if (emb.length < texSrc.length) { texSrc = Buffer.from(emb); texFrom = 'embedded glb image'; }
}
const dec = pngDecode(texSrc);
const reenc = pngEncode(dec.w, dec.h, dec.rgba);
console.log('texture', texFrom, dec.w + 'x' + dec.h, texSrc.length, 'B ->', reenc.length, 'B re-encoded (8-bit)');
const texOut = reenc.length < texSrc.length ? reenc : texSrc;
const texURL = 'data:image/png;base64,' + texOut.toString('base64');

// ---- emit -------------------------------------------------------------------
const data = {
  tex: texURL,
  skel: {
    names: jname,
    parents: parentOf,
    t: b64(bindT), r: b64(bindR), s: b64(bindS),
  },
  geo: (() => {
    const g = { nv, q: +Q.toFixed(4), p: b64(qp), u: b64(qu), i: b64(idxOut), si: b64(si), sw: b64(sw) };
    if (i32) g.i32 = 1;
    return g;
  })(),
  clips,
};
const js = "// PSX first-person arms (asset: 'PSX First Person Arms' free pack; see README credits)\n" +
  '// converted by tools/armgen/genarms.js. Optional: game checks typeof MESHY_ARMS.\n' +
  'var MESHY_ARMS = ' + JSON.stringify(data) + ';\n';
fs.writeFileSync(OUT, js);
console.log('wrote', OUT, Math.round(js.length / 1024) + 'KB');
