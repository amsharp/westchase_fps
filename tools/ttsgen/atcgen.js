// Targeted generator for the air-traffic-controller radio lines. Synthesizes
// ONLY the ATC lines via Fish Audio, applies the extra-crusty 8000 Hz radio
// crunch (psxify), and MERGES them into the existing repo-root voicelines.js
// WITHOUT rebuilding the rest of the pack.
//   FISH_API_KEY=... node atcgen.js
const fs = require('fs');
const path = require('path');
const { psxify, speakable } = require('./psxify.js');

const KEY = process.env.FISH_API_KEY;
if (!KEY) { console.error('set FISH_API_KEY'); process.exit(1); }
const WORK = path.join(__dirname, 'work');
const TARGET = path.join(__dirname, '..', '..', 'voicelines.js');
fs.mkdirSync(WORK, { recursive: true });

// ATC voice (Fish catalog "Air Traffic Controller" — clear authoritative male).
const ATC = '57edb16ea01a4d12adaf5e7ea518be0e';
const LINES = {
  atc_runway_1: { voice: ATC, text: '(confused) Unknown aircraft, you are not cleared for takeoff. Vacate the runway immediately.' },
  atc_runway_2: { voice: ATC, text: '(annoyed) Hold your position! You are not authorized. Get off the active runway, now!' },
  atc_hijack_1: { voice: ATC, text: '(shouting) All units — aircraft departing without clearance! Possible hijack in progress!' },
  atc_hijack_2: { voice: ATC, text: '(nervous) Unauthorized departure — we have a possible hijacking. Notify the authorities!' },
};

function loadPack() {
  if (!fs.existsSync(TARGET)) return {};
  const src = fs.readFileSync(TARGET, 'utf8');
  const i = src.indexOf('var VOICE_LINES = ');
  if (i < 0) return {};
  let j = src.lastIndexOf('};');
  const json = src.slice(i + 'var VOICE_LINES = '.length, j + 1);
  return JSON.parse(json);
}

(async () => {
  const pack = loadPack();
  console.log('existing lines:', Object.keys(pack).length);
  for (const id of Object.keys(LINES)) {
    const { text, voice } = LINES[id];
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
      fs.writeFileSync(crunched, psxify(raw, 8000));   // 8000 Hz = extra-crusty radio chatter
    }
    pack[id] = 'data:audio/wav;base64,' + fs.readFileSync(crunched).toString('base64');
    console.log(' ', id, Math.round(pack[id].length / 1024) + 'KB');
  }
  const out = '// PS1-crunched TTS dialogue (Fish Audio -> tools/ttsgen). Loaded before\n' +
    '// game.js; safe to omit — the game checks typeof VOICE_LINES.\n' +
    'var VOICE_LINES = ' + JSON.stringify(pack) + ';\n';
  new Function(out);   // sanity-parse
  fs.writeFileSync(TARGET, out);
  console.log('wrote', TARGET, '~' + Math.round(out.length / 1024) + 'KB,', Object.keys(pack).length, 'lines total');
})().catch(e => { console.error(String(e)); process.exit(1); });
