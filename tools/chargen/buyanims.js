// Buy animation clips from the Meshy library for one rig (3 credits each) —
// with the shared-clip system a single purchase animates the whole roster.
//   MESHY_API_KEY=... node buyanims.js <rig_task_id> idle:0 chat:56 jab:191 ...
// Downloads work/anim_<name>.glb for each. Pack into the shared clip set
// with packclips.js afterwards.
const fs = require('fs');
const path = require('path');
const KEY = process.env.MESHY_API_KEY;
if (!KEY) { console.error('set MESHY_API_KEY'); process.exit(1); }
const API = 'https://api.meshy.ai/openapi/v1';
const RIG = process.argv[2];
const WANTS = process.argv.slice(3).map(s => { const [n, id] = s.split(':'); return { n, id: +id }; });
const WORK = path.join(__dirname, 'work');
fs.mkdirSync(WORK, { recursive: true });

async function api(m, ep, b) {
  const r = await fetch(API + ep, { method: m, headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  return r.json();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function run({ n, id }) {
  const t = await api('POST', '/animations', { rig_task_id: RIG, action_id: id });
  if (!t.result) throw new Error(n + ' submit: ' + JSON.stringify(t).slice(0, 200));
  for (let i = 0; i < 120; i++) {
    const j = await api('GET', '/animations/' + t.result);
    if (j.status === 'SUCCEEDED') {
      const url = j.result.animation_glb_url;
      const r = await fetch(url);
      fs.writeFileSync(path.join(WORK, 'anim_' + n + '.glb'), Buffer.from(await r.arrayBuffer()));
      console.log('ok', n, '(action', id + ')');
      return;
    }
    if (j.status === 'FAILED' || j.status === 'CANCELED') throw new Error(n + ' ' + j.status);
    await sleep(8000);
  }
  throw new Error(n + ' timeout');
}
(async () => {
  const rs = await Promise.allSettled(WANTS.map(run));
  rs.forEach((r, i) => { if (r.status === 'rejected') console.log('FAIL', WANTS[i].n, String(r.reason).slice(0, 150)); });
  const bal = await api('GET', '/balance');
  console.log('credits left:', bal.balance);
  console.log('ANIMSDONE');
})();
