// Shop-dialogue voice pack: shop_lines.json -> Fish Audio TTS -> psxify 8 kHz
// -> shopvoices1.js (+2.js if a chunk would exceed ~35MB), repo root, optional
// at runtime (game guards with typeof SHOP_VOICES). PER-ROLE packs.
//   FISH_API_KEY=... node shopvoicegen.js [--conc 4] [--only ROLE,ROLE]
// Resumable: crunched WAVs cached in work/shop/, and work/shop/state.json
// tracks done/failed so a killed run resumes without re-hitting the API.
// Delete a wav (and its state entry is ignored — presence of the wav wins)
// to force a redo of one line.
//
// Voice resolution (from shop_lines.json._voices[ROLE]):
//   {ref}                     -> every line in the role uses that reference_id
//   {refs:[...]}              -> round-robin across the role's lines by index
//   {byCat:{cat:{ref|refs}}}  -> per-category override (STAFF chatQ/chatA, PLAYER greets)
const fs = require('fs');
const path = require('path');
const { psxify, speakable } = require('./psxify.js');

const KEY = process.env.FISH_API_KEY;
if (!KEY) { console.error('set FISH_API_KEY'); process.exit(1); }
const LINES = JSON.parse(fs.readFileSync(path.join(__dirname, 'shop_lines.json'), 'utf8'));
const VOICES = LINES._voices || {};
const WORK = path.join(__dirname, 'work', 'shop');
const STATE = path.join(WORK, 'state.json');
fs.mkdirSync(WORK, { recursive: true });

function opt(flag, dflt) { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : dflt; }
const CONC = +opt('--conc', 4);
const ONLY = opt('--only', '') ? opt('--only', '').split(',') : null;

// resolve the reference_id for (role, category, index-within-category)
function refFor(role, cat, i) {
  const v = VOICES[role];
  if (!v) return null;
  let sub = v;
  if (v.byCat) { if (!v.byCat[cat]) return null; sub = v.byCat[cat]; }
  if (sub.ref) return sub.ref;
  if (sub.refs && sub.refs.length) return sub.refs[i % sub.refs.length];
  return null;
}

// build job list, mirroring the nested pack shape ROLE -> cat -> [lines]
const jobs = [];
for (const role of Object.keys(LINES)) {
  if (role.startsWith('_') || (ONLY && !ONLY.includes(role))) continue;
  for (const cat of Object.keys(LINES[role])) {
    if (cat.startsWith('_')) continue;
    const arr = LINES[role][cat];
    if (!Array.isArray(arr)) continue;
    arr.forEach((text, i) => {
      const ref = refFor(role, cat, i);
      if (!ref) { console.log('NO VOICE for', role, cat, i, '- skipped'); return; }
      jobs.push({ role, cat, i, text, ref, file: path.join(WORK, role + '_' + cat + '_' + i + '.wav') });
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
      const key = j.role + '_' + j.cat + '_' + j.i;
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
      } catch (e) {
        state[key] = 'fail'; saveState();
        failures.push(key); console.log('FAIL', key, String(e).slice(0, 140));
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));

  // assemble nested pack ROLE -> cat -> [data-url,...]
  const pack = {};
  let bytes = 0, count = 0;
  for (const j of jobs) {
    if (!fs.existsSync(j.file)) continue;
    const b = fs.readFileSync(j.file);
    pack[j.role] = pack[j.role] || {};
    pack[j.role][j.cat] = pack[j.role][j.cat] || [];
    pack[j.role][j.cat][j.i] = 'data:audio/wav;base64,' + b.toString('base64');
    bytes += b.length; count++;
  }

  // chunk on whole ROLES, each chunk well under 35MB (GitHub warns at 50MB)
  const CHUNK_MAX = 30 * 1024 * 1024;
  const roles = Object.keys(pack);
  const parts = []; let cur = [], curSize = 0;
  for (const role of roles) {
    const sz = JSON.stringify(pack[role]).length;
    if (cur.length && curSize + sz > CHUNK_MAX) { parts.push(cur); cur = []; curSize = 0; }
    cur.push(role); curSize += sz;
  }
  if (cur.length) parts.push(cur);

  const dir = path.join(__dirname, '..', '..');
  let total = 0;
  parts.forEach((chunkRoles, ci) => {
    const obj = {};
    for (const r of chunkRoles) obj[r] = pack[r];
    // Order-independent merge into window.SHOP_VOICES via Object.assign, matching
    // the npcvoices chunk pattern. Chunk 1 declares SHOP_VOICE_CHUNKS.
    const out = '// Per-ROLE 8kHz PSX shop dialogue, chunk ' + (ci + 1) + '/' + parts.length +
      ' (Fish Audio TTS\n// via tools/ttsgen/shopvoicegen.js). Merges whole roles into the shared\n' +
      '// window.SHOP_VOICES registry; order-independent. Chunk 1 loads via <script>\n' +
      '// in index.html (and declares SHOP_VOICE_CHUNKS); load the rest similarly.\n' +
      (ci === 0 ? 'window.SHOP_VOICE_CHUNKS = ' + parts.length + ';\n' : '') +
      'window.SHOP_VOICES = Object.assign(window.SHOP_VOICES || {}, ' + JSON.stringify(obj) + ');\n';
    new Function(out); // parse-check
    const f = path.join(dir, 'shopvoices' + (ci + 1) + '.js');
    fs.writeFileSync(f, out);
    total += out.length;
    console.log('wrote', f, chunkRoles.length, 'roles, ~' + Math.round(out.length / 1024 / 1024 * 10) / 10 + 'MB');
  });
  // clear any stale higher-numbered chunks from a previous larger run
  for (let i = parts.length + 1; i <= 20; i++) {
    const f = path.join(dir, 'shopvoices' + i + '.js');
    if (fs.existsSync(f)) { fs.unlinkSync(f); console.log('removed stale', f); }
  }
  console.log('total', count, 'lines across', parts.length, 'chunks, ~' + Math.round(total / 1024 / 1024 * 10) / 10 + 'MB');
  console.log('failures:', failures.join(',') || 'none');
  console.log('SHOPVOICESDONE');
})().catch(e => { console.error(String(e)); process.exit(1); });
