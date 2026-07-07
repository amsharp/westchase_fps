// Seed image -> game-ready character entry, end to end:
//   Meshy image-to-3d (lowpoly, t-pose, remeshed) -> Meshy rigging (also
//   yields free walking/running clips) -> download rigged GLB -> gensplit
//   into the game's rigid-part format.
//
//   MESHY_API_KEY=msy_... node charpipe.js NAME seed.png [--polycount 1600] [--height 1.75] [--workdir work]
//
// Outputs in the workdir: NAME_rigged.glb, NAME_anims.json (clip URLs +
// task ids), and an entry appended to meshychars_data.json (merge into the
// game with merge_meshychars.js). Costs ~35 Meshy credits per character.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const KEY = process.env.MESHY_API_KEY;
if (!KEY) { console.error('set MESHY_API_KEY'); process.exit(1); }
const API = 'https://api.meshy.ai/openapi/v1';

const args = process.argv.slice(2);
const NAME = args[0], SEED = args[1];
function opt(flag, dflt) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : dflt; }
const POLY = +opt('--polycount', 1600);
const HEIGHT = +opt('--height', 1.75);
const WORK = opt('--workdir', path.join(__dirname, 'work'));
if (!NAME || !SEED) { console.error('usage: node charpipe.js NAME seed.png [--polycount N] [--height M] [--workdir D]'); process.exit(1); }
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
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
}

(async () => {
  const img = 'data:image/png;base64,' + fs.readFileSync(SEED).toString('base64');
  const gen = await api('POST', '/image-to-3d', {
    image_url: img,
    model_type: 'lowpoly',
    ai_model: 'latest',
    should_texture: true,
    should_remesh: true,        // without this Meshy ignores the polycount...
    topology: 'triangle',
    target_polycount: POLY,
    pose_mode: 't-pose',
    target_formats: ['glb'],
  });
  if (!gen.result) throw new Error('gen submit failed: ' + JSON.stringify(gen));
  console.log(NAME, 'gen task', gen.result);
  await waitTask('/image-to-3d', gen.result, NAME + ':gen');

  // ...and even WITH it the in-task remesh often doesn't hold (observed
  // 4k-15k tris on a 1600 target). Rig, measure the real count, and fall
  // back to a standalone remesh + re-rig when over budget.
  function glbTris(file) {
    const b = fs.readFileSync(file);
    const j = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString('utf8'));
    let t = 0;
    for (const m of j.meshes || []) for (const p of m.primitives) {
      t += (p.indices !== undefined ? j.accessors[p.indices].count : j.accessors[p.attributes.POSITION].count) / 3;
    }
    return t;
  }
  let meshTask = gen.result, remeshTask = null;
  let rig = await api('POST', '/rigging', { input_task_id: meshTask, height_meters: HEIGHT });
  if (!rig.result) throw new Error('rig submit failed: ' + JSON.stringify(rig));
  let rigRes = await waitTask('/rigging', rig.result, NAME + ':rig');
  const glb = path.join(WORK, NAME + '_rigged.glb');
  await download(rigRes.result.rigged_character_glb_url, glb);
  const tris = glbTris(glb);
  console.log(NAME, 'rigged at', tris, 'tris (target', POLY + ')');
  if (tris > POLY * 1.6) {
    console.log(NAME, 'over budget — standalone remesh + re-rig');
    const rm = await api('POST', '/remesh', { input_task_id: gen.result, topology: 'triangle', target_polycount: POLY, target_formats: ['glb'] });
    if (!rm.result) throw new Error('remesh submit failed: ' + JSON.stringify(rm));
    await waitTask('/remesh', rm.result, NAME + ':remesh');
    remeshTask = rm.result; meshTask = rm.result;
    rig = await api('POST', '/rigging', { input_task_id: meshTask, height_meters: HEIGHT });
    if (!rig.result) throw new Error('re-rig submit failed: ' + JSON.stringify(rig));
    rigRes = await waitTask('/rigging', rig.result, NAME + ':rig2');
    await download(rigRes.result.rigged_character_glb_url, glb);
    console.log(NAME, 're-rigged at', glbTris(glb), 'tris');
  }
  fs.writeFileSync(path.join(WORK, NAME + '_anims.json'), JSON.stringify({
    gen_task: gen.result, remesh_task: remeshTask, rig_task: rig.result,
    walking_glb: rigRes.result.basic_animations.walking_glb_url,
    running_glb: rigRes.result.basic_animations.running_glb_url,
  }, null, 1));
  console.log(NAME, 'rigged GLB saved:', glb);

  execSync('node ' + path.join(__dirname, 'gensplit.js') + ' "' + glb + '" ' + NAME + ' "' + path.join(WORK, 'meshychars_data.json') + '"', { stdio: 'inherit' });
  const bal = await api('GET', '/balance');
  console.log('meshy credits left:', bal.balance);
})().catch(e => { console.error(String(e)); process.exit(1); });
