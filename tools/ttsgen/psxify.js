// PS1-ify a 16-bit PCM WAV: mono mixdown -> lowpass -> decimate to 11025 Hz
// -> normalize -> 8-bit quantize. Usable as a lib (module.exports.psxify) or
// CLI: node psxify.js in.wav out.wav [rateHz]
const fs = require('fs');

function parseWav(buf) {
  if (buf.slice(0, 4).toString('latin1') !== 'RIFF') throw new Error('not RIFF');
  let off = 12, fmt = null, data = null;
  while (off + 8 <= buf.length) {
    const id = buf.slice(off, off + 4).toString('latin1');
    const len = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { codec: buf.readUInt16LE(off + 8), ch: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    else if (id === 'data') data = buf.slice(off + 8, off + 8 + len);
    off += 8 + len + (len & 1);
  }
  if (!fmt || !data) throw new Error('missing fmt/data');
  if (fmt.codec !== 1 || fmt.bits !== 16) throw new Error('need 16-bit PCM, got codec ' + fmt.codec + ' bits ' + fmt.bits);
  return { fmt, data };
}

function psxify(wavBuf, outRate) {
  outRate = outRate || 11025;
  const { fmt, data } = parseWav(wavBuf);
  const frames = data.length / 2 / fmt.ch;
  // mono mixdown to float
  let x = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < fmt.ch; c++) s += data.readInt16LE((i * fmt.ch + c) * 2);
    x[i] = s / fmt.ch / 32768;
  }
  // 2x single-pole lowpass around 0.4 * outRate (anti-alias + PS1 muffle)
  const fc = outRate * 0.4;
  const a = 1 - Math.exp(-2 * Math.PI * fc / fmt.rate);
  for (let pass = 0; pass < 2; pass++) {
    let y = 0;
    for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] = y; }
  }
  // decimate by averaging (integer or fractional step)
  const step = fmt.rate / outRate;
  const n = Math.floor(x.length / step);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s0 = Math.floor(i * step), s1 = Math.min(x.length, Math.floor((i + 1) * step));
    let s = 0;
    for (let k = s0; k < s1; k++) s += x[k];
    out[i] = s / Math.max(1, s1 - s0);
  }
  // normalize to -1dB-ish
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 0 ? 0.89 / peak : 1;
  // 8-bit unsigned WAV
  const dataLen = n;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0, 'latin1'); buf.writeUInt32LE(36 + dataLen, 4); buf.write('WAVE', 8, 'latin1');
  buf.write('fmt ', 12, 'latin1'); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(outRate, 24); buf.writeUInt32LE(outRate, 28);
  buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34);
  buf.write('data', 36, 'latin1'); buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, out[i] * g));
    buf[44 + i] = Math.round((v + 1) * 127.5);
  }
  return buf;
}

if (require.main === module) {
  const out = psxify(fs.readFileSync(process.argv[2]), +(process.argv[4] || 11025));
  fs.writeFileSync(process.argv[3], out);
  console.log('wrote', process.argv[3], Math.round(out.length / 1024) + 'KB');
}
// Leading "(angry) ..." style tone markers are acting notes for the line
// author — Fish S1 reads them ALOUD on many voice models, so strip them
// before synthesis. Keep them in the JSON sources as documentation.
function speakable(text) {
  return text.replace(/^\s*\([^)]{1,24}\)\s*/, '');
}
module.exports = { psxify, speakable };
