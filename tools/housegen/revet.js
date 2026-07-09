// revet.js — re-vet the surveyed HOUSE_INSTANCES against the WC_REMAP world.
// The existing houses.js was planned against the OLD EXP_ROADS network (48
// roads). REMAP is the true-geometry world: 35 roads + 32 editor venues +
// parking/pavement surfaces, plus the unchanged EXP_PONDS/EXP_FOREST/LAKE.
// We KEEP the surveyed neighborhood layout (REMAP's 35 roads are far sparser
// than EXP's residential grid, so a full re-plan would strand ~half the homes)
// and only DROP/NUDGE instances that now collide, re-orienting street-fronting
// houses toward the nearest true road when it's collision-free.
//   node revet.js            (rewrites /home/user/westchase_fps/houses.js)
'use strict';
var fs = require('fs'), vm = require('vm'), path = require('path');
var ROOT = '/home/user/westchase_fps';

function loadVars(file) {
  var ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx);
  return ctx;
}
var H = loadVars('houses.js');
var R = loadVars('remapdata.js');
var HOUSE_CLUSTERS = H.HOUSE_CLUSTERS, HOUSE_INSTANCES = H.HOUSE_INSTANCES,
    HOUSE_LOTS = H.HOUSE_LOTS, HOUSE_PARKED_ROWS = H.HOUSE_PARKED_ROWS;
var REMAP_ROADS = R.REMAP_ROADS, REMAP_CLEAR = R.REMAP_CLEAR, REMAP_SURFACES = R.REMAP_SURFACES;

// pull EXP_PONDS / EXP_FOREST / LAKE straight out of game.js source text
var gsrc = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
function grabArray(name) {
  var m = gsrc.match(new RegExp('var ' + name + '\\s*=\\s*(\\[[\\s\\S]*?\\]);'));
  return m ? JSON.parse(m[1]) : null;
}
var EXP_PONDS = grabArray('EXP_PONDS');
var EXP_FOREST = grabArray('EXP_FOREST');
var LAKE = (function () { var m = gsrc.match(/var LAKE\s*=\s*\{([^}]*)\}/); var o = {}; m[1].split(',').forEach(function (kv) { var p = kv.split(':'); o[p[0].trim()] = parseFloat(p[1]); }); return o; })();
console.error('EXP_PONDS', EXP_PONDS.length, 'EXP_FOREST', EXP_FOREST.length, 'LAKE', JSON.stringify(LAKE));

var HALF = 590;
// ---- geometry (game rotation.y=a convention: local +x -> world (ca,-sa),
// local +z -> world (sa,ca); local = R^T * world) ----
function rectAxes(a) { return [[Math.cos(a), -Math.sin(a)], [Math.sin(a), Math.cos(a)]]; }
function rectOverlap(x1, z1, hw1, hd1, a1, x2, z2, hw2, hd2, a2, m) {
  var A1 = rectAxes(a1), A2 = rectAxes(a2);
  var axes = [A1[0], A1[1], A2[0], A2[1]];
  var dx = x2 - x1, dz = z2 - z1;
  for (var i = 0; i < 4; i++) {
    var ax = axes[i];
    var dist = Math.abs(dx * ax[0] + dz * ax[1]);
    var r1 = (hw1 + m) * Math.abs(A1[0][0] * ax[0] + A1[0][1] * ax[1]) + (hd1 + m) * Math.abs(A1[1][0] * ax[0] + A1[1][1] * ax[1]);
    var r2 = hw2 * Math.abs(A2[0][0] * ax[0] + A2[0][1] * ax[1]) + hd2 * Math.abs(A2[1][0] * ax[0] + A2[1][1] * ax[1]);
    if (dist > r1 + r2) return false;
  }
  return true;
}
function segRectDist(x1, z1, x2, z2, rx0, rz0, rx1, rz1) {
  function inR(x, z) { return x >= rx0 && x <= rx1 && z >= rz0 && z <= rz1; }
  if (inR(x1, z1) || inR(x2, z2)) return 0;
  var corners = [[rx0, rz0], [rx1, rz0], [rx1, rz1], [rx0, rz1]];
  function segSeg(ax, az, bx, bz, cx, cz, dx, dz) {
    var d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    var d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
    var d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx);
    var d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
    return d1 * d2 < 0 && d3 * d4 < 0;
  }
  for (var i = 0; i < 4; i++) {
    var A = corners[i], Bc = corners[(i + 1) % 4];
    if (segSeg(x1, z1, x2, z2, A[0], A[1], Bc[0], Bc[1])) return 0;
  }
  function ptSeg(px, pz, ax, az, bx, bz) {
    var dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    var t = ((px - ax) * dx + (pz - az) * dz) / L2; t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
  }
  var m = 1e9;
  for (var k = 0; k < 4; k++) m = Math.min(m, ptSeg(corners[k][0], corners[k][1], x1, z1, x2, z2));
  function ptRect(px, pz) { var qx = Math.max(rx0, Math.min(px, rx1)), qz = Math.max(rz0, Math.min(pz, rz1)); return Math.hypot(px - qx, pz - qz); }
  m = Math.min(m, ptRect(x1, z1), ptRect(x2, z2));
  return m;
}
function segOrientedRectDist(x1, z1, x2, z2, cx, cz, hw, hd, a) {
  var ca = Math.cos(a), sa = Math.sin(a);
  function loc(px, pz) { var dx = px - cx, dz = pz - cz; return [dx * ca - dz * sa, dx * sa + dz * ca]; }
  var p1 = loc(x1, z1), p2 = loc(x2, z2);
  return segRectDist(p1[0], p1[1], p2[0], p2[1], -hw, -hd, hw, hd);
}
function pointInPoly(x, z, poly) {
  var inP = false;
  for (var a = 0, b = poly.length - 1; a < poly.length; b = a++) {
    if ((poly[a][1] > z) !== (poly[b][1] > z) && x < (poly[b][0] - poly[a][0]) * (z - poly[a][1]) / (poly[b][1] - poly[a][1]) + poly[a][0]) inP = !inP;
  }
  return inP;
}
function houseCorners(x, z, hw, hd, a) {
  var ax = rectAxes(a), X = ax[0], Z = ax[1], out = [];
  var sx = [1, -1, 1, -1], sz = [1, 1, -1, -1];
  for (var i = 0; i < 4; i++) out.push([x + X[0] * hw * sx[i] + Z[0] * hd * sz[i], z + X[1] * hw * sx[i] + Z[1] * hd * sz[i]]);
  return out;
}

// ---- clearance tuning ----
var ROAD_PAD = 2.0;      // keep house asphalt-edge + 2 (still allows road-fronting)
var VEN_MARGIN = 1.0;    // editor venue footprints
var SURF_MARGIN = 0.5;   // parking / pavement slabs
var FOREST_MARGIN = -2.5;// houses may sink a couple u into a forest-rect edge

// blocked(x,z,a,hw,hd) -> reason|null  (statics only)
function blockedStatic(x, z, a, hw, hd) {
  var rad = Math.hypot(hw, hd);
  if (Math.abs(x) + rad > HALF || Math.abs(z) + rad > HALF) return 'wall';
  // roads
  for (var i = 0; i < REMAP_ROADS.length; i++) {
    var rd = REMAP_ROADS[i], pts = rd.pts, lim = rd.hw + ROAD_PAD;
    for (var j = 0; j < pts.length - 1; j++) {
      var ax = pts[j][0], az = pts[j][1], bx = pts[j + 1][0], bz = pts[j + 1][1];
      if (x < Math.min(ax, bx) - lim - rad || x > Math.max(ax, bx) + lim + rad ||
          z < Math.min(az, bz) - lim - rad || z > Math.max(az, bz) + lim + rad) continue;
      if (segOrientedRectDist(ax, az, bx, bz, x, z, hw, hd, a) < lim) return 'road';
    }
  }
  // venues
  for (var v = 0; v < REMAP_CLEAR.length; v++) {
    var c = REMAP_CLEAR[v];
    if (c.poly) {
      if (pointInPoly(x, z, c.poly)) return 'venue';
      var cs = houseCorners(x, z, hw, hd, a);
      for (var q = 0; q < 4; q++) if (pointInPoly(cs[q][0], cs[q][1], c.poly)) return 'venue';
    } else {
      if (rectOverlap(x, z, hw, hd, a, c.x, c.z, c.w / 2, c.d / 2, (c.rot || 0) * Math.PI / 180, VEN_MARGIN)) return 'venue';
    }
  }
  // parking / pavement surfaces
  for (var s = 0; s < REMAP_SURFACES.length; s++) {
    var su = REMAP_SURFACES[s];
    if (rectOverlap(x, z, hw, hd, a, su.x, su.z, su.w / 2, su.d / 2, (su.rot || 0) * Math.PI / 180, SURF_MARGIN)) return 'surface';
  }
  // ponds
  for (var p = 0; p < EXP_PONDS.length; p++) {
    var pd = EXP_PONDS[p];
    if (rectOverlap(x, z, hw, hd, a, pd[0], pd[1], pd[2] + 2.6, pd[3] + 2.6, 0, 0)) return 'pond';
  }
  // lake ellipse
  var lrx = LAKE.r * 1.25 + 1, lrz = LAKE.r * 0.85 + 1;
  var lc = houseCorners(x, z, hw, hd, a); lc.push([x, z]);
  for (var lci = 0; lci < lc.length; lci++) {
    var ex = (lc[lci][0] - LAKE.x) / lrx, ez = (lc[lci][1] - LAKE.z) / lrz;
    if (ex * ex + ez * ez < 1) return 'lake';
  }
  // forest rects
  for (var f = 0; f < EXP_FOREST.length; f++) {
    var ff = EXP_FOREST[f];
    if (rectOverlap(x, z, hw, hd, a, (ff[0] + ff[1]) / 2, (ff[2] + ff[3]) / 2, (ff[1] - ff[0]) / 2, (ff[3] - ff[2]) / 2, 0, FOREST_MARGIN)) return 'forest';
  }
  return null;
}

// nearest REMAP road: {d(edge dist), px,pz}
function nearestRoad(x, z) {
  var best = null;
  for (var i = 0; i < REMAP_ROADS.length; i++) {
    var rd = REMAP_ROADS[i], pts = rd.pts;
    for (var j = 0; j < pts.length - 1; j++) {
      var ax = pts[j][0], az = pts[j][1], bx = pts[j + 1][0], bz = pts[j + 1][1];
      var dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      var t = ((x - ax) * dx + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      var px = ax + dx * t, pz = az + dz * t;
      var d = Math.hypot(x - px, z - pz) - rd.hw;
      if (!best || d < best.d) best = { d: d, px: px, pz: pz };
    }
  }
  return best;
}

// ---- neighbor grid (other instances' ORIGINAL footprints) ----
var GRID = 40;
function keyRange(x0, z0, x1, z1, cb) {
  for (var ix = Math.floor(x0 / GRID); ix <= Math.floor(x1 / GRID); ix++)
    for (var iz = Math.floor(z0 / GRID); iz <= Math.floor(z1 / GRID); iz++) cb(ix + ',' + iz);
}
var nbGrid = new Map();
function nbAdd(item) { var r = item.rad; keyRange(item.x - r, item.z - r, item.x + r, item.z + r, function (k) { var a = nbGrid.get(k); if (!a) nbGrid.set(k, a = []); a.push(item); }); }
function nbHit(x, z, a, hw, hd, self) {
  var rad = Math.hypot(hw, hd), out = false, seen = new Set();
  keyRange(x - rad, z - rad, x + rad, z + rad, function (k) {
    var arr = nbGrid.get(k); if (!arr) return;
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i]; if (it === self || it.dropped || seen.has(it)) continue; seen.add(it);
      if (rectOverlap(x, z, hw, hd, a, it.x, it.z, it.hw, it.hd, it.a, 1.0)) { out = true; return; }
    }
  });
  return out;
}

// build items
var items = [];
for (var i = 0; i < HOUSE_INSTANCES.length; i++) {
  var t = HOUSE_INSTANCES[i];
  var cl = HOUSE_CLUSTERS[t[0]];
  if (!cl) continue;
  var sc = t[5] || 1;
  var hw = cl.spec.dims[0] * sc / 2, hd = cl.spec.dims[1] * sc / 2;
  var it = { inst: t, ci: t[0], x: t[1], z: t[2], a: t[3] * Math.PI / 180, rotDeg: t[3], vi: t[4], sc: sc, hw: hw, hd: hd, rad: Math.hypot(hw, hd), dropped: false };
  items.push(it); nbAdd(it);
}

var NUDGE = [];
[3, 6, 9, 12].forEach(function (rr) { for (var ang = 0; ang < 360; ang += 45) NUDGE.push([Math.cos(ang * Math.PI / 180) * rr, Math.sin(ang * Math.PI / 180) * rr]); });

var stats = { kept: 0, reoriented: 0, nudged: 0, dropped: 0, reasons: {} };
function bump(r) { stats.reasons[r] = (stats.reasons[r] || 0) + 1; }

for (var m = 0; m < items.length; m++) {
  var it2 = items[m];
  var hw2 = it2.hw, hd2 = it2.hd;
  // candidate rotations: nearest-road-facing first (if close), then original
  var cands = [];
  var nr = nearestRoad(it2.x, it2.z);
  if (nr && nr.d < 32) {
    var dirx = nr.px - it2.x, dirz = nr.pz - it2.z, dl = Math.hypot(dirx, dirz) || 1;
    var na = Math.atan2(dirx / dl, dirz / dl);
    var delta = Math.abs(((na - it2.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (delta > 0.20) cands.push({ a: na, deg: na * 180 / Math.PI, reo: true });
  }
  cands.push({ a: it2.a, deg: it2.rotDeg, reo: false });

  var done = false;
  // in-place (no nudge) first
  for (var ci = 0; ci < cands.length && !done; ci++) {
    var cnd = cands[ci];
    if (!blockedStatic(it2.x, it2.z, cnd.a, hw2, hd2) && !nbHit(it2.x, it2.z, cnd.a, hw2, hd2, it2)) {
      apply(it2, it2.x, it2.z, cnd);
      done = true;
    }
  }
  // nudge
  for (var n2 = 0; n2 < NUDGE.length && !done; n2++) {
    var ox = it2.x + NUDGE[n2][0], oz = it2.z + NUDGE[n2][1];
    for (var ci2 = 0; ci2 < cands.length && !done; ci2++) {
      var cnd2 = cands[ci2];
      if (!blockedStatic(ox, oz, cnd2.a, hw2, hd2) && !nbHit(ox, oz, cnd2.a, hw2, hd2, it2)) {
        apply(it2, ox, oz, cnd2); it2.nudged = true; stats.nudged++;
        done = true;
      }
    }
  }
  if (!done) { it2.dropped = true; stats.dropped++; bump(blockedStatic(it2.x, it2.z, it2.a, hw2, hd2) || 'building'); }
}
function apply(it, x, z, cnd) {
  it.x = x; it.z = z; it.a = cnd.a; it.rotDeg = cnd.deg;
  stats.kept++;
  if (cnd.reo) stats.reoriented++;
}

// ---- rebuild instances ----
var outInst = [];
for (var k = 0; k < items.length; k++) {
  var it3 = items[k];
  if (it3.dropped) continue;
  var e = [it3.ci, +it3.x.toFixed(1), +it3.z.toFixed(1), +it3.rotDeg.toFixed(1), it3.vi];
  if (it3.sc && it3.sc !== 1) e.push(it3.sc);
  outInst.push(e);
}

// ---- re-vet lots (drop lots overlapping road/venue/surface) ----
var outLots = [];
var lotDrop = 0;
for (var L = 0; L < HOUSE_LOTS.length; L++) {
  var lo = HOUSE_LOTS[L]; // [x,z,w,d,rotDeg]
  var la = lo[4] * Math.PI / 180, lhw = lo[2] / 2, lhd = lo[3] / 2;
  var bad = false;
  for (var ri = 0; ri < REMAP_ROADS.length && !bad; ri++) {
    var rr = REMAP_ROADS[ri], pp = rr.pts, lim = rr.hw + 1.5, rad = Math.hypot(lhw, lhd);
    for (var jj = 0; jj < pp.length - 1; jj++) {
      if (segOrientedRectDist(pp[jj][0], pp[jj][1], pp[jj + 1][0], pp[jj + 1][1], lo[0], lo[1], lhw, lhd, la) < lim) { bad = true; break; }
    }
  }
  for (var vv = 0; vv < REMAP_CLEAR.length && !bad; vv++) {
    var cc = REMAP_CLEAR[vv];
    if (cc.poly) { if (pointInPoly(lo[0], lo[1], cc.poly)) bad = true; }
    else if (rectOverlap(lo[0], lo[1], lhw, lhd, la, cc.x, cc.z, cc.w / 2, cc.d / 2, (cc.rot || 0) * Math.PI / 180, 0.5)) bad = true;
  }
  for (var ss = 0; ss < REMAP_SURFACES.length && !bad; ss++) {
    var sf = REMAP_SURFACES[ss];
    if (rectOverlap(lo[0], lo[1], lhw, lhd, la, sf.x, sf.z, sf.w / 2, sf.d / 2, (sf.rot || 0) * Math.PI / 180, 0)) bad = true;
  }
  if (bad) { lotDrop++; continue; }
  outLots.push(lo);
}

// ---- re-vet parked rows (drop rows whose start clearly sits on a road) ----
var outRows = [];
for (var pr = 0; pr < HOUSE_PARKED_ROWS.length; pr++) {
  var row = HOUSE_PARKED_ROWS[pr];
  // sample the row's midpoint
  var mx = row.x + row.dx * (row.slots - 1) / 2, mz = row.z + row.dz * (row.slots - 1) / 2;
  var onRoad = false;
  for (var rq = 0; rq < REMAP_ROADS.length && !onRoad; rq++) {
    var rrr = REMAP_ROADS[rq], ptz = rrr.pts;
    for (var jz = 0; jz < ptz.length - 1; jz++) {
      var A0 = ptz[jz], B0 = ptz[jz + 1], ddx = B0[0] - A0[0], ddz = B0[1] - A0[1], LL = ddx * ddx + ddz * ddz || 1;
      var tt = ((mx - A0[0]) * ddx + (mz - A0[1]) * ddz) / LL; tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
      if (Math.hypot(mx - (A0[0] + ddx * tt), mz - (A0[1] + ddz * tt)) < rrr.hw + 1) { onRoad = true; break; }
    }
  }
  if (!onRoad) outRows.push(row);
}

console.error('instances', HOUSE_INSTANCES.length, '->', outInst.length, JSON.stringify(stats));
console.error('lots', HOUSE_LOTS.length, '->', outLots.length, 'dropped', lotDrop);
console.error('parked rows', HOUSE_PARKED_ROWS.length, '->', outRows.length);

var js = '// houses.js — surveyed neighborhoods: AI house clusters (tools/housegen).\n' +
  '// Generated by tools/housegen/plan.js, re-vetted for WC_REMAP by\n' +
  '// tools/housegen/revet.js (drops/nudges instances colliding with the true\n' +
  '// roads/venues/surfaces/ponds/lake/forest). Load before game.js.\n' +
  'var HOUSE_CLUSTERS = ' + JSON.stringify(HOUSE_CLUSTERS) + ';\n' +
  'var HOUSE_INSTANCES = ' + JSON.stringify(outInst) + ';\n' +
  'var HOUSE_LOTS = ' + JSON.stringify(outLots) + ';\n' +
  'var HOUSE_PARKED_ROWS = ' + JSON.stringify(outRows) + ';\n';
fs.writeFileSync(path.join(ROOT, 'houses.js'), js);
console.error('wrote houses.js', (js.length / 1048576).toFixed(2) + 'MB');
