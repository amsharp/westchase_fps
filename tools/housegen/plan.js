// plan.js — survey → houses.js placement planner (building stamping phase).
//   node plan.js <scratchpad> <out houses.js>
//
// Reads:
//   <scratchpad>/survey/buildings_merged.json   1301 surveyed buildings
//                                               (gx/gz game coords, gcluster)
//   <scratchpad>/expansion/expdata.json         named road polylines (game u)
//   <scratchpad>/expansion/occupancy.json       existing colliders/buildings/
//                                               lots/forest/breakables dump
//   work/clusters/gc_*.json                     45 texture+spec clusters
//
// Emits houses.js (repo root):
//   HOUSE_CLUSTERS  [{id,tex,spec,variants}]  (kept variants only)
//   HOUSE_INSTANCES [[ci, x, z, rotDeg, vi], ...]
//   HOUSE_LOTS      [[x, z, w, d, rotDeg], ...]   front parking aprons
//   HOUSE_PARKED_ROWS [{x,z,dx,dz,slots,ry,n}]    extra parked-car rows
//
// Core rules (see task/CLAUDE.md):
//  - survey positions are 0.35-compressed but footprints stay 1:1, so grid
//    rows are RE-SPACED along their street (footprint + 4-7u gap) anchored on
//    the row centroid; overflow drops repeats first (keep unique looks).
//  - fronts face the nearest road; clearance: road hw+4 (arterial hw+5.6),
//    ponds +2.6 shore, forest rects, walls +-600, occupancy, each other.
'use strict';
const fs = require('fs');
const path = require('path');

const SP = process.argv[2] || '/tmp/claude-0/-home-user-westchase-fps/6762ca26-85bb-50ae-aa02-dab118a4400c/scratchpad';
const OUT = process.argv[3] || path.join(__dirname, '..', '..', 'houses.js');

const survey = JSON.parse(fs.readFileSync(path.join(SP, 'survey/buildings_merged.json'), 'utf8'));
const expdata = JSON.parse(fs.readFileSync(path.join(SP, 'expansion/expdata.json'), 'utf8'));
const occ = JSON.parse(fs.readFileSync(path.join(SP, 'expansion/occupancy.json'), 'utf8'));

// ---------------- deterministic rng ----------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0xC0FFEE);

// ---------------- clusters ----------------
const CLDIR = path.join(__dirname, 'work', 'clusters');
const clusters = {};
for (const f of fs.readdirSync(CLDIR)) {
  if (!f.startsWith('gc_') || !f.endsWith('.json')) continue;
  const c = JSON.parse(fs.readFileSync(path.join(CLDIR, f), 'utf8'));
  clusters[c.id] = c;
}
// footprint scale for oversize (real-meter) industrial footprints: compressed
// road grid can't host 100-190m slabs at 1:1. Scale dims + planar feat fields.
function scaleSpec(spec, s) {
  const out = JSON.parse(JSON.stringify(spec));
  out.dims[0] *= s; out.dims[1] *= s;
  const ft = out.feat || {};
  if (ft.win) for (const k in ft.win) for (const wn of ft.win[k]) wn[2] *= s;
  if (ft.door) { ft.door.w *= s; if (ft.door.porch && ft.door.porch.d) ft.door.porch.d *= s; }
  if (ft.garage) ft.garage.w *= s;
  if (ft.chimney) ft.chimney.w *= s;
  if (ft.dormer) ft.dormer.w *= s;
  if (ft.boxes) for (const b of ft.boxes) { b[1] *= s; b[3] *= s; b[4] *= s; b[6] *= s; }
  return out;
}
for (const id in clusters) {
  const c = clusters[id];
  const mx = Math.max(c.spec.dims[0], c.spec.dims[1]);
  if (mx > 65) {
    const s = Math.max(0.38, 65 / mx);
    c.spec = scaleSpec(c.spec, s);
    c.fscale = s;
  }
  if (id === 'gc_misc_D') c.spec.canopy = true;   // fuel canopy: hollow build
}

// survey references clusters that never got textures — remap to the nearest
// available same-family cluster by footprint area.
const FAMILY_FALLBACK = {
  retailbox: ['gc_retailbox_A'],
  retail: ['gc_retail_A', 'gc_retail_B'],
  off: ['gc_off_A', 'gc_off_E', 'gc_off_F', 'gc_off_G', 'gc_off_H'],
  church: ['gc_civic_A', 'gc_civic_B'],
  amen: ['gc_civic_A', 'gc_misc_B', 'gc_misc_E'],
  apt: ['gc_apt_A', 'gc_apt_B', 'gc_apt_C', 'gc_apt_D', 'gc_apt_E', 'gc_apt_F'],
  misc: ['gc_misc_A', 'gc_misc_B', 'gc_misc_C', 'gc_misc_E', 'gc_misc_L'],
  sfh: ['gc_sfh_A', 'gc_sfh_B', 'gc_sfh_C', 'gc_sfh_D', 'gc_sfh_E', 'gc_sfh_F', 'gc_sfh_G'],
  wh: ['gc_wh_A', 'gc_wh_B', 'gc_wh_C', 'gc_wh_D', 'gc_wh_E', 'gc_wh_F'],
  town: ['gc_town_A', 'gc_town_B'],
  school: ['gc_school_A', 'gc_school_B', 'gc_school_C'],
  civic: ['gc_civic_A', 'gc_civic_B'],
  flex: ['gc_flex_A', 'gc_flex_B', 'gc_flex_C'],
  outparcel: ['gc_outparcel_A', 'gc_outparcel_B'],
};
function resolveCluster(gc, bw, bd) {
  if (clusters[gc]) return gc;
  const fam = gc.replace(/^gc_/, '').replace(/_[A-Z]$/, '');
  const cands = FAMILY_FALLBACK[fam] || FAMILY_FALLBACK.misc;
  let best = cands[0], bd2 = 1e18;
  const a = (bw || 15) * (bd || 12);
  for (const c of cands) {
    if (!clusters[c]) continue;
    const d = clusters[c].spec.dims, da = Math.abs(d[0] * d[1] - a);
    if (da < bd2) { bd2 = da; best = c; }
  }
  return best;
}

// ---------------- roads (expansion polylines + core arterials) ----------------
const roads = [];
for (const r of expdata.roads) roads.push({ n: r.n, cls: r.cls, hw: r.hw, pts: r.pts });
roads.push({ n: 'Race Track Rd (core)', cls: 0, hw: 14, pts: [[-600, 0], [340, 0]] });
roads.push({ n: 'Nine Eagles / Countryway (core)', cls: 0, hw: 11, pts: [[0, -600], [0, 340]] });
for (const r of roads) {
  r.segs = []; r.len = 0;
  for (let i = 0; i + 1 < r.pts.length; i++) {
    const [x1, z1] = r.pts[i], [x2, z2] = r.pts[i + 1];
    const L = Math.hypot(x2 - x1, z2 - z1);
    r.segs.push({ x1, z1, x2, z2, L, s0: r.len });
    r.len += L;
  }
  r.clear = r.cls === 0 ? r.hw + 5.6 : r.hw + 4;
}
function nearestRoad(x, z) {
  let best = null;
  for (let ri = 0; ri < roads.length; ri++) {
    const r = roads[ri];
    for (let si = 0; si < r.segs.length; si++) {
      const g = r.segs[si];
      const dx = g.x2 - g.x1, dz = g.z2 - g.z1, L2 = dx * dx + dz * dz || 1;
      let t = ((x - g.x1) * dx + (z - g.z1) * dz) / L2;
      t = Math.max(0, Math.min(1, t));
      const px = g.x1 + dx * t, pz = g.z1 + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (!best || d < best.dist) {
        const ux = dx / Math.sqrt(L2), uz = dz / Math.sqrt(L2);
        // side: sign of cross(tangent, toPoint)
        const side = (ux * (z - pz) - uz * (x - px)) >= 0 ? 1 : -1;
        best = { ri, si, dist: d, s: g.s0 + t * g.L, px, pz, ux, uz, side };
      }
    }
  }
  return best;
}
function roadPointAt(r, s) {
  s = Math.max(0, Math.min(r.len, s));
  for (const g of r.segs) {
    if (s <= g.s0 + g.L + 1e-6) {
      const t = g.L ? (s - g.s0) / g.L : 0;
      return { x: g.x1 + (g.x2 - g.x1) * t, z: g.z1 + (g.z2 - g.z1) * t, ux: (g.x2 - g.x1) / (g.L || 1), uz: (g.z2 - g.z1) / (g.L || 1) };
    }
  }
  const g = r.segs[r.segs.length - 1];
  return { x: g.x2, z: g.z2, ux: (g.x2 - g.x1) / (g.L || 1), uz: (g.z2 - g.z1) / (g.L || 1) };
}

// seg-rect distance (rect axis-aligned): 0 if intersecting
function segRectDist(x1, z1, x2, z2, rx0, rz0, rx1, rz1) {
  function inR(x, z) { return x >= rx0 && x <= rx1 && z >= rz0 && z <= rz1; }
  if (inR(x1, z1) || inR(x2, z2)) return 0;
  const corners = [[rx0, rz0], [rx1, rz0], [rx1, rz1], [rx0, rz1]];
  // segment-segment intersection with rect edges
  function segSeg(ax, az, bx, bz, cx, cz, dx, dz) {
    const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    const d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
    const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx);
    const d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
    return d1 * d2 < 0 && d3 * d4 < 0;
  }
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
    if (segSeg(x1, z1, x2, z2, ax, az, bx, bz)) return 0;
  }
  function ptSeg(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    let t = ((px - ax) * dx + (pz - az) * dz) / L2; t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
  }
  let m = 1e9;
  for (const [cx, cz] of corners) m = Math.min(m, ptSeg(cx, cz, x1, z1, x2, z2));
  // rect-corner-to-seg covered above; also seg endpoints to rect
  function ptRect(px, pz) {
    const qx = Math.max(rx0, Math.min(px, rx1)), qz = Math.max(rz0, Math.min(pz, rz1));
    return Math.hypot(px - qx, pz - qz);
  }
  m = Math.min(m, ptRect(x1, z1), ptRect(x2, z2));
  return m;
}

// ---------------- static obstacles ----------------
const PONDS = expdata.ponds.map(p => Array.isArray(p) ? { x: p[0], z: p[1], rx: p[2], rz: p[3] } : p);
const FOREST = expdata.forest.map(f => Array.isArray(f) ? { x0: f[0], x1: f[1], z0: f[2], z1: f[3] } : f);
const occRects = [];
for (const c of occ.colliders) occRects.push({ x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1 });
for (const b of occ.mapBuildings) occRects.push({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 });
for (const p of occ.mapParking) occRects.push({ x0: p.x - p.w / 2, x1: p.x + p.w / 2, z0: p.z - p.d / 2, z1: p.z + p.d / 2 });
for (const d of occ.mapDrives) occRects.push({ x0: d.x - d.w / 2, x1: d.x + d.w / 2, z0: d.z - d.d / 2, z1: d.z + d.d / 2 });
for (const f of (occ.mapForest || [])) occRects.push({ x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1 });
const breaks = (occ.breakables || []).map(b => ({ x: b.x, z: b.z, r: b.r || 1 }));

const placed = [];   // {x,z,hx,hz, inst:[ci,x,z,rot,vi], lot?}
const lots = [];     // {x,z,w,d,rot,hx,hz,area,fx,fz,ux,uz}

function overlapsRect(x, z, hx, hz, R, m) {
  return x + hx > R.x0 - m && x - hx < R.x1 + m && z + hz > R.z0 - m && z - hz < R.z1 + m;
}
// full placement check. Returns null if OK else reason string.
function checkSpot(x, z, hx, hz, opts) {
  opts = opts || {};
  const roadM = opts.roadMargin !== undefined ? opts.roadMargin : 0;
  if (Math.abs(x) + hx > 585 || Math.abs(z) + hz > 585) return 'wall';
  const x0 = x - hx, x1 = x + hx, z0 = z - hz, z1 = z + hz;
  for (const r of roads) {
    const lim = r.clear + roadM;
    // quick reject by road bbox could help; roads few, skip
    for (const g of r.segs) {
      if (segRectDist(g.x1, g.z1, g.x2, g.z2, x0, z0, x1, z1) < lim) return 'road';
    }
  }
  for (const p of PONDS) {
    if (overlapsRect(x, z, hx, hz, { x0: p.x - p.rx - 2.6, x1: p.x + p.rx + 2.6, z0: p.z - p.rz - 2.6, z1: p.z + p.rz + 2.6 }, 0.5)) return 'pond';
  }
  for (const f of FOREST) if (overlapsRect(x, z, hx, hz, f, 0.5)) return 'forest';
  const core = Math.abs(x) < 340 + hx && Math.abs(z) < 340 + hz;
  const occM = opts.occMargin !== undefined ? opts.occMargin : (core ? 5 : 1);
  for (const R of occRects) if (overlapsRect(x, z, hx, hz, R, occM)) return 'occupied';
  for (const b of breaks) {
    const qx = Math.max(x0, Math.min(b.x, x1)), qz = Math.max(z0, Math.min(b.z, z1));
    if ((b.x - qx) * (b.x - qx) + (b.z - qz) * (b.z - qz) < (b.r + 0.4) * (b.r + 0.4)) return 'prop';
  }
  const gap = opts.gap !== undefined ? opts.gap : 1.2;
  for (const p of placed) {
    if (opts.ignore && p === opts.ignore) continue;
    if (overlapsRect(x, z, hx, hz, { x0: p.x - p.hx, x1: p.x + p.hx, z0: p.z - p.hz, z1: p.z + p.hz }, gap)) return 'building';
  }
  for (const l of lots) if (overlapsRect(x, z, hx, hz, { x0: l.x - l.hx, x1: l.x + l.hx, z0: l.z - l.hz, z1: l.z + l.hz }, 0.3)) return 'lot';
  return null;
}
function aabbHalf(w, d, ryDeg) {
  const a = ryDeg * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  return { hx: (w * c + d * s) / 2, hz: (w * s + d * c) / 2 };
}

// ---------------- variant selection ----------------
function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function colDist(a, b) { const A = hexRGB(a), B = hexRGB(b); return (A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2; }
function nearestVariant(cl, roofColor, keptIdx) {
  const idxs = keptIdx || cl.variants.map((_, i) => i);
  if (!roofColor) return idxs[0];
  let best = idxs[0], bd = 1e18;
  for (const i of idxs) {
    const d = colDist(cl.variants[i].roofColor || '#808080', roofColor);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// prepass: candidate buildings + provisional variant usage per cluster
const B = survey.buildings.filter(b => b.gcluster);
for (const b of B) b.gc = resolveCluster(b.gcluster, b.w, b.d);
const usage = {};   // gc -> variantIdx -> count
for (const b of B) {
  const cl = clusters[b.gc];
  const vi = nearestVariant(cl, b.roofColor);
  usage[b.gc] = usage[b.gc] || {};
  usage[b.gc][vi] = (usage[b.gc][vi] || 0) + 1;
}
// kept variants per cluster (combo budget ~<=72)
const kept = {};    // gc -> [variantIdx...]
{
  const counts = {};
  for (const b of B) counts[b.gc] = (counts[b.gc] || 0) + 1;
  for (const gc in usage) {
    const n = counts[gc];
    let K = n >= 150 ? 4 : n >= 60 ? 3 : n >= 15 ? 2 : 1;
    K = Math.min(K, Object.keys(usage[gc]).length);
    kept[gc] = Object.entries(usage[gc]).sort((a, b2) => b2[1] - a[1]).slice(0, K).map(e => +e[0]);
  }
  let total = Object.values(kept).reduce((a, k) => a + k.length, 0);
  // trim biggest lists if over budget
  const budget = 72;
  while (total > budget) {
    let big = null;
    for (const gc in kept) if (!big || kept[gc].length > kept[big].length) big = gc;
    if (kept[big].length <= 1) break;
    kept[big].pop(); total--;
  }
}
for (const b of B) b.vi = nearestVariant(clusters[b.gc], b.roofColor, kept[b.gc]);

// ---------------- classify: row types vs individual ----------------
const ROW_TYPES = { sfh: 1, townhouse_row: 1 };
const LOT_TYPES = { retail_strip: 1, retail_box: 1, office: 1, warehouse: 1, flex_industrial: 1, apartment_block: 1, school_bldg: 1 };
const rows = {};        // key ri|side -> [b]
const individual = [];
const dropStats = {};   // area -> reason -> n
function drop(b, reason) {
  dropStats[b.area] = dropStats[b.area] || {};
  dropStats[b.area][reason] = (dropStats[b.area][reason] || 0) + 1;
}
for (const b of B) {
  const nr = nearestRoad(b.gx, b.gz);
  b.nr = nr;
  if (ROW_TYPES[b.type]) {
    if (!nr || nr.dist > 45) { drop(b, 'no-street'); continue; }
    const key = nr.ri + '|' + nr.side;
    (rows[key] = rows[key] || []).push(b);
  } else {
    individual.push(b);
  }
}

const instances = [];   // [ci,x,z,rotDeg,vi]
const clusterIdx = {};  // gc -> emitted index
const clusterList = [];
function ciOf(gc) {
  if (clusterIdx[gc] === undefined) { clusterIdx[gc] = clusterList.length; clusterList.push(gc); }
  return clusterIdx[gc];
}
const placeStats = {};  // area -> n
function commit(b, x, z, rotDeg, hx, hz) {
  const gc = b.gc;
  const vi = kept[gc].indexOf(b.vi);
  const inst = [ciOf(gc), +x.toFixed(1), +z.toFixed(1), +rotDeg.toFixed(1), vi < 0 ? 0 : vi];
  instances.push(inst);
  placed.push({ x, z, hx, hz, b, inst });
  placeStats[b.area] = (placeStats[b.area] || 0) + 1;
  return placed[placed.length - 1];
}

// ---------------- individual placement (big stuff first) ----------------
individual.sort((a, b2) => {
  const A = clusters[a.gc].spec.dims, Bm = clusters[b2.gc].spec.dims;
  return Bm[0] * Bm[1] - A[0] * A[1];
});
for (const b of individual) {
  const cl = clusters[b.gc], dims = cl.spec.dims;
  const w = dims[0], d = dims[1];
  const nr = b.nr;
  let x = b.gx, z = b.gz, rotDeg;
  const wantLot = LOT_TYPES[b.type] && !cl.spec.canopy;
  const lotDepth = wantLot ? Math.max(8, Math.min(15, w * 0.35)) : 0;
  let fx = 0, fz = 1, ux = 1, uz = 0;
  if (nr && nr.dist < 70) {
    const r = roads[nr.ri];
    ux = nr.ux; uz = nr.uz;
    // outward normal (road -> building side)
    const nx = -uz * nr.side, nz = ux * nr.side;
    fx = -nx; fz = -nz;    // front faces the road
    rotDeg = Math.atan2(fx, fz) * 180 / Math.PI;
    const req = r.clear + 2 + lotDepth + (lotDepth ? 1 : 0) + d / 2 + 1.5;
    if (nr.dist < req) { x = nr.px + nx * req; z = nr.pz + nz * req; }
  } else {
    rotDeg = 90 - (b.orientDeg || 0);
    fx = Math.sin(rotDeg * Math.PI / 180); fz = Math.cos(rotDeg * Math.PI / 180);
    ux = fz; uz = -fx;
  }
  const H = aabbHalf(w, d, rotDeg);
  let done = false, lastFail = '';
  outer:
  for (const along of [0, 5, -5, 11, -11, 18, -18, 26, -26, 35, -35]) {
    for (const back of [0, 4, 8, 13, 19]) {
      const px = x + ux * along - fx * back, pz = z + uz * along - fz * back;
      const fail = checkSpot(px, pz, H.hx, H.hz, { gap: 0.8 });
      if (fail) { lastFail = fail; continue; }
      const P = commit(b, px, pz, rotDeg, H.hx, H.hz);
      // parking apron in front
      if (wantLot) {
        const lw = Math.max(10, Math.min(40, w));
        for (const ld of [lotDepth, lotDepth * 0.7]) {
          const lx = px + fx * (d / 2 + ld / 2 + 0.8), lz = pz + fz * (d / 2 + ld / 2 + 0.8);
          const LH = aabbHalf(lw, ld, rotDeg);
          if (!checkSpot(lx, lz, LH.hx, LH.hz, { roadMargin: -3, gap: -1.5, occMargin: 1, ignore: P })) {
            const lot = { x: +lx.toFixed(1), z: +lz.toFixed(1), w: +lw.toFixed(1), d: +ld.toFixed(1), rot: +rotDeg.toFixed(1), hx: LH.hx, hz: LH.hz, area: lw * ld, fx, fz, ux, uz, forB: P };
            lots.push(lot);
            break;
          }
        }
      }
      done = true;
      break outer;
    }
  }
  if (!done) drop(b, 'no-room:' + lastFail);
}

// ---------------- row re-spacing ----------------
for (const key in rows) {
  const [riS, sideS] = key.split('|');
  const ri = +riS, side = +sideS;
  const r = roads[ri];
  const members = rows[key];
  members.sort((a, b2) => a.nr.s - b2.nr.s);
  // drop repeats until row fits its street span
  const smin = 8, smax = Math.max(smin, r.len - 8);
  const span = smax - smin;
  let list = members.slice();
  function totalLen(L2) {
    let t = 0;
    for (const m of L2) t += clusters[m.gc].spec.dims[0] + 5.5;
    return t;
  }
  if (totalLen(list) > span) {
    const seen = {}, uniques = [], repeats = [];
    for (const m of list) {
      const k = m.gc + '|' + m.vi;
      if (seen[k]) repeats.push(m); else { seen[k] = 1; uniques.push(m); }
    }
    // drop repeats (alternating ends) until it fits or none left
    let fromEnd = true;
    while (repeats.length && totalLen(uniques.concat(repeats)) > span) {
      if (fromEnd) repeats.pop(); else repeats.shift();
      fromEnd = !fromEnd;
    }
    list = uniques.concat(repeats).sort((a, b2) => a.nr.s - b2.nr.s);
    for (const m of members) if (!list.includes(m)) drop(m, 'row-repeat');
  }
  // anchor on centroid of surveyed arclengths
  let cen = 0;
  for (const m of list) cen += m.nr.s;
  cen = list.length ? cen / list.length : 0;
  let widths = list.map(m => clusters[m.gc].spec.dims[0]);
  let gaps = list.map(() => 4 + rng() * 3);
  let total = widths.reduce((a, w2, i) => a + w2 + (i < widths.length - 1 ? gaps[i] : 0), 0);
  let cursor = Math.max(smin, Math.min(cen - total / 2, smax - total));
  for (let i = 0; i < list.length; i++) {
    const m = list[i], cl = clusters[m.gc], dims = cl.spec.dims;
    let ok = false, lastFail = '';
    // if the natural slot is blocked, slide forward along the street a few
    // times (the whole row shifts with it — synthetic spacing anyway)
    for (let att = 0; att < 6 && !ok; att++) {
      const sc = cursor + widths[i] / 2;
      if (sc + widths[i] / 2 > smax) break;
      const P = roadPointAt(r, sc);
      const nx = -P.uz * side, nz = P.ux * side;
      const off = r.clear + 1.5 + rng() * 1.5 + dims[1] / 2;
      const rotDeg = Math.atan2(-nx, -nz) * 180 / Math.PI;
      const H = aabbHalf(dims[0], dims[1], rotDeg);
      for (const back of [0, 2.5, 5]) {
        const px = P.x + nx * (off + back), pz = P.z + nz * (off + back);
        const fail = checkSpot(px, pz, H.hx, H.hz, { gap: 0.8 });
        if (!fail) { commit(m, px, pz, rotDeg, H.hx, H.hz); ok = true; break; }
        else lastFail = fail;
      }
      if (!ok) cursor += 4;   // slide past the obstruction
    }
    if (ok) cursor += widths[i] + (i < gaps.length ? gaps[i] : 0);
    else if (cursor + widths[i] > smax) drop(m, 'row-overflow');
    else drop(m, 'blocked:' + lastFail);
  }
}

if (process.env.PLAN_DEBUG) {
  for (const key in rows) {
    const [riS, sideS] = key.split('|');
    const r = roads[+riS];
    const n = rows[key].length;
    const got = placed.filter(p => p.b.nr && p.b.nr.ri === +riS && p.b.nr.side === +sideS && ROW_TYPES[p.b.type]).length;
    console.log('ROW', r.n, 'side', sideS, 'len', Math.round(r.len), 'members', n, 'placed', got);
  }
}

// ---------------- parked-car rows on the biggest new lots ----------------
const parkedRows = [];
{
  const big = lots.slice().sort((a, b2) => b2.area - a.area).slice(0, 12);
  let carSum = 0;
  for (const l of big) {
    if (carSum >= 22) break;
    const slots = Math.floor((l.w - 3) / 3.3);
    if (slots < 2) continue;
    const n = Math.min(3, Math.max(1, Math.round(slots * 0.3)));
    // row runs along the lot's width axis (u); noses point at the building (-f)
    const rowOff = Math.max(0, l.d / 2 - 2.8);
    const cx = l.x - l.fx * rowOff, cz = l.z - l.fz * rowOff;
    const sx = cx - l.ux * 3.3 * (slots - 1) / 2, sz = cz - l.uz * 3.3 * (slots - 1) / 2;
    const ry = Math.atan2(-l.fx, -l.fz);
    parkedRows.push({
      x: +sx.toFixed(1), z: +sz.toFixed(1),
      dx: +(l.ux * 3.3).toFixed(2), dz: +(l.uz * 3.3).toFixed(2),
      slots, ry: +ry.toFixed(3), n,
    });
    carSum += n;
  }
  console.log('parked rows:', parkedRows.length, 'target cars:', carSum);
}

// ---------------- emit ----------------
const outClusters = clusterList.map(gc => {
  const c = clusters[gc];
  return { id: c.id, tex: c.tex, spec: c.spec, variants: kept[gc].map(vi => ({ shift: c.variants[vi].shift || 0, roof: c.variants[vi].roofColor || c.spec.wallColor })) };
});
const outLots = lots.map(l => [l.x, l.z, l.w, l.d, l.rot]);
const js = '// houses.js — surveyed neighborhoods: AI house clusters (tools/housegen).\n' +
  '// Generated by tools/housegen/plan.js — do not hand-edit. Load before game.js.\n' +
  'var HOUSE_CLUSTERS = ' + JSON.stringify(outClusters) + ';\n' +
  'var HOUSE_INSTANCES = ' + JSON.stringify(instances) + ';\n' +
  'var HOUSE_LOTS = ' + JSON.stringify(outLots) + ';\n' +
  'var HOUSE_PARKED_ROWS = ' + JSON.stringify(parkedRows) + ';\n';
fs.writeFileSync(OUT, js);

// ---------------- report ----------------
const comboUse = {};
for (const i of instances) comboUse[i[0] + '|' + i[4]] = 1;
console.log('wrote', OUT, (js.length / 1048576).toFixed(2) + 'MB');
console.log('clusters emitted:', outClusters.length, ' combos used:', Object.keys(comboUse).length);
console.log('instances:', instances.length, ' lots:', lots.length);
console.log('placed by district:', JSON.stringify(placeStats));
for (const a in dropStats) console.log('dropped', a, JSON.stringify(dropStats[a]));
