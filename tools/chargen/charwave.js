// Wave runner: every gated seed -> charpipe -> clip download -> genskin
// (shared clips) -> role tag -> merged data JSON. Resumable: characters with
// an entry in the output JSON are skipped; charpipe skips finished rigs via
// its own work products only if you keep them.
//   MESHY_API_KEY=... node charwave.js [--only NAME,NAME] [--conc 4]
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const roster = require('./roster.json');
const WORK = path.join(__dirname, 'work');
const OUTJS = path.join(WORK, 'meshyskins_v3.json');

function opt(flag, dflt) { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : dflt; }
const CONC = +opt('--conc', 4);
const ONLY = opt('--only', '') ? opt('--only', '').split(',') : null;

const roleOf = {};
for (const n in roster.civs) roleOf[n] = 'civ';
for (const n in roster.cops) roleOf[n] = 'cop';
roleOf.CLERK = 'clerk'; roleOf.DEALER = 'dealer';

const done = new Set(fs.existsSync(OUTJS) ? JSON.parse(fs.readFileSync(OUTJS, 'utf8')).map(e => e.n) : []);
const queue = Object.keys(roleOf).filter(n =>
  (!ONLY || ONLY.includes(n)) && !done.has(n) && fs.existsSync(path.join(WORK, 'seed_' + n + '.png')));
console.log('queue:', queue.join(', ') || '(empty)');

(async () => {
  const failures = [];
  const { spawn } = require('child_process');
  function sh(cmd, args) {
    return new Promise((res, rej) => {
      const p = spawn(cmd, args, { stdio: 'inherit' });
      p.on('exit', c => c === 0 ? res() : rej(new Error('exit ' + c)));
    });
  }
  let idx = 0;
  async function worker2() {
    while (idx < queue.length) {
      const name = queue[idx++];
      try {
        const seed = path.join(WORK, 'seed_' + name + '.png');
        const rigged = path.join(WORK, name + '_rigged.glb');
        if (!fs.existsSync(rigged)) await sh('node', [path.join(__dirname, 'charpipe.js'), name, seed]);
        const meta = JSON.parse(fs.readFileSync(path.join(WORK, name + '_anims.json'), 'utf8'));
        for (const [k, u] of [['walk', meta.walking_glb], ['run', meta.running_glb]]) {
          const f = path.join(WORK, name + '_' + k + '.glb');
          if (fs.existsSync(f)) continue;
          const r = await fetch(u);
          if (!r.ok) throw new Error(k + ' clip HTTP ' + r.status);
          fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
        }
        // genskin appends to a shared JSON — serialize via a queue lock
        while (genskinBusy) await new Promise(r => setTimeout(r, 300));
        genskinBusy = true;
        try {
          await sh('node', [path.join(__dirname, 'genskin.js'), name,
            path.join(WORK, name + '_walk.glb'), path.join(WORK, name + '_run.glb'),
            OUTJS, '--clips-from', path.join(WORK, 'shared_clips.json')]);
        } finally { genskinBusy = false; }
        console.log('DONE', name);
      } catch (e) { failures.push(name); console.log('FAILED', name, String(e).slice(0, 180)); }
    }
  }
  let genskinBusy = false;
  await Promise.all(Array.from({ length: CONC }, worker2));
  // role tags
  const list = JSON.parse(fs.readFileSync(OUTJS, 'utf8'));
  for (const e of list) if (roleOf[e.n] && roleOf[e.n] !== 'civ') e.role = roleOf[e.n];
  fs.writeFileSync(OUTJS, JSON.stringify(list));
  console.log('entries:', list.length, 'failures:', failures.join(',') || 'none');
  console.log('WAVEDONE');
})();
