// Measure each locomotion clip's authored STRIDE (game units of ground
// covered per gait cycle) and store it as `st` on the clip data. The game
// (animPerson) advances a gait clip by distance/stride cycles, so `st` is
// what keeps feet planted instead of skating: while a foot is on the ground
// its backward speed relative to the root equals the authored body speed;
// stride = that speed * clip duration.
//
// Method: FK the two ToeBase joints from the PACKED clip data (exactly what
// the game plays back, retarget deltas included for shared clips) at 60 Hz,
// take the median horizontal toe speed over "planted" samples (toe within
// 15% of its vertical range above its low point), per foot, averaged.
//
//   node stridecalc.js          patches meshychars.js in place (walk/run st
//                               per own-clip character + shared clip set) and
//                               mirrors st into work/meshyskins_v3.json and
//                               work/shared_clips.json for future rebuilds.
//
// Rerun after regenerating any clips (ownclips.js / reshare_clips.js).
const fs = require('fs');
const path = require('path');
const WORK = path.join(__dirname, 'work');
const TARGET = path.join(__dirname, '..', '..', 'meshychars.js');

const src = fs.readFileSync(TARGET, 'utf8');
const box = {};
new Function('box', src + ';box.CHARS=MESHY_CHARS;box.SHARED=typeof MESHY_SHARED_CLIPS!=="undefined"?MESHY_SHARED_CLIPS:null;')(box);
const CHARS = box.CHARS, SHARED = box.SHARED;
const header = src.slice(0, src.indexOf('var MESHY_SHARED_CLIPS'));

function b64i16(s) { const b = Buffer.from(s, 'base64'); return new Int16Array(b.buffer, b.byteOffset, b.length / 2); }
function qMul(a, b) {
  return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
          a[3] * b[1] + a[1] * b[3] + a[2] * b[0] - a[0] * b[2],
          a[3] * b[2] + a[2] * b[3] + a[0] * b[1] - a[1] * b[0],
          a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}
function qInv(a) { return [-a[0], -a[1], -a[2], a[3]]; }
function quatMat(q) {
  const [qx, qy, qz, qw] = q, x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2, wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return [1 - (yy + zz), xy + wz, xz - wy, xy - wz, 1 - (xx + zz), yz + wx, xz + wy, yz - wx, 1 - (xx + yy)];
}
function nlerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = d < 0 ? -1 : 1;
  const o = [a[0] * (1 - t) + b[0] * t * s, a[1] * (1 - t) + b[1] * t * s, a[2] * (1 - t) + b[2] * t * s, a[3] * (1 - t) + b[3] * t * s];
  const L = Math.hypot(o[0], o[1], o[2], o[3]) || 1;
  return [o[0] / L, o[1] / L, o[2] / L, o[3] / L];
}

// FK stride of a clip on one target skeleton.
//   clip: {d,f,q,y}  (q/y base64 or Int16Array)
//   map/post: shared-clip retarget (null for own clips)
function clipStride(entry, clip, map, post) {
  const names = entry.skel.names, parents = entry.skel.parents, nj = names.length;
  const bt = b64i16(entry.skel.t), br = b64i16(entry.skel.r);
  const bindT = [], bindR = [];
  for (let i = 0; i < nj; i++) {
    bindT.push([bt[i * 3] / 2000, bt[i * 3 + 1] / 2000, bt[i * 3 + 2] / 2000]);
    bindR.push([br[i * 4] / 16383, br[i * 4 + 1] / 16383, br[i * 4 + 2] / 16383, br[i * 4 + 3] / 16383]);
  }
  const q = clip.q instanceof Int16Array ? clip.q : b64i16(clip.q);
  const y = clip.y instanceof Int16Array ? clip.y : b64i16(clip.y);
  const rootJi = parents.indexOf(-1);
  const srcN = map ? map.length : nj;
  const toeIdx = []; names.forEach((n, i) => { if (/ToeBase/.test(n)) toeIdx.push(i); });
  // frame rotation of target joint i at frame f (with retarget delta)
  function rotAt(f, i) {
    let si = i;
    if (map) { si = map.indexOf(i); if (si < 0) return bindR[i]; }
    const o = (f * srcN + si) * 4;
    const cq = [q[o] / 16383, q[o + 1] / 16383, q[o + 2] / 16383, q[o + 3] / 16383];
    return post ? qMul(cq, post[si]) : cq;
  }
  const SUB = 4, N = (clip.f - 1) * SUB;   // 60 Hz over the 15 fps frames
  const feet = toeIdx.map(() => []);
  for (let s = 0; s <= N; s++) {
    const ft = s / SUB, f0 = Math.min(clip.f - 2, Math.floor(ft)), a = ft - f0, f1 = f0 + 1;
    const world = new Array(nj).fill(null);
    function calc(i) {
      if (world[i]) return world[i];
      const R = quatMat(nlerp(rotAt(f0, i), rotAt(f1, i), a));
      const t = bindT[i].slice();
      if (i === rootJi) t[1] += (clip.gy || 0) + (y[f0] / 2000) * (1 - a) + (y[f1] / 2000) * a;
      if (parents[i] < 0) { world[i] = { R, t }; return world[i]; }
      const P = calc(parents[i]);
      const wt = [
        P.R[0] * t[0] + P.R[3] * t[1] + P.R[6] * t[2] + P.t[0],
        P.R[1] * t[0] + P.R[4] * t[1] + P.R[7] * t[2] + P.t[1],
        P.R[2] * t[0] + P.R[5] * t[1] + P.R[8] * t[2] + P.t[2]];
      const WR = [];
      for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) WR[c * 3 + r] = P.R[r] * R[c * 3] + P.R[3 + r] * R[c * 3 + 1] + P.R[6 + r] * R[c * 3 + 2];
      world[i] = { R: WR, t: wt };
      return world[i];
    }
    toeIdx.forEach((ti, fi) => { const w = calc(ti); feet[fi].push({ x: w.t[0], y: w.t[1], z: w.t[2] }); });
  }
  const dt = clip.d / N, speeds = [];
  feet.forEach(F => {
    let mn = 1e9, mx = -1e9;
    F.forEach(p => { mn = Math.min(mn, p.y); mx = Math.max(mx, p.y); });
    const thr = mn + (mx - mn) * 0.15, vs = [];
    for (let s = 1; s <= N; s++) if (F[s].y < thr && F[s - 1].y < thr) vs.push(Math.hypot(F[s].x - F[s - 1].x, F[s].z - F[s - 1].z) / dt);
    vs.sort((a, b) => a - b);
    speeds.push(vs.length ? vs[Math.floor(vs.length / 2)] : 0);
  });
  const spd = speeds.reduce((a, b) => a + b, 0) / (speeds.length || 1);
  return +(spd * clip.d).toFixed(3);
}

const SANE = { walk: [1.0, 2.2], run: [2.0, 4.0] };
function checkSane(name, key, st) {
  const [lo, hi] = SANE[key];
  if (st < lo || st > hi) console.warn('  WARNING', name, key, 'stride', st, 'outside expected', lo + '-' + hi);
}

// ---- own clips --------------------------------------------------------------
for (const e of CHARS) {
  for (const key of ['walk', 'run']) {
    const c = e.clips && e.clips[key];
    if (!c || !c.q) continue;
    c.st = clipStride(e, c, null, null);
    checkSane(e.n, key, c.st);
    console.log(e.n.padEnd(16), key.padEnd(4), 'st', c.st);
  }
}

// ---- shared clips (walk/run): average over the characters that use them -----
if (SHARED) {
  const bindQOf = b64 => {
    const q = b64i16(b64), out = [];
    for (let i = 0; i < q.length / 4; i++) out.push([q[i * 4] / 16383, q[i * 4 + 1] / 16383, q[i * 4 + 2] / 16383, q[i * 4 + 3] / 16383]);
    return out;
  };
  for (const key of ['walk', 'run']) {
    const sh = SHARED.clips[key];
    if (!sh) continue;
    const srcBind = bindQOf(sh.bind || SHARED.bind);
    const vals = [];
    for (const e of CHARS) {
      if (e.clips && e.clips[key] && e.clips[key].q) continue;   // uses own clip
      const map = SHARED.names.map(n => e.skel.names.indexOf(n));
      const post = SHARED.names.map((n, si) => {
        const bi = map[si];
        let tgt = [0, 0, 0, 1];
        if (bi >= 0) {
          const br = b64i16(e.skel.r);
          tgt = [br[bi * 4] / 16383, br[bi * 4 + 1] / 16383, br[bi * 4 + 2] / 16383, br[bi * 4 + 3] / 16383];
        }
        return qMul(qInv(srcBind[si]), tgt);
      });
      const gy = e.clips && e.clips[key] ? e.clips[key].gy : 0;
      // shared FK maps source-joint order: adapt clip q layout via map/post
      const st = clipStride(e, { d: sh.d, f: sh.f, q: sh.q, y: sh.y, gy: gy }, map, post);
      vals.push(st);
      // store per-char too — the retargeted stride depends on leg lengths,
      // and getMeshySkin prefers the per-char value over the set average
      if (e.clips && e.clips[key]) e.clips[key].st = st;
      checkSane(e.n + ' (shared)', key, st);
    }
    sh.st = vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3) : null;
    checkSane('SHARED', key, sh.st);
    console.log('SHARED'.padEnd(16), key.padEnd(4), 'st', sh.st, '(' + vals.length + ' chars: ' + vals.map(v => v.toFixed(2)).join(' ') + ')');
  }
}

// ---- write back --------------------------------------------------------------
const out = header + 'var MESHY_SHARED_CLIPS = ' + JSON.stringify(SHARED) + ';\n' +
  'var MESHY_CHARS = ' + JSON.stringify(CHARS) + ';\n';
new Function(out);
fs.writeFileSync(TARGET, out);
console.log('wrote', TARGET, '~' + Math.round(out.length / 1024) + 'KB');

// mirror st into the work JSONs so ownclips/reshare rebuilds keep it
const v3f = path.join(WORK, 'meshyskins_v3.json');
if (fs.existsSync(v3f)) {
  const v3 = JSON.parse(fs.readFileSync(v3f, 'utf8'));
  for (const e of v3) {
    const g = CHARS.find(c => c.n === e.n);
    if (!g) continue;
    for (const key of ['walk', 'run']) {
      if (e.clips && e.clips[key] && g.clips[key] && g.clips[key].st !== undefined) e.clips[key].st = g.clips[key].st;
    }
  }
  fs.writeFileSync(v3f, JSON.stringify(v3));
  console.log('patched', v3f);
}
const shf = path.join(WORK, 'shared_clips.json');
if (fs.existsSync(shf) && SHARED) {
  const shj = JSON.parse(fs.readFileSync(shf, 'utf8'));
  for (const key of ['walk', 'run']) if (shj.clips[key] && SHARED.clips[key]) shj.clips[key].st = SHARED.clips[key].st;
  fs.writeFileSync(shf, JSON.stringify(shj));
  console.log('patched', shf);
}
