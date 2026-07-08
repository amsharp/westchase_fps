// mkhouses.js — assemble houses.js (game data file) from generated cluster
// textures + a layout file.
//   node mkhouses.js work/layout.json work/houses.js
//
// layout.json:
// { "clusters": { id: { "dims":[w,d,h], "roofType":"hip|gable|flat",
//                       "roofH":2.6, "wallColor":"#rrggbb" } },
//   "instances": [ [id, x, z, rotDeg, colorShift], ... ] }
// Textures are read from work/<id>_tex.json (made by genfacade.js).
'use strict';
const fs = require('fs');
const path = require('path');

const [, , layoutF, outF] = process.argv;
if (!outF) { console.error('usage: node mkhouses.js layout.json houses.js'); process.exit(1); }
const layout = JSON.parse(fs.readFileSync(layoutF, 'utf8'));

const clusters = {};
for (const id of Object.keys(layout.clusters)) {
  const tex = JSON.parse(fs.readFileSync(path.join(__dirname, 'work', id + '_tex.json'), 'utf8'));
  clusters[id] = Object.assign({ tex }, layout.clusters[id]);
}
const out = '// houses.js — AI-generated house clusters (tools/housegen). Load before game.js.\n' +
  'var HOUSE_CLUSTERS = ' + JSON.stringify(clusters) + ';\n' +
  'var HOUSE_INSTANCES = ' + JSON.stringify(layout.instances) + ';\n';
fs.writeFileSync(outF, out);
console.log('wrote', outF, Math.round(out.length / 1024) + 'KB,',
  Object.keys(clusters).length, 'clusters,', layout.instances.length, 'instances');
