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
  const out = '// Per-NPC 8kHz PSX voice lines (Fish Audio TTS via tools/ttsgen/\n' +
    '// npcvoicegen.js). Optional: game checks typeof NPC_VOICES.\n' +
    'var NPC_VOICES = ' + JSON.stringify(pack) + ';\n';
  new Function(out);
  fs.writeFileSync(TARGET, out);
  console.log('wrote', TARGET, count, 'lines, ~' + Math.round(out.length / 1024 / 1024 * 10) / 10 + 'MB');
  console.log('failures:', failures.join(',') || 'none');
  console.log('NPCVOICESDONE');
})();
