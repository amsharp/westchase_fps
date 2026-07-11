// SFX pipeline — Lyria clip generator (OFFLINE TOOL, never shipped/called by
// the game). POSTs a "Sound effect: ..." prompt to lyria-3-clip-preview and
// saves the returned ~27s audio/mpeg clip into the scratchpad raw dir.
//   Run: node tools/sfxgen/gen.js <id> [<id> ...]      (ids from prompts.json)
//        node tools/sfxgen/gen.js <id>=2               (regen -> saves <id>_v2)
// Key: GEMINI_API_KEY from the env (source the scratchpad pipeline.env first);
// NEVER hardcode or print it. Every call is appended to calls.json (budget log).
var fs = require('fs');
var path = require('path');

var SCRATCH = process.env.SFX_SCRATCH ||
  '/tmp/claude-0/-home-user-westchase-fps/efaef73e-76aa-5d75-8d6c-935e41bd5d2d/scratchpad/sfx';
var RAW = path.join(SCRATCH, 'raw');
var CALLS = path.join(SCRATCH, 'calls.json');
var KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY not in env'); process.exit(2); }
var PROMPTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'prompts.json'), 'utf8'));
var MODEL = process.env.LYRIA_MODEL || 'lyria-3-clip-preview';

function logCall(id, ok, bytes) {
  var log = [];
  try { log = JSON.parse(fs.readFileSync(CALLS, 'utf8')); } catch (e) { }
  log.push({ t: new Date().toISOString(), model: MODEL, id: id, ok: ok, bytes: bytes || 0 });
  fs.writeFileSync(CALLS, JSON.stringify(log, null, 1));
  return log.length;
}

async function genOne(id, ver) {
  var spec = PROMPTS[id];
  if (!spec) { console.error('unknown id: ' + id); return false; }
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL +
    ':generateContent?key=' + KEY;
  var body = { contents: [{ parts: [{ text: spec.prompt }] }] };
  var r = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    var t = await r.text();
    console.error(id + ': HTTP ' + r.status + ' ' + t.slice(0, 300).replace(new RegExp(KEY, 'g'), '***'));
    logCall(id, false, 0);
    return false;
  }
  var j = await r.json();
  var parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
  var inline = null;
  for (var i = 0; i < parts.length; i++) if (parts[i].inlineData) { inline = parts[i].inlineData; break; }
  if (!inline) {
    console.error(id + ': no inlineData in response; parts=' + JSON.stringify(parts.map(function (p) { return Object.keys(p); })));
    logCall(id, false, 0);
    return false;
  }
  var buf = Buffer.from(inline.data, 'base64');
  var out = path.join(RAW, id + (ver > 1 ? '_v' + ver : '') + '.mp3');
  fs.writeFileSync(out, buf);
  var n = logCall(id, true, buf.length);
  console.log(id + ': saved ' + out + ' (' + buf.length + ' bytes, ' + (inline.mimeType || '?') + ') — total calls: ' + n);
  return true;
}

(async function () {
  var args = process.argv.slice(2);
  if (!args.length) { console.log('ids: ' + Object.keys(PROMPTS).join(' ')); return; }
  for (var i = 0; i < args.length; i++) {
    var m = args[i].split('='), id = m[0], ver = m[1] ? parseInt(m[1], 10) : 1;
    await genOne(id, ver);
  }
})().catch(function (e) { console.error('FATAL', e.message); process.exit(1); });
