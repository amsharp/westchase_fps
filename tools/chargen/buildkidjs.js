// Assemble kidchars.js (repo root) from the kid wave output + variant manifest.
// Emits:
//   var KID_CHARS = [ ...meshychars-format skinned entries... ];  // 8 bases
//   var KID_VARIANTS = [ {base, n, race, tex}, ... ];             // 16 reskins
// Kid entries embed their OWN walk/run clips (no shared-clip dependency), carry
// h (target height), race, sex, age, role:'kid'. Variants are texture-only:
// the integrator (#72) clones the base's geo/skel/clips and swaps the map.
// node --check + new Function gate; single file (well under size limits).
const fs = require('fs');
const path = require('path');
const HERE = __dirname, ROOT = path.join(HERE, '..', '..'), WORK = path.join(HERE, 'work');

const kids = JSON.parse(fs.readFileSync(path.join(WORK, 'kidskins_data.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'kid_reskins_manifest.json'), 'utf8'));

// sanity: every base referenced by a variant must exist
const kidNames = new Set(kids.map(k => k.n));
const variants = [];
for (const m of manifest) {
  const fp = path.join(WORK, m.file);
  if (!fs.existsSync(fp)) { console.log('SKIP (no tex):', m.n); continue; }
  if (!kidNames.has(m.base)) { console.log('WARN base missing for variant', m.n, '->', m.base); continue; }
  variants.push({ base: m.base, n: m.n, race: m.race, tex: 'data:image/jpeg;base64,' + fs.readFileSync(fp).toString('base64') });
}

const header = '// Child NPCs for Westchase FPS (task #72 integrates; kids are COMBAT-EXEMPT).\n' +
  '// OFFLINE-generated: child-tuned gpt-image-1 seeds -> Meshy image-to-3D ->\n' +
  '// rigging -> genskin baked at each kid\'s REAL height (--height) with OWN\n' +
  '// walk/run clips (auto-stride for little legs). Same skinned schema as\n' +
  '// meshychars.js. Load after three.min.js, before game.js. Self-contained:\n' +
  '// kids embed their own clips (no MESHY_SHARED_CLIPS dependency).\n' +
  '// KID_CHARS: 8 full skinned kids {n,tex,h,skel,geo,clips,role,race,sex,age}.\n' +
  '//   h = target in-game height (game units, ~1.05-1.42); build the SkinnedMesh\n' +
  '//   at scale 1.0 (geometry is ALREADY baked to h) — do NOT apply the adult\n' +
  '//   0.92 civ build-scale. race = starting ethnicity for parent matching.\n' +
  '// KID_VARIANTS: 16 texture-only reskins {base,n,race,tex} — clone base\n' +
  '//   geo/skel/clips, swap the material map (NearestFilter, no mipmaps).\n';

const body = header +
  'var KID_CHARS = ' + JSON.stringify(kids) + ';\n' +
  'var KID_VARIANTS = ' + JSON.stringify(variants) + ';\n';

new Function(body);  // syntax gate
fs.writeFileSync(path.join(ROOT, 'kidchars.js'), body);
console.log('wrote kidchars.js ~' + Math.round(body.length / 1024) + 'KB');
console.log('KID_CHARS:', kids.length, '->', kids.map(e => e.n + '(h' + e.h + ',' + e.race + ')').join(', '));
console.log('KID_VARIANTS:', variants.length, '->', variants.map(e => e.n + '(' + e.race + ')').join(', '));
