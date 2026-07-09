// Staff wave runner: every gated staff seed -> charpipe (Meshy gen+rig) ->
// clip download -> genskin (shared clips) -> venue/role tag -> staffskins JSON.
// Resumable: characters already in the output JSON are skipped. Mirrors
// charwave.js but reads staff_roster.json and writes work/staffskins_data.json
// so it never touches the main meshychars pipeline.
//   MESHY_API_KEY=... node staffwave.js [--only NAME,NAME] [--conc 4]
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const roster = require('./staff_roster.json');
const WORK = path.join(__dirname, 'work');
const OUTJS = path.join(WORK, 'staffskins_data.json');

function opt(flag, dflt) { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : dflt; }
const CONC = +opt('--conc', 4);
const ONLY = opt('--only', '') ? opt('--only', '').split(',') : null;

const names = Object.keys(roster.staff);
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

(async () => {
  const failures = [];
  let idx = 0, genskinBusy = false;
  async function worker() {
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
  await Promise.all(Array.from({ length: CONC }, worker));
  // venue/role tags
  const list = JSON.parse(fs.readFileSync(OUTJS, 'utf8'));
  for (const e of list) {
    e.role = 'staff';
    if (roster.venue[e.n]) { e.venue = roster.venue[e.n][0]; e.job = roster.venue[e.n][1]; }
  }
  fs.writeFileSync(OUTJS, JSON.stringify(list));
  console.log('entries:', list.length, 'failures:', failures.join(',') || 'none');
  console.log('WAVEDONE');
})();
