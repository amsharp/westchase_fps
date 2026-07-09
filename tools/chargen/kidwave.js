// Kid wave runner: every gated kid seed -> charpipe (Meshy gen+rig) -> clip
// download -> genskin baked at the kid's REAL height (--height) with its OWN
// walk/run clips (auto-stride for little legs) -> race/sex/age tag ->
// kidskins JSON. Resumable: kids already in the output JSON are skipped.
// Mirrors staffwave.js but reads kid_roster.json and writes
// work/kidskins_data.json. State mirrored to work/kidstate.json for resume.
//   MESHY_API_KEY=... node kidwave.js [--only NAME,NAME] [--conc 4]
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const roster = require('./kid_roster.json').kids;
const WORK = path.join(__dirname, 'work');
const OUTJS = path.join(WORK, 'kidskins_data.json');
const STATE = path.join(WORK, 'kidstate.json');

function opt(flag, dflt) { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : dflt; }
const CONC = +opt('--conc', 4);
const ONLY = opt('--only', '') ? opt('--only', '').split(',') : null;

const names = Object.keys(roster);
const done = new Set(fs.existsSync(OUTJS) ? JSON.parse(fs.readFileSync(OUTJS, 'utf8')).map(e => e.n) : []);
const queue = names.filter(n =>
  (!ONLY || ONLY.includes(n)) && !done.has(n) && fs.existsSync(path.join(WORK, 'seed_' + n + '.png')));
console.log('queue:', queue.join(', ') || '(empty)');

function sh(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', c => c === 0 ? res() : rej(new Error('exit ' + c)));
  });
}
function saveState(obj) { fs.writeFileSync(STATE, JSON.stringify(obj, null, 1)); }

(async () => {
  const failures = [];
  const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { done: [], failed: [] };
  let idx = 0, genskinBusy = false;
  async function worker() {
    while (idx < queue.length) {
      const name = queue[idx++];
      const kid = roster[name];
      try {
        const seed = path.join(WORK, 'seed_' + name + '.png');
        const rigged = path.join(WORK, name + '_rigged.glb');
        if (!fs.existsSync(rigged)) await sh('node', [path.join(__dirname, 'charpipe.js'), name, seed, '--height', String(kid.h)]);
        const meta = JSON.parse(fs.readFileSync(path.join(WORK, name + '_anims.json'), 'utf8'));
        for (const [k, u] of [['walk', meta.walking_glb], ['run', meta.running_glb]]) {
          const f = path.join(WORK, name + '_' + k + '.glb');
          if (fs.existsSync(f)) continue;
          const r = await fetch(u);
          if (!r.ok) throw new Error(k + ' clip HTTP ' + r.status);
          fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
        }
        while (genskinBusy) await new Promise(r => setTimeout(r, 300));
        genskinBusy = true;
        try {
          // OWN clips (no --clips-from): kid strides differ from adults;
          // genskin auto-computes per-clip stride at the kid's scale.
          await sh('node', [path.join(__dirname, 'genskin.js'), name,
            path.join(WORK, name + '_walk.glb'), path.join(WORK, name + '_run.glb'),
            OUTJS, '--height', String(kid.h)]);
        } finally { genskinBusy = false; }
        state.done.push(name); saveState(state);
        console.log('DONE', name);
      } catch (e) { failures.push(name); state.failed.push(name); saveState(state); console.log('FAILED', name, String(e).slice(0, 180)); }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  // race/sex/age tags (h already set by genskin)
  const list = JSON.parse(fs.readFileSync(OUTJS, 'utf8'));
  for (const e of list) {
    const k = roster[e.n];
    if (!k) continue;
    e.role = 'kid'; e.race = k.race; e.sex = k.sex; e.age = k.age;
  }
  fs.writeFileSync(OUTJS, JSON.stringify(list));
  console.log('entries:', list.length, 'failures:', failures.join(',') || 'none');
  console.log('KIDWAVEDONE');
})();
