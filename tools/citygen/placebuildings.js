// placebuildings.js — downtown building placement generator.
// Frontage-walks every ground road inside the downtown box, lines both sides
// with CITY_BUILDINGS models (fronts facing the road), tiers height by distance
// from the skyscraper cluster, drops a reusable parking garage + connecting
// access roads, and scatters a few parking-lot surfaces. Writes results back
// into westchase_map.json (buildings type:'model', access roads, surfaces) and
// prints GARAGE_SPOTS lines to paste into game.js.
//
//   node tools/citygen/placebuildings.js
//
'use strict';
var fs = require('fs'), vm = require('vm');
var ROOT = __dirname + '/../../';

// ---- load remapdata (roads/models/areas) + citybuildings (dims) ----
function loadGlobals(file, names) {
  var src = fs.readFileSync(ROOT + file, 'utf8');
  var sb = {}; vm.createContext(sb);
  vm.runInContext(src + ';globalThis.__x={' + names.map(function (n) { return n + ':typeof ' + n + '!=="undefined"?' + n + ':undefined'; }).join(',') + '};', sb);
  return sb.__x;
}
var RD = loadGlobals('remapdata.js', ['REMAP_ROADS', 'REMAP_MODELS', 'REMAP_AREAS']);
var CB = loadGlobals('citybuildings.js', ['CITY_BUILDINGS']);
var ROADS = RD.REMAP_ROADS, MODELS = RD.REMAP_MODELS, AREAS = RD.REMAP_AREAS || [];
var DIMS = {}; CB.CITY_BUILDINGS.forEach(function (b) { DIMS[b.id] = b.dims; });

// ---- downtown box ----
var X0 = 1632, X1 = 2860, Z0 = 1474, Z1 = 2689;
// skyscraper cluster centroid
var CX = 0, CZ = 0; MODELS.forEach(function (m) { CX += m.x; CZ += m.z; }); CX /= MODELS.length; CZ /= MODELS.length;

// ---- seeded RNG (mulberry32) for reproducible layouts ----
var _seed = 0x1a2b3c4d >>> 0;
function rnd() { _seed |= 0; _seed = _seed + 0x6D2B79F5 | 0; var t = Math.imul(_seed ^ _seed >>> 15, 1 | _seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
function rr(a, b) { return a + (b - a) * rnd(); }
function pick(arr) { return arr[(rnd() * arr.length) | 0]; }

// ---- polyline helpers ----
function segList(pts) { var s = []; for (var i = 0; i < pts.length - 1; i++) { var a = pts[i], b = pts[i + 1]; s.push({ a: a, b: b, dx: b[0] - a[0], dz: b[1] - a[1], len: Math.hypot(b[0] - a[0], b[1] - a[1]) }); } return s; }
// nearest distance from (x,z) to a polyline
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

// pre-index roads (all kinds block buildings). Access roads get pushed in later.
var ROADSET = ROADS.map(function (r) { return { hw: r.hw || 5, pts: r.pts, kind: r.kind || 'ground' }; });
function onRoad(x, z, pad) {
  for (var i = 0; i < ROADSET.length; i++) {
    var r = ROADSET[i];
    // river/water gets extra clearance; highways are wide corridors
    var extra = r.kind === 'water' ? 8 : 0;
    if (polyDist(r.pts, x, z) < r.hw + (pad || 0) + extra) return true;
  }
  return false;
}
// water / ocean AREA rects (rot assumed axis-aligned; downtown areas are)
var WATERAREAS = AREAS.filter(function (a) { return a.kind === 'water' || a.kind === 'ocean'; });
function inWater(x, z) {
  for (var i = 0; i < WATERAREAS.length; i++) { var a = WATERAREAS[i]; if (Math.abs(x - a.x) < a.w / 2 && Math.abs(z - a.z) < a.d / 2) return true; }
  return false;
}

// ---- occupancy grid (placed buildings + existing skyscrapers + garage) ----
var GX0 = X0 - 40, GZ0 = Z0 - 40, GW = (X1 - X0) + 80, GH = (Z1 - Z0) + 80;
var grid = new Uint8Array(GW * GH);
function gset(x, z) { var ix = (x - GX0) | 0, iz = (z - GZ0) | 0; if (ix < 0 || iz < 0 || ix >= GW || iz >= GH) return; grid[iz * GW + ix] = 1; }
function gget(x, z) { var ix = (x - GX0) | 0, iz = (z - GZ0) | 0; if (ix < 0 || iz < 0 || ix >= GW || iz >= GH) return 1; return grid[iz * GW + ix]; }
// stamp / test a rotated rect (center, tangent unit Tu, normal unit Nu, halfW along T, halfD along N), inset to allow flush walls
function rectCells(cx, cz, Tu, Nu, hw, hd, inset, fn) {
  var w = hw - inset, d = hd - inset; if (w < 0.4) w = 0.4; if (d < 0.4) d = 0.4;
  var hit = false;
  for (var u = -w; u <= w; u += 1.0) for (var v = -d; v <= d; v += 1.0) {
    var x = cx + Tu[0] * u + Nu[0] * v, z = cz + Tu[1] * u + Nu[1] * v;
    if (fn(x, z)) hit = true; if (hit && fn === gget) return true;
  }
  return hit;
}
function stampRect(cx, cz, Tu, Nu, hw, hd) { rectCells(cx, cz, Tu, Nu, hw, hd, 0.5, function (x, z) { gset(x, z); return false; }); }
function gridBlocked(cx, cz, Tu, Nu, hw, hd) { return rectCells(cx, cz, Tu, Nu, hw, hd, 0.7, gget); }
// wide-rect road/box/water test (samples across full footprint)
function footFree(cx, cz, Tu, Nu, hw, hd) {
  for (var u = -hw; u <= hw; u += 1.5) for (var v = -hd; v <= hd; v += 1.5) {
    var x = cx + Tu[0] * u + Nu[0] * v, z = cz + Tu[1] * u + Nu[1] * v;
    if (x < X0 || x > X1 || z < Z0 || z > Z1) return false;
    if (onRoad(x, z, 1.0)) return false;
    if (inWater(x, z)) return false;
  }
  return true;
}

// seed grid with existing skyscraper footprints (their w + derived depth)
MODELS.forEach(function (m) {
  var yaw = (m.rot || 0) * Math.PI / 180, Tu = [Math.cos(yaw), -Math.sin(yaw)], Nu = [Math.sin(yaw), Math.cos(yaw)];
  var w = (m.w || 40), d = w; // treat skyscraper as square-ish footprint (conservative keep-out)
  stampRect(m.x, m.z, Tu, Nu, w / 2 + 6, d / 2 + 6);
});

// ---- categories ----
var CAT = {
  brick: ['brick1', 'brick2', 'brick3', 'brick4', 'brick5'],
  biz: ['citybiz1', 'citybiz2', 'citybiz3', 'citybiz4', 'citybiz5', 'citybiz6', 'citybiz7', 'citybiz8', 'citybiz9', 'citybiz10'],
  office: ['office1', 'office2', 'office3', 'office4', 'office5'],
  highrise: ['highrise1']
};
var FOOTW = { brick: [9, 13], biz: [11, 15], office: [14, 20], highrise: [22, 28] };
function pickCat(d) {
  if (d < 180) return rnd() < 0.55 ? 'office' : 'biz';
  if (d < 340) { var r = rnd(); return r < 0.42 ? 'office' : (r < 0.55 ? 'highrise' : 'biz'); }
  if (d < 520) { var r2 = rnd(); return r2 < 0.55 ? 'biz' : (r2 < 0.8 ? 'office' : 'brick'); }
  return rnd() < 0.55 ? 'brick' : 'biz';
}

// ---- placement ----
var placements = []; // {id, model, x, z, rot, w, d, h}
var placeN = 0;
function placeBuilding(cx, cz, Tu, Nu, cat, id) {
  var dims = DIMS[id]; if (!dims) return false;
  var footW = rr(FOOTW[cat][0], FOOTW[cat][1]);
  var depth = dims[2] / dims[0] * footW;
  if (depth > 20) { footW *= 20 / depth; depth = 20; } // cap deep footprints
  // Tu = width axis (along road tangent), Nu = depth axis (points away from road)
  // building center offset already applied by caller; here just validate + stamp
  var hw = footW / 2, hd = depth / 2;
  if (!footFree(cx, cz, Tu, Nu, hw, hd)) return false;
  if (gridBlocked(cx, cz, Tu, Nu, hw, hd)) return false;
  stampRect(cx, cz, Tu, Nu, hw, hd);
  // front (+Z of model) faces the road = -Nu direction
  var fx = -Nu[0], fz = -Nu[1];
  var rot = Math.atan2(fx, fz) * 180 / Math.PI;
  var scale = footW / dims[0];
  placements.push({ id: id + '_c' + (placeN++), model: id, x: +cx.toFixed(1), z: +cz.toFixed(1), rot: +rot.toFixed(1), w: +footW.toFixed(1), d: +depth.toFixed(1), h: +(dims[1] * scale).toFixed(1) });
  return true;
}

function frontageWalk(r) {
  if ((r.kind || 'ground') !== 'ground') return;
  var pts = r.pts, hw = r.hw || 5;
  if (hw < 8) return;   // skip tiny connectors/driveways — only line real streets
  // only walk roads that touch the box
  var touches = pts.some(function (p) { return p[0] >= X0 - 30 && p[0] <= X1 + 30 && p[1] >= Z0 - 30 && p[1] <= Z1 + 30; });
  if (!touches) return;
  var segs = segList(pts);
  for (var sideI = 0; sideI < 2; sideI++) {
    var side = sideI === 0 ? 1 : -1;
    var lastId = null;
    for (var si = 0; si < segs.length; si++) {
      var sg = segs[si]; if (sg.len < 6) continue;
      var Tx = sg.dx / sg.len, Tz = sg.dz / sg.len;      // tangent
      var Nx = -Tz * side, Nz = Tx * side;               // normal pointing to this side (away from road)
      var Tu = [Tx, Tz], Nu = [Nx, Nz];
      var s = rr(2, 6);
      while (s < sg.len - 3) {
        var px = sg.a[0] + Tx * s, pz = sg.a[1] + Tz * s;
        var d2c = Math.hypot(px - CX, pz - CZ);
        var cat = pickCat(d2c);
        var id = pick(CAT[cat]); if (id === lastId) id = pick(CAT[cat]); // avoid twins
        var dims = DIMS[id];
        var footW = rr(FOOTW[cat][0], FOOTW[cat][1]);
        var depth = dims[2] / dims[0] * footW; if (depth > 20) { footW *= 20 / depth; depth = 20; }
        if (rnd() > 0.72) { s += footW + rr(1, 5); continue; }   // leave this slot empty (breathing room / alleyways)
        var offset = hw + 2.5 + depth / 2;               // sidewalk margin
        var cx = px + Nx * offset, cz = pz + Nz * offset;
        var placed = placeBuilding(cx, cz, Tu, Nu, cat, id);
        // advance: building width + gap (mostly flush wall, sometimes alley / spacer)
        var gap = 0.6;
        if (rnd() < 0.14) gap += rr(4, 8);               // alleyway
        else if (rnd() < 0.07) gap += rr(10, 20);        // spacer
        s += footW + gap;
        if (placed) lastId = id;
      }
    }
  }
}

// ---- run frontage walk over all box roads ----
ROADS.forEach(frontageWalk);

// ---- parking garage + access roads ----
var accessRoads = [];
var garageSpots = [];
function tryGarage(gx, gz) {
  var HW = 30, HD = 22;
  var Tu = [1, 0], Nu = [0, 1];
  // footprint must be clear of roads/box/water and not overlap grid
  if (!footFree(gx, gz, Tu, Nu, HW, HD)) return false;
  if (gridBlocked(gx, gz, Tu, Nu, HW, HD)) return false;
  var d2c = Math.hypot(gx - CX, gz - CZ); if (d2c < 200 || d2c > 640) return false;
  // find nearest road to E and W (entrances at gx±30, gz) within 140u
  function rayHit(dir) {
    for (var t = HW + 4; t < 150; t += 2) { var x = gx + dir * t; if (onRoad(x, gz, 0)) return t; }
    return -1;
  }
  var eHit = rayHit(1), wHit = rayHit(-1);
  if (eHit < 0 && wHit < 0) return false; // must connect at least one entrance to the grid
  stampRect(gx, gz, Tu, Nu, HW + 3, HD + 3);
  garageSpots.push([gx, gz]);
  var gi = garageSpots.length;
  if (eHit > 0) accessRoads.push({ id: 'grg' + gi + '_e', cls: 0, hw: 5, dirt: false, pts: [[gx + HW, gz], [gx + HW + eHit, gz]] });
  if (wHit > 0) accessRoads.push({ id: 'grg' + gi + '_w', cls: 0, hw: 5, dirt: false, pts: [[gx - HW, gz], [gx - HW - wHit, gz]] });
  // stamp access roads into ROADSET so buildings don't sit on them
  accessRoads.slice(-2).forEach(function (ar) { ROADSET.push({ hw: ar.hw, pts: ar.pts, kind: 'ground' }); });
  return true;
}
// search interior for 1-2 garage spots in the tall/mid band
(function () {
  var targets = [[2650, 1640], [2500, 2500], [1780, 2400], [2700, 2400]];
  var placed = 0;
  for (var ti = 0; ti < targets.length && placed < 2; ti++) {
    var found = false;
    for (var rad = 0; rad <= 160 && !found; rad += 12) {
      for (var a = 0; a < 12 && !found; a++) {
        var ang = a / 12 * Math.PI * 2;
        var gx = targets[ti][0] + Math.cos(ang) * rad, gz = targets[ti][1] + Math.sin(ang) * rad;
        if (tryGarage(Math.round(gx), Math.round(gz))) { found = true; placed++; }
      }
    }
  }
})();

// prune any frontage building that ended up sitting on a garage access stub
if (accessRoads.length) {
  var before = placements.length;
  placements = placements.filter(function (p) {
    for (var i = 0; i < accessRoads.length; i++) { var ar = accessRoads[i]; if (polyDist(ar.pts, p.x, p.z) < ar.hw + Math.max(p.w, p.d) / 2) return false; }
    return true;
  });
  if (placements.length !== before) console.log('pruned', before - placements.length, 'building(s) off garage access roads');
}

// ---- parking-lot surfaces in a few leftover interior spots ----
var lots = [];
(function () {
  var tries = 0, made = 0;
  while (tries < 400 && made < 5) {
    tries++;
    var lx = Math.round(rr(X0 + 60, X1 - 60)), lz = Math.round(rr(Z0 + 60, Z1 - 60));
    var w = Math.round(rr(34, 52)), d = Math.round(rr(26, 40));
    var Tu = [1, 0], Nu = [0, 1];
    var d2c = Math.hypot(lx - CX, lz - CZ); if (d2c < 220) continue;
    if (!footFree(lx, lz, Tu, Nu, w / 2, d / 2)) continue;
    if (gridBlocked(lx, lz, Tu, Nu, w / 2, d / 2)) continue;
    stampRect(lx, lz, Tu, Nu, w / 2, d / 2);
    lots.push({ kind: 'parking', x: lx, z: lz, rot: 0, w: w, d: d });
    made++;
  }
})();

// ---- write outputs ----
var summary = { buildings: placements.length, accessRoads: accessRoads.length, garages: garageSpots.length, lots: lots.length };
console.log('PLACED', JSON.stringify(summary));
var byCat = {}; placements.forEach(function (p) { var c = p.model.replace(/[0-9_].*$/, ''); byCat[c] = (byCat[c] || 0) + 1; });
console.log('by model prefix:', JSON.stringify(byCat));
console.log('GARAGE_SPOTS to add in game.js:');
garageSpots.forEach(function (g) { console.log('  [' + g[0] + ', ' + g[1] + '],'); });

// merge into westchase_map.json
var mapPath = ROOT + 'westchase_map.json';
var map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
// strip any prior generated placements (idempotent re-runs)
map.buildings = map.buildings.filter(function (b) { return !(b.gen === 'city'); });
map.roads = map.roads.filter(function (r) { return !(r.id && /^grg\d+_/.test(r.id)); });
map.surfaces = map.surfaces.filter(function (s) { return !(s.gen === 'city'); });
placements.forEach(function (p) { map.buildings.push({ id: p.id, type: 'model', x: p.x, z: p.z, rot: p.rot, w: p.w, d: p.d, model: p.model, h: p.h, gen: 'city' }); });
accessRoads.forEach(function (r) { map.roads.push(r); });
lots.forEach(function (l) { l.gen = 'city'; map.surfaces.push(l); });
fs.writeFileSync(mapPath, JSON.stringify(map));
console.log('wrote', mapPath, '(buildings now', map.buildings.length + ', roads', map.roads.length + ', surfaces', map.surfaces.length + ')');

// emit garage spots to a small json for the game-side patch step
fs.writeFileSync(ROOT + 'tools/citygen/garage_spots.json', JSON.stringify(garageSpots));
