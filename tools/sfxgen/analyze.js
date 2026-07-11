// SFX pipeline — clip analyzer. Decodes an mp3/wav in headless chromium
// (OfflineAudioContext; no ffmpeg on this box) and prints a 25ms-window peak
// envelope + detected transient segments, so slice.js configs can be authored
// against real data.
//   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/sfxgen/analyze.js <file.mp3> [outJson]
var pw = require('playwright');
var fs = require('fs');

var FILE = process.argv[2];
var OUT = process.argv[3];
if (!FILE) { console.error('usage: analyze.js <audiofile> [outJson]'); process.exit(2); }
var b64 = fs.readFileSync(FILE).toString('base64');

(async function () {
  var browser = await pw.chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox']
  });
  var page = await browser.newPage();
  var res = await page.evaluate(async function (b64) {
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var probe = new OfflineAudioContext(1, 44100, 44100);
    var buf = await probe.decodeAudioData(bytes.buffer);
    var d = buf.getChannelData(0), sr = buf.sampleRate;
    var win = Math.round(sr * 0.025), env = [];
    for (var s = 0; s < d.length; s += win) {
      var p = 0;
      for (var j = s; j < Math.min(d.length, s + win); j++) { var a = d[j] < 0 ? -d[j] : d[j]; if (a > p) p = a; }
      env.push(Math.round(p * 1000) / 1000);
    }
    // transient segmentation: above-threshold runs with 120ms hangover
    var TH = 0.06, segs = [], cur = null, hang = 0, HANG = Math.ceil(0.12 / 0.025);
    for (i = 0; i < env.length; i++) {
      if (env[i] > TH) {
        if (!cur) cur = { s: i, peak: 0 };
        if (env[i] > cur.peak) cur.peak = env[i];
        hang = HANG;
      } else if (cur) {
        if (--hang <= 0) { cur.e = i - HANG + 1; segs.push(cur); cur = null; }
      }
    }
    if (cur) { cur.e = env.length; segs.push(cur); }
    return {
      sr: sr, dur: Math.round(buf.duration * 100) / 100, ch: buf.numberOfChannels,
      env: env,
      segs: segs.map(function (g) {
        return { t0: Math.round(g.s * 25) / 1000, t1: Math.round(g.e * 25) / 1000, peak: g.peak };
      })
    };
  }, b64);
  console.log('dur=' + res.dur + 's sr=' + res.sr + ' ch=' + res.ch + ' segments=' + res.segs.length);
  res.segs.forEach(function (g, i) {
    console.log('  seg' + i + ': ' + g.t0.toFixed(2) + '-' + g.t1.toFixed(2) + 's  len=' + (g.t1 - g.t0).toFixed(2) + '  peak=' + g.peak);
  });
  // coarse ascii envelope (200 cols max)
  var step = Math.max(1, Math.ceil(res.env.length / 200)), line = '';
  for (var i = 0; i < res.env.length; i += step) {
    var m = 0; for (var j = i; j < Math.min(res.env.length, i + step); j++) if (res.env[j] > m) m = res.env[j];
    line += m > 0.6 ? '#' : m > 0.3 ? '+' : m > 0.12 ? '-' : m > 0.04 ? '.' : ' ';
  }
  console.log('[' + line + ']');
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(res));
  await browser.close();
})().catch(function (e) { console.error('FATAL', e); process.exit(1); });
