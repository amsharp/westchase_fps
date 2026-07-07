// Merge character entries from one or more meshychars_data.json files into
// the game's meshychars.js (repo root). Entries with the same name are
// replaced; everything else is preserved. Syntax-checks the result.
//   node merge_meshychars.js work/meshychars_data.json [more.json...]
const fs = require('fs');
const path = require('path');
const TARGET = path.join(__dirname, '..', '..', 'meshychars.js');

let list = [];
if (fs.existsSync(TARGET)) {
  const src = fs.readFileSync(TARGET, 'utf8');
  const m = src.match(/var MESHY_CHARS = (\[[\s\S]*\]);/);
  if (m) list = JSON.parse(m[1]);
}
for (const f of process.argv.slice(2)) {
  for (const entry of JSON.parse(fs.readFileSync(f, 'utf8'))) {
    const i = list.findIndex(e => e.n === entry.n);
    if (i >= 0) list[i] = entry; else list.push(entry);
    console.log((i >= 0 ? 'replaced' : 'added'), entry.n);
  }
}
// shared clip set (one walk/run for every character, matched by bone name)
let sharedOut = '';
const sharedFile = path.join(__dirname, 'work', 'shared_clips.json');
if (fs.existsSync(sharedFile)) {
  const sh = JSON.parse(fs.readFileSync(sharedFile, 'utf8'));
  const packed = { names: sh.names, bind: sh.bindR, clips: {} };
  for (const k in sh.clips) packed.clips[k] = { d: sh.clips[k].d, f: sh.clips[k].f, q: sh.clips[k].q, y: sh.clips[k].y };
  sharedOut = 'var MESHY_SHARED_CLIPS = ' + JSON.stringify(packed) + ';\n';
  console.log('shared clips: ' + Object.keys(packed.clips).join('+'));
}
const out = '// AI-generated PSX characters (gpt-image-1 seed -> Meshy image-to-3D ->\n' +
  '// rigging -> skinned conversion; see tools/chargen/). Loaded\n' +
  '// before game.js; safe to omit — the game checks typeof MESHY_CHARS.\n' +
  sharedOut +
  'var MESHY_CHARS = ' + JSON.stringify(list) + ';\n';
new Function(out);   // syntax gate before touching the game
fs.writeFileSync(TARGET, out);
console.log('wrote', TARGET, '-', list.length, 'characters, ~' + Math.round(out.length / 1024) + 'KB');
console.log('names:', list.map(e => e.n).join(', '));
