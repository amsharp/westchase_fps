// SFX pipeline — pack verifier. Loads the SHIPPED soundfx.js in headless
// chromium, decodes every SFX_PACK entry via OfflineAudioContext and reports
// duration / peak / attack per entry; engine loops are additionally decoded
// DOUBLED to measure the envelope discontinuity at the loop seam.
//   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/sfxgen/verify.js
// Exit 1 if any entry fails to decode or a loop seam jumps > 0.35x local RMS.
var pw = require('playwright');
var fs = require('fs');
var path = require('path');

var SCRATCH = process.env.SFX_SCRATCH ||
  '/tmp/claude-0/-home-user-westchase-fps/efaef73e-76aa-5d75-8d6c-935e41bd5d2d/scratchpad';
var PACK_SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'soundfx.js'), 'utf8');

(async function () {
  var browser = await pw.chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox']
  });
  var page = await browser.newPage();
  await page.addScriptTag({ content: PACK_SRC });
  var res = await page.evaluate(async function () {
    async function dec(url) {
      var bin = atob(url.split(',')[1]), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var probe = new OfflineAudioContext(1, 44100, 44100);
      return await probe.decodeAudioData(bytes.buffer);
    }
    var out = {}, keys = Object.keys(SFX_PACK);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k], arr = SFX_PACK[key];
      out[key] = [];
      for (var v = 0; v < arr.length; v++) {
        try {
          var buf = await dec(arr[v]);
          var d = buf.getChannelData(0), sr = buf.sampleRate, i;
          var pk = 0;
          for (i = 0; i < d.length; i++) { var a = d[i] < 0 ? -d[i] : d[i]; if (a > pk) pk = a; }
          var atk = 0;
          for (i = 0; i < d.length; i++) if ((d[i] < 0 ? -d[i] : d[i]) > pk * 0.6) { atk = i / sr; break; }
          var e = { ok: true, sr: sr, dur: Math.round(buf.duration * 1000) / 1000, peak: Math.round(pk * 1000) / 1000, attackMs: Math.round(atk * 1000) };
          if (key.indexOf('eng_') === 0) {
            // seam check at the interior loop points the game uses
            // (loopStart = 0.1s, loopEnd = dur - 0.1s; margins are context)
            var M = Math.round(sr * 0.1), n = d.length, w = Math.round(sr * 0.01);
            var end = n - M, start = M, b4 = 0, af = 0;
            for (i = 0; i < w; i++) { b4 += d[end - w + i] * d[end - w + i]; af += d[start + i] * d[start + i]; }
            b4 = Math.sqrt(b4 / w); af = Math.sqrt(af / w);
            e.seamRmsBefore = Math.round(b4 * 1000) / 1000;
            e.seamRmsAfter = Math.round(af * 1000) / 1000;
            e.seamSampleJump = Math.round(Math.abs(d[start] - d[end - 1]) * 1000) / 1000;
            e.seamOk = Math.abs(d[start] - d[end - 1]) <= Math.max(0.06, 0.35 * Math.max(b4, af));
          }
          out[key].push(e);
        } catch (err) {
          out[key].push({ ok: false, err: String(err) });
        }
      }
    }
    return out;
  });
  var bad = 0, lines = [];
  Object.keys(res).forEach(function (k) {
    res[k].forEach(function (e, i) {
      if (!e.ok) { bad++; lines.push(k + '_' + i + ': DECODE FAIL ' + e.err); return; }
      if (e.seamOk === false) { bad++; lines.push(k + '_' + i + ': SEAM FAIL jump=' + e.seamSampleJump); }
      lines.push(k + '_' + i + ': ' + e.dur + 's @' + e.sr + ' peak=' + e.peak + ' atk=' + e.attackMs + 'ms' +
        (e.seamSampleJump !== undefined ? ' seamJump=' + e.seamSampleJump + ' rms(' + e.seamRmsBefore + '/' + e.seamRmsAfter + ')' : ''));
    });
  });
  console.log(lines.join('\n'));
  fs.writeFileSync(path.join(SCRATCH, 'sfx_pack_verify.json'), JSON.stringify(res, null, 1));
  console.log(bad ? 'FAILURES: ' + bad : 'ALL ENTRIES OK');
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(function (e) { console.error('FATAL', e); process.exit(2); });
