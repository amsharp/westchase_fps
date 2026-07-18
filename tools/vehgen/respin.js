// Body-only Meshy respin with the corrected seed set (v2): balanced rear
// coverage (dead-rear added, front-on dropped), no deck void, no G-body
// bellows. MESHY_API_KEY=... node respin.js
const fs = require('fs'); const path = require('path');
const KEY = process.env.MESHY_API_KEY;
const API = 'https://api.meshy.ai/openapi/v1';
const WORK = path.join(__dirname, 'work');
const durl = f => 'data:image/png;base64,' + fs.readFileSync(path.join(WORK, f)).toString('base64');
async function api(method, ep, body) {
  const r = await fetch(API + ep, { method, headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const seeds = ['seed_PORSCHEBODY_v2.png', 'seed_PORSCHEBODY_rear_v5.png', 'seed_PORSCHEBODY_deadrear_v6.png', 'seed_PORSCHEBODY_side_v2.png'];
  console.log('submitting body respin,', seeds.length, 'views');
  const gen = await api('POST', '/multi-image-to-3d', {
    image_urls: seeds.map(durl), ai_model: 'latest', should_texture: true, should_remesh: true,
    topology: 'triangle', target_polycount: 800, symmetry_mode: 'auto', target_formats: ['glb'],
  });
  if (!gen.result) throw new Error('submit failed: ' + JSON.stringify(gen));
  console.log('task', gen.result);
  for (let i = 0; i < 300; i++) {
    const j = await api('GET', '/multi-image-to-3d/' + gen.result);
    if (j.status === 'SUCCEEDED') {
      const url = (j.model_urls && j.model_urls.glb) || (j.result && j.result.model_urls && j.result.model_urls.glb);
      const r = await fetch(url); fs.writeFileSync(path.join(WORK, 'PORSCHEBODY.glb'), Buffer.from(await r.arrayBuffer()));
      console.log('DONE saved PORSCHEBODY.glb');
      const bal = await api('GET', '/balance'); console.log('credits left:', bal.balance);
      return;
    }
    if (j.status === 'FAILED' || j.status === 'CANCELED') throw new Error(j.status + ': ' + JSON.stringify(j.task_error || {}));
    if (i % 6 === 0) console.log(j.status, j.progress || 0);
    await sleep(10000);
  }
  throw new Error('timeout');
})().catch(e => { console.error('FAIL', String(e)); process.exit(1); });
