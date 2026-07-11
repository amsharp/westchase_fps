// SFX pipeline — flee scream/yell generator (OFFLINE TOOL). The TTS dialogue
// pipeline (Fish, tools/ttsgen) struggles with genuine screaming, so these
// come from Gemini TTS (same GEMINI_API_KEY): expressive prebuilt voices,
// style-prompted screams/panic yells, one call per line. Output is raw PCM
// s16le 24kHz -> wrapped to WAV -> ttsgen's psxify 8-bit/11kHz crunch so they
// sit in the game's PS1 aesthetic -> <scratch>/sfx/screams/<id>.wav.
// NOTE: Lyria audio-conditioning on a reference NPC voice was tried first and
// is NOT supported (400 "Unsupported input mime type for this model").
//   Run: node tools/sfxgen/screamgen.js [id ...]   (default: all)
var fs = require('fs');
var path = require('path');
var psx = require('../ttsgen/psxify.js');

var SCRATCH = process.env.SFX_SCRATCH ||
  '/tmp/claude-0/-home-user-westchase-fps/efaef73e-76aa-5d75-8d6c-935e41bd5d2d/scratchpad/sfx';
var OUTDIR = path.join(SCRATCH, 'screams');
var CALLS = path.join(SCRATCH, 'calls.json');
var KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY not in env'); process.exit(2); }
var MODEL = process.env.TTS_MODEL || 'gemini-2.5-flash-preview-tts';

// id -> {voice, text}. The leading stage direction is the style prompt.
var LINES = {
  scream_m_0: { voice: 'Fenrir', text: 'Scream in absolute wordless terror, a raw panicked scream while running for your life: AAAAAAAHHHH!' },
  scream_m_1: { voice: 'Fenrir', text: 'Yell in total panic, breathless and cracking with fear: HELP! SOMEBODY HELP!' },
  scream_m_2: { voice: 'Puck', text: 'Yell in terrified panic at the top of your lungs while sprinting away: RUN! HE\'S GOT A GUN!' },
  scream_m_3: { voice: 'Puck', text: 'A short sharp terrified shriek of shock, wordless: AAH!' },
  scream_f_0: { voice: 'Kore', text: 'Scream in absolute wordless terror, a raw high panicked scream while running for your life: AAAAAAAHHHH!' },
  scream_f_1: { voice: 'Kore', text: 'Yell in total panic, breathless and cracking with fear: HELP! HELP ME!' },
  scream_f_2: { voice: 'Aoede', text: 'Yell in terrified panic at the top of your lungs while sprinting away: RUN! EVERYBODY RUN!' },
  scream_f_3: { voice: 'Aoede', text: 'A short sharp terrified shriek of shock, wordless: EEEK!' },
  scream_kid_0: { voice: 'Leda', text: 'A young kid screaming in wordless terror while running away: AAAAAAAHH!' },
  scream_kid_1: { voice: 'Leda', text: 'A young kid yelling in panic, voice shaking with fear: MOM! MOOOM!' },
  scream_kid_2: { voice: 'Leda', text: 'A young kid shrieking briefly in fright, wordless: AAH!' }
};

function logCall(id, ok, bytes) {
  var log = [];
  try { log = JSON.parse(fs.readFileSync(CALLS, 'utf8')); } catch (e) { }
  log.push({ t: new Date().toISOString(), model: MODEL, id: id, ok: ok, bytes: bytes || 0 });
  fs.writeFileSync(CALLS, JSON.stringify(log, null, 1));
  return log.length;
}
function pcmToWav(pcm, rate) {
  var h = Buffer.alloc(44);
  h.write('RIFF', 0, 'latin1'); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8, 'latin1');
  h.write('fmt ', 12, 'latin1'); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36, 'latin1'); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function genOne(id) {
  var spec = LINES[id];
  if (!spec) { console.error('unknown id ' + id); return; }
  var r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + KEY, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: spec.text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: spec.voice } } }
      }
    })
  });
  if (!r.ok) {
    var t = await r.text();
    console.error(id + ': HTTP ' + r.status + ' ' + t.slice(0, 250).replace(new RegExp(KEY, 'g'), '***'));
    logCall(id, false, 0);
    return;
  }
  var j = await r.json();
  var parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
  var inline = null;
  for (var i = 0; i < parts.length; i++) if (parts[i].inlineData) { inline = parts[i].inlineData; break; }
  if (!inline) { console.error(id + ': no audio; parts=' + JSON.stringify(parts).slice(0, 200)); logCall(id, false, 0); return; }
  var pcm = Buffer.from(inline.data, 'base64');
  var rate = 24000;
  var m = /rate=(\d+)/.exec(inline.mimeType || '');
  if (m) rate = parseInt(m[1], 10);
  var wav = pcmToWav(pcm, rate);
  var crunched = psx.psxify(wav, 11025);
  fs.writeFileSync(path.join(OUTDIR, id + '.wav'), crunched);
  var n = logCall(id, true, crunched.length);
  console.log(id + ': ' + spec.voice + ' ' + (inline.mimeType || '?') + ' -> ' + crunched.length + 'b psxified — total calls: ' + n);
}

(async function () {
  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });
  var ids = process.argv.slice(2);
  if (!ids.length) ids = Object.keys(LINES);
  for (var i = 0; i < ids.length; i++) await genOne(ids[i]);
})().catch(function (e) { console.error('FATAL', e.message); process.exit(1); });
