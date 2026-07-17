// Additive NPC-voice generator: synthesize ONLY the named characters and write
// them as a NEW npcvoices<N>.js chunk, leaving the existing baked chunks (and
// their ~72MB of audio) untouched. Bumps NPC_VOICE_CHUNKS in npcvoices1.js.
// Chunks merge into window.NPC_VOICES independently, so a new chunk is safe.
//   FISH_API_KEY=... node addvoices.js NAME[,NAME...] [--conc 3]
// Resumable: crunched WAVs cached in work/npc/, delete one to redo it.
const fs = require('fs');
const path = require('path');
const { psxify, speakable } = require('./psxify.js');

const KEY = process.env.FISH_API_KEY;
if (!KEY) { console.error('set FISH_API_KEY'); process.exit(1); }
const NAMES = (process.argv[2] || '').split(',').filter(Boolean);
if (!NAMES.length) { console.error('usage: node addvoices.js NAME[,NAME...]'); process.exit(1); }
function opt(f, d) { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; }
const CONC = +opt('--conc', 3);

const VOICES = JSON.parse(fs.readFileSync(path.join(__dirname, 'npc_voices.json'), 'utf8'));
const LINES = JSON.parse(fs.readFileSync(path.join(__dirname, 'npc_lines.json'), 'utf8'));
const WORK = path.join(__dirname, 'work', 'npc');
const ROOT = path.join(__dirname, '..', '..');
fs.mkdirSync(WORK, { recursive: true });

const jobs = [];
for (const name of NAMES) {
  if (!VOICES[name]) { console.error('NO VOICE for', name); process.exit(1); }
  if (!LINES[name]) { console.error('NO LINES for', name); process.exit(1); }
  for (const cat of Object.keys(LINES[name])) {
    if (cat.startsWith('_')) continue;
    const arr = Array.isArray(LINES[name][cat]) ? LINES[name][cat] : [LINES[name][cat]];
    arr.forEach((text, i) => jobs.push({ name, cat, i, text, file: path.join(WORK, name + '_' + cat + '_' + i + '.wav') }));
  }
}
console.log(jobs.length, 'lines,', jobs.filter(j => !fs.existsSync(j.file)).length, 'to synthesize');

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
        fs.writeFileSync(j.file, psxify(Buffer.from(await r.arrayBuffer()), 8000));
        console.log('ok', path.basename(j.file));
      } catch (e) { failures.push(j.name + '_' + j.cat + '_' + j.i); console.log('FAIL', j.name, j.cat, j.i, String(e).slice(0, 140)); }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));

  // assemble pack for the requested names only
  const pack = {};
  let count = 0;
  for (const j of jobs) {
    if (!fs.existsSync(j.file)) continue;
    pack[j.name] = pack[j.name] || {};
    pack[j.name][j.cat] = pack[j.name][j.cat] || [];
    pack[j.name][j.cat][j.i] = 'data:audio/wav;base64,' + fs.readFileSync(j.file).toString('base64');
    count++;
  }
  // pick the next free chunk index
  let n = 1; while (fs.existsSync(path.join(ROOT, 'npcvoices' + (n + 1) + '.js'))) n++;
  const chunkIdx = n + 1;
  const out = '// Per-NPC 8kHz PSX voice lines, additive chunk ' + chunkIdx + ' (Fish Audio TTS\n' +
    '// via tools/ttsgen/addvoices.js). Merges whole characters into the shared\n' +
    '// window.NPC_VOICES registry; late-loaded by game.js. Order-independent.\n' +
    '(function (p) { window.NPC_VOICES = window.NPC_VOICES || {}; for (var k in p) window.NPC_VOICES[k] = p[k]; })(' +
    JSON.stringify(pack) + ');\n';
  new Function(out);
  fs.writeFileSync(path.join(ROOT, 'npcvoices' + chunkIdx + '.js'), out);
  console.log('wrote npcvoices' + chunkIdx + '.js —', Object.keys(pack).join(','), count, 'lines, ~' + Math.round(out.length / 1024) + 'KB');

  // bump NPC_VOICE_CHUNKS in chunk 1 to include the new chunk
  const c1 = path.join(ROOT, 'npcvoices1.js');
  let s = fs.readFileSync(c1, 'utf8');
  const m = s.match(/window\.NPC_VOICE_CHUNKS = (\d+);/);
  if (!m) { console.error('could not find NPC_VOICE_CHUNKS in npcvoices1.js'); process.exit(1); }
  if (+m[1] < chunkIdx) {
    s = s.replace(/window\.NPC_VOICE_CHUNKS = \d+;/, 'window.NPC_VOICE_CHUNKS = ' + chunkIdx + ';');
    fs.writeFileSync(c1, s);
    console.log('NPC_VOICE_CHUNKS', m[1], '->', chunkIdx);
  } else console.log('NPC_VOICE_CHUNKS already', m[1]);
  console.log('failures:', failures.join(',') || 'none');
  console.log('ADDVOICESDONE');
})();
