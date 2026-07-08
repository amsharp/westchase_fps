// Per-NPC voice pack: npc_voices.json + npc_lines.json -> Fish Audio TTS ->
// psxify 8 kHz -> npcvoices.js (repo root, optional at runtime).
//   FISH_API_KEY=... node npcvoicegen.js [--conc 3] [--only NAME,NAME]
// Resumable: crunched WAVs cached in work/npc/, delete one to force a redo.
const fs = require('fs');
const path = require('path');
const { psxify, speakable } = require('./psxify.js');

const KEY = process.env.FISH_API_KEY;
if (!KEY) { console.error('set FISH_API_KEY'); process.exit(1); }
const VOICES = JSON.parse(fs.readFileSync(path.join(__dirname, 'npc_voices.json'), 'utf8'));
const LINES = JSON.parse(fs.readFileSync(path.join(__dirname, 'npc_lines.json'), 'utf8'));
const WORK = path.join(__dirname, 'work', 'npc');
const TARGET = path.join(__dirname, '..', '..', 'npcvoices.js');
fs.mkdirSync(WORK, { recursive: true });

function opt(flag, dflt) { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : dflt; }
const CONC = +opt('--conc', 3);
const ONLY = opt('--only', '') ? opt('--only', '').split(',') : null;

const jobs = [];
for (const name of Object.keys(LINES)) {
  if (name.startsWith('_') || ONLY && !ONLY.includes(name)) continue;
  if (!VOICES[name]) { console.log('NO VOICE for', name, '- skipped'); continue; }
  for (const cat of Object.keys(LINES[name])) {
    if (cat.startsWith('_')) continue;
    const arr = Array.isArray(LINES[name][cat]) ? LINES[name][cat] : [LINES[name][cat]];
    arr.forEach((text, i) => {
      jobs.push({ name, cat, i, text, file: path.join(WORK, name + '_' + cat + '_' + i + '.wav') });
    });
  }
}
console.log(jobs.length, 'lines total,', jobs.filter(j => !fs.existsSync(j.file)).length, 'to generate');

(async () => {
  let idx = 0; const failures = [];
  async function worker() {
    while (idx < jobs.length) {
      const j = jobs[idx++];
      if (fs.existsSync(j.file)) continue;
      try {
        const r = await fetch('https://api.fish.audio/v1/tts', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', model: 's1' },
          body: JSON.stringify({ text: speakable(j.text), reference_id: VOICES[j.name].ref, format: 'wav' }),
        });
        if (!r.ok) throw new Error('TTS HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
        const raw = Buffer.from(await r.arrayBuffer());
        fs.writeFileSync(j.file, psxify(raw, 8000));
        console.log('ok', path.basename(j.file));
      } catch (e) { failures.push(j.name + '_' + j.cat + '_' + j.i); console.log('FAIL', j.name, j.cat, j.i, String(e).slice(0, 140)); }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  // assemble
  const pack = {};
  let bytes = 0, count = 0;
  for (const j of jobs) {
    if (!fs.existsSync(j.file)) continue;
    const b = fs.readFileSync(j.file);
    pack[j.name] = pack[j.name] || {};
    pack[j.name][j.cat] = pack[j.name][j.cat] || [];
    pack[j.name][j.cat][j.i] = 'data:audio/wav;base64,' + b.toString('base64');
    bytes += b.length; count++;
  }
  // Chunked output: GitHub warns at 50MB / hard-fails at 100MB per file, so
  // the pack is split into npcvoices1.js, npcvoices2.js, ... each well under
  // 35MB. Chunks split on whole characters and merge into the shared
  // window.NPC_VOICES registry, so load order never matters. Chunk 1 is the
  // blocking <script> tag in index.html (and declares NPC_VOICE_CHUNKS); the
  // rest are injected by game.js as dynamic script tags after boot (works
  // from file://). playNpcVoice treats not-yet-loaded characters like
  // characters with no pack entry and falls back to the generic barks.
  const CHUNK_MAX = 30 * 1024 * 1024;
  const names = Object.keys(pack);
  const parts = [];
  let cur = [], curSize = 0;
  for (const name of names) {
    const sz = JSON.stringify(pack[name]).length;
    if (cur.length && curSize + sz > CHUNK_MAX) { parts.push(cur); cur = []; curSize = 0; }
    cur.push(name); curSize += sz;
  }
  if (cur.length) parts.push(cur);
  const dir = path.join(__dirname, '..', '..');
  let total = 0;
  parts.forEach((chunkNames, ci) => {
    const obj = {};
    for (const n of chunkNames) obj[n] = pack[n];
    const out = '// Per-NPC 8kHz PSX voice lines, chunk ' + (ci + 1) + '/' + parts.length +
      ' (Fish Audio TTS via\n// tools/ttsgen/npcvoicegen.js). Merges whole characters into the shared\n' +
      '// window.NPC_VOICES registry; chunk 1 loads via <script> in index.html, the\n' +
      '// rest are late-loaded by game.js (loadNpcVoiceChunks). Order-independent.\n' +
      (ci === 0 ? 'window.NPC_VOICE_CHUNKS = ' + parts.length + ';\n' : '') +
      '(function (p) { window.NPC_VOICES = window.NPC_VOICES || {}; for (var k in p) window.NPC_VOICES[k] = p[k]; })(' +
      JSON.stringify(obj) + ');\n';
    new Function(out);
    const f = path.join(dir, 'npcvoices' + (ci + 1) + '.js');
    fs.writeFileSync(f, out);
    total += out.length;
    console.log('wrote', f, chunkNames.length, 'characters, ~' + Math.round(out.length / 1024 / 1024 * 10) / 10 + 'MB');
  });
  // clear out the old monolith and any stale higher-numbered chunks
  if (fs.existsSync(TARGET)) { fs.unlinkSync(TARGET); console.log('removed monolithic', TARGET); }
  for (let i = parts.length + 1; i <= 20; i++) {
    const f = path.join(dir, 'npcvoices' + i + '.js');
    if (fs.existsSync(f)) { fs.unlinkSync(f); console.log('removed stale', f); }
  }
  console.log('total', count, 'lines across', parts.length, 'chunks, ~' + Math.round(total / 1024 / 1024 * 10) / 10 + 'MB');
  console.log('failures:', failures.join(',') || 'none');
  console.log('NPCVOICESDONE');
})();
