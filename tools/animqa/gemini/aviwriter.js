// tools/animqa/gemini/aviwriter.js — minimal pure-Node MJPEG-AVI muxer.
//
// Why: under headless swiftshader there is no GPU and no vsync, so MediaRecorder
// + canvas.captureStream is compositor-bound to <1 fps and produced 0-frame
// webms (see record.js header). The reliable path is to render the game to an
// off-screen WebGLRenderTarget, read pixels back, JPEG-encode each frame in the
// page, and mux the JPEGs here into an AVI with the MJPG codec — a container
// Gemini accepts (video/avi) and that needs no ffmpeg/npm. Playback fps is set
// by the caller so a fixed-timestep capture plays back as smooth real-time
// motion even though each frame took ~1 s of wall-clock to render.
//
//   const { writeAvi } = require('./aviwriter');
//   writeAvi(outPath, jpegBuffers, width, height, fps);

function fourcc(s) { return Buffer.from(s.slice(0, 4).padEnd(4, ' '), 'ascii'); }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0, 0); return b; }
function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n & 0xffff, 0); return b; }
function chunk(id, payload) { // pads payload to even length
  const pad = payload.length & 1 ? Buffer.from([0]) : Buffer.alloc(0);
  return Buffer.concat([fourcc(id), u32(payload.length), payload, pad]);
}
function list(type, payloads) {
  const body = Buffer.concat([fourcc(type), ...payloads]);
  return Buffer.concat([fourcc('LIST'), u32(body.length), body]);
}

function writeAvi(outPath, frames, width, height, fps) {
  const fs = require('fs');
  const n = frames.length;
  const usPerFrame = Math.round(1e6 / (fps || 12));

  // --- avih (main AVI header, 56 bytes) ---
  const avih = Buffer.concat([
    u32(usPerFrame), u32(0), u32(0), u32(0x10 /*AVIF_HASINDEX*/),
    u32(n), u32(0), u32(1 /*streams*/), u32(0),
    u32(width), u32(height), u32(0), u32(0), u32(0), u32(0)
  ]);

  // --- strh (stream header, 56 bytes) ---
  const strh = Buffer.concat([
    fourcc('vids'), fourcc('MJPG'), u32(0), u16(0), u16(0),
    u32(0), u32(1 /*scale*/), u32(fps || 12 /*rate*/), u32(0), u32(n),
    u32(0), u32(0xffffffff /*quality -1*/), u32(0),
    u16(0), u16(0), u16(width), u16(height)   // rcFrame l,t,r,b
  ]);

  // --- strf (BITMAPINFOHEADER, 40 bytes) ---
  const strf = Buffer.concat([
    u32(40), u32(width), u32(height), u16(1), u16(24),
    fourcc('MJPG'), u32(width * height * 3), u32(0), u32(0), u32(0), u32(0)
  ]);

  const strl = list('strl', [chunk('strh', strh), chunk('strf', strf)]);
  const hdrl = list('hdrl', [chunk('avih', avih), strl]);

  // --- movi list of 00dc frame chunks + idx1 offsets (relative to 'movi' fourcc) ---
  const frameChunks = [];
  const idx = [];
  let off = 4; // first chunk sits right after the 'movi' fourcc
  for (let i = 0; i < n; i++) {
    const fc = chunk('00dc', frames[i]);
    frameChunks.push(fc);
    idx.push(Buffer.concat([fourcc('00dc'), u32(0x10 /*AVIIF_KEYFRAME*/), u32(off), u32(frames[i].length)]));
    off += fc.length;
  }
  const movi = list('movi', frameChunks);
  const idx1 = chunk('idx1', Buffer.concat(idx));

  const riffBody = Buffer.concat([fourcc('AVI '), hdrl, movi, idx1]);
  const riff = Buffer.concat([fourcc('RIFF'), u32(riffBody.length), riffBody]);
  fs.writeFileSync(outPath, riff);
  return riff.length;
}

module.exports = { writeAvi };
