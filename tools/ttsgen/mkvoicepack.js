// Build the game's voice pack: manifest.json -> Fish Audio TTS -> psxify ->
// voicelines.js (repo root, loaded before game.js, optional at runtime).
//   FISH_API_KEY=... node mkvoicepack.js [manifest.json]
// Manifest: { "line_id": {"text": "...", "voice": "<fish reference_id>"} }
// Raw + crunched WAVs are kept in work/ for auditioning; only regenerates
// lines whose crunched WAV is missing (delete a wav to force a redo).
const fs = require('fs');
const path = require('path');
const { psxify, speakable } = require('./psxify.js');

const KEY = process.env.FISH_API_KEY;
if (!KEY) { console.error('set FISH_API_KEY'); process.exit(1); }
const MANIFEST = process.argv[2] || path.join(__dirname, 'manifest.json');
const WORK = path.join(__dirname, 'work');
const TARGET = path.join(__dirname, '..', '..', 'voicelines.js');
fs.mkdirSync(WORK, { recursive: true });

(async () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const pack = {};
  for (const id of Object.keys(manifest)) {
    const { text, voice } = manifest[id];
    const crunched = path.join(WORK, id + '.wav');
    if (!fs.existsSync(crunched)) {
      console.log('tts:', id, '-', JSON.stringify(text));
      const r = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', model: 's1' },
        body: JSON.stringify({ text: speakable(text), reference_id: voice, format: 'wav' }),
      });
      if (!r.ok) throw new Error(id + ': HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
      const raw = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(path.join(WORK, id + '_raw.wav'), raw);
      fs.writeFileSync(crunched, psxify(raw, 8000));
    }
    pack[id] = 'data:audio/wav;base64,' + fs.readFileSync(crunched).toString('base64');
    console.log(' ', id, Math.round(pack[id].length / 1024) + 'KB');
  }
  const out = '// PS1-crunched TTS dialogue (Fish Audio -> tools/ttsgen). Loaded before\n' +
    '// game.js; safe to omit — the game checks typeof VOICE_LINES.\n' +
    'var VOICE_LINES = ' + JSON.stringify(pack) + ';\n';
  new Function(out);
  fs.writeFileSync(TARGET, out);
  console.log('wrote', TARGET, '~' + Math.round(out.length / 1024) + 'KB,', Object.keys(pack).length, 'lines');
})().catch(e => { console.error(String(e)); process.exit(1); });
