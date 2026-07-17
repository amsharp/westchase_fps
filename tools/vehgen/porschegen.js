// Porsche 964 asset generation: body via Meshy MULTI-image-to-3d (front+rear+
// side seeds), wheel + spoiler via single image-to-3d. Downloads GLBs to work/.
//   MESHY_API_KEY=... node porschegen.js
const fs = require('fs');
const path = require('path');
const KEY = process.env.MESHY_API_KEY;
if (!KEY) { console.error('set MESHY_API_KEY'); process.exit(1); }
const API = 'https://api.meshy.ai/openapi/v1';
const WORK = path.join(__dirname, 'work');
const durl = f => 'data:image/png;base64,' + fs.readFileSync(path.join(WORK, f)).toString('base64');

async function api(method, ep, body) {
  const r = await fetch(API + ep, { method, headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitTask(ep, id, label) {
  for (let i = 0; i < 300; i++) {
    const j = await api('GET', ep + '/' + id);
    if (j.status === 'SUCCEEDED') { console.log(label, 'SUCCEEDED'); return j; }
    if (j.status === 'FAILED' || j.status === 'CANCELED') throw new Error(label + ' ' + j.status + ': ' + JSON.stringify(j.task_error || {}));
    if (i % 6 === 0) console.log(label, j.status, j.progress || 0);
    await sleep(10000);
  }
  throw new Error(label + ' timeout');
}
async function download(url, out) { const r = await fetch(url); fs.writeFileSync(out, Buffer.from(await r.arrayBuffer())); }
function glbTris(file) {
  const b = fs.readFileSync(file); const j = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString('utf8'));
  let t = 0; for (const m of j.meshes || []) for (const p of m.primitives) t += (p.indices !== undefined ? j.accessors[p.indices].count : j.accessors[p.attributes.POSITION].count) / 3;
  return t;
}

async function genMulti(name, seeds, poly) {
  console.log(name, 'multi-image submit', seeds.length, 'views');
  const gen = await api('POST', '/multi-image-to-3d', {
    image_urls: seeds.map(durl), ai_model: 'latest', should_texture: true, should_remesh: true,
    topology: 'triangle', target_polycount: poly, symmetry_mode: 'off', target_formats: ['glb'],
  });
  if (!gen.result) throw new Error(name + ' submit failed: ' + JSON.stringify(gen));
  const j = await waitTask('/multi-image-to-3d', gen.result, name);
  const url = (j.model_urls && j.model_urls.glb) || (j.result && j.result.model_urls && j.result.model_urls.glb);
  await download(url, path.join(WORK, name + '.glb'));
  console.log(name, 'GLB', glbTris(path.join(WORK, name + '.glb')), 'tris');
}
async function genSingle(name, seed, poly) {
  console.log(name, 'image-to-3d submit');
  const gen = await api('POST', '/image-to-3d', {
    image_url: durl(seed), model_type: 'lowpoly', ai_model: 'latest', should_texture: true, should_remesh: true,
    topology: 'triangle', target_polycount: poly, pose_mode: 't-pose', target_formats: ['glb'],
  });
  if (!gen.result) throw new Error(name + ' submit failed: ' + JSON.stringify(gen));
  const j = await waitTask('/image-to-3d', gen.result, name);
  const url = (j.model_urls && j.model_urls.glb) || (j.result && j.result.model_urls && j.result.model_urls.glb);
  await download(url, path.join(WORK, name + '.glb'));
  console.log(name, 'GLB', glbTris(path.join(WORK, name + '.glb')), 'tris');
}

(async () => {
  await Promise.all([
    genMulti('PORSCHEBODY', ['seed_PORSCHEBODY.png', 'seed_PORSCHEBODY_rear.png', 'seed_PORSCHEBODY_side.png'], 700),
    genSingle('PORSCHEWHEEL', 'seed_PORSCHEWHEEL.png', 200),
    genSingle('PORSCHESPOILER', 'seed_PORSCHESPOILER.png', 120),
  ]);
  const bal = await api('GET', '/balance');
  console.log('meshy credits left:', bal.balance);
  console.log('PORSCHEGENDONE');
})().catch(e => { console.error('FAIL', String(e)); process.exit(1); });
