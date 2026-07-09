// Kid voice pack: kid_voices.json (personas + parents) + kid_lines.json ->
// Fish Audio TTS -> psxify 8kHz -> kidvoices1.js (repo root, window.KID_VOICES,
// optional at runtime). Lines are keyed by PERSONA, not by look — task #72
// maps each kid look to a persona via kid_voices.json .lookMap.
//   FISH_API_KEY=... node kidvoicegen.js [--conc 3] [--only PERSONA,...]
// Resumable: crunched WAVs cached in work/kid/, delete one to force a redo.
const fs = require('fs');
const path = require('path');
const { psxify, speakable } = require('./psxify.js');

const KEY = process.env.FISH_API_KEY;
if (!KEY) { console.error('set FISH_API_KEY'); process.exit(1); }
const VJ = JSON.parse(fs.readFileSync(path.join(__dirname, 'kid_voices.json'), 'utf8'));
const LINES = JSON.parse(fs.readFileSync(path.join(__dirname, 'kid_lines.json'), 'utf8'));
const WORK = path.join(__dirname, 'work', 'kid');
const TARGET = path.join(__dirname, '..', '..', 'kidvoices1.js');
fs.mkdirSync(WORK, { recursive: true });

// merge persona + parent refs into one lookup
const REF = {};
for (const k in VJ.personas) REF[k] = VJ.personas[k].ref;
for (const k in VJ.parents) if (k !== '_comment') REF[k] = VJ.parents[k].ref;

function opt(flag, dflt) { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : dflt; }
const CONC = +opt('--conc', 3);
const ONLY = opt('--only', '') ? opt('--only', '').split(',') : null;

const jobs = [];
for (const name of Object.keys(LINES)) {
  if (name.startsWith('_') || ONLY && !ONLY.includes(name)) continue;
  if (!REF[name]) { console.log('NO REF for', name, '- skipped'); continue; }
  for (const cat of Object.keys(LINES[name])) {
    if (cat.startsWith('_')) continue;
    const arr = LINES[name][cat];
    arr.forEach((text, i) => jobs.push({ name, cat, i, text, file: path.join(WORK, name + '_' + cat + '_' + i + '.wav') }));
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
          body: JSON.stringify({ text: speakable(j.text), reference_id: REF[j.name], format: 'wav' }),
        });
        if (!r.ok) throw new Error('TTS HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
        fs.writeFileSync(j.file, psxify(Buffer.from(await r.arrayBuffer()), 8000));
        console.log('ok', path.basename(j.file));
      } catch (e) { failures.push(j.name + '_' + j.cat + '_' + j.i); console.log('FAIL', j.name, j.cat, j.i, String(e).slice(0, 140)); }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));

  // assemble window.KID_VOICES = { persona: { cat: [dataURL,...] } }
  const pack = {};
  let bytes = 0, count = 0;
  for (const j of jobs) {
    if (!fs.existsSync(j.file)) continue;
    const b = fs.readFileSync(j.file);
    (pack[j.name] = pack[j.name] || {});
    (pack[j.name][j.cat] = pack[j.name][j.cat] || []);
    pack[j.name][j.cat][j.i] = 'data:audio/wav;base64,' + b.toString('base64');
    bytes += b.length; count++;
  }
  const out = '// Kid + parent-to-kid 8kHz PSX voice lines (Fish Audio TTS via\n' +
    '// tools/ttsgen/kidvoicegen.js). window.KID_VOICES[persona][category] = [wav data-URLs].\n' +
    '// Task #72 maps each kid LOOK to a persona via kidchars/kid_voices lookMap.\n' +
    '// Loaded before game.js, optional at runtime (guard: typeof KID_VOICES).\n' +
    'window.KID_VOICES = ' + JSON.stringify(pack) + ';\n';
  new Function(out);   // syntax gate
  fs.writeFileSync(TARGET, out);
  console.log('wrote', TARGET, '~' + Math.round(out.length / 1024) + 'KB,', count, 'clips across', Object.keys(pack).length, 'personas');
  console.log('failures:', failures.join(',') || 'none');
  console.log('KIDVOICESDONE');
})();
