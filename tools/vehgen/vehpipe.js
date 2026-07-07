// Vehicle seed image -> static low-poly GLB, end to end (no rigging):
//   Meshy image-to-3d (lowpoly) -> measure tris -> standalone remesh if over
//   budget -> download GLB into the workdir as NAME.glb.
//
//   MESHY_API_KEY=msy_... node vehpipe.js NAME seed.png [--polycount 450] [--workdir work]
//
// Convert the GLBs with tools/chargen/genprops.js afterwards (vehicles are
// static props: quantized positions + UVs + embedded texture). ~15 credits/car.
// Polycount grounded in measured PS1 source material — see STYLE.md
// (GGBot PSX cars: 304-476 tris, mean ~408; GT-era cars ~300 polys).
const fs = require('fs');
const path = require('path');

const KEY = process.env.MESHY_API_KEY;
if (!KEY) { console.error('set MESHY_API_KEY'); process.exit(1); }
const API = 'https://api.meshy.ai/openapi/v1';

const args = process.argv.slice(2);
const NAME = args[0], SEED = args[1];
function opt(flag, dflt) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : dflt; }
const POLY = +opt('--polycount', 450);
const WORK = opt('--workdir', path.join(__dirname, 'work'));
if (!NAME || !SEED) { console.error('usage: node vehpipe.js NAME seed.png [--polycount N] [--workdir D]'); process.exit(1); }
fs.mkdirSync(WORK, { recursive: true });

async function api(method, ep, body) {
  const r = await fetch(API + ep, {
    method,
    headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
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
async function download(url, out) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('download HTTP ' + r.status);
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
}
function glbTris(file) {
  const b = fs.readFileSync(file);
  const j = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString('utf8'));
  let t = 0;
  for (const m of j.meshes || []) for (const p of m.primitives) {
    t += (p.indices !== undefined ? j.accessors[p.indices].count : j.accessors[p.attributes.POSITION].count) / 3;
  }
  return t;
}

(async () => {
  const img = 'data:image/png;base64,' + fs.readFileSync(SEED).toString('base64');
  const gen = await api('POST', '/image-to-3d', {
    image_url: img,
    model_type: 'lowpoly',
    ai_model: 'latest',
    should_texture: true,
    should_remesh: true,
    topology: 'triangle',
    target_polycount: POLY,
    target_formats: ['glb'],
  });
  if (!gen.result) throw new Error('gen submit failed: ' + JSON.stringify(gen));
  console.log(NAME, 'gen task', gen.result);
  let res = await waitTask('/image-to-3d', gen.result, NAME + ':gen');
  const glb = path.join(WORK, NAME + '.glb');
  await download(res.model_urls.glb, glb);
  let tris = glbTris(glb);
  console.log(NAME, 'generated at', tris, 'tris (target', POLY + ')');
  if (tris > POLY * 1.6) {
    console.log(NAME, 'over budget — standalone remesh');
    const rm = await api('POST', '/remesh', { input_task_id: gen.result, topology: 'triangle', target_polycount: POLY, target_formats: ['glb'] });
    if (!rm.result) throw new Error('remesh submit failed: ' + JSON.stringify(rm));
    const rmRes = await waitTask('/remesh', rm.result, NAME + ':remesh');
    await download(rmRes.model_urls.glb, glb);
    tris = glbTris(glb);
    console.log(NAME, 'remeshed at', tris, 'tris');
  }
  console.log(NAME, 'GLB saved:', glb, tris, 'tris');
  const bal = await api('GET', '/balance');
  console.log('meshy credits left:', bal.balance);
})().catch(e => { console.error(String(e)); process.exit(1); });
