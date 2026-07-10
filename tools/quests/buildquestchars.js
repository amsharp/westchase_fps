// buildquestchars.js — assemble ../../questchars.js from the quest wave output +
// reskin manifest. Emits:
//   var QUEST_CHARS   = [ ...10 skinned meshychars-format NPCs..., BISCUIT(animal) ];
//   var QUEST_RESKINS = [ {n, base, tex, role, quest, notes}, ... ];  (6 texture-only)
// Skinned entries build exactly like MESHY_CHARS (getMeshySkin/buildMeshySkinned).
// Reskins: clone `base` geo/skel/clips, swap the map to the entry's tex. `base`
// may name a QUEST_CHARS entry (CONCIERGE), a MESHY_CHARS entry (DIEGO/TYRELL/
// ALEX) or a KID_CHARS entry (LEO) — resolve across all loaded char arrays.
// BISCUIT is an animal: reuse the accessprops.js `dog` mesh (texVariant), no rig.
// node --check + new Function gate; splits to questchars2.js if > 12 MB.
const fs = require('fs');
const path = require('path');
const HERE = __dirname, ROOT = path.join(HERE, '..', '..'), WORK = path.join(HERE, 'work');

const skins = JSON.parse(fs.readFileSync(path.join(WORK, 'chars', 'questskins_data.json'), 'utf8'));
const roster = require('./quest_roster.json').chars;
for (const e of skins) if (roster[e.n]) { e.quest = roster[e.n].quest; e.role = 'quest'; }

// BISCUIT — non-humanoid: reuse accessprops `dog` mesh at build time.
const biscuit = {
  n: 'BISCUIT', kind: 'animal', prop: 'dog', propSource: 'accessprops.js',
  texVariant: 'chocolate', quest: 'q9_biscuit', role: 'quest',
  notes: "Reuse ACCESS_PROPS 'dog' mesh (chocolate / black-&-tan variant). Small scruffy brown mutt companion; procedural trot bob, no skeleton. Summoned by the Dog Whistle."
};
const questChars = skins.concat([biscuit]);

// reskins
const manifest = require('./quest_reskins.json');
const reskins = [];
for (const m of manifest) {
  const fp = path.join(WORK, 'reskin', m.file);
  if (!fs.existsSync(fp)) { console.log('SKIP (no tex):', m.n); continue; }
  const tex = 'data:image/jpeg;base64,' + fs.readFileSync(fp).toString('base64');
  reskins.push({ n: m.n, base: m.base, baseSrc: m.src, tex: tex, role: m.role, quest: m.quest, notes: m.notes });
}

const header = '// questchars.js — 11 quest NPC looks for Westchase FPS (wave #77).\n' +
  '// OFFLINE: gpt-image-1 T-pose seeds -> Meshy image-to-3d lowpoly -> rigging\n' +
  '// -> genskin (own walk/run clips), same skinned schema as meshychars.js.\n' +
  '// Load AFTER meshychars.js + kidchars.js (reskins reference their bases) and\n' +
  '// BEFORE game.js; guard typeof QUEST_CHARS.\n' +
  '// QUEST_CHARS: 10 skinned NPCs {n,tex,h,skel,geo,clips,quest} + BISCUIT (animal,\n' +
  '//   reuse accessprops dog mesh). QUEST_RESKINS: 6 texture-only {n,base,tex} —\n' +
  '//   clone the base char geo/skel/clips, swap the map.\n' +
  '// NOTE: quest VLAD / WENDELL are DISTINCT new meshes from the same-named\n' +
  '//   MESHY_CHARS NPCs; the quest system references QUEST_CHARS by this array.\n';

const body = header +
  'var QUEST_CHARS = ' + JSON.stringify(questChars) + ';\n' +
  'var QUEST_RESKINS = ' + JSON.stringify(reskins) + ';\n' +
  "if (typeof module !== 'undefined') module.exports = { QUEST_CHARS: QUEST_CHARS, QUEST_RESKINS: QUEST_RESKINS };\n";

new Function(body);
const MAXB = 12 * 1024 * 1024;
if (body.length > MAXB) {
  const a = header + 'var QUEST_CHARS = ' + JSON.stringify(questChars) + ';\n' +
    "if (typeof module !== 'undefined') module.exports = { QUEST_CHARS: QUEST_CHARS };\n";
  const b = '// QUEST_RESKINS (texture-only variants) — load after questchars.js.\n' +
    'var QUEST_RESKINS = ' + JSON.stringify(reskins) + ';\n' +
    "if (typeof module !== 'undefined') module.exports = { QUEST_RESKINS: QUEST_RESKINS };\n";
  new Function(a); new Function(b);
  fs.writeFileSync(path.join(ROOT, 'questchars.js'), a);
  fs.writeFileSync(path.join(ROOT, 'questchars2.js'), b);
  console.log('SPLIT: questchars.js (' + Math.round(a.length / 1024) + 'KB) + questchars2.js (' + Math.round(b.length / 1024) + 'KB)');
} else {
  fs.writeFileSync(path.join(ROOT, 'questchars.js'), body);
  console.log('wrote questchars.js ~' + Math.round(body.length / 1024) + 'KB');
}
console.log('QUEST_CHARS:', questChars.length, '->', questChars.map(e => e.n).join(', '));
console.log('QUEST_RESKINS:', reskins.length, '->', reskins.map(e => e.n + '<-' + e.base).join(', '));
