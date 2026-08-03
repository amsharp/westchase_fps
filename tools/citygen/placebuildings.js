// placebuildings.js (v2) — downtown building placement generator.
// Frontage-walks every downtown street, lines both sides with CITY_BUILDINGS
// models with their FRONT FACING THE ROAD, tiers height by distance from the
// skyscraper cluster (tall offices/highrises in the middle band, rowhouses on the
// fringe), and writes the placements back into westchase_map.json (buildings
// type:'model', gen:'city') for tools/mapimport.js to bake into REMAP_MODELS.
//
// MODEL ORIENTATION (verified by render): every family's front (storefront /
// entrance / lobby) is on the model's LOCAL +X face. So dims[2] (Z extent) is the
// FRONTAGE width and dims[0] (X extent) is the DEPTH front-to-back. placeCatalogModel
// scales uniformly by w/dims[0], so the stored `w` == the depth; frontage = dims[2]*w/dims[0].
// Rotation makes local +X point at the road.
//
// No parking garages / lots here (v1.121: those are now editor-placed).
//   node tools/citygen/placebuildings.js
'use strict';
var fs = require('fs'), vm = require('vm');
var ROOT = __dirname + '/../../';

function loadGlobals(file, names) {
  var src = fs.readFileSync(ROOT + file, 'utf8');
  var sb = {}; vm.createContext(sb);
  vm.runInContext(src + ';globalThis.__x={' + names.map(function (n) { return n + ':typeof ' + n + '!=="undefined"?' + n + ':undefined'; }).join(',') + '};', sb);
  return sb.__x;
}
var RD = loadGlobals('remapdata.js', ['REMAP_ROADS', 'REMAP_MODELS', 'REMAP_AREAS']);
var CB = loadGlobals('citybuildings.js', ['CITY_BUILDINGS']);
var ROADS = RD.REMAP_ROADS, AREAS = RD.REMAP_AREAS || [];
// keep-out seeds + centroid come from the SKYSCRAPERS only — remapdata may still
// carry a previous run's gen:'city' fillers, which we ignore (we regenerate them).
var SKY_RE = /^(boa|pnc|regions|sykes|wellsfargo|bbt|suntrust)$/;
var MODELS = (RD.REMAP_MODELS || []).filter(function (m) { return SKY_RE.test(m.model); });
var DIMS = {}; CB.CITY_BUILDINGS.forEach(function (b) { DIMS[b.id] = b.dims; });

// ---- downtown box + skyscraper centroid ----
var X0 = 1632, X1 = 2860, Z0 = 1474, Z1 = 2689;
var CX = 0, CZ = 0, nSky = 0;
MODELS.forEach(function (m) { CX += m.x; CZ += m.z; nSky++; });
CX /= nSky; CZ /= nSky;

// ---- seeded RNG ----
var _seed = 0x1a2b3c4d >>> 0;
function rnd() { _seed |= 0; _seed = _seed + 0x6D2B79F5 | 0; var t = Math.imul(_seed ^ _seed >>> 15, 1 | _seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
function rr(a, b) { return a + (b - a) * rnd(); }
function pick(arr) { return arr[(rnd() * arr.length) | 0]; }

// ---- polyline helpers ----
function segList(pts) { var s = []; for (var i = 0; i < pts.length - 1; i++) { var a = pts[i], b = pts[i + 1]; s.push({ a: a, b: b, dx: b[0] - a[0], dz: b[1] - a[1], len: Math.hypot(b[0] - a[0], b[1] - a[1]) }); } return s; }
function polyDist(pts, x, z) {
  var best = 1e9;
  for (var i = 0; i < pts.length - 1; i++) {
    var ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    var dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    var t = ((x - ax) * dx + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    var px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best) best = d;
  }
  return best;
}
var ROADSET = ROADS.map(function (r) { return { hw: r.hw || 5, pts: r.pts, kind: r.kind || 'ground' }; });
function onRoad(x, z, pad) {
  for (var i = 0; i < ROADSET.length; i++) {
    var r = ROADSET[i], extra = r.kind === 'water' ? 8 : 0;
    if (polyDist(r.pts, x, z) < r.hw + (pad || 0) + extra) return true;
  }
  return false;
}
var WATERAREAS = AREAS.filter(function (a) { return a.kind === 'water' || a.kind === 'ocean'; });
function inWater(x, z) {
  for (var i = 0; i < WATERAREAS.length; i++) { var a = WATERAREAS[i]; if (Math.abs(x - a.x) < a.w / 2 && Math.abs(z - a.z) < a.d / 2) return true; }
  return false;
}

// ---- occupancy grid ----
var GX0 = X0 - 40, GZ0 = Z0 - 40, GW = (X1 - X0) + 80, GH = (Z1 - Z0) + 80;
var grid = new Uint8Array(GW * GH);
function gset(x, z) { var ix = (x - GX0) | 0, iz = (z - GZ0) | 0; if (ix < 0 || iz < 0 || ix >= GW || iz >= GH) return; grid[iz * GW + ix] = 1; }
function gget(x, z) { var ix = (x - GX0) | 0, iz = (z - GZ0) | 0; if (ix < 0 || iz < 0 || ix >= GW || iz >= GH) return 1; return grid[iz * GW + ix]; }
function rectCells(cx, cz, Tu, Nu, hw, hd, inset, fn) {
  var w = hw - inset, d = hd - inset; if (w < 0.4) w = 0.4; if (d < 0.4) d = 0.4;
  var hit = false;
  for (var u = -w; u <= w; u += 1.0) for (var v = -d; v <= d; v += 1.0) {
    var x = cx + Tu[0] * u + Nu[0] * v, z = cz + Tu[1] * u + Nu[1] * v;
    if (fn(x, z)) { if (fn === gget) return true; hit = true; }
  }
  return hit;
}
function stampRect(cx, cz, Tu, Nu, hw, hd) { rectCells(cx, cz, Tu, Nu, hw, hd, 0.5, function (x, z) { gset(x, z); return false; }); }
function gridBlocked(cx, cz, Tu, Nu, hw, hd) { return rectCells(cx, cz, Tu, Nu, hw, hd, 0.7, gget); }
function footFree(cx, cz, Tu, Nu, hw, hd) {
  for (var u = -hw; u <= hw; u += 1.5) for (var v = -hd; v <= hd; v += 1.5) {
    var x = cx + Tu[0] * u + Nu[0] * v, z = cz + Tu[1] * u + Nu[1] * v;
    if (x < X0 || x > X1 || z < Z0 || z > Z1) return false;
    if (onRoad(x, z, 1.0)) return false;
    if (inWater(x, z)) return false;
  }
  return true;
}
// seed existing skyscraper footprints as keep-out
MODELS.forEach(function (m) {
  var yaw = (m.rot || 0) * Math.PI / 180, Tu = [Math.cos(yaw), -Math.sin(yaw)], Nu = [Math.sin(yaw), Math.cos(yaw)];
  var w = (m.w || 40);
  stampRect(m.x, m.z, Tu, Nu, w / 2 + 6, w / 2 + 6);
});

// ---- categories (FRONTAGE width ranges — the dimension along the road) ----
var CAT = {
  brick: ['brick1', 'brick2', 'brick3', 'brick4', 'brick5'],
  biz: ['citybiz1', 'citybiz2', 'citybiz3', 'citybiz4', 'citybiz5', 'citybiz6', 'citybiz7', 'citybiz8', 'citybiz9', 'citybiz10'],
  office: ['office1', 'office2', 'office3', 'office4', 'office5'],
  highrise: ['highrise1']
};
var FRONT = { brick: [9, 13], biz: [11, 15], office: [19, 28], highrise: [44, 62] };
function pickCat(d) {
  if (d < 160) return rnd() < 0.5 ? 'biz' : 'office';
  if (d < 360) { var r = rnd(); return r < 0.34 ? 'office' : (r < 0.5 ? 'highrise' : 'biz'); }
  if (d < 560) { var r2 = rnd(); return r2 < 0.5 ? 'biz' : (r2 < 0.78 ? 'office' : 'brick'); }
  return rnd() < 0.58 ? 'brick' : 'biz';
}

// front is local +X. want +X to point at the road (= -Nu). rotation.y=t maps
// local +X -> (cos t, -sin t); solving (cos t,-sin t)=(-Nu) gives t=atan2(Nu[1],-Nu[0]).
function faceRot(Nu) { return Math.atan2(Nu[1], -Nu[0]) * 180 / Math.PI; }
// metrics for a chosen frontage: uniform scale from dims[2] (frontage axis), depth
// = dims[0]*scale (== the `w` placeCatalogModel wants), height = dims[1]*scale.
function metrics(id, frontage) {
  var dm = DIMS[id], s = frontage / dm[2];
  return { s: s, depth: dm[0] * s, height: dm[1] * s, frontage: frontage };
}

var placements = [], placeN = 0;
function tryPlace(cx, cz, Tu, Nu, id, mt) {
  var hw = mt.frontage / 2, hd = mt.depth / 2;         // frontage along Tu, depth along Nu
  if (!footFree(cx, cz, Tu, Nu, hw, hd)) return false;
  if (gridBlocked(cx, cz, Tu, Nu, hw, hd)) return false;
  stampRect(cx, cz, Tu, Nu, hw, hd);
  placements.push({ id: id + '_c' + (placeN++), model: id, x: +cx.toFixed(1), z: +cz.toFixed(1), rot: +faceRot(Nu).toFixed(1), w: +mt.depth.toFixed(2), d: +mt.frontage.toFixed(2), h: +mt.height.toFixed(1) });
  return true;
}

function frontageWalk(r) {
  if ((r.kind || 'ground') !== 'ground') return;
  var pts = r.pts, hw = r.hw || 5;
  if (hw < 8) return;                                  // only line real streets
  if (!pts.some(function (p) { return p[0] >= X0 - 30 && p[0] <= X1 + 30 && p[1] >= Z0 - 30 && p[1] <= Z1 + 30; })) return;
  var segs = segList(pts);
  for (var sideI = 0; sideI < 2; sideI++) {
    var side = sideI === 0 ? 1 : -1, lastId = null;
    for (var si = 0; si < segs.length; si++) {
      var sg = segs[si]; if (sg.len < 8) continue;
      var Tx = sg.dx / sg.len, Tz = sg.dz / sg.len;
      var Nx = -Tz * side, Nz = Tx * side;             // normal AWAY from road on this side
      var Tu = [Tx, Tz], Nu = [Nx, Nz];
      var s = rr(2, 6);
      while (s < sg.len - 3) {
        var px = sg.a[0] + Tx * s, pz = sg.a[1] + Tz * s;
        var cat = pickCat(Math.hypot(px - CX, pz - CZ));
        var id = pick(CAT[cat]); if (id === lastId) id = pick(CAT[cat]);
        var mt = metrics(id, rr(FRONT[cat][0], FRONT[cat][1]));
        if (rnd() > 0.72) { s += mt.frontage + rr(1, 5); continue; }   // breathing room / alleyways
        var offset = hw + 2.5 + mt.depth / 2;
        var cx = px + Nx * offset, cz = pz + Nz * offset;
        var placed = tryPlace(cx, cz, Tu, Nu, id, mt);
        var gap = 0.6;
        if (rnd() < 0.14) gap += rr(4, 8);
        else if (rnd() < 0.07) gap += rr(10, 20);
        s += mt.frontage + gap;
        if (placed) lastId = id;
      }
    }
  }
}
ROADS.forEach(frontageWalk);

// ---- outputs ----
var byCat = {}; placements.forEach(function (p) { var c = p.model.replace(/[0-9_].*$/, ''); byCat[c] = (byCat[c] || 0) + 1; });
console.log('PLACED', placements.length, JSON.stringify(byCat));

var mapPath = ROOT + 'westchase_map.json';
var map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
// strip prior generated content (buildings, garage access roads, generated lots)
map.buildings = map.buildings.filter(function (b) { return !(b.gen === 'city'); });
map.roads = map.roads.filter(function (r) { return !(r.id && /^grg\d+_/.test(r.id)); });
map.surfaces = map.surfaces.filter(function (s) { return !(s.gen === 'city'); });
placements.forEach(function (p) { map.buildings.push({ id: p.id, type: 'model', x: p.x, z: p.z, rot: p.rot, w: p.w, d: p.d, model: p.model, h: p.h, gen: 'city' }); });
fs.writeFileSync(mapPath, JSON.stringify(map));
console.log('wrote', mapPath, '(buildings', map.buildings.length + ', roads', map.roads.length + ', surfaces', map.surfaces.length + ')');
