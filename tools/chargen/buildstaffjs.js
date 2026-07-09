// Assemble staffchars.js (repo root) from the staff wave output +
// reskins manifest. Emits:
//   var STAFF_CHARS = [ ...meshychars-format skinned entries... ];
//   var CHAR_RESKINS = [ {base, n, tex, role, venue, job}, ... ];
// Reskin entries carry only a texture; the integrator clones the base
// character's geometry/skeleton/clips and swaps the map. `base` may name a
// STAFF_CHARS entry (Publix team-fills) or a MESHY_CHARS entry (civ variants).
// node --check + new Function gate; splits to staffchars2.js if > 12 MB.
const fs = require('fs');
const path = require('path');
const HERE = __dirname, ROOT = path.join(HERE, '..', '..'), WORK = path.join(HERE, 'work');

const staff = JSON.parse(fs.readFileSync(path.join(WORK, 'staffskins_data.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'reskins_manifest.json'), 'utf8'));

const reskins = [];
for (const m of manifest) {
  const fp = path.join(WORK, m.file);
  if (!fs.existsSync(fp)) { console.log('SKIP (no tex yet):', m.n); continue; }
  const tex = 'data:image/jpeg;base64,' + fs.readFileSync(fp).toString('base64');
  const e = { base: m.base, n: m.n, tex: tex, role: m.role };
  if (m.venue) e.venue = m.venue;
  if (m.job) e.job = m.job;
  reskins.push(e);
}

const header = '// Shop-interior staff + reskin variants for Westchase FPS.\n' +
  '// OFFLINE-generated (gpt-image-1 seeds -> Meshy image-to-3D -> rigging ->\n' +
  '// genskin), same schema as meshychars.js. Loaded before game.js, AFTER\n' +
  '// meshychars.js (reskins reference MESHY_CHARS bases + MESHY_SHARED_CLIPS).\n' +
  '// STAFF_CHARS: full skinned characters. CHAR_RESKINS: texture-only variants\n' +
  '// {base,n,tex,...} — clone base geo/skel/clips, swap the map.\n';

const body = header +
  'var STAFF_CHARS = ' + JSON.stringify(staff) + ';\n' +
  'var CHAR_RESKINS = ' + JSON.stringify(reskins) + ';\n';

new Function(body);  // syntax gate

const MAXB = 12 * 1024 * 1024;
if (body.length > MAXB) {
  // split: STAFF_CHARS in staffchars.js, CHAR_RESKINS in staffchars2.js
  const a = header + 'var STAFF_CHARS = ' + JSON.stringify(staff) + ';\n';
  const b = '// CHAR_RESKINS (texture-only variants) — load after staffchars.js.\n' +
    'var CHAR_RESKINS = ' + JSON.stringify(reskins) + ';\n';
  new Function(a); new Function(b);
  fs.writeFileSync(path.join(ROOT, 'staffchars.js'), a);
  fs.writeFileSync(path.join(ROOT, 'staffchars2.js'), b);
  console.log('SPLIT: staffchars.js (' + Math.round(a.length / 1024) + 'KB) + staffchars2.js (' + Math.round(b.length / 1024) + 'KB)');
} else {
  fs.writeFileSync(path.join(ROOT, 'staffchars.js'), body);
  console.log('wrote staffchars.js ~' + Math.round(body.length / 1024) + 'KB');
}
console.log('STAFF_CHARS:', staff.length, '->', staff.map(e => e.n).join(', '));
console.log('CHAR_RESKINS:', reskins.length, '->', reskins.map(e => e.n).join(', '));
