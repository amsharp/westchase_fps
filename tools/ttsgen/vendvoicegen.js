// Build the street-vendor voice pack: vend_lines.json -> Fish Audio TTS ->
// psxify (8kHz PSX crunch) -> vendvoices.js (repo root, loaded before game.js,
// optional at runtime — the game guards with typeof VEND_VOICES).
//   FISH_API_KEY=... node vendvoicegen.js
// Per-NAME packs: VEND_VOICES[name][cat][i] = data-URL WAV. Crunched WAVs are
// cached in work/vend/; delete one to force a redo. _voices maps NAME -> ref.
const fs = require('fs');
const path = require('path');
const { psxify, speakable } = require('./psxify.js');

const KEY = process.env.FISH_API_KEY;
if (!KEY) { console.error('set FISH_API_KEY'); process.exit(1); }
const SRC = path.join(__dirname, 'vend_lines.json');
const WORK = path.join(__dirname, 'work', 'vend');
const TARGET = path.join(__dirname, '..', '..', 'vendvoices.js');
fs.mkdirSync(WORK, { recursive: true });

(async () => {
  const cat = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const voices = cat._voices;
  const pack = {};
  let total = 0;
  for (const name of Object.keys(cat)) {
    if (name[0] === '_') continue;
    const ref = voices[name];
    if (!ref) throw new Error('no _voices ref for ' + name);
    pack[name] = {};
    for (const c of Object.keys(cat[name])) {
      const lines = cat[name][c];
      pack[name][c] = [];
      for (let i = 0; i < lines.length; i++) {
        const id = name + '_' + c + '_' + i;
        const crunched = path.join(WORK, id + '.wav');
        if (!fs.existsSync(crunched)) {
          console.log('tts:', id, '-', JSON.stringify(lines[i]));
          const r = await fetch('https://api.fish.audio/v1/tts', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', model: 's1' },
            body: JSON.stringify({ text: speakable(lines[i]), reference_id: ref, format: 'wav' }),
          });
          if (!r.ok) throw new Error(id + ': HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
          const raw = Buffer.from(await r.arrayBuffer());
          fs.writeFileSync(path.join(WORK, id + '_raw.wav'), raw);
          fs.writeFileSync(crunched, psxify(raw, 8000));
        }
        pack[name][c].push('data:audio/wav;base64,' + fs.readFileSync(crunched).toString('base64'));
        total++;
      }
    }
  }
  const out = '// PS1-crunched street-vendor dialogue (Fish Audio -> tools/ttsgen/\n' +
    '// vendvoicegen.js). Loaded before game.js; safe to omit — the game checks\n' +
    '// typeof VEND_VOICES. VEND_VOICES[name][cat][i] = data-URL WAV.\n' +
    'window.VEND_VOICES = Object.assign(window.VEND_VOICES || {}, ' + JSON.stringify(pack) + ');\n';
  new Function(out);
  fs.writeFileSync(TARGET, out);
  console.log('wrote', TARGET, '~' + Math.round(out.length / 1024) + 'KB,', total, 'lines');
})().catch(e => { console.error(String(e)); process.exit(1); });
