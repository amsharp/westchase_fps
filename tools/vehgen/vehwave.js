// Wave runner for vehicles: every roster seed -> vehpipe (image-to-3d, no
// rig). Resumable: vehicles with work/NAME.glb are skipped.
//   MESHY_API_KEY=... node vehwave.js [--only NAME,NAME] [--conc 2]
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const roster = require('./roster.json');
const WORK = path.join(__dirname, 'work');

function opt(flag, dflt) { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : dflt; }
const CONC = +opt('--conc', 2);
const ONLY = opt('--only', '') ? opt('--only', '').split(',') : null;

const queue = Object.keys(roster.vehicles).filter(n =>
  (!ONLY || ONLY.includes(n)) &&
  !fs.existsSync(path.join(WORK, n + '.glb')) &&
  fs.existsSync(path.join(WORK, 'seed_' + n + '.png')));
console.log('queue:', queue.join(', ') || '(empty)');

function sh(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', c => c === 0 ? res() : rej(new Error('exit ' + c)));
  });
}
(async () => {
  const failures = [];
  let idx = 0;
  async function worker() {
    while (idx < queue.length) {
      const name = queue[idx++];
      try {
        await sh('node', [path.join(__dirname, 'vehpipe.js'), name, path.join(WORK, 'seed_' + name + '.png')]);
        console.log('DONE', name);
      } catch (e) { failures.push(name); console.log('FAILED', name, String(e).slice(0, 180)); }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  console.log('failures:', failures.join(',') || 'none');
  console.log('VEHWAVEDONE');
})();
