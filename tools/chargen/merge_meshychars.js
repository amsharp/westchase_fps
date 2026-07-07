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
const out = '// AI-generated PSX characters (gpt-image-1 seed -> Meshy image-to-3D ->\n' +
  '// rigging -> offline dominant-bone split; see tools/chargen/). Loaded\n' +
  '// before game.js; safe to omit — the game checks typeof MESHY_CHARS.\n' +
  'var MESHY_CHARS = ' + JSON.stringify(list) + ';\n';
new Function(out);   // syntax gate before touching the game
fs.writeFileSync(TARGET, out);
console.log('wrote', TARGET, '-', list.length, 'characters, ~' + Math.round(out.length / 1024) + 'KB');
console.log('names:', list.map(e => e.n).join(', '));
