// Rebuild remapdata.js from a map-editor export (westchase_map.json).
// Emits REMAP_ROADS, REMAP_EXITS (recomputed), REMAP_CLEAR (building footprints
// + passthrough parking polys), REMAP_VENUES (data-driven building placement),
// REMAP_SURFACES (parking/pavement). game.js consumes these when WC_REMAP.
const fs = require('fs');
const HALF = 600;                        // legacy (unused by bounds now)
// world bounds after the E+S expansion: town in the NW corner
const WLO = -600, WHI = 1800;
const src = process.argv[2] || '/tmp/claude-0/-home-user-westchase-fps/efaef73e-76aa-5d75-8d6c-935e41bd5d2d/scratchpad/westchase_map.json';
const map = JSON.parse(fs.readFileSync(src, 'utf8'));
const r2 = n => Math.round(n * 100) / 100;

// ---- roads (carry every kind + its special params: highway/ramp/merge/water/
// exitdeck + elevation, one-way/lanes, merge endHw, exit taper/gore/clamp,
// highway barGap) ----
const roads = map.roads.map(r => {
  const o = { id: r.id, cls: r.cls, hw: r.hw, pts: r.pts.map(p => [r2(p[0]), r2(p[1])]) };
  if (r.dirt) o.dirt = 1;
  if (r.kind && r.kind !== 'road') o.kind = r.kind;
  if (r.elev) o.elev = r.elev;
  if (r.oneway) o.oneway = true;
  if (r.lanes) o.lanes = r.lanes;
  if (r.endHw != null) o.endHw = r.endHw;
  if (r.taper != null) o.taper = r.taper;
  if (r.goreLen != null) o.goreLen = r.goreLen;
  if (r.clampLine) o.clampLine = r.clampLine.map(p => [r2(p[0]), r2(p[1])]);
  if (r.clampSide != null) o.clampSide = r.clampSide;
  if (r.clampSign != null) o.clampSign = r.clampSign;
  if (r.barGap) o.barGap = r.barGap.map(g => ({ side: g.side, s0: r2(g.s0), s1: r2(g.s1) }));
  return o;
});

// ---- exits: any road endpoint on a wall, inward dir toward the adjacent point ----
// (rivers don't make road exits — no ROAD CLOSED barrier across a waterway)
const exits = [];
for (const r of map.roads) {
  if (r.kind === 'water') continue;
  const ends = [[0, 1], [r.pts.length - 1, r.pts.length - 2]];
  for (const [ei, ni] of ends) {
    const p = r.pts[ei], q = r.pts[ni];
    let edge = null;
    if (p[0] <= WLO + 1) edge = 'W'; else if (p[0] >= WHI - 1) edge = 'E';
    else if (p[1] <= WLO + 1) edge = 'N'; else if (p[1] >= WHI - 1) edge = 'S';
    if (!edge) continue;
    let dx = q[0] - p[0], dz = q[1] - p[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    exits.push({ x: r2(p[0]), z: r2(p[1]), edge, hw: r.hw, dx: r2(dx), dz: r2(dz), id: r.id });
  }
}

// ---- venue footprints for REMAP_CLEAR (sidewalk gaps) + REMAP_VENUES (placement) ----
const clears = [];
const venues = [];
for (const b of map.buildings) {
  clears.push({ x: r2(b.x), z: r2(b.z), rot: b.rot || 0, w: b.w, d: b.d, id: b.id });
  venues.push({ id: b.id, type: b.type, x: r2(b.x), z: r2(b.z), rot: b.rot || 0, w: b.w, d: b.d });
}
// passthrough parking-lot polys
for (const z of (map.zones || [])) clears.push({ poly: z.poly, id: z.id });

// ---- surfaces ----
const surfaces = map.surfaces.map(s => ({ kind: s.kind, x: r2(s.x), z: r2(s.z), rot: s.rot || 0, w: s.w, d: s.d }));

// ---- terrain areas: forest / lake / ocean rect footprints ----
const areas = (map.areas || []).map(a => ({ kind: a.kind, x: r2(a.x), z: r2(a.z), rot: a.rot || 0, w: a.w, d: a.d }));

// ---- emit ----
const J = o => JSON.stringify(o);
let out = '';
out += '// WC_REMAP (R3) true-geometry world data — regenerated from the in-game\n';
out += '// map editor (tools/mapimport.js <- westchase_map.json). Frame: junction at\n';
out += '// (0,0), +x east, +z south. Consumed by game.js when WC_REMAP.\n';
out += 'var REMAP_ROADS = ' + J(roads).replace(/,"dirt":null/g, '') + ';\n';
out += 'var REMAP_EXITS = ' + J(exits) + ';\n';
out += 'var REMAP_CLEAR = ' + J(clears) + ';\n';
out += 'var REMAP_VENUES = ' + J(venues) + ';\n';
out += 'var REMAP_SURFACES = ' + J(surfaces) + ';\n';
out += 'var REMAP_AREAS = ' + J(areas) + ';\n';
// strip the undefined dirt keys JSON dropped already; ensure dirt:1 kept
out = out.replace(/"dirt":null/g, '').replace(/,\}/g, '}');
fs.writeFileSync('remapdata.js', out);
const hw = roads.filter(r => r.kind === 'highway').length, rmp = roads.filter(r => r.kind === 'ramp').length, riv = roads.filter(r => r.kind === 'water').length;
console.log('roads:', roads.length, '(highway ' + hw + ', ramp ' + rmp + ', river ' + riv + ') | exits:', exits.length, exits.map(e => e.edge + ':' + e.id).join(', '));
console.log('venues:', venues.length, '| clears:', clears.length, '| surfaces:', surfaces.length, '| areas:', areas.length);
console.log('wrote remapdata.js', out.length, 'bytes');
