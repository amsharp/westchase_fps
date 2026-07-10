// questpropgen.js — Meshy image-to-3d for the 8 static quest props (NO rigging).
// gpt-image-1 seeds must already exist (work/props/seed_<n>.png). Submits each
// to Meshy image-to-3d (lowpoly, should_remesh, triangle), polls, downloads the
// textured GLB to work/props/<n>.glb. Resumable + credit-safe: a per-prop
// checkpoint (work/props/<n>_task.json) stores the submitted task id BEFORE the
// long poll, so a killed/re-run process re-attaches to the in-flight task
// instead of resubmitting (and re-spending credits). GLB already present = skip.
//   MESHY_API_KEY=... node questpropgen.js [--only n,n] [--conc 3] [--poly 1200]
const fs = require('fs');
const path = require('path');
const roster = require('./quest_props.json').props;
const KEY = process.env.MESHY_API_KEY;
if (!KEY) { console.error('set MESHY_API_KEY'); process.exit(1); }
const API = 'https://api.meshy.ai/openapi/v1';
const WORK = path.join(__dirname, 'work', 'props');
fs.mkdirSync(WORK, { recursive: true });

function opt(f, d) { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; }
const CONC = +opt('--conc', 3);
const POLY = +opt('--poly', 1200);
const ONLY = opt('--only', '') ? opt('--only', '').split(',') : null;

async function api(method, ep, body) {
  const r = await fetch(API + ep, { method, headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitTask(ep, id, label) {
  for (let i = 0; i < 240; i++) {
    const j = await api('GET', ep + '/' + id);
    if (j.status === 'SUCCEEDED') { console.log(label, 'SUCCEEDED'); return j; }
    if (j.status === 'FAILED' || j.status === 'CANCELED') throw new Error(label + ' ' + j.status + ': ' + JSON.stringify(j.task_error || {}));
    if (i % 6 === 0) console.log(label, j.status, j.progress || 0);
    await sleep(10000);
  }
  throw new Error(label + ' timeout');
}

const names = Object.keys(roster).filter(n => (!ONLY || ONLY.includes(n)) && !fs.existsSync(path.join(WORK, n + '.glb')) && fs.existsSync(path.join(WORK, 'seed_' + n + '.png')));
console.log('queue:', names.join(', ') || '(empty)');

(async () => {
  let idx = 0; const failures = [];
  async function worker() {
    while (idx < names.length) {
      const n = names[idx++];
      const ck = path.join(WORK, n + '_task.json');
      try {
        let taskId = fs.existsSync(ck) ? JSON.parse(fs.readFileSync(ck, 'utf8')).task : null;
        if (!taskId) {
          const img = 'data:image/png;base64,' + fs.readFileSync(path.join(WORK, 'seed_' + n + '.png')).toString('base64');
          const gen = await api('POST', '/image-to-3d', {
            image_url: img, model_type: 'lowpoly', ai_model: 'latest', should_texture: true,
            should_remesh: true, topology: 'triangle', target_polycount: POLY, target_formats: ['glb'],
          });
          if (!gen.result) throw new Error('submit failed: ' + JSON.stringify(gen).slice(0, 200));
          taskId = gen.result;
          fs.writeFileSync(ck, JSON.stringify({ task: taskId }));
          console.log(n, 'task', taskId);
        } else console.log(n, 'resuming task', taskId);
        const res = await waitTask('/image-to-3d', taskId, n);
        const url = res.model_urls && res.model_urls.glb;
        if (!url) throw new Error('no glb url');
        const r = await fetch(url);
        fs.writeFileSync(path.join(WORK, n + '.glb'), Buffer.from(await r.arrayBuffer()));
        console.log('DONE', n);
      } catch (e) { failures.push(n); console.log('FAILED', n, String(e).slice(0, 160)); }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  const bal = await api('GET', '/balance');
  console.log('failures:', failures.join(',') || 'none', '| meshy credits left:', bal.balance);
  console.log('PROPGENDONE');
})();
