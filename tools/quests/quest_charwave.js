// quest_charwave.js — Meshy gen+rig+skin for the 10 humanoid quest NPCs.
// Mirrors chargen/staffwave.js but INLINES the Meshy calls with per-char
// checkpointing so a killed/re-run process re-attaches to in-flight Meshy
// tasks instead of resubmitting (credit-safe under foreground timeouts).
// Pipeline per char: image-to-3d (lowpoly t-pose remesh) -> rigging (yields
// free walk/run clips) -> [remesh+re-rig if >1.6x poly budget] -> download
// rigged + walk/run GLBs -> genskin.js (OWN clips) -> work/chars/questskins_data.json.
// Resumable: chars already in the output JSON are skipped.
//   MESHY_API_KEY=... node quest_charwave.js [--only NAME,NAME] [--conc 4] [--poly 1500]
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const roster = require('./quest_roster.json').chars;
const KEY = process.env.MESHY_API_KEY;
if (!KEY) { console.error('set MESHY_API_KEY'); process.exit(1); }
const API = 'https://api.meshy.ai/openapi/v1';
const WORK = path.join(__dirname, 'work', 'chars');
const OUTJS = path.join(WORK, 'questskins_data.json');
const GENSKIN = path.join(__dirname, '..', 'chargen', 'genskin.js');

function opt(f, d) { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; }
const CONC = +opt('--conc', 4);
const POLY = +opt('--poly', 1500);
const ONLY = opt('--only', '') ? opt('--only', '').split(',') : null;

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
function sh(cmd, args) { return new Promise((res, rej) => { const p = spawn(cmd, args, { stdio: 'inherit' }); p.on('exit', c => c === 0 ? res() : rej(new Error('exit ' + c))); }); }

const names = Object.keys(roster);
const done = new Set(fs.existsSync(OUTJS) ? JSON.parse(fs.readFileSync(OUTJS, 'utf8')).map(e => e.n) : []);
const queue = names.filter(n => (!ONLY || ONLY.includes(n)) && !done.has(n) && fs.existsSync(path.join(WORK, 'seed_' + n + '.png')));
console.log('queue:', queue.join(', ') || '(empty)');

function ckPath(n) { return path.join(WORK, n + '_task.json'); }
function readCk(n) { try { return JSON.parse(fs.readFileSync(ckPath(n), 'utf8')); } catch (e) { return {}; } }
function writeCk(n, ck) { fs.writeFileSync(ckPath(n), JSON.stringify(ck)); }

(async () => {
  let idx = 0, genskinBusy = false; const failures = [];
  async function worker() {
    while (idx < queue.length) {
      const n = queue[idx++];
      try {
        const ck = readCk(n);
        const glb = path.join(WORK, n + '_rigged.glb');
        // 1) image-to-3d
        if (!ck.genTask) {
          const img = 'data:image/png;base64,' + fs.readFileSync(path.join(WORK, 'seed_' + n + '.png')).toString('base64');
          const gen = await api('POST', '/image-to-3d', { image_url: img, model_type: 'lowpoly', ai_model: 'latest', should_texture: true, should_remesh: true, topology: 'triangle', target_polycount: POLY, pose_mode: 't-pose', target_formats: ['glb'] });
          if (!gen.result) throw new Error('gen submit failed: ' + JSON.stringify(gen).slice(0, 200));
          ck.genTask = gen.result; writeCk(n, ck); console.log(n, 'gen', gen.result);
        }
        await waitTask('/image-to-3d', ck.genTask, n + ':gen');
        // 2) rig
        let meshTask = ck.remeshTask || ck.genTask;
        if (!ck.rigTask) {
          const rig = await api('POST', '/rigging', { input_task_id: meshTask, height_meters: roster[n].height });
          if (!rig.result) throw new Error('rig submit failed: ' + JSON.stringify(rig).slice(0, 200));
          ck.rigTask = rig.result; writeCk(n, ck); console.log(n, 'rig', rig.result);
        }
        let rigRes = await waitTask('/rigging', ck.rigTask, n + ':rig');
        await download(rigRes.result.rigged_character_glb_url, glb);
        // 3) remesh fallback if way over budget
        const tris = glbTris(glb);
        console.log(n, 'rigged', tris, 'tris (target', POLY + ')');
        if (tris > POLY * 1.6 && !ck.remeshDone) {
          if (!ck.remeshTask) {
            const rm = await api('POST', '/remesh', { input_task_id: ck.genTask, topology: 'triangle', target_polycount: POLY, target_formats: ['glb'] });
            if (!rm.result) throw new Error('remesh submit failed'); ck.remeshTask = rm.result; ck.rigTask = null; writeCk(n, ck); console.log(n, 'remesh', rm.result);
          }
          await waitTask('/remesh', ck.remeshTask, n + ':remesh');
          if (!ck.rigTask) { const rig2 = await api('POST', '/rigging', { input_task_id: ck.remeshTask, height_meters: roster[n].height }); if (!rig2.result) throw new Error('re-rig submit failed'); ck.rigTask = rig2.result; writeCk(n, ck); }
          rigRes = await waitTask('/rigging', ck.rigTask, n + ':rig2');
          await download(rigRes.result.rigged_character_glb_url, glb);
          ck.remeshDone = true; writeCk(n, ck); console.log(n, 're-rigged', glbTris(glb), 'tris');
        }
        // 4) download clips
        const anims = rigRes.result.basic_animations || {};
        ck.walking_glb = anims.walking_glb_url; ck.running_glb = anims.running_glb_url; writeCk(n, ck);
        for (const [k, u] of [['walk', ck.walking_glb], ['run', ck.running_glb]]) {
          const f = path.join(WORK, n + '_' + k + '.glb');
          if (fs.existsSync(f) || !u) continue;
          await download(u, f);
        }
        // 5) genskin (own clips) — serialize (chromium heavy)
        while (genskinBusy) await sleep(300);
        genskinBusy = true;
        try {
          await sh('node', [GENSKIN, n, path.join(WORK, n + '_walk.glb'), path.join(WORK, n + '_run.glb'), OUTJS, '--height', String(1.78)]);
        } finally { genskinBusy = false; }
        console.log('DONE', n);
      } catch (e) { failures.push(n); console.log('FAILED', n, String(e).slice(0, 200)); }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  // tag quest + height from roster
  if (fs.existsSync(OUTJS)) {
    const list = JSON.parse(fs.readFileSync(OUTJS, 'utf8'));
    for (const e of list) if (roster[e.n]) { e.quest = roster[e.n].quest; e.role = 'quest'; }
    fs.writeFileSync(OUTJS, JSON.stringify(list));
    console.log('entries:', list.length, '->', list.map(e => e.n).join(', '));
  }
  const bal = await api('GET', '/balance');
  console.log('failures:', failures.join(',') || 'none', '| meshy credits left:', bal.balance);
  console.log('WAVEDONE');
})();
