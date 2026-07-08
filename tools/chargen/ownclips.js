// Restore each character's OWN Meshy-provided walk/run clips (reverting the
// shared-clip retarget for locomotion). For every entry in
// work/meshyskins_v3.json with work/NAME_walk.glb + work/NAME_run.glb
// available, re-runs genskin.js (WITHOUT --clips-from) into a temp json and
// copies only that entry's clips.walk / clips.run (the full versions with
// q/y/d/f/gy) into the v3 entry — all other v3 fields (n, role, tex, skel,
// geo) are preserved. Characters without GLBs keep their shared-clip
// reference. Then rewrites work/meshyskins_v3.json and rebuilds the game's
// meshychars.js exactly like reshare_clips.js does (MESHY_SHARED_CLIPS block
// from work/shared_clips.json unchanged — idle/chat/talk/jab/hitpunch/
// hitshot and the shared walk/run stay available as fallback).
//   node ownclips.js [START END]   (optional entry index range, END exclusive)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const WORK = path.join(__dirname, 'work');

const listFile = path.join(WORK, 'meshyskins_v3.json');
const list = JSON.parse(fs.readFileSync(listFile, 'utf8'));
const START = process.argv[2] !== undefined ? +process.argv[2] : 0;
const END = process.argv[3] !== undefined ? +process.argv[3] : list.length;

const ok = [], missing = [], failed = [];
for (let i = START; i < END; i++) {
  const e = list[i];
  const walk = path.join(WORK, e.n + '_walk.glb');
  const run = path.join(WORK, e.n + '_run.glb');
  if (!fs.existsSync(walk) || !fs.existsSync(run)) {
    missing.push(e.n);
    console.log(e.n.padEnd(16), 'GLBs missing — keeping shared clips');
    continue;
  }
  const tmp = path.join(WORK, '_ownclips_tmp.json');
  try {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);   // fresh file — genskin appends
    execFileSync(process.execPath, [path.join(__dirname, 'genskin.js'), e.n, walk, run, tmp],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    const tent = JSON.parse(fs.readFileSync(tmp, 'utf8')).find(t => t.n === e.n);
    if (!tent || !tent.clips.walk.q || !tent.clips.run.q) throw new Error('temp entry lacks own clip q data');
    // own clips are applied by joint index at runtime — joint order must match
    if (JSON.stringify(tent.skel.names) !== JSON.stringify(e.skel.names)) throw new Error('joint order differs from v3 skel');
    e.clips.walk = tent.clips.walk;   // {d,f,q,y,gy}
    e.clips.run = tent.clips.run;
    ok.push(e.n);
    console.log(e.n.padEnd(16), 'own clips: walk', tent.clips.walk.f + 'f gy ' + tent.clips.walk.gy,
      '| run', tent.clips.run.f + 'f gy ' + tent.clips.run.gy);
  } catch (err) {
    failed.push(e.n + ' (' + String(err.message || err).split('\n')[0].slice(0, 120) + ')');
    console.log(e.n.padEnd(16), 'FAILED — keeping shared clips:', String(err.message || err).split('\n')[0]);
  }
}
const tmp = path.join(WORK, '_ownclips_tmp.json');
if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
fs.writeFileSync(listFile, JSON.stringify(list));
console.log('\nupdated', listFile);
console.log('own clips:', ok.length, '| missing GLBs:', missing.join(', ') || 'none', '| failed:', failed.join(', ') || 'none');

// ---- rebuild the game data file (same as reshare_clips.js) -----------------
const shared = JSON.parse(fs.readFileSync(path.join(WORK, 'shared_clips.json'), 'utf8'));
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
