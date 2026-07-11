// SFX pipeline — slicer. Reads slices.json, decodes each raw Lyria clip in
// headless chromium, cuts one-shots (onset-refined, burst-truncated, faded)
// and seam-crossfaded loops, resamples via OfflineAudioContext, normalizes,
// and writes 16-bit mono WAVs + a QA report (attack/tail/seam metrics).
//   Run: NODE_PATH=/opt/node22/lib/node_modules node tools/sfxgen/slice.js
// Outputs: <scratch>/sfx/cut/<out>_<n>.wav + <scratch>/sfx/slice_report.json
var pw = require('playwright');
var fs = require('fs');
var path = require('path');

var SCRATCH = process.env.SFX_SCRATCH ||
  '/tmp/claude-0/-home-user-westchase-fps/efaef73e-76aa-5d75-8d6c-935e41bd5d2d/scratchpad/sfx';
var SPEC = JSON.parse(fs.readFileSync(path.join(__dirname, 'slices.json'), 'utf8'));

(async function () {
  var browser = await pw.chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox']
  });
  var page = await browser.newPage();
  await page.evaluate(function () {
    // ---- in-page DSP toolkit ----
    window.decodeB64 = async function (b64) {
      var bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var probe = new OfflineAudioContext(1, 44100, 44100);
      var buf = await probe.decodeAudioData(bytes.buffer);
      // mono mixdown
      var n = buf.length, d = new Float32Array(n);
      for (var c = 0; c < buf.numberOfChannels; c++) {
        var ch = buf.getChannelData(c);
        for (i = 0; i < n; i++) d[i] += ch[i] / buf.numberOfChannels;
      }
      return { d: d, sr: buf.sampleRate };
    };
    window.resample = async function (d, sr, outRate) {
      var buf = new OfflineAudioContext(1, d.length, sr);
      var b = buf.createBuffer(1, d.length, sr);
      b.getChannelData(0).set(d);
      var outLen = Math.max(1, Math.round(d.length * outRate / sr));
      var oc = new OfflineAudioContext(1, outLen, outRate);
      var src = oc.createBufferSource(); src.buffer = b; src.connect(oc.destination); src.start();
      var r = await oc.startRendering();
      return r.getChannelData(0);
    };
    window.wavB64 = function (d, rate) {
      var n = d.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
      function ws(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
      ws(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true);
      v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, n * 2, true);
      for (var i = 0; i < n; i++) { var s = Math.max(-1, Math.min(1, d[i])); v.setInt16(44 + i * 2, s * 32767, true); }
      var u8 = new Uint8Array(buf), bin = '';
      for (i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
      return btoa(bin);
    };
    window.envOf = function (d, sr, win) {
      var w = Math.round(sr * win), env = [];
      for (var s = 0; s < d.length; s += w) {
        var p = 0;
        for (var j = s; j < Math.min(d.length, s + w); j++) { var a = d[j] < 0 ? -d[j] : d[j]; if (a > p) p = a; }
        env.push(p);
      }
      return env;
    };
    // one-shot cutter: refine onset inside [t0,t1], optionally truncate at a
    // 2nd onset (burst protection — gun clips where Lyria packed shots close),
    // trim tail at silence, fade in/out, normalize.
    window.cutShot = function (d, sr, t0, t1, maxLen, norm, burstCut) {
      var s0 = Math.max(0, Math.round(t0 * sr)), s1 = Math.min(d.length, Math.round(t1 * sr));
      var seg = d.subarray(s0, s1), i, peak = 0;
      for (i = 0; i < seg.length; i++) { var a = seg[i] < 0 ? -seg[i] : seg[i]; if (a > peak) peak = a; }
      // onset = first sample above 20% of peak; start 8ms before it
      var on = 0, th = peak * 0.2;
      for (i = 0; i < seg.length; i++) { if ((seg[i] < 0 ? -seg[i] : seg[i]) > th) { on = i; break; } }
      var start = Math.max(0, on - Math.round(sr * 0.008));
      // 2nd-onset scan (5ms env): after 60ms past the onset, a fresh rise above
      // 55% of peak following a dip below 12% => next transient; cut there.
      var w5 = Math.round(sr * 0.005), dipped = false, cut = seg.length;
      if (burstCut) for (i = on + Math.round(sr * 0.06); i < seg.length - w5; i += w5) {
        var p5 = 0;
        for (var j = i; j < i + w5; j++) { var b = seg[j] < 0 ? -seg[j] : seg[j]; if (b > p5) p5 = b; }
        if (p5 < peak * 0.12) dipped = true;
        else if (dipped && p5 > peak * 0.55) { cut = i - Math.round(sr * 0.01); break; }
      }
      var end = Math.min(cut, start + Math.round(maxLen * sr), seg.length);
      // tail trim: walk back while below 1.5% of peak
      var floorA = Math.max(0.004, peak * 0.015);
      while (end > start + sr * 0.05 && (seg[end - 1] < 0 ? -seg[end - 1] : seg[end - 1]) < floorA) end--;
      var out = new Float32Array(seg.subarray(start, end));
      var fi = Math.min(out.length >> 2, Math.round(sr * 0.003));
      for (i = 0; i < fi; i++) out[i] *= i / fi;
      var fo = Math.min(out.length >> 1, Math.round(sr * 0.04));
      for (i = 0; i < fo; i++) out[out.length - 1 - i] *= i / fo;
      var opk = 0;   // normalize on the SLICE's own peak (truncation-safe)
      for (i = 0; i < out.length; i++) { var oa = out[i] < 0 ? -out[i] : out[i]; if (oa > opk) opk = oa; }
      var g = norm / Math.max(0.0001, opk);
      for (i = 0; i < out.length; i++) out[i] *= g;
      return out;
    };
    // loop cutter: best seam by waveform self-similarity, then a 90ms
    // crossfade INTO the pre-start audio so end==start by construction.
    window.cutLoop = function (d, sr, r0, r1, L) {
      var Ls = Math.round(L * sr), F = Math.round(sr * 0.09);
      var lo = Math.max(F + 1, Math.round(r0 * sr)), hi = Math.min(d.length - Ls - 1, Math.round(r1 * sr) - Ls);
      var W = Math.round(sr * 0.03), bestS = lo, bestE = 1e9;
      for (var s = lo; s < hi; s += Math.round(sr * 0.01)) {
        var e = 0;
        for (var j = 0; j < W; j += 4) { var df = d[s + j] - d[s + Ls + j]; e += df * df; }
        if (e < bestE) { bestE = e; bestS = s; }
      }
      var out = new Float32Array(Ls), i;
      for (i = 0; i < Ls; i++) out[i] = d[bestS + i];
      for (i = 0; i < F; i++) {
        var w = i / F;   // 0 -> 1 across the fade
        out[Ls - F + i] = out[Ls - F + i] * (1 - w) + d[bestS - F + i] * w;
      }
      var peak = 0;
      for (i = 0; i < Ls; i++) { var a = out[i] < 0 ? -out[i] : out[i]; if (a > peak) peak = a; }
      return { out: out, peak: peak, seamErr: Math.sqrt(bestE / (W / 4)) };
    };
    window.normTo = function (out, peak, norm) {
      var g = norm / Math.max(0.0001, peak);
      for (var i = 0; i < out.length; i++) out[i] *= g;
    };
    // loop seam QA: double the buffer and measure the env jump at the seam
    window.seamCheck = function (out, sr) {
      var two = new Float32Array(out.length * 2);
      two.set(out); two.set(out, out.length);
      var w = Math.round(sr * 0.01), c = out.length;
      var a = 0, b = 0;
      for (var i = 0; i < w; i++) { var x = two[c - w + i], y = two[c + i]; a += x * x; b += y * y; }
      a = Math.sqrt(a / w); b = Math.sqrt(b / w);
      var jump = Math.abs(two[c] - two[c - 1]);
      return { rmsBefore: a, rmsAfter: b, sampleJump: jump };
    };
  });

  var report = {};
  async function runSet(specs, isLoop) {
    for (var k = 0; k < specs.length; k++) {
      var sp = specs[k];
      var b64 = fs.readFileSync(path.join(SCRATCH, 'raw', sp.src)).toString('base64');
      var res = await page.evaluate(async function (arg) {
        var dec = await decodeB64(arg.b64);
        var outs = [];
        if (arg.isLoop) {
          // resample the whole region FIRST so the seam crossfade is built at
          // the final rate (end sample = pre-start sample by construction)
          var rr0 = Math.max(0, Math.round((arg.sp.region[0] - 0.3) * dec.sr));
          var rr1 = Math.min(dec.d.length, Math.round((arg.sp.region[1] + 0.1) * dec.sr));
          var regRs = await resample(dec.d.subarray(rr0, rr1), dec.sr, arg.sp.rate);
          var L = cutLoop(regRs, arg.sp.rate, 0.3, regRs.length / arg.sp.rate, arg.sp.len);
          normTo(L.out, L.peak, arg.sp.norm);
          var sc = seamCheck(L.out, arg.sp.rate);
          outs.push({
            wav: wavB64(L.out, arg.sp.rate), dur: L.out.length / arg.sp.rate,
            peak: arg.sp.norm, seam: sc, seamErr: L.seamErr
          });
        } else {
          for (var p = 0; p < arg.sp.picks.length; p++) {
            var cutd = cutShot(dec.d, dec.sr, arg.sp.picks[p][0], arg.sp.picks[p][1], arg.sp.maxLen, arg.sp.norm, !!arg.sp.burstCut);
            var rs2 = await resample(cutd, dec.sr, arg.sp.rate);
            // normalize AFTER resample (the downsample lowpass can eat a
            // single-sample transient peak — e.g. the cash-bell ding)
            var pk = 0, i;
            for (i = 0; i < rs2.length; i++) { var a = rs2[i] < 0 ? -rs2[i] : rs2[i]; if (a > pk) pk = a; }
            var gg = arg.sp.norm / Math.max(0.0001, pk);
            for (i = 0; i < rs2.length; i++) rs2[i] *= gg;
            pk = arg.sp.norm;
            var atk = 0;
            for (i = 0; i < rs2.length; i++) if ((rs2[i] < 0 ? -rs2[i] : rs2[i]) > pk * 0.6) { atk = i / arg.sp.rate; break; }
            // tail level: RMS of last 20ms
            var tw = Math.round(arg.sp.rate * 0.02), tr = 0;
            for (i = rs2.length - tw; i < rs2.length; i++) tr += rs2[i] * rs2[i];
            outs.push({ wav: wavB64(rs2, arg.sp.rate), dur: rs2.length / arg.sp.rate, peak: pk, attackMs: Math.round(atk * 1000), tailRms: Math.sqrt(tr / tw) });
          }
        }
        return outs;
      }, { b64: b64, sp: sp, isLoop: isLoop });
      report[sp.out] = [];
      for (var v = 0; v < res.length; v++) {
        var f = path.join(SCRATCH, 'cut', sp.out + '_' + v + '.wav');
        fs.writeFileSync(f, Buffer.from(res[v].wav, 'base64'));
        var meta = { file: f, rate: sp.rate, dur: Math.round(res[v].dur * 1000) / 1000, peak: Math.round(res[v].peak * 1000) / 1000 };
        if (isLoop) { meta.seam = res[v].seam; meta.seamErr = res[v].seamErr; }
        else { meta.attackMs = res[v].attackMs; meta.tailRms = Math.round(res[v].tailRms * 10000) / 10000; }
        report[sp.out].push(meta);
        console.log(sp.out + '_' + v + ': ' + meta.dur + 's peak=' + meta.peak +
          (isLoop ? ' seamJump=' + res[v].seam.sampleJump.toFixed(4) + ' seamErr=' + res[v].seamErr.toFixed(4)
            : ' attack=' + meta.attackMs + 'ms tail=' + meta.tailRms));
      }
    }
  }
  await runSet(SPEC.oneshots, false);
  await runSet(SPEC.loops, true);
  fs.writeFileSync(path.join(SCRATCH, 'slice_report.json'), JSON.stringify(report, null, 1));
  await browser.close();
  console.log('report -> ' + path.join(SCRATCH, 'slice_report.json'));
})().catch(function (e) { console.error('FATAL', e); process.exit(1); });
