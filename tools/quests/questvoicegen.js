// questvoicegen.js — quest dialogue pack: quest_lines.json -> Fish Audio TTS ->
// psxify 8kHz -> questvoices1.js (+2.js if a chunk exceeds ~30MB), repo root,
// optional at runtime (game guards typeof QUEST_VOICES). Mirrors the shop pack.
//   FISH_API_KEY=... node questvoicegen.js [--conc 4] [--only NPCKEY,NPCKEY]
// Resumable: crunched WAVs cached in work/voices/, work/voices/state.json tracks
// done/failed. Delete a wav to force a redo of one line.
// Voice resolution (_voices[NPCKEY]): {ref} -> whole NPC uses it;
//   {refs:[...]} -> round-robin across that NPC's lines by global index.
const fs = require('fs');
const path = require('path');
const { psxify, speakable } = require('../ttsgen/psxify.js');

const KEY = process.env.FISH_API_KEY;
if (!KEY) { console.error('set FISH_API_KEY'); process.exit(1); }
const LINES = JSON.parse(fs.readFileSync(path.join(__dirname, 'quest_lines.json'), 'utf8'));
const VOICES = LINES._voices || {};
const WORK = path.join(__dirname, 'work', 'voices');
const STATE = path.join(WORK, 'state.json');
fs.mkdirSync(WORK, { recursive: true });

function opt(f, d) { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; }
const CONC = +opt('--conc', 4);
const ONLY = opt('--only', '') ? opt('--only', '').split(',') : null;

// build job list; round-robin index is per-NPC across all its lines in order
const jobs = [];
for (const npc of Object.keys(LINES)) {
  if (npc.startsWith('_') || (ONLY && !ONLY.includes(npc))) continue;
  const v = VOICES[npc];
  if (!v) { console.log('NO VOICE for', npc, '- skipped'); continue; }
  let ni = 0;
  for (const cat of Object.keys(LINES[npc])) {
    const arr = LINES[npc][cat];
    if (!Array.isArray(arr)) continue;
    arr.forEach((text, i) => {
      const ref = v.ref ? v.ref : (v.refs && v.refs.length ? v.refs[ni % v.refs.length] : null);
      if (!ref) { console.log('no ref', npc, cat, i); return; }
      jobs.push({ npc, cat, i, ni, text, ref, file: path.join(WORK, npc + '_' + cat + '_' + i + '.wav') });
      ni++;
    });
  }
}
const todo = jobs.filter(j => !fs.existsSync(j.file));
console.log(jobs.length, 'lines total,', todo.length, 'to generate (conc ' + CONC + ')');

let state = {};
try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { state = {}; }
function saveState() { try { fs.writeFileSync(STATE, JSON.stringify(state, null, 0)); } catch (e) {} }

(async () => {
  let idx = 0; const failures = [];
  async function worker() {
    while (idx < jobs.length) {
      const j = jobs[idx++];
      const key = j.npc + '_' + j.cat + '_' + j.i;
      if (fs.existsSync(j.file)) { state[key] = 'ok'; continue; }
      try {
        const r = await fetch('https://api.fish.audio/v1/tts', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', model: 's1' },
          body: JSON.stringify({ text: speakable(j.text), reference_id: j.ref, format: 'wav' }),
        });
        if (!r.ok) throw new Error('TTS HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
        const raw = Buffer.from(await r.arrayBuffer());
        const crunched = psxify(raw, 8000);
        if (crunched.length <= 44) throw new Error('empty WAV');
        fs.writeFileSync(j.file, crunched);
        state[key] = 'ok'; saveState();
        console.log('ok', key, Math.round(crunched.length / 1024) + 'KB');
      } catch (e) { state[key] = 'fail'; saveState(); failures.push(key); console.log('FAIL', key, String(e).slice(0, 140)); }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));

  // assemble pack: NPCKEY -> cat -> [data-url,...]
  const pack = {};
  let count = 0;
  for (const j of jobs) {
    if (!fs.existsSync(j.file)) continue;
    const b = fs.readFileSync(j.file);
    pack[j.npc] = pack[j.npc] || {};
    pack[j.npc][j.cat] = pack[j.npc][j.cat] || [];
    pack[j.npc][j.cat][j.i] = 'data:audio/wav;base64,' + b.toString('base64');
    count++;
  }
  // chunk on whole NPCs, each chunk under ~30MB
  const CHUNK_MAX = 30 * 1024 * 1024;
  const npcs = Object.keys(pack);
  const parts = []; let cur = [], curSize = 0;
  for (const npc of npcs) {
    const sz = JSON.stringify(pack[npc]).length;
    if (cur.length && curSize + sz > CHUNK_MAX) { parts.push(cur); cur = []; curSize = 0; }
    cur.push(npc); curSize += sz;
  }
  if (cur.length) parts.push(cur);

  const dir = path.join(__dirname, '..', '..');
  let total = 0;
  parts.forEach((chunkNpcs, ci) => {
    const obj = {};
    for (const n of chunkNpcs) obj[n] = pack[n];
    const out = '// Quest dialogue, 8kHz PSX-crunched (Fish Audio TTS via\n' +
      '// tools/quests/questvoicegen.js), chunk ' + (ci + 1) + '/' + parts.length + '. Merges whole NPCs into\n' +
      '// window.QUEST_VOICES; order-independent. Chunk 1 declares QUEST_VOICE_CHUNKS.\n' +
      '// Lookup: QUEST_VOICES[npcKey][category][index]. See tools/quests/QUESTVOICES.md.\n' +
      (ci === 0 ? 'window.QUEST_VOICE_CHUNKS = ' + parts.length + ';\n' : '') +
      'window.QUEST_VOICES = Object.assign(window.QUEST_VOICES || {}, ' + JSON.stringify(obj) + ');\n';
    new Function(out); // parse-check
    const f = path.join(dir, 'questvoices' + (ci + 1) + '.js');
    fs.writeFileSync(f, out);
    total += out.length;
    console.log('wrote', f, chunkNpcs.length, 'NPCs, ~' + Math.round(out.length / 1024 / 1024 * 10) / 10 + 'MB');
  });
  for (let i = parts.length + 1; i <= 20; i++) { const f = path.join(dir, 'questvoices' + i + '.js'); if (fs.existsSync(f)) { fs.unlinkSync(f); console.log('removed stale', f); } }
  console.log('total', count, 'lines across', parts.length, 'chunks, ~' + Math.round(total / 1024 / 1024 * 10) / 10 + 'MB');
  console.log('failures:', failures.join(',') || 'none');
  console.log('QUESTVOICESDONE');
})().catch(e => { console.error(String(e)); process.exit(1); });
