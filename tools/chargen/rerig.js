// Cheap re-rig: take an existing Meshy gen/remesh task id (from
// work/<NAME>_anims.json) and run rigging again — mesh is reused, only weights
// are recomputed (~5 credits). Downloads a fresh rigged GLB + walk/run clips
// and rewrites <NAME>_anims.json. Use when a character's MESH is good but the
// auto-rig weighted geometry badly. Then re-run genskin (via kidwave).
//   MESHY_API_KEY=... node rerig.js NAME [--height 1.36] [--from gen|remesh]
const fs = require('fs');
const path = require('path');
const KEY = process.env.MESHY_API_KEY;
if (!KEY) { console.error('set MESHY_API_KEY'); process.exit(1); }
const API = 'https://api.meshy.ai/openapi/v1';
const NAME = process.argv[2];
function opt(f, d) { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; }
const HEIGHT = +opt('--height', 1.4);
const FROM = opt('--from', 'gen');
const WORK = path.join(__dirname, 'work');
const meta = JSON.parse(fs.readFileSync(path.join(WORK, NAME + '_anims.json'), 'utf8'));
const inputTask = FROM === 'remesh' && meta.remesh_task ? meta.remesh_task : meta.gen_task;

async function api(m, ep, body) { const r = await fetch(API + ep, { method: m, headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return r.json(); }
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
async function download(url, out) { const r = await fetch(url); fs.writeFileSync(out, Buffer.from(await r.arrayBuffer())); }

(async () => {
  console.log(NAME, 're-rig from task', inputTask, 'height', HEIGHT);
  const rig = await api('POST', '/rigging', { input_task_id: inputTask, height_meters: HEIGHT });
  if (!rig.result) throw new Error('rig submit failed: ' + JSON.stringify(rig));
  const res = await waitTask('/rigging', rig.result, NAME + ':rerig');
  await download(res.result.rigged_character_glb_url, path.join(WORK, NAME + '_rigged.glb'));
  // fresh clips
  for (const [k, u] of [['walk', res.result.basic_animations.walking_glb_url], ['run', res.result.basic_animations.running_glb_url]]) {
    await download(u, path.join(WORK, NAME + '_' + k + '.glb'));
  }
  meta.rig_task = rig.result;
  meta.walking_glb = res.result.basic_animations.walking_glb_url;
  meta.running_glb = res.result.basic_animations.running_glb_url;
  fs.writeFileSync(path.join(WORK, NAME + '_anims.json'), JSON.stringify(meta, null, 1));
  const bal = await api('GET', '/balance');
  console.log(NAME, 're-rigged; clips downloaded. balance', bal.balance);
})().catch(e => { console.error(String(e)); process.exit(1); });
