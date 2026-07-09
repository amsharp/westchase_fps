/* ============================================================
   WESTCHASE — retro FPS
   v3: hand-authored map matching the Linebaugh Ave intersection
   ============================================================ */
(function () {
'use strict';

// Bump with EVERY change to the game (shown on the main menu).
var GAME_VERSION = 'v1.53.1';
document.getElementById('gameVer').textContent = GAME_VERSION;

// ---- WC_REMAP build-time flag (R2, true-geometry remap) ----
// false (shipping default) = the current axis-road world, every remap code
// path dormant. true = build the TRUE satellite geometry from remapdata.js
// (Race Track Rd as a smoothed diagonal through the origin, Countryway SE,
// Nine Eagles N — a 3-leg Y) instead of the perpendicular axis roads.
// Tests force it on via window.WC_REMAP_OVERRIDE (set before game.js loads).
var WC_REMAP = true;
if (typeof window !== 'undefined' && window.WC_REMAP_OVERRIDE !== undefined) WC_REMAP = !!window.WC_REMAP_OVERRIDE;
if (typeof REMAP_ROADS === 'undefined') WC_REMAP = false;   // data file missing -> legacy world
// The editor-authored map (REMAP_VENUES) is the intersection landmark set; the
// survey house fill (houses.js) populates the residential neighborhoods around
// it. Its HOUSE_INSTANCES were re-vetted against the true roads/venues/surfaces
// (tools/housegen/revet.js) so they no longer clip the remap geometry; the
// runtime houseOnRoad() drop below is a deterministic safety net. Requires the
// houses.js data file (guarded where consumed).
var STAMP_SURVEY_HOUSES = (typeof HOUSE_CLUSTERS !== 'undefined');

// ---------------- world constants ----------------
var HALF = 600, TOTAL = HALF * 2;   // expanded world (map expansion)
var CORE = 340;                     // original hand-built map half-size — all
                                    // pre-expansion content lives in |x|,|z|<=CORE
var EYE = 1.7, GRAV = 16;
var MAIN_HW = 14;   // main road (E-W, z=0) half width
var CROSS_HW = 11;  // cross road (N-S, x=0) half width
// arterial exits through the NEW perimeter (the bends are in EXP_ROADS):
// Race Track Rd bends NE at x=CORE and exits the east wall at z=NE_EXIT_Z;
// Countryway Blvd bends SE at z=CORE and exits the south wall at x=SE_EXIT_X.
var NE_EXIT_Z = -200, SE_EXIT_X = 278;

var WEAPONS = {
  fists:  { name: 'FISTS',  melee: true, dmg: 34, rate: 0.42, range: 2.4 },
  pistol: { name: 'PISTOL', price: 150, dmg: 40, rate: 0.2, auto: false, spread: 0.014, desc: '9mm sidearm. Reliable.', flashAt: [0.26, -0.265, -0.9] },
  smg:    { name: 'SMG',    price: 400, dmg: 15, rate: 0.065, auto: true, spread: 0.008, spreadMax: 0.05, bloomPerShot: 0.006, desc: 'First shots on target. Then it sprays.', flashAt: [0.26, -0.262, -1.2] },
  rifle:  { name: 'RIFLE',  price: 600, dmg: 95, rate: 0.8,  auto: false, spread: 0.004, desc: 'One shot, one nap. Right-click to scope.', flashAt: [0.24, -0.235, -1.38] },
  auto:   { name: 'AK-47',  price: 1000, dmg: 34, rate: 0.11, auto: true, spread: 0.012, desc: 'Full auto, long range.', flashAt: [0.26, -0.255, -1.2] },
  rocket: { name: 'ROCKET LAUNCHER', price: 2000, rate: 5, rocket: true, desc: 'Danger close. 5s reload.', flashAt: [0.3, -0.28, -1.0] },
  raygun: { name: 'RAY GUN', price: 0, dmg: 70, rate: 0.22, auto: false, spread: 0, laser: true, desc: 'Alien tech. Semi-auto. Never misses.', flashAt: [0.26, -0.25, -0.95] },
  snack:  { name: 'SNACK', snack: true, rate: 0.8 },
  soda:   { name: 'SODA', snack: true, rate: 0.6 }   // vending machines (streetprops)
};
var GUN_LIST = ['pistol', 'smg', 'rifle', 'auto', 'rocket', 'raygun'];

// ---------------- state ----------------
var state = {
  running: false, menu: null,
  money: 400, hp: 100, dead: false,
  owned: { pistol: false, smg: false, rifle: false, auto: false, rocket: false, raygun: false },
  equipped: 'fists',
  lastHurt: -99, lastCarHit: -99, lastRob: -99,
  wanted: 0, civKills: 0, copKills: 0, snacks: 0
};

var keys = {}, mouseDown = false;
var yaw = 0, pitch = 0;
var player = { x: -72, z: -97, y: EYE, vy: 0, grounded: true };   // Publix lot, next to the dealer
var spawnX = -72, spawnZ = -97;   // where death respawns you — overridden to the real spawn per world
var lastShot = -99, punchT = -99, recoil = 0, punchSide = false, punchSlap = false, gunBloom = 0, equipT = -99;
var lastShotBy = {};   // per-weapon last-fire time so a fast gun can't lock out a slow one you switch to — and a weapon's own reload (the RPG's 5s) can't be dodged by switching away and back
var recentAtmCash = [];   // host-side dedup of client atmCash spawns (per-peer prop breaks can double-report one meter)
var recoilPitch = 0;   // camera kick from firing, decays back to the aim pitch (separate from mouse-look pitch)
var T = 0;
var driving = null;   // traffic-car entry the player is driving

var dealerPos = { x: -72, z: -106 };   // in the Publix parking lot, facing the store
var gasRob = { x: 60, z: 42 };   // entrance zone in front of the RaceTrac door
var LAKE = { x: -280, z: 55, r: 62 };   // open SW field, nudged east toward the road (clear of it + the parking lot)
var LAKE_DEPTH = 4;            // bowl depth at the center
var WATER_Y = 0.2;             // water surface height
function lakeBedY(x, z) {
  // paraboloid bowl matching the bed mesh; 0 outside the shoreline
  var dx = (x - LAKE.x) / (LAKE.r * 1.25), dz = (z - LAKE.z) / (LAKE.r * 0.85);
  var q = dx * dx + dz * dz;
  return q >= 1 ? 0 : -LAKE_DEPTH * (1 - q);
}
// (x,z) within the lake footprint (+margin) — trees/forest keep out of it
function inLake(x, z) { var dx = (x - LAKE.x) / (LAKE.r * 1.25), dz = (z - LAKE.z) / (LAKE.r * 0.85); return dx * dx + dz * dz < 1.25; }

// minimap feature registers
var mapBuildings = [];   // {x,z,w,d,c,pad}
var mapParking = [];     // {x,z,w,d}
var mapForest = [];      // {x0,x1,z0,z1}
var mapPave = [];        // {x,z,w,d} concrete pads
var mapDrives = [];      // {x,z,w,d} access roads / driveways

// ---------------- renderer / scene ----------------
// preserveDrawingBuffer lets the bug-report tool read the framebuffer back with
// toDataURL after a render (negligible perf cost for this game)
var renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
document.getElementById('game').appendChild(renderer.domElement);
var MAXANISO = renderer.capabilities.getMaxAnisotropy ? Math.min(4, renderer.capabilities.getMaxAnisotropy()) : 1;

var scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe4ee, 110, 520);

var camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 1000);
camera.rotation.order = 'YXZ';

var hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a58, 0.85);
scene.add(hemi);
var sun = new THREE.DirectionalLight(0xfff0d0, 0.95);
sun.position.set(60, 100, 30);
scene.add(sun);

function sizeRenderer() {
  var aspect = window.innerWidth / window.innerHeight;
  var h = 480, w = Math.min(1280, Math.max(640, Math.round(h * aspect)));
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = '100vw';
  renderer.domElement.style.height = '100vh';
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', sizeRenderer);
sizeRenderer();

// ---------------- texture helpers ----------------
function finishTex(t, repX, repY) {
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = MAXANISO;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repX) t.repeat.set(repX, repY || repX);
  return t;
}
function tex(size, draw, repX, repY) {
  var c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  return finishTex(new THREE.CanvasTexture(c), repX, repY);
}
function noise(g, s, n, dark, light) {
  for (var i = 0; i < n; i++) {
    g.fillStyle = 'rgba(0,0,0,' + (Math.random() * dark) + ')';
    g.fillRect((Math.random() * s) | 0, (Math.random() * s) | 0, 2, 2);
    g.fillStyle = 'rgba(255,255,255,' + (Math.random() * light) + ')';
    g.fillRect((Math.random() * s) | 0, (Math.random() * s) | 0, 2, 2);
  }
}

var grassT = tex(256, function (g, s) {
  // richer, less-neon turf: deeper olive base + many SMALL tonal patches
  // (kept well under half a tile so the ~10u world tiling doesn't read as
  // repeating blobs) + dense blade detail + sparse dry/dirt flecks.
  g.fillStyle = '#4f7d37'; g.fillRect(0, 0, s, s);
  // broad soft mottle in muted greens/olives (small radii → fine grain)
  var patch = ['rgba(64,102,44,0.5)', 'rgba(108,142,74,0.45)', 'rgba(88,120,58,0.4)',
               'rgba(120,110,66,0.28)', 'rgba(70,96,48,0.5)'];
  for (var i = 0; i < 70; i++) {
    var gx = Math.random() * s, gy = Math.random() * s, gr2 = 5 + Math.random() * 20;
    var gr = g.createRadialGradient(gx, gy, 1, gx, gy, gr2);
    gr.addColorStop(0, patch[(Math.random() * patch.length) | 0]); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(gx - gr2, gy - gr2, gr2 * 2, gr2 * 2);
  }
  // dense blade speckle (varied greens, muted highs)
  var greens = ['#4a7330', '#5d8a3e', '#6f9c4a', '#3f6a2a', '#77a352', '#547a36'];
  for (i = 0; i < 2600; i++) {
    g.strokeStyle = greens[(Math.random() * greens.length) | 0];
    g.lineWidth = 1;
    var x = Math.random() * s, y = Math.random() * s;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 2.5, y - 2 - Math.random() * 4); g.stroke();
  }
  // a few dry/dirt flecks for tonal break-up
  for (i = 0; i < 120; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(120,104,64,0.4)' : 'rgba(150,158,120,0.3)'; g.fillRect((Math.random() * s) | 0, (Math.random() * s) | 0, 2, 2); }
}, TOTAL / 10, TOTAL / 10);

// forest-floor litter (dark leaf/needle/dirt cover under dense canopy)
var forestFloorT = tex(128, function (g, s) {
  g.fillStyle = '#33471f'; g.fillRect(0, 0, s, s);
  var pt = ['rgba(46,58,26,0.6)', 'rgba(70,52,28,0.55)', 'rgba(58,44,22,0.5)', 'rgba(40,54,26,0.6)', 'rgba(88,74,40,0.35)'];
  for (var i = 0; i < 60; i++) { var gx = Math.random() * s, gy = Math.random() * s, r = 4 + Math.random() * 16, gr = g.createRadialGradient(gx, gy, 1, gx, gy, r); gr.addColorStop(0, pt[(Math.random() * pt.length) | 0]); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(gx - r, gy - r, r * 2, r * 2); }
  // scattered leaf/needle litter strokes + twigs
  var lit = ['#5a4a24', '#6e5a2c', '#3c4a20', '#7a6636', '#485a26'];
  for (i = 0; i < 1400; i++) { g.strokeStyle = lit[(Math.random() * lit.length) | 0]; g.lineWidth = 1; var x = Math.random() * s, y = Math.random() * s, a = Math.random() * 6.28; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3); g.stroke(); }
}, TOTAL / 12, TOTAL / 12);

var walkT = tex(128, function (g, s) {
  g.fillStyle = '#b5b1a6'; g.fillRect(0, 0, s, s);
  noise(g, s, 500, 0.07, 0.06);
  g.strokeStyle = 'rgba(70,66,58,0.6)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.stroke();
}, 6, 6);

var roadT = tex(128, function (g, s) {
  g.fillStyle = '#3a3b40'; g.fillRect(0, 0, s, s);
  noise(g, s, 900, 0.16, 0.05);
  g.fillStyle = '#c9a42e';
  g.fillRect(0, s / 2 - 4, s, 2.5);
  g.fillRect(0, s / 2 + 2, s, 2.5);
  g.fillStyle = 'rgba(220,220,215,0.85)';
  for (var d = 4; d < s; d += 42) {
    g.fillRect(d, s * 0.25 - 1, 20, 2.5);
    g.fillRect(d, s * 0.75 - 1, 20, 2.5);
  }
});

var parkingT = tex(128, function (g, s) {
  g.fillStyle = '#43444a'; g.fillRect(0, 0, s, s);
  noise(g, s, 700, 0.13, 0.05);
  g.fillStyle = 'rgba(230,230,225,0.8)';
  for (var x = 8; x < s; x += 22) g.fillRect(x, 6, 3, 40);
}, 4, 4);

// light concrete pad under buildings
var concreteT = tex(128, function (g, s) {
  g.fillStyle = '#c3bfb4'; g.fillRect(0, 0, s, s);
  noise(g, s, 500, 0.06, 0.05);
  for (var i = 0; i < 3; i++) { var sx = Math.random() * s, sy = Math.random() * s; var gr = g.createRadialGradient(sx, sy, 1, sx, sy, 12 + Math.random() * 14); gr.addColorStop(0, 'rgba(70,66,58,0.14)'); gr.addColorStop(1, 'rgba(70,66,58,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }
  g.strokeStyle = 'rgba(90,86,78,0.5)'; g.lineWidth = 2;
  for (i = 0; i <= s; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke(); }
});
// plain asphalt for access roads / driveways
var driveT = tex(128, function (g, s) {
  g.fillStyle = '#3d3e44'; g.fillRect(0, 0, s, s);
  noise(g, s, 800, 0.15, 0.05);
  g.strokeStyle = 'rgba(20,20,22,0.4)'; g.lineWidth = 1;
  for (var i = 0; i < 3; i++) { var x = Math.random() * s, y = 0; g.beginPath(); g.moveTo(x, y); for (var k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 18; y += s / 4; g.lineTo(x, y); } g.stroke(); }
});

var roofTileT = tex(128, function (g, s) {
  g.fillStyle = '#a85838'; g.fillRect(0, 0, s, s);
  var rows = 8, rh = s / rows;
  for (var r = 0; r < rows; r++) {
    var y = r * rh;
    var gr = g.createLinearGradient(0, y, 0, y + rh);
    gr.addColorStop(0, '#c07048'); gr.addColorStop(0.7, '#a05334'); gr.addColorStop(1, '#7e3f26');
    g.fillStyle = gr; g.fillRect(0, y, s, rh);
    g.strokeStyle = 'rgba(60,28,16,0.6)'; g.lineWidth = 1.5;
    for (var x = 0; x <= s; x += 16) {
      g.beginPath(); g.moveTo(x + (r % 2 ? 8 : 0), y); g.lineTo(x + (r % 2 ? 8 : 0), y + rh); g.stroke();
    }
  }
  noise(g, s, 200, 0.08, 0.04);
});

var flatRoofT = tex(128, function (g, s) {
  g.fillStyle = '#8f8a80'; g.fillRect(0, 0, s, s);
  noise(g, s, 1400, 0.14, 0.1);
});
var flatRoofM = lamb2(flatRoofT);

var blueRoofT = tex(128, function (g, s) {
  g.fillStyle = '#2f6f9e'; g.fillRect(0, 0, s, s);
  var gr = g.createLinearGradient(0, 0, 0, s);
  gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(20,50,80,0.6)'; g.lineWidth = 2;
  for (var x = 0; x < s; x += 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke(); }
}, 6, 2);
var blueRoofM = lamb2(blueRoofT);

var storageDoorT = tex(128, function (g, s) {
  g.fillStyle = '#c9662a'; g.fillRect(0, 0, s, s);
  for (var i = 0; i < s; i += 8) { g.fillStyle = i % 16 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.1)'; g.fillRect(0, i, s, 4); }
  g.fillStyle = '#e8e4da';
  for (var x = 6; x < s; x += 42) g.fillRect(x, 2, 34, s - 4);
  g.fillStyle = '#c9662a';
  for (x = 6; x < s; x += 42) for (var y = 6; y < s; y += 8) g.fillRect(x + 2, y, 30, 4);
}, 5, 1);
var storageDoorM = lamb2(storageDoorT);

var garageT = tex(64, function (g, s) {
  g.fillStyle = '#e6e0d2'; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
  for (var y = 8; y < s; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
});

// forest backdrop (tiled tree silhouettes)
var forestBackT = tex(256, function (g, s) {
  var sky = g.createLinearGradient(0, 0, 0, s);
  sky.addColorStop(0, '#9fc4d8'); sky.addColorStop(0.35, '#7ea77f'); sky.addColorStop(1, '#2c4a2a');
  g.fillStyle = sky; g.fillRect(0, 0, s, s);
  function layer(baseY, col, n, hmin, hmax) {
    g.fillStyle = col;
    for (var i = 0; i < n; i++) {
      var x = Math.random() * s, h = hmin + Math.random() * (hmax - hmin), w = 14 + Math.random() * 18;
      g.beginPath();
      g.moveTo(x - w / 2, baseY);
      g.quadraticCurveTo(x - w / 4, baseY - h * 0.6, x, baseY - h);
      g.quadraticCurveTo(x + w / 4, baseY - h * 0.6, x + w / 2, baseY);
      g.fill();
    }
  }
  layer(s * 0.7, '#3a5c34', 30, 40, 80);
  layer(s * 0.85, '#2d4a28', 34, 50, 100);
  layer(s, '#20361d', 40, 60, 120);
}, 10, 1);

var oakBarkT = tex(64, function (g, s) {
  g.fillStyle = '#6b5236'; g.fillRect(0, 0, s, s);
  for (var i = 0; i < 14; i++) {
    g.strokeStyle = 'rgba(40,28,14,' + (0.2 + Math.random() * 0.35) + ')';
    g.lineWidth = 1 + Math.random() * 2;
    var x = Math.random() * s;
    g.beginPath(); g.moveTo(x, 0);
    for (var y = 0; y <= s; y += 12) g.lineTo(x + Math.sin(y * 0.2 + i) * 2, y);
    g.stroke();
  }
}, 1, 2);

var PASTELS = ['#f2e3c6', '#f7d9b0', '#eec4b4', '#f5eed8', '#e6d7ae', '#f0cfa0', '#dfe4d0'];

function stucco(g, s, base) { g.fillStyle = base; g.fillRect(0, 0, s, s); noise(g, s, 700, 0.05, 0.06); }
var facadeCache = {};
function facadeTex(base, w, h, withDoor) {
  var rows = Math.max(1, Math.min(6, Math.round(h / 3)));
  var cols = Math.max(2, Math.min(6, Math.round(w / 4)));
  var key = base + '_' + rows + '_' + cols + '_' + (withDoor ? 1 : 0);
  if (facadeCache[key]) return facadeCache[key];
  var c = document.createElement('canvas'); c.width = c.height = 256;
  var g = c.getContext('2d');
  stucco(g, 256, base);
  // companion NIGHT-emissive canvas: black walls, only windows/doorway emit —
  // used as emissiveMap so at night this reads as lit windows, not a glowing wall
  var ce = document.createElement('canvas'); ce.width = ce.height = 256;
  var ge = ce.getContext('2d'); ge.fillStyle = '#000'; ge.fillRect(0, 0, 256, 256);
  var cw = 256 / cols, rh = 256 / rows;
  g.fillStyle = 'rgba(0,0,0,0.07)';
  for (var r = 1; r < rows; r++) g.fillRect(0, r * rh - 1, 256, 2);
  for (r = 0; r < rows; r++) for (var cc = 0; cc < cols; cc++) {
    var x = cc * cw + cw * 0.22, y = r * rh + rh * 0.18, ww = cw * 0.56, hh = rh * 0.6;
    if (withDoor && r === rows - 1 && cc === (cols >> 1)) {
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x - 3, y - 3, ww + 6, rh * 0.82);
      g.fillStyle = '#4a3220'; g.fillRect(x, y, ww, rh * 0.82 - 4);
      // warm entrance light spilling over the doorway (outdoor lighting)
      var dg = ge.createLinearGradient(0, y - 6, 0, y + rh * 0.82);
      dg.addColorStop(0, '#ffdd90'); dg.addColorStop(1, '#7a5620');
      ge.fillStyle = dg; ge.fillRect(x - 4, y - 6, ww + 8, rh * 0.82);
      continue;
    }
    g.fillStyle = '#ddd6c4'; g.fillRect(x - 2.5, y - 2.5, ww + 5, hh + 5);
    var lit = Math.random() < 0.1;
    var gr = g.createLinearGradient(0, y, 0, y + hh);
    if (lit) { gr.addColorStop(0, '#ffe9b0'); gr.addColorStop(1, '#cf9d48'); }
    else { gr.addColorStop(0, '#a9c6da'); gr.addColorStop(0.5, '#63809a'); gr.addColorStop(1, '#3c4c5e'); }
    g.fillStyle = gr; g.fillRect(x, y, ww, hh);
    if (!lit) { g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x + ww * 0.18, y + hh); g.lineTo(x + ww * 0.62, y); g.stroke(); }
    g.fillStyle = 'rgba(35,40,46,0.85)'; g.fillRect(x + ww / 2 - 1, y, 2, hh); g.fillRect(x, y + hh / 2 - 1, ww, 2);
    // ~38% of windows are lit warm at night; the rest a faint cool (dark room)
    if (Math.random() < 0.38) { var eg = ge.createLinearGradient(0, y, 0, y + hh); eg.addColorStop(0, '#fff0c6'); eg.addColorStop(1, '#e2b465'); ge.fillStyle = eg; }
    else ge.fillStyle = '#16283e';
    ge.fillRect(x, y, ww, hh);
  }
  var t = finishTex(new THREE.CanvasTexture(c));
  t.userData = { emis: finishTex(new THREE.CanvasTexture(ce)) };
  facadeCache[key] = t; return t;
}
function storefrontTex(base) {
  var c = document.createElement('canvas'); c.width = c.height = 256;
  var g = c.getContext('2d');
  stucco(g, 256, base);
  var y0 = 96;
  g.fillStyle = '#3c4c5e'; g.fillRect(12, y0, 232, 256 - y0 - 10);
  for (var i = 0; i < 5; i++) {
    var x = 16 + i * 46;
    var gr = g.createLinearGradient(0, y0, 0, 248);
    gr.addColorStop(0, '#b8d2e2'); gr.addColorStop(0.4, '#6d8aa2'); gr.addColorStop(1, '#2e3d4c');
    g.fillStyle = gr; g.fillRect(x, y0 + 6, 38, 256 - y0 - 24);
    if (Math.random() < 0.5) {
      var ig = g.createRadialGradient(x + 19, 190, 4, x + 19, 190, 26);
      ig.addColorStop(0, 'rgba(255,220,150,0.5)'); ig.addColorStop(1, 'rgba(255,220,150,0)');
      g.fillStyle = ig; g.fillRect(x, y0 + 6, 38, 256 - y0 - 24);
    }
  }
  g.fillStyle = '#26303a'; g.fillRect(112, y0 + 6, 40, 256 - y0 - 18);
  g.strokeStyle = '#c8c2b0'; g.lineWidth = 3; g.strokeRect(112, y0 + 6, 40, 256 - y0 - 18);
  return finishTex(new THREE.CanvasTexture(c));
}
function signTex(lines, bg, fg, w, h) {
  var c = document.createElement('canvas'); c.width = w || 512; c.height = h || 112;
  var g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  noise(g, c.width, 150, 0.06, 0.04);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(5, 5, c.width - 10, c.height - 10);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  var n = lines.length;
  for (var i = 0; i < n; i++) {
    var fs = Math.floor(c.height / (n + 0.5));
    g.font = 'bold ' + fs + 'px Georgia, serif';
    while (fs > 10 && g.measureText(lines[i]).width > c.width * 0.9) { fs -= 2; g.font = 'bold ' + fs + 'px Georgia, serif'; }
    g.fillText(lines[i], c.width / 2, c.height * (i + 0.55) / n);
  }
  var t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = MAXANISO;
  return t;
}

// cloth + gun textures (viewmodels / people)
var clothCache = {};
function clothTex(col) {
  if (clothCache[col]) return clothCache[col];
  var t = tex(64, function (g, s) {
    g.fillStyle = col; g.fillRect(0, 0, s, s);
    noise(g, s, 260, 0.1, 0.05);
  });
  clothCache[col] = t; return t;
}
var gunmetalT = tex(64, function (g, s) {
  g.fillStyle = '#24262b'; g.fillRect(0, 0, s, s);
  for (var i = 0; i < 40; i++) { g.strokeStyle = 'rgba(255,255,255,' + Math.random() * 0.07 + ')'; var y = Math.random() * s; g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
});
var woodT = tex(64, function (g, s) {
  g.fillStyle = '#6b4527'; g.fillRect(0, 0, s, s);
  for (var i = 0; i < 9; i++) { g.strokeStyle = 'rgba(40,22,8,' + (0.2 + Math.random() * 0.3) + ')'; g.lineWidth = 1 + Math.random() * 2; var y = Math.random() * s; g.beginPath(); g.moveTo(0, y); for (var x = 0; x <= s; x += 16) g.lineTo(x, y + Math.sin(x * 0.2 + i) * 3); g.stroke(); }
});
var gripT = tex(32, function (g, s) {
  g.fillStyle = '#1c1c20'; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  for (var i = -s; i < s * 2; i += 5) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + s, s); g.stroke(); g.beginPath(); g.moveTo(i + s, 0); g.lineTo(i, s); g.stroke(); }
});

// ---------------- materials / geo helpers ----------------
function lamb(opt) { return new THREE.MeshLambertMaterial(opt); }
// give a textured building material a NIGHT self-glow: its own map doubles as an
// emissiveMap so windows (bright in the texture) read as lit at night. No new
// lights/objects — emissiveIntensity is toggled from the day factor in updateEnv.
var nightEmis = [];
function nightLit(mat, warm) {
  if (mat && mat.map) {
    var em = mat.map.userData && mat.map.userData.emis;   // windows-only map (facades) vs whole texture (storefront/houses)
    mat.emissive = new THREE.Color(em ? 0xffffff : (warm || 0xffe6b0));
    mat.emissiveMap = em || mat.map;
    mat.emissiveIntensity = 0;
    mat.userData = mat.userData || {};
    mat.userData.emisBase = em ? 0.95 : 0.22;   // windows-only can burn bright; whole-texture stays a subtle wash
    mat.needsUpdate = true; nightEmis.push(mat);
  }
  return mat;
}
function lamb2(map) { return new THREE.MeshLambertMaterial({ map: map }); }
function phong(opt) { return new THREE.MeshPhongMaterial(opt); }
function box(w, h, d, mat, x, y, z) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x || 0, y || 0, z || 0); return m; }
function cyl(r1, r2, h, seg, mat, x, y, z) { var m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat); m.position.set(x || 0, y || 0, z || 0); return m; }
function sph(r, mat, x, y, z, ws, hs) { var m = new THREE.Mesh(new THREE.SphereGeometry(r, ws || 10, hs || 8), mat); m.position.set(x || 0, y || 0, z || 0); return m; }

var shadowGeo = new THREE.CircleGeometry(1, 14); shadowGeo.rotateX(-Math.PI / 2);
var shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false });
function blobShadow(sx, sz, y) { var m = new THREE.Mesh(shadowGeo, shadowMat); m.scale.set(sx, 1, sz); m.position.y = y || 0.03; return m; }

// ---------------- venue depth: real-material textures (v1.51 venue upgrade) ----
// geo_ref reality: banks = red brick; plaza + strips = tan stucco with terracotta
// pilasters + green metal accents; Starbucks = sage clapboard; BoA/Starbucks hips
// are gray standing-seam metal. Procedural, offline, low-res per user preference.
function brickTex(base, mortar) {
  return tex(128, function (g, s) {
    g.fillStyle = mortar || '#cabfa8'; g.fillRect(0, 0, s, s);
    var bh = 13, bw = 26;
    for (var r = 0, y = 0; y < s; y += bh, r++) {
      var off = (r % 2) * bw / 2;
      for (var x = -bw; x < s; x += bw) {
        var c = new THREE.Color(base).multiplyScalar(0.82 + Math.random() * 0.32);
        g.fillStyle = '#' + c.getHexString();
        g.fillRect(x + off + 1.5, y + 1.5, bw - 3, bh - 3);
      }
    }
    noise(g, s, 220, 0.07, 0.05);
  }, 3, 3);
}
function stuccoTex(base) {
  return tex(128, function (g, s) {
    g.fillStyle = base; g.fillRect(0, 0, s, s); noise(g, s, 900, 0.05, 0.05);
    g.strokeStyle = 'rgba(0,0,0,0.035)'; g.lineWidth = 1;
    for (var i = 0; i < 34; i++) { var y = Math.random() * s; g.beginPath(); g.moveTo(0, y); g.lineTo(s, y + (Math.random() - 0.5) * 7); g.stroke(); }
  }, 2, 2);
}
function seamMetalTex(base) {
  return tex(128, function (g, s) {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    for (var x = 0; x < s; x += 14) { g.fillStyle = 'rgba(255,255,255,0.11)'; g.fillRect(x, 0, 2, s); g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x + 11, 0, 2, s); }
    noise(g, s, 110, 0.05, 0.04);
  }, 3, 3);
}
function clapboardTex(base) {
  return tex(128, function (g, s) {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    var rows = 10, rh = s / rows;
    for (var r = 0; r < rows; r++) {
      var y = r * rh, gr = g.createLinearGradient(0, y, 0, y + rh);
      gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.85, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.22)');
      g.fillStyle = gr; g.fillRect(0, y, s, rh);
    }
    noise(g, s, 180, 0.04, 0.04);
  }, 2, 3);
}
// storefront glass with a dark mullion grid + reflection streaks
var bayGlassT = tex(128, function (g, s) {
  var gr = g.createLinearGradient(0, 0, 0, s);
  gr.addColorStop(0, '#a4c3d6'); gr.addColorStop(0.45, '#5f7f97'); gr.addColorStop(1, '#2b3b49');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 3;
  for (var i = -s; i < s; i += 38) { g.beginPath(); g.moveTo(i, s); g.lineTo(i + s * 0.5, 0); g.stroke(); }
  g.fillStyle = '#20262c';
  for (var x = 0; x <= s; x += s / 3) g.fillRect(x - 2, 0, 4, s);
  g.fillRect(0, s * 0.5 - 2, s, 4); g.fillRect(0, 0, s, 6); g.fillRect(0, s - 6, s, 6);
});
// shared venue materials (defined here so load-time builders can use them)
var brickBankM = lamb2(brickTex('#9c5540', '#d7ccb4'));    // red brick banks
var brickBaseM = lamb2(brickTex('#7d4632', '#b7a888'));    // darker pier/base brick
var stuccoTanM = lamb2(stuccoTex('#e2d4b6'));              // plaza / strip tan stucco
var stuccoBeigeM = lamb2(stuccoTex('#e9e2d0'));            // Publix beige
var terracottaM = lamb2(stuccoTex('#b56a3d'));             // terracotta pilaster
var greenMetalM = lamb2(seamMetalTex('#3c6b48'));          // green metal awning/accent
var grayHipM = lamb2(seamMetalTex('#9a9ea1'));             // gray standing-seam metal roof
var clapSageM = lamb2(clapboardTex('#a7ad92'));            // Starbucks sage clapboard
var bayGlassM = lamb2(bayGlassT);                          // storefront glass
var venCapM = lamb({ color: 0xcfc7b4 });                  // parapet capstone
var venAcM = lamb({ color: 0x9a9a94 });                   // rooftop AC

// ---- venue depth primitives (builder-local, all FLAT single-material meshes so
// placeVenueData can merge them by material for perf; front faces +z, dir=+1/-1
// selects which wall the feature sits on). No painted-window doubling: builders
// that add vWin/vBay skin the wall plain and let these boxes carry the detail. ----
// punched window: recessed dark glass + protruding trim ring
function vWin(x, y, wallZ, dir, w, h, trimM, glassM) {
  var fr = box(w + 0.34, h + 0.34, 0.12, trimM); fr.position.set(x, y, wallZ + dir * 0.06); scene.add(fr);
  var gl = box(w, h, 0.16, glassM || bayGlassM); gl.position.set(x, y, wallZ - dir * 0.05); scene.add(gl);
}
// NOTE: Object3D.add() returns the PARENT — never chain .position onto scene.add().
// storefront glass bay: solid bulkhead + recessed mullion glass + header + sill
function vBay(x, y0, wallZ, dir, w, h, trimM, glassM) {
  var bulk = 0.55, gh = h - bulk - 0.25;
  scene.add(box(w, gh, 0.16, glassM || bayGlassM, x, y0 + bulk + gh / 2, wallZ - dir * 0.05));
  scene.add(box(w + 0.2, bulk, 0.2, trimM, x, y0 + bulk / 2, wallZ + dir * 0.05));
  scene.add(box(w + 0.3, 0.34, 0.24, trimM, x, y0 + h - 0.02, wallZ + dir * 0.07));
  scene.add(box(w + 0.3, 0.12, 0.3, trimM, x, y0 + bulk, wallZ + dir * 0.13));
}
// pilaster/pier protruding from a wall, optional brick base block
function vPier(x, wallZ, dir, w, h, out, mat, baseM) {
  scene.add(box(w, h, out, mat, x, h / 2 + 0.05, wallZ + dir * out / 2));
  if (baseM) scene.add(box(w + 0.22, 1.5, out + 0.14, baseM, x, 0.8, wallZ + dir * (out + 0.07) / 2));
}
// flat entrance canopy (slab + fascia) on two round posts
function vCanopy(x, wallZ, dir, w, out, y, mat, postM) {
  scene.add(box(w, 0.35, out, mat, x, y, wallZ + dir * out / 2));
  scene.add(box(w, 0.55, 0.22, mat, x, y - 0.12, wallZ + dir * out));
  for (var i = -1; i <= 1; i += 2) scene.add(cyl(0.13, 0.13, y, 6, postM || mat, x + i * (w / 2 - 0.45), y / 2, wallZ + dir * (out - 0.3)));
}
// parapet capstone band on a flat roof
function vParapet(cx, cz, w, d, topY, mat) {
  scene.add(box(w + 0.6, 0.7, d + 0.6, mat || venCapM, cx, topY + 0.35, cz));
}
// rooftop AC unit on a curb
function vAC(x, cz, topY, mat) {
  scene.add(box(2.4, 0.22, 1.8, venCapM, x, topY + 0.11, cz));
  scene.add(box(2.1, 0.9, 1.5, mat || venAcM, x, topY + 0.57, cz));
}
// eave soffit + fascia band for a hip/pitched roof
function vEave(cx, cz, w, d, y, mat) {
  scene.add(box(w + 1.0, 0.18, d + 1.0, mat || venCapM, cx, y, cz));
}

var colliders = [], solidMeshes = [];
var landColliders = null;   // colliders minus the lake block — the player may wade in
// returns the pushed collider object so callers (breakable props) can toggle
// `.active` off/on when the prop topples/respawns — pushOut skips inactive
// entries in place, so the reference stays valid inside landColliders too.
function addCollider(cx, cz, w, d) { var o = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 }; colliders.push(o); return o; }
// oriented-bounding-box collider (remap roadside furniture, rotated venue
// footprints in R3/R4). Carries its world-space AABB bounds too, so every
// legacy reader that iterates colliders (berserk cars, parked-slot rejection,
// spawn checks) keeps working — conservatively — without changes; only
// pushOut resolves the exact OBB. yaw follows THREE rotation.y convention.
function addColliderOBB(cx, cz, hw, hd, yaw) {
  var c = Math.cos(yaw), s = Math.sin(yaw);
  var bx = hw * Math.abs(c) + hd * Math.abs(s), bz = hw * Math.abs(s) + hd * Math.abs(c);
  var o = { obb: 1, x: cx, z: cz, hx: hw, hz: hd, c: c, s: s, x0: cx - bx, x1: cx + bx, z0: cz - bz, z1: cz + bz };
  colliders.push(o);
  return o;
}

var hipGeo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4); hipGeo.rotateY(Math.PI / 4);

// ---------------- sky ----------------
var skyDome = null;
(function sky() {
  var c = document.createElement('canvas'); c.width = 256; c.height = 256;
  var g = c.getContext('2d');
  var gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#3f8ad8'); gr.addColorStop(0.45, '#8ec6ea'); gr.addColorStop(0.75, '#d5e9f2'); gr.addColorStop(1, '#e2ecf0');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  for (var i = 0; i < 10; i++) {
    var cx0 = Math.random() * 256, y = 60 + Math.random() * 90, r = 14 + Math.random() * 26;
    // draw wrapped copies so no cloud gets clipped at the U seam of the dome
    for (var w = -1; w <= 1; w++) {
      var x = cx0 + w * 256;
      if (x + r * 2.2 < 0 || x - r * 2.2 > 256) continue;
      var cg = g.createRadialGradient(x, y, 2, x, y, r);
      cg.addColorStop(0, 'rgba(255,255,255,0.85)'); cg.addColorStop(0.6, 'rgba(255,255,255,0.4)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = cg; g.save(); g.translate(x, y); g.scale(2.2, 1); g.translate(-x, -y);
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.restore();
    }
  }
  var t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  skyDome = new THREE.Mesh(new THREE.SphereGeometry(520, 20, 12), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false }));
  scene.add(skyDome);
})();

// ---------------- ground / roads / parking ----------------
(function ground() {
  // circular hole under the lake — the flat grass otherwise sits between
  // the water surface and the sunken bed and blocks the see-through water
  var E = (TOTAL + 60) / 2;
  var s = new THREE.Shape();
  s.moveTo(-E, -E); s.lineTo(E, -E); s.lineTo(E, E); s.lineTo(-E, E); s.closePath();
  var hole = new THREE.Path();
  // the lake is elliptical (bed/water scaled 1.25 x / 0.85 z) — match it,
  // slightly inset so the bed rim always covers the cut edge
  hole.absellipse(LAKE.x, -LAKE.z, LAKE.r * 1.25 * 0.97, LAKE.r * 0.85 * 0.97, 0, Math.PI * 2, true, 0);
  s.holes.push(hole);
  var geo = new THREE.ShapeGeometry(s, 24);
  // ShapeGeometry UVs are in shape units — normalize to the plane's 0..1
  var uv = geo.attributes.uv;
  for (var i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / (E * 2) + 0.5, uv.getY(i) / (E * 2) + 0.5);
  geo.rotateX(-Math.PI / 2);
  // push the huge base plane very slightly back in depth so the many overlaid
  // ground layers (road 0.05 / lots 0.10 / sidewalks 0.12 / pads 0.16) always
  // win the depth test — kills any distance-dependent coplanar z-fighting on
  // real GPUs regardless of the small (5cm) vertical separations above it.
  var gmat = lamb2(grassT);
  gmat.polygonOffset = true; gmat.polygonOffsetFactor = 1; gmat.polygonOffsetUnits = 1;
  scene.add(new THREE.Mesh(geo, gmat));
})();

function roadStrip(cx, cz, w, d, vertical) {
  // long axis always on u, then rotate the GEOMETRY for the cross road —
  // rotating the UV transform lands the repeat across the road and paints
  // a pinstripe carpet of lane lines
  var L = Math.max(w, d), W2 = Math.min(w, d);
  var geo = new THREE.PlaneGeometry(L, W2); geo.rotateX(-Math.PI / 2);
  if (vertical) geo.rotateY(Math.PI / 2);
  var m = lamb({ map: roadT.clone() });
  m.map.repeat.set(L / 16, 1);
  m.map.needsUpdate = true;
  var mesh = new THREE.Mesh(geo, m);
  mesh.position.set(cx, 0.05, cz);
  scene.add(mesh);
}
function sidewalk(cx, cz, w, d, raise) {
  // raise nudges y so overlapping strips at corners don't z-fight
  var geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2);
  var m = lamb({ map: walkT.clone() }); m.map.repeat.set(w / 8, d / 8); m.map.needsUpdate = true;
  var mesh = new THREE.Mesh(geo, m); mesh.position.set(cx, raise ? 0.125 : 0.12, cz); scene.add(mesh);
}
function parkingLot(cx, cz, w, d) {
  var geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2);
  var m = lamb({ map: parkingT.clone() }); m.map.repeat.set(w / 22, d / 22); m.map.needsUpdate = true;
  var mesh = new THREE.Mesh(geo, m); mesh.position.set(cx, 0.1, cz); scene.add(mesh);
  mapParking.push({ x: cx, z: cz, w: w, d: d });
}
function pavePad(cx, cz, w, d) {
  var geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2);
  var m = lamb({ map: concreteT.clone() }); m.map.repeat.set(Math.max(1, w / 6), Math.max(1, d / 6)); m.map.needsUpdate = true;
  var mesh = new THREE.Mesh(geo, m); mesh.position.set(cx, 0.13, cz); scene.add(mesh);
  mapPave.push({ x: cx, z: cz, w: w, d: d });
}
function drive(cx, cz, w, d) {
  var geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2);
  var m = lamb({ map: driveT.clone() }); m.map.repeat.set(Math.max(1, w / 10), Math.max(1, d / 10)); m.map.needsUpdate = true;
  var mesh = new THREE.Mesh(geo, m); mesh.position.set(cx, 0.14, cz); scene.add(mesh);
  mapDrives.push({ x: cx, z: cz, w: w, d: d });
}

// main + cross roads with flanking sidewalks (strips beside the asphalt,
// not under it — the old full-width slab hid the road texture entirely).
// Expansion: the straight asphalt continues WEST (Race Track Rd) and NORTH
// (Nine Eagles Dr) to the new edge; eastward/southward it stops at x/z=CORE
// where the EXP_ROADS arterial bends (NE / SE) take over.
var MAIN_SPAN = HALF + CORE, MAIN_CTR = (CORE - HALF) / 2;
if (!WC_REMAP) {
  roadStrip(MAIN_CTR, 0, MAIN_SPAN, MAIN_HW * 2, false);
  roadStrip(0, MAIN_CTR, CROSS_HW * 2, MAIN_SPAN, true);
  sidewalk(MAIN_CTR, -(MAIN_HW + 2.5), MAIN_SPAN, 5);
  sidewalk(MAIN_CTR, MAIN_HW + 2.5, MAIN_SPAN, 5);
  sidewalk(-(CROSS_HW + 2.5), MAIN_CTR, 5, MAIN_SPAN, true);
  sidewalk(CROSS_HW + 2.5, MAIN_CTR, 5, MAIN_SPAN, true);
}
// (WC_REMAP: the core legs render as true-geometry ribbons with everything
// else — see buildRemapWorld in the remap-engine section)

// crosswalks at the intersection
var zebraT = (function () {
  var c = document.createElement('canvas'); c.width = c.height = 64;
  var g = c.getContext('2d'); g.clearRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(225,225,220,0.92)';
  for (var x = 2; x < 64; x += 16) g.fillRect(x, 2, 9, 60);
  var t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
})();
(function crosswalks() {
  if (WC_REMAP) return;   // axis crosswalks die with the axis roads (Y-junction furniture = R3)
  // pads sit ABOVE the sidewalk strips (0.125) — at 0.13 they z-fought and
  // shimmered; spans now match the road they cross instead of poking past it
  var za = new THREE.PlaneGeometry(CROSS_HW * 2 - 2, 3); za.rotateX(-Math.PI / 2);   // across the N-S road
  var zb = new THREE.PlaneGeometry(3, MAIN_HW * 2 - 2); zb.rotateX(-Math.PI / 2);   // across the E-W road
  var ma = new THREE.MeshBasicMaterial({ map: zebraT, transparent: true, depthWrite: false });
  var za1 = new THREE.Mesh(za, ma); za1.position.set(0, 0.165, -MAIN_HW - 2.5); scene.add(za1);
  var za2 = new THREE.Mesh(za, ma); za2.position.set(0, 0.165, MAIN_HW + 2.5); scene.add(za2);
  var zb1 = new THREE.Mesh(zb, ma); zb1.position.set(-CROSS_HW - 2.5, 0.165, 0); scene.add(zb1);
  var zb2 = new THREE.Mesh(zb, ma); zb2.position.set(CROSS_HW + 2.5, 0.165, 0); scene.add(zb2);
})();

// ---------------- signs & generic buildings ----------------
function signPlane(x, y, z, ry, w, h, lines, bg, fg) {
  var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: signTex(lines, bg, fg), side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m;
}
function parapetM(color) { return lamb({ color: new THREE.Color(color).multiplyScalar(0.85) }); }

function bldg(x, z, w, d, h, color, o) {
  o = o || {};
  var fac = nightLit(lamb({ map: facadeTex(color, Math.max(w, d), h, o.door !== false) }));
  var topM = o.hip ? fac : flatRoofM;
  var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [fac, fac, topM, topM, fac, fac]);
  b.position.set(x, h / 2 + 0.1, z);
  scene.add(b); solidMeshes.push(b); addCollider(x, z, w, d);
  if (o.hip) {
    var rt = roofTileT.clone(); rt.repeat.set(Math.max(2, w / 8), 2); rt.needsUpdate = true;
    var roof = new THREE.Mesh(hipGeo, lamb2(rt));
    var rh = o.roofH || 2.6; roof.scale.set(w + 2, rh, d + 2); roof.position.set(x, h + 0.1 + rh / 2, z);
    scene.add(roof);
  } else {
    scene.add(box(w + 0.5, 0.5, d + 0.5, parapetM(color), x, h + 0.35, z));
    if (o.ac !== false && w > 16) scene.add(box(2, 1, 1.6, lamb({ color: 0x9a9a94 }), x + (Math.random() - 0.5) * w * 0.4, h + 1, z + (Math.random() - 0.5) * d * 0.4));
  }
  mapBuildings.push({ x: x, z: z, w: w, d: d, h: h, c: o.mmColor || color, pad: o.pad !== false });
  return b;
}
// storefront-fronted shop (front faces +z toward road unless o.face given)
function shop(x, z, w, d, h, color, lines, bg, fg, o) {
  o = o || {};
  var face = o.face || 1; // 1 => front at +z, -1 => front at -z
  var fac = nightLit(lamb({ map: facadeTex(color, Math.max(w, d), h, false) }));
  var front = nightLit(lamb({ map: storefrontTex(color) }), 0xfff0c8);
  var side = fac;
  var px = face === 1 ? side : side, nx = side;
  var pz = face === 1 ? front : fac, nz = face === 1 ? fac : front;
  var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, flatRoofM, flatRoofM, pz, nz]);
  b.position.set(x, h / 2 + 0.1, z);
  scene.add(b); solidMeshes.push(b); addCollider(x, z, w, d);
  scene.add(box(w + 0.5, 0.5, d + 0.5, parapetM(color), x, h + 0.35, z));
  if (lines) {
    var sz = z + face * (d / 2 + 0.06);
    signPlane(x, h - 0.6, sz, face === 1 ? 0 : Math.PI, Math.min(w - 2, 12), 1.5, lines, bg, fg);
    // striped awning
    var awn = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 1, 13), 1.5), lamb({ map: awningTex(bg, '#e8e2d0'), side: THREE.DoubleSide }));
    awn.rotation.x = face === 1 ? -0.6 : 0.6;
    awn.position.set(x, h * 0.55, z + face * (d / 2 + 0.7));
    scene.add(awn);
  }
  mapBuildings.push({ x: x, z: z, w: w, d: d, h: h, c: o.mmColor || fg || color, pad: o.pad !== false });
  return b;
}
var awnCache = {};
function awningTex(c1, c2) {
  var k = c1 + c2; if (awnCache[k]) return awnCache[k];
  var t = tex(64, function (g, s) {
    for (var x = 0; x < s; x += 16) { g.fillStyle = c1; g.fillRect(x, 0, 8, s); g.fillStyle = c2; g.fillRect(x + 8, 0, 8, s); }
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, s - 10, s, 10);
  }, 4, 1);
  awnCache[k] = t; return t;
}

// gable-roofed strip mall with blue metal roof
// tan-stucco strip mall (geo_ref: no blue roofs — flat parapet, terracotta piers,
// green awnings, real storefront glass bays). Storefront faces -z.
function stripMall(x, z, w, names) {
  var d = 20, h = 5, dir = -1, fz = z + dir * d / 2;
  var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [stuccoTanM, stuccoTanM, flatRoofM, flatRoofM, stuccoTanM, stuccoTanM]);
  b.position.set(x, h / 2 + 0.1, z); scene.add(b); solidMeshes.push(b); addCollider(x, z, w, d);
  mapBuildings.push({ x: x, z: z, w: w, d: d, h: h, c: '#c9c3b4', pad: true });
  vParapet(x, z, w, d, h + 0.1, venCapM);
  var n = names.length, seg = w / n;
  for (var i = 0; i <= n; i++) vPier(x - w / 2 + i * seg, fz, dir, 1.1, h - 0.1, 0.45, terracottaM, brickBaseM);
  for (i = 0; i < n; i++) {
    var sx = x - w / 2 + seg * (i + 0.5);
    vBay(sx, 0.2, fz, dir, seg - 2.6, h - 1.2, venCapM, bayGlassM);
    var awn = new THREE.Mesh(new THREE.PlaneGeometry(seg - 1.8, 1.4), lamb({ map: awningTex('#3c6b48', '#e8e2d0'), side: THREE.DoubleSide }));
    awn.rotation.x = dir === 1 ? -0.6 : 0.6; awn.position.set(sx, h - 0.85, fz + dir * 1.05); scene.add(awn);
    signPlane(sx, h - 0.4, fz + dir * 0.16, dir === 1 ? 0 : Math.PI, seg - 2.2, 1.0, [names[i]], '#22303a', '#ffe9a0');
  }
  for (i = 0; i < n; i++) vAC(x - w / 2 + seg * (i + 0.5), z + 3, h + 0.1, venAcM);
}

// ---------------- specific landmarks ----------------
function gasStation(x, z) {
  // convenience store (robbable), front faces north (-z) toward the road
  shop(x + 6, z, 16, 13, 5, '#e8e4da', ['RACETRAC'], '#c0392b', '#ffd94a', { face: -1, mmColor: '#e05a3a' });
  // fuel canopy toward road/west
  var cw = 20, cd = 13, cy = 5.6;
  scene.add(box(cw, 0.7, cd, lamb({ color: 0xe8e2d0 }), x - 8, cy, z));
  scene.add(box(cw, 0.5, 0.6, lamb({ color: 0xc0392b }), x - 8, cy - 0.55, z - cd / 2));
  scene.add(box(cw, 0.5, 0.6, lamb({ color: 0xc0392b }), x - 8, cy - 0.55, z + cd / 2));
  var poleM = lamb({ color: 0xb8b2a4 });
  [[x - 16, z - 4], [x, z - 4], [x - 16, z + 4], [x, z + 4]].forEach(function (p) { scene.add(cyl(0.25, 0.25, cy, 8, poleM, p[0], cy / 2, p[1])); });
  // pump islands
  [[x - 12, z], [x - 4, z]].forEach(function (p) {
    scene.add(box(3.2, 0.3, 1.4, lamb({ color: 0x555b60 }), p[0], 0.25, p[1]));
    scene.add(box(0.9, 1.3, 0.9, lamb({ color: 0xcc3b2b }), p[0] - 0.7, 0.95, p[1]));
    scene.add(box(0.9, 1.3, 0.9, lamb({ color: 0xcc3b2b }), p[0] + 0.7, 0.95, p[1]));
  });
  // tall price sign at road
  scene.add(cyl(0.2, 0.2, 6, 6, poleM, x - 17, 3, z + 5));
  signPlane(x - 17, 6.4, z + 5, 0, 3.2, 2, ['GAS', '$3.29'], '#12508f', '#ffd94a');
}

function storage(x, z) {
  for (var r = 0; r < 3; r++) {
    var rz = z - 14 + r * 14;
    var b = box(46, 4, 8, storageDoorM, x, 2.1, rz);
    scene.add(b); solidMeshes.push(b); addCollider(x, rz, 46, 8);
    scene.add(box(47, 1.6, 9, lamb({ color: 0x8a8478 }), x, 4.6, rz));
    if (r === 0) mapBuildings.push({ x: x, z: z, w: 46, d: 40, h: 4.5, c: '#c9662a', pad: true });
  }
  signPlane(x, 3, z - 18.4, 0, 12, 1.6, ['SELF STORAGE'], '#243b5a', '#ffe9a0');
}

// Publix anchor (geo_ref sv_aldi_front): beige stucco, terracotta pilasters w/
// brick bases, GREEN metal awning band, arched entry portal, storefront glass.
function supermarket(x, z) {
  var w = 74, d = 44, h = 9, fz = z + d / 2;
  var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [stuccoBeigeM, stuccoBeigeM, flatRoofM, flatRoofM, stuccoBeigeM, stuccoBeigeM]);
  b.position.set(x, h / 2 + 0.1, z); scene.add(b); solidMeshes.push(b); addCollider(x, z, w, d);
  mapBuildings.push({ x: x, z: z, w: w, d: d, h: h, c: '#3f8a4a', pad: true });
  vParapet(x, z, w, d, h + 0.1, venCapM);
  // green metal awning band across the storefront (the ALDI/Publix green line)
  scene.add(box(w + 0.2, 1.1, 0.5, greenMetalM, x, h - 0.4, fz + 0.25));
  var bays = 6, seg = w / bays, EHW = 8;
  for (var i = 0; i <= bays; i++) {
    var px = x - w / 2 + i * seg;
    if (Math.abs(px - x) < EHW - 1) continue;
    vPier(px, fz, 1, 1.5, h - 0.2, 0.55, terracottaM, brickBaseM);
  }
  for (i = 0; i < bays; i++) {
    var bx = x - w / 2 + seg * (i + 0.5);
    if (Math.abs(bx - x) < EHW) continue;
    vBay(bx, 0.2, fz, 1, seg - 2.6, 5.4, venCapM, bayGlassM);
  }
  // arched entry portal: green metal canopy over glass entry doors
  vCanopy(x, fz, 1, 2 * EHW - 1, 4.2, 4.4, greenMetalM, terracottaM);
  vBay(x, 0.2, fz, 1, 2 * EHW - 3, 4.9, venCapM, bayGlassM);
  signPlane(x, h + 0.4, fz + 0.35, 0, 30, 2.4, ['PUBLIX'], '#1c7e3a', '#ffffff');
  for (i = -1; i <= 1; i++) vAC(x + i * 22, z - 6, h + 0.1, venAcM);
  parkingLot(x, z + 44, 78, 40);
  for (i = -1; i <= 1; i++) scene.add(cyl(0.2, 0.2, 7, 6, lamb({ color: 0x555 }), x + i * 26, 3.5, z + 44));
}

function school(x, z) {
  bldg(x, z, 82, 32, 8, '#e4d8c0', { flat: true, door: false, mmColor: '#c8a24a' });
  signPlane(x, 6.6, z + 16.1, 0, 26, 2.4, ['FARNELL', 'MIDDLE SCHOOL'], '#2c3e70', '#ffe9a0');
  // running track + field to the north
  var track = new THREE.Mesh(new THREE.CircleGeometry(24, 28), lamb({ color: 0xb05a3a }));
  track.rotation.x = -Math.PI / 2; track.scale.set(1.4, 1, 1); track.position.set(x, 0.14, z - 34); scene.add(track);
  var field = new THREE.Mesh(new THREE.CircleGeometry(20, 24), lamb({ color: 0x3f8a3f }));
  field.rotation.x = -Math.PI / 2; field.scale.set(1.4, 1, 1); field.position.set(x, 0.16, z - 34); scene.add(field);
  parkingLot(x + 54, z, 24, 44);
}

function bankBldg(x, z, name) {
  bldg(x, z, 26, 20, 7, '#eae3d2', { flat: true, door: false, mmColor: '#3f6f9c' });
  // columns portico facing road
  var pm = lamb({ color: 0xf2ecdd });
  for (var i = -1; i <= 1; i++) scene.add(cyl(0.5, 0.5, 5.5, 10, pm, x + i * 8, 2.85, z + 10.5));
  scene.add(box(24, 0.8, 3, pm, x, 5.9, z + 10.5));
  signPlane(x, 5, z + 10.1, 0, 16, 1.6, [name], '#123a6a', '#ffe9a0');
}

function townhouseRow(x, z, units, ry) {
  ry = ry || 0;
  var g = new THREE.Group();
  var uw = 8;
  for (var i = 0; i < units; i++) {
    var ux = -uw * units / 2 + uw * (i + 0.5);
    var col = PASTELS[(i * 3) % PASTELS.length];
    var fac = nightLit(lamb({ map: facadeTex(col, uw, 7, false) }));
    var b = new THREE.Mesh(new THREE.BoxGeometry(uw - 0.2, 7, 10), [fac, fac, flatRoofM, flatRoofM, fac, fac]);
    b.position.set(ux, 3.6, 0); g.add(b);
    var rt = roofTileT.clone(); rt.repeat.set(2, 2); rt.needsUpdate = true;
    var roof = new THREE.Mesh(hipGeo, lamb2(rt)); roof.scale.set(uw + 0.3, 2, 10.5); roof.position.set(ux, 8.1, 0); g.add(roof);
    g.add(box(uw * 0.55, 2, 0.15, lamb({ map: garageT }), ux, 1.1, 5.05));
  }
  g.position.set(x, 0.1, z); g.rotation.y = ry;
  scene.add(g);
  // collider (approx, axis-aligned)
  var W = uw * units, D = 10;
  if (ry === 0) addCollider(x, z, W, D); else addCollider(x, z, D, W);
  solidMeshes.push(g);
  mapBuildings.push({ x: x, z: z, w: ry === 0 ? W : D, d: ry === 0 ? D : W, h: 9, c: '#c7b48a', pad: false });
}

function house(x, z, col) {
  var w = 9 + Math.random() * 3, d = 8 + Math.random() * 3, h = 4.5 + Math.random() * 2.5;
  bldg(x, z, w, d, h, col || PASTELS[(Math.random() * PASTELS.length) | 0], { hip: true, door: false, roofH: 2.4, mmColor: '#d8c8a0', pad: false });
  scene.add(box(w * 0.4, 1.9, 0.12, lamb({ map: garageT }), x, 0.95, z + d / 2 + 0.06));
  // driveway
  var dv = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 5), lamb({ color: 0x9a958a })); dv.rotation.x = -Math.PI / 2;
  dv.position.set(x, 0.11, z + d / 2 + 3); scene.add(dv);
}

function subdivision(cx, cz, cols, rows, sx, sz) {
  // interior street
  roadStrip(cx, cz, sx * cols + 8, 6, false);
  for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
    var hx = cx - (cols - 1) * sx / 2 + c * sx;
    var side = r === 0 ? -1 : 1;
    var hz = cz + side * (5 + sz / 2);
    house(hx, hz);
    if (Math.random() < 0.5) oak(hx + (Math.random() - 0.5) * sx * 0.6, hz + side * (sz * 0.6));
  }
}

function redHouse(x, z) {
  // tallest structure: 5 stories, red tile roof
  bldg(x, z, 18, 18, 22, '#e7c9a0', { hip: true, door: false, roofH: 4.5, mmColor: '#c0392b', pad: false });
  // balconies
  for (var f = 1; f <= 4; f++) scene.add(box(19, 0.3, 19, lamb({ color: 0xcbbfa4 }), x, 0.1 + f * (22 / 5), z));
}

function coffeeShop(x, z) {
  shop(x, z, 15, 13, 5, '#e2d6bc', ['STARBUCKS'], '#0a5c3a', '#ffffff', { face: 1, mmColor: '#0a5c3a' });
}

// ---------------- breakable props (trees + street lights vs cars) ----------------
var breakables = [];
var Y_UP = new THREE.Vector3(0, 1, 0);
var packPropCache = {};
function getPackProp(name) {
  if (packPropCache[name]) return packPropCache[name];
  if (typeof MESHY_PROPS === 'undefined') return null;
  var e = null;
  for (var i = 0; i < MESHY_PROPS.length; i++) if (MESHY_PROPS[i].n === name) e = MESHY_PROPS[i];
  if (!e) return null;
  var qp = new Int16Array(b64Bytes(e.p).buffer), qu = new Uint16Array(b64Bytes(e.u).buffer);
  var fp = new Float32Array(qp.length), fu = new Float32Array(qu.length);
  for (i = 0; i < qp.length; i++) fp[i] = qp[i] / e.q;
  for (i = 0; i < qu.length; i += 2) { fu[i] = qu[i] / 8192; fu[i + 1] = 1 - qu[i + 1] / 8192; }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(fu, 2));
  geo.computeVertexNormals();
  var im = new Image();
  var tx = new THREE.Texture(im);
  tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false;
  im.onload = function () { tx.needsUpdate = true; };
  im.src = e.tex;
  var mat = lamb({ map: tx, alphaTest: 0.4, side: THREE.DoubleSide });
  var maxY = 0;
  for (i = 1; i < fp.length; i += 3) if (fp[i] > maxY) maxY = fp[i];
  packPropCache[name] = { geo: geo, mat: mat, h: maxY || 1 };
  return packPropCache[name];
}
var packPinkCache = {};
function getPackPropPink(name) {   // blossom recolor of a pack prop (crepe myrtle)
  if (packPinkCache[name]) return packPinkCache[name];
  var pp = getPackProp(name);
  if (!pp) return null;
  var e = null;
  for (var i = 0; i < MESHY_PROPS.length; i++) if (MESHY_PROPS[i].n === name) e = MESHY_PROPS[i];
  var cv = document.createElement('canvas');
  var tx = new THREE.CanvasTexture(cv);
  tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false;
  var im = new Image();
  im.onload = function () {
    cv.width = im.width; cv.height = im.height;
    var c2 = cv.getContext('2d'); c2.drawImage(im, 0, 0);
    var d = c2.getImageData(0, 0, cv.width, cv.height), px = d.data;
    for (var j = 0; j < px.length; j += 4) {
      var g = px[j + 1];
      if (g > px[j] * 0.9 && g > px[j + 2]) {   // leafy pixel -> blossom
        px[j] = Math.min(255, 130 + g * 0.85) | 0;
        px[j + 1] = 55 + g * 0.35 | 0;
        px[j + 2] = 95 + g * 0.45 | 0;
      }
    }
    c2.putImageData(d, 0, 0); tx.needsUpdate = true;
  };
  im.src = e.tex;
  packPinkCache[name] = { geo: pp.geo, mat: lamb({ map: tx, alphaTest: 0.4, side: THREE.DoubleSide }), h: pp.h };
  return packPinkCache[name];
}
// collR (optional): half-width of a small trunk/pole collider registered
// alongside the breakable's (much larger) car-snap radius `r` — solid to the
// player/NPCs/cops/cars, but toggled inactive while the prop is toppled
// (breakProp) and reactivated on respawn (updateWorldFx), so a felled tree
// doesn't leave a floating wall.
function registerBreakable(g, x, z, r, type, light, collR) {
  var col = collR ? addCollider(x, z, collR * 2, collR * 2) : null;
  breakables.push({
    g: g, x: x, z: z, r: r, type: type, light: light || null,
    broken: false, fallT: 0, respawnT: 0, fx: 1, fz: 0, thudded: false,
    yq: new THREE.Quaternion().setFromAxisAngle(Y_UP, g.rotation.y),
    col: col
  });
}

// ---------------- oak trees + forest ----------------
var oakTrunkM = lamb2(oakBarkT);
var leafMats = [lamb({ color: 0x3f6f2e }), lamb({ color: 0x4c8038 }), lamb({ color: 0x355f28 }), lamb({ color: 0x568a3e })];
var canopyGeo = new THREE.SphereGeometry(1, 8, 6);
// map expansion: the 600-half perimeter + survey forest patches need more
// trees than the old 240 budget (walls ~180 + core patches ~150 + ring ~320).
// Headroom raised to 1000: silently starving forestPatch() of trees leaves its
// impassable collider standing as an invisible wall (dense in-patch visuals
// come from the instanced expForestFill, which does not count against this).
var oakCount = 0, OAK_CAP = 1000;
function oak(x, z, scale) {
  if (oakCount >= OAK_CAP) return;
  oakCount++;
  scale = scale || (0.85 + Math.random() * 0.5);
  var pp = getPackProp(['oak1', 'oak2', 'oak3'][(Math.random() * 3) | 0]);
  if (pp) {
    var g2 = new THREE.Group();
    var tm = new THREE.Mesh(pp.geo, pp.mat);
    var ts = 8.5 * scale / pp.h;   // scale to oak height regardless of authoring units
    tm.scale.set(ts, ts, ts);
    g2.add(tm);
    g2.add(blobShadow(2 * scale, 2 * scale, 0.05));
    g2.position.set(x, 0, z); g2.rotation.y = Math.random() * Math.PI * 2;
    scene.add(g2);
    registerBreakable(g2, x, z, 1.0, 'tree', null, 0.4 * scale);
    return;
  }
  var g = new THREE.Group();
  var h = (4.5 + Math.random() * 2.5) * scale;
  g.add(cyl(0.28 * scale, 0.45 * scale, h, 7, oakTrunkM, 0, h / 2, 0));
  var lm = leafMats[(Math.random() * leafMats.length) | 0];
  var n = 4 + (Math.random() * 3 | 0);
  for (var i = 0; i < n; i++) {
    var r = (1.7 + Math.random() * 1.1) * scale;
    var a = i / n * Math.PI * 2;
    var cm = new THREE.Mesh(canopyGeo, lm);
    cm.scale.set(r, r * 0.82, r);
    cm.position.set(Math.cos(a) * r * 0.6, h + Math.random() * r * 0.6, Math.sin(a) * r * 0.6);
    g.add(cm);
  }
  g.add(new THREE.Mesh(canopyGeo, lm)).scale.set(2 * scale, 1.6 * scale, 2 * scale);
  g.children[g.children.length - 1].position.y = h + scale;
  g.add(blobShadow(2 * scale, 2 * scale, 0.05));
  g.position.set(x, 0, z); g.rotation.y = Math.random() * Math.PI;
  scene.add(g);
  registerBreakable(g, x, z, 1.0, 'tree', null, 0.4 * scale);
}

// palm (kept, less common)
var frondT = (function () {
  var c = document.createElement('canvas'); c.width = 128; c.height = 32;
  var g = c.getContext('2d'); g.clearRect(0, 0, 128, 32);
  for (var x = 2; x < 126; x += 5) {
    var t = x / 128, len = (13 - t * 9) * (0.75 + Math.random() * 0.4);
    g.strokeStyle = ['#3f8f3c', '#357f33', '#4c9f48'][(Math.random() * 3) | 0]; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, 16); g.lineTo(x + 5, 16 - len); g.stroke();
    g.beginPath(); g.moveTo(x, 16); g.lineTo(x + 5, 16 + len); g.stroke();
  }
  g.strokeStyle = '#2e6b2a'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 16); g.lineTo(128, 16); g.stroke();
  var t2 = new THREE.CanvasTexture(c); t2.magFilter = THREE.LinearFilter; t2.minFilter = THREE.LinearMipmapLinearFilter; return t2;
})();
var frondMat = lamb({ map: frondT, alphaTest: 0.45, side: THREE.DoubleSide });
var barkT2 = tex(64, function (g, s) { g.fillStyle = '#8a6a48'; g.fillRect(0, 0, s, s); for (var y = 0; y < s; y += 7) { g.fillStyle = y % 14 ? 'rgba(60,40,22,0.5)' : 'rgba(120,92,60,0.5)'; g.fillRect(0, y, s, 3.5); } }, 1, 3);
var frondGeo = (function () {
  var g = new THREE.PlaneGeometry(3.2, 0.85, 8, 1); g.translate(1.6, 0, 0);
  var pos = g.attributes.position;
  for (var i = 0; i < pos.count; i++) { var x = pos.getX(i), t = x / 3.2; pos.setY(i, pos.getY(i) * (1 - 0.72 * t)); }
  g.rotateX(-Math.PI / 2);
  for (i = 0; i < pos.count; i++) { var x2 = pos.getX(i), t2 = x2 / 3.2; pos.setY(i, pos.getY(i) - 1.35 * t2 * t2); }
  g.computeVertexNormals(); return g;
})();
function palm(x, z) {
  var g = new THREE.Group(); var h = 5.5 + Math.random() * 2.5;
  g.add(cyl(0.17, 0.26, h, 7, lamb2(barkT2), 0, h / 2, 0));
  var crown = new THREE.Group(); crown.position.y = h;
  for (var i = 0; i < 8; i++) { var f = new THREE.Mesh(frondGeo, frondMat); f.rotation.y = i / 8 * Math.PI * 2 + Math.random() * 0.4; f.rotation.z = (Math.random() - 0.5) * 0.2; crown.add(f); }
  g.add(crown); g.add(blobShadow(1.1, 1.1, 0.05));
  g.position.set(x, 0, z); g.rotation.y = Math.random() * Math.PI; scene.add(g);
  registerBreakable(g, x, z, 0.8, 'tree', null, 0.3);
}

function forestPatch(x0, x1, z0, z1, count) {
  // remap: forest rects were authored/pre-clipped against the AXIS roads —
  // several now straddle the true diagonals (their colliders would wall off
  // the road). Split rects that touch a true road and keep the clear halves.
  if (WC_REMAP && !remapRectClear(x0, x1, z0, z1, 2.5)) {
    if (Math.max(x1 - x0, z1 - z0) > 56) {
      var cnt2 = count === undefined ? undefined : Math.ceil(count / 2);
      if (x1 - x0 >= z1 - z0) { forestPatch(x0, (x0 + x1) / 2, z0, z1, cnt2); forestPatch((x0 + x1) / 2, x1, z0, z1, cnt2); }
      else { forestPatch(x0, x1, z0, (z0 + z1) / 2, cnt2); forestPatch(x0, x1, (z0 + z1) / 2, z1, cnt2); }
    }
    return;
  }
  // keep forest (trees + its collider) off the lake
  if (inLake((x0 + x1) / 2, (z0 + z1) / 2) && (x1 - x0) < 90 && (z1 - z0) < 90) return;
  mapForest.push({ x0: x0, x1: x1, z0: z0, z1: z1 });
  // Collider inset 2.5u per side: the edge tree line straddles the rect
  // boundary, so the player stops among visible trunks instead of on an
  // invisible plane out in the grass — and survey rects that graze a road or
  // sidewalk corridor no longer block the pavement itself.
  var inset = Math.min(2.5, (x1 - x0) / 4, (z1 - z0) / 4);
  addCollider((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0 - inset * 2, z1 - z0 - inset * 2);
  var area = (x1 - x0) * (z1 - z0);
  if (count === undefined) count = Math.min(60, Math.round(area / 260));
  for (var i = 0; i < count; i++) {
    var fx = x0 + Math.random() * (x1 - x0), fz = z0 + Math.random() * (z1 - z0);
    // survey houses may nose into a forest-rect edge — keep trees out of them
    if (houseBlocksSpot(fx, fz) || inLake(fx, fz)) continue;
    oak(fx, fz);
  }
}

// ---------------- perimeter forest + roadblocks ----------------
function forestWall(cx, cz, w, d) {
  var geo = new THREE.PlaneGeometry(Math.max(w, d), 30);
  var m = lamb({ map: forestBackT.clone(), fog: true });
  m.map.repeat.set(Math.max(w, d) / 60, 1); m.map.needsUpdate = true;
  var horizontal = w > d;
  var mesh = new THREE.Mesh(geo, m);
  mesh.position.set(cx, 13, cz);
  if (!horizontal) mesh.rotation.y = Math.PI / 2;
  // face inward
  if (horizontal && cz > 0) mesh.rotation.y = Math.PI;
  if (!horizontal && cx > 0) mesh.rotation.y = -Math.PI / 2;
  scene.add(mesh);
  addCollider(cx, cz, w, d);
  // decorative oaks just inside
  var into = cz > 0 ? -1 : (cz < 0 ? 1 : 0), intox = cx > 0 ? -1 : (cx < 0 ? 1 : 0);
  var n = Math.round(Math.max(w, d) / 26);
  for (var i = 0; i < n; i++) {
    if (horizontal) oak(cx - w / 2 + Math.random() * w, cz + into * (2 + Math.random() * 8));
    else oak(cx + intox * (2 + Math.random() * 8), cz - d / 2 + Math.random() * d);
  }
}
(function perimeter() {
  if (WC_REMAP) { remapPerimeter(); return; }   // 6 true exits (remap engine section)
  var t = 3;
  // north (z=-HALF): gap for the cross road (Nine Eagles Dr) at x=0
  forestWall(-(HALF + CROSS_HW) / 2 - 2, -HALF, HALF - CROSS_HW, t);
  forestWall((HALF + CROSS_HW) / 2 + 2, -HALF, HALF - CROSS_HW, t);
  // west (x=-HALF): gap for the main road (Race Track Rd) at z=0
  forestWall(-HALF, -(HALF + MAIN_HW) / 2 - 2, t, HALF - MAIN_HW);
  forestWall(-HALF, (HALF + MAIN_HW) / 2 + 2, t, HALF - MAIN_HW);
  // east (x=HALF): gap where Race Track Rd exits NE at z=NE_EXIT_Z (+-21,
  // the road crosses at ~41 degrees so the opening is wider than MAIN_HW)
  forestWall(HALF, (-HALF + (NE_EXIT_Z - 21)) / 2, t, (NE_EXIT_Z - 21) + HALF);
  forestWall(HALF, ((NE_EXIT_Z + 21) + HALF) / 2, t, HALF - (NE_EXIT_Z + 21));
  // south (z=HALF): gap where Countryway Blvd exits SE at x=SE_EXIT_X (+-17)
  forestWall((-HALF + (SE_EXIT_X - 17)) / 2, HALF, (SE_EXIT_X - 17) + HALF, t);
  forestWall(((SE_EXIT_X + 17) + HALF) / 2, HALF, HALF - (SE_EXIT_X + 17), t);
})();

function roadblock(x, z, w, d) {
  var bm = lamb({ color: 0xdadada });
  var stripe = lamb({ color: 0xd88018 });
  var horizontal = w > d;
  var span = horizontal ? w : d;
  var n = Math.max(2, Math.round(span / 3));
  for (var i = 0; i < n; i++) {
    var t = (i + 0.5) / n;
    var bx = horizontal ? x - w / 2 + t * w : x;
    var bz = horizontal ? z : z - d / 2 + t * d;
    var b = box(horizontal ? 2.6 : 1, 1.1, horizontal ? 1 : 2.6, i % 2 ? stripe : bm, bx, 0.55, bz);
    scene.add(b);
  }
  addCollider(x, z, w, d);
  signPlane(x, 2.2, z + (horizontal ? (z < 0 ? 1.5 : -1.5) : 0), horizontal ? 0 : Math.PI / 2, 6, 1.6, ['ROAD', 'CLOSED'], '#b03018', '#ffffff');
}
(function roadblocks() {
  if (WC_REMAP) return;   // remapPerimeter places rotated barriers at the 6 true exits
  roadblock(0, -HALF + 8, CROSS_HW * 2, 1.4);        // north: Nine Eagles Dr exit
  roadblock(-HALF + 8, 0, 1.4, MAIN_HW * 2);         // west: Race Track Rd exit
  roadblock(HALF - 8, NE_EXIT_Z + 8, 1.4, 40);       // east: Race Track Rd NE exit (road runs diagonal, span padded)
  roadblock(SE_EXIT_X - 1, HALF - 8, 34, 1.4);       // south: Countryway Blvd SE exit
})();

// ---------------- car meshes (defined before layout uses staticCar) ----------------
var CARCOLS = [0xb03024, 0x2d5fa9, 0xd8d8d4, 0x24262a, 0x3a7a40, 0xc8ac3a, 0x7a4898, 0x9aa2ac, 0x804828];
var carBodyGeo = (function () {
  var sp = new THREE.Shape();
  sp.moveTo(-2.25, 0.3); sp.lineTo(-2.32, 0.62); sp.lineTo(-2.2, 0.88);
  sp.lineTo(2.15, 0.92); sp.lineTo(2.32, 0.6); sp.lineTo(2.25, 0.3);
  sp.lineTo(1.9, 0.22); sp.lineTo(-1.9, 0.22); sp.closePath();
  var g = new THREE.ExtrudeGeometry(sp, { depth: 1.62, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 2, steps: 1 });
  g.translate(0, 0, -0.81); return g;
})();
var carCabinGeo = (function () {
  var sp = new THREE.Shape();
  sp.moveTo(-1.62, 0.88); sp.lineTo(-1.3, 1.44); sp.lineTo(0.42, 1.47); sp.lineTo(1.0, 0.9); sp.closePath();
  var g = new THREE.ExtrudeGeometry(sp, { depth: 1.42, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1, steps: 1 });
  g.translate(0, 0, -0.71); return g;
})();
var glassMat = phong({ color: 0x18222e, shininess: 100, specular: 0xaabbcc });
var tireMat = lamb({ color: 0x161616 });
var hubMat = lamb({ color: 0x8f9298 });
var wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12);
// Meshy textured wheel (tire + 5-spoke rim); axle = local +Y like the cylinder
var meshyWheel = null;
function getMeshyWheel() {
  if (meshyWheel || typeof MESHY_WHEEL === 'undefined') return meshyWheel;
  var e = MESHY_WHEEL;
  var qp = new Int16Array(b64Bytes(e.p).buffer), qu = new Uint16Array(b64Bytes(e.u).buffer);
  var fp = new Float32Array(qp.length), fu = new Float32Array(qu.length);
  for (var i = 0; i < qp.length; i++) fp[i] = qp[i] / e.q;
  for (i = 0; i < qu.length; i += 2) { fu[i] = qu[i] / 8192; fu[i + 1] = 1 - qu[i + 1] / 8192; }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(fu, 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array(b64Bytes(e.i).buffer), 1));
  geo.computeVertexNormals();
  var im = new Image();
  var tx = new THREE.Texture(im);
  tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false;
  im.onload = function () { tx.needsUpdate = true; };
  im.src = e.tex;
  meshyWheel = { geo: geo, mat: lamb({ map: tx }), s: 0.68 / e.dims[0] };
  return meshyWheel;
}
var lightF = new THREE.MeshBasicMaterial({ color: 0xfff2cc });
var lightR = new THREE.MeshBasicMaterial({ color: 0xc03028 });
var bumperM = lamb({ color: 0x2c2e32 });
// headlight ground beam (night): warm trapezoid glow ahead of the nose
var beamTex = (function () {
  var c = document.createElement('canvas'); c.width = 128; c.height = 64;
  var g = c.getContext('2d');
  g.clearRect(0, 0, 128, 64);
  var gr = g.createLinearGradient(0, 0, 128, 0);
  gr.addColorStop(0, 'rgba(255,238,190,0.9)'); gr.addColorStop(0.55, 'rgba(255,238,190,0.45)'); gr.addColorStop(1, 'rgba(255,238,190,0)');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(0, 22); g.lineTo(128, 2); g.lineTo(128, 62); g.lineTo(0, 42); g.closePath(); g.fill();
  var t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  return t;
})();
var beamGeo = (function () { var g = new THREE.PlaneGeometry(6.4, 3.4); g.rotateX(-Math.PI / 2); g.translate(5.3, 0, 0); return g; })();
var beamM = new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0.5, depthWrite: false });
// nose/tail light glows: small additive quads on the car body (night + brake flare)
var glowTex = (function () {
  var c = document.createElement('canvas'); c.width = 32; c.height = 32;
  var g = c.getContext('2d');
  var gr = g.createRadialGradient(16, 16, 1, 16, 16, 15);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  var t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  return t;
})();
var glowGeo = new THREE.PlaneGeometry(1, 1);
var headGlowM = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xfff2cc, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
function makeTailGlowM() { // per-car (brake flare mutates color/opacity)
  return new THREE.MeshBasicMaterial({ map: glowTex, color: 0xd0261c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
}
// ---- Meshy AI vehicles (optional meshyvehs.js): 10 early-2000s bodies,
// blue seed paint hue-swapped at load into 5 common colors per model ----
var VEH_LEN = 4.64;                    // match the procedural car footprint
// every Meshy model comes out nose -x (front-left 3/4 seed view) — flip all
var VEH_FLIP = { COMPACT: 1, HATCH: 1, MINIVAN: 1, PICKUP_BIG: 1, PICKUP_FS: 1, PICKUP_HD: 1, SEDAN_FULL: 1, SEDAN_MID: 1, SEDAN_SPORT: 1, SUV_MID: 1 };
var VEH_COLS = [null, [200, 202, 206], [232, 232, 228], [34, 36, 40], [166, 38, 30]]; // as-is/silver/white/black/red
var vehGeoCache = {}, vehMatCache = {}, vehEndCache = {};
// nose/tail x extents at light height (nose-+x geo): where to hang the light
// glows. Band is proportional to the model height so it works for both the
// ~0.6u-tall Meshy models and the ~2.2u-tall GGBot models (0.14–0.46 of
// height reproduces the old absolute 0.10–0.30 band on every Meshy body).
function scanVehEnds(geo, h) {
  var pos = geo.getAttribute('position');
  var nx = 0, tx = 0, lo = h * 0.14, hi = h * 0.46;
  for (var i = 0; i < pos.count; i++) {
    var y = pos.getY(i);
    if (y < lo || y > hi) continue;
    var x = pos.getX(i);
    if (x > nx) nx = x;
    if (x < tx) tx = x;
  }
  return { nx: nx, tx: tx };
}
function vehEnds(vi) {
  if (!vehEndCache[vi]) vehEndCache[vi] = scanVehEnds(getVehGeo(vi), MESHY_VEHS[vi].dims[1]);
  return vehEndCache[vi];
}
function getVehGeo(vi) {
  if (vehGeoCache[vi]) return vehGeoCache[vi];
  var e = MESHY_VEHS[vi];
  var qp = new Int16Array(b64Bytes(e.p).buffer), qu = new Uint16Array(b64Bytes(e.u).buffer);
  var fp = new Float32Array(qp.length), fu = new Float32Array(qu.length);
  for (var i = 0; i < qp.length; i++) fp[i] = qp[i] / e.q;
  for (i = 0; i < qu.length; i += 2) { fu[i] = qu[i] / 8192; fu[i + 1] = 1 - qu[i + 1] / 8192; }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(fu, 2));
  if (VEH_FLIP[e.n]) geo.rotateY(Math.PI);
  geo.computeVertexNormals();
  vehGeoCache[vi] = geo;
  return geo;
}
function getVehMat(vi, col) {
  var key = vi + '_' + col;
  if (vehMatCache[key]) return vehMatCache[key];
  var e = MESHY_VEHS[vi];
  var cv = document.createElement('canvas');
  cv.width = 1; cv.height = 1;
  var tx = new THREE.CanvasTexture(cv);
  tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false;
  var im = new Image();
  im.onload = function () {
    cv.width = im.width; cv.height = im.height;
    var g = cv.getContext('2d'); g.drawImage(im, 0, 0);
    var tgt = VEH_COLS[col];
    if (tgt) {
      var d = g.getImageData(0, 0, cv.width, cv.height), px = d.data;
      for (var j = 0; j < px.length; j += 4) {
        var r = px[j], gg = px[j + 1], b = px[j + 2];
        if (b > r * 1.18 && b > gg * 1.12 && b > 55) {   // blue body paint
          var lum = (r * 0.35 + gg * 0.45 + b * 0.35) / 148;   // ~1.0 at base paint
          px[j] = Math.min(255, tgt[0] * lum);
          px[j + 1] = Math.min(255, tgt[1] * lum);
          px[j + 2] = Math.min(255, tgt[2] * lum);
        }
      }
      g.putImageData(d, 0, 0);
    }
    tx.needsUpdate = true;
  };
  im.src = e.tex;
  vehMatCache[key] = lamb({ map: tx });
  return vehMatCache[key];
}
// ---- GGBot "PSX Style Cars" (optional ggbotvehs.js, CC0): hand-picked
// bodies the Meshy fleet lacks (wagon/full-size sedan/taxi/step van + the
// burned-out wreck used as an explosion husk). Entries embed their shipped
// color-variant textures verbatim in `texs` (no VEH_COLS hue-swap), ship
// wheel-LESS bodies with TRUE pivots in `wheels` ([x,y,z,r], nose +x, no
// flip) and carry their own stripped baked-wheel mesh `wg` (indexed, axle
// local +Y, UV-mapped into the same car atlas) — so no VEH_WHEEL_TUNE.
var ggGeoCache = {}, ggWheelCache = {}, ggMatCache = {}, ggEndCache = {};
var GG_TRAFFIC = [];    // roster indices: normal-weight traffic/parked bodies
var GG_WRECK_I = -1;    // Car 06 husk (explosion leftovers, never a live car)
if (typeof GGBOT_VEHS !== 'undefined') for (var ggi = 0; ggi < GGBOT_VEHS.length; ggi++) {
  if (GGBOT_VEHS[ggi].n === 'GG_WRECK') GG_WRECK_I = ggi;
  // GG_POLICE is reserved for a future cop-car feature — never in rosters
  else if (GGBOT_VEHS[ggi].n !== 'GG_POLICE') GG_TRAFFIC.push(ggi);
}
function getGGGeo(gi) {
  if (ggGeoCache[gi]) return ggGeoCache[gi];
  var e = GGBOT_VEHS[gi];
  var qp = new Int16Array(b64Bytes(e.p).buffer), qu = new Uint16Array(b64Bytes(e.u).buffer);
  var fp = new Float32Array(qp.length), fu = new Float32Array(qu.length);
  for (var i = 0; i < qp.length; i++) fp[i] = qp[i] / e.q;
  for (i = 0; i < qu.length; i += 2) { fu[i] = qu[i] / 8192; fu[i + 1] = 1 - qu[i + 1] / 8192; }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(fu, 2));
  geo.computeVertexNormals();
  ggGeoCache[gi] = geo;
  return geo;
}
function getGGWheel(gi) {   // the car's own baked wheel, re-centered, axle local +Y
  if (ggWheelCache[gi]) return ggWheelCache[gi];
  var e = GGBOT_VEHS[gi].wg;
  var qp = new Int16Array(b64Bytes(e.p).buffer), qu = new Uint16Array(b64Bytes(e.u).buffer);
  var fp = new Float32Array(qp.length), fu = new Float32Array(qu.length);
  for (var i = 0; i < qp.length; i++) fp[i] = qp[i] / e.q;
  for (i = 0; i < qu.length; i += 2) { fu[i] = qu[i] / 8192; fu[i + 1] = 1 - qu[i + 1] / 8192; }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(fu, 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array(b64Bytes(e.i).buffer), 1));
  geo.computeVertexNormals();
  ggWheelCache[gi] = geo;
  return geo;
}
function getGGMat(gi, ti) {   // shipped variant texture as-is (no hue-swap)
  var key = gi + '_' + ti;
  if (ggMatCache[key]) return ggMatCache[key];
  var im = new Image();
  var tx = new THREE.Texture(im);
  tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false;
  var mat = lamb({ map: tx });
  im.onload = function () {
    tx.needsUpdate = true;
    // PAINTED-LIGHT GLOW: the texels around each measured head/taillight
    // position glow at night (emissiveMap masked to just those triangles),
    // so the lights themselves read brighter than the body — not only the
    // floating glow quads. Mask: rasterize the UV footprint of every triangle
    // whose centroid sits within ~0.45 model units of a GG_LIGHT_TUNE point,
    // then keep the texture's own pixels there (heads stay warm, tails red).
    var tune = GG_LIGHT_TUNE[GGBOT_VEHS[gi].n];
    if (!tune) return;
    var geo = getGGGeo(gi);
    if (!geo.boundingBox) geo.computeBoundingBox();
    var pos = geo.getAttribute('position'), uv = geo.getAttribute('uv');
    var noseX = geo.boundingBox.max.x, tailX = geo.boundingBox.min.x;
    var pts = [[noseX, tune.hy, tune.hz], [noseX, tune.hy, -tune.hz], [tailX, tune.ty, tune.tz], [tailX, tune.ty, -tune.tz]];
    var R2 = 0.45 * 0.45, W = im.width, H = im.height;
    var mc = document.createElement('canvas'); mc.width = W; mc.height = H;
    var g = mc.getContext('2d');
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 2;   // slight dilation so thin slivers still read
    var found = false;
    for (var t = 0; t < pos.count; t += 3) {
      var cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
      var cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
      var cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
      var near = false;
      for (var q = 0; q < 4; q++) { var P = pts[q], ax = cx - P[0], ay = cy - P[1], az = cz - P[2]; if (ax * ax + ay * ay + az * az < R2) { near = true; break; } }
      if (!near) continue;
      found = true;
      g.beginPath();
      g.moveTo(uv.getX(t) * W, (1 - uv.getY(t)) * H);
      g.lineTo(uv.getX(t + 1) * W, (1 - uv.getY(t + 1)) * H);
      g.lineTo(uv.getX(t + 2) * W, (1 - uv.getY(t + 2)) * H);
      g.closePath(); g.fill(); g.stroke();
    }
    if (!found) return;
    // keep the texture's pixels only inside the light mask (transparent = no emission)
    g.globalCompositeOperation = 'source-in';
    g.drawImage(im, 0, 0, W, H);
    var etx = new THREE.CanvasTexture(mc);
    etx.magFilter = THREE.NearestFilter; etx.minFilter = THREE.NearestFilter; etx.generateMipmaps = false;
    mat.emissive = new THREE.Color(0xffffff);
    mat.emissiveMap = etx;
    mat.emissiveIntensity = 0;
    mat.userData = mat.userData || {};
    mat.userData.emisBase = 1.35;   // lights burn noticeably brighter than the lit-window wash
    mat.needsUpdate = true;
    nightEmis.push(mat);
  };
  im.src = GGBOT_VEHS[gi].texs[ti];
  ggMatCache[key] = mat;
  return ggMatCache[key];
}
function ggEnds(gi) {
  if (!ggEndCache[gi]) ggEndCache[gi] = scanVehEnds(getGGGeo(gi), GGBOT_VEHS[gi].dims[1]);
  return ggEndCache[gi];
}
// Per-model 3D-wheel placement, hand-measured against the wheels BAKED into the
// Meshy body meshes so the spinning wheel fully covers the painted one and sits
// on the ground: [frontX, frontR, rearX, rearR, frontZOut, rearZOut, tireWidth].
// zOut (>0) = desired outer tire face |z| for models whose fender flares carry a
// painted wheel hub (pickups/SUV) — the 3D wheel must sit proud of that face.
var VEH_WHEEL_TUNE = {
  COMPACT: [1.50, 0.36, -1.56, 0.38, 0, 0, 1.3],
  HATCH: [1.63, 0.36, -1.66, 0.39, 0, 0, 1.3],
  MINIVAN: [1.52, 0.35, -1.56, 0.36, 0, 0, 1.3],
  PICKUP_BIG: [1.55, 0.42, -1.51, 0.43, 1.06, 1.10, 1.45],
  PICKUP_FS: [1.56, 0.33, -1.40, 0.32, 0, 0.95, 1.3],
  PICKUP_HD: [1.52, 0.36, -1.45, 0.36, 0, 1.03, 1.45],
  SEDAN_FULL: [1.37, 0.33, -1.45, 0.35, 0, 0, 1.3],
  SEDAN_MID: [1.27, 0.30, -1.35, 0.32, 0, 0, 1.3],
  SEDAN_SPORT: [1.38, 0.30, -1.50, 0.35, 0, 0, 1.3],
  SUV_MID: [1.46, 0.41, -1.53, 0.42, 1.04, 1.07, 1.3]
};
var WHEEL_BASE_W = 0.294;   // MESHY_WHEEL tire width at the base 0.34 radius
// painted head/taillight centers per GGBot body (MODEL units, pre-scale):
// hy/hz = headlight y/lateral-z, ty/tz = taillight. Measured offline by
// pixel-locating the lights in gridded night renders and unprojecting onto the
// nose/tail face; quads mirror to ±z. Models absent here use the generic guess.
var GG_LIGHT_TUNE = {
  GG_WAGON: { hy: 0.96, hz: 0.87, ty: 1.10, tz: 0.76 },
  GG_SEDAN: { hy: 1.10, hz: 0.75, ty: 1.08, tz: 0.67 },
  GG_TAXI: { hy: 1.09, hz: 0.76, ty: 1.06, tz: 0.71 },
  GG_STEPVAN: { hy: 1.10, hz: 0.97, ty: 0.91, tz: 1.09 }
};
function makeCar() {
  var g = new THREE.Group();
  var body = new THREE.Group();   // separate so suspension can bounce it over the wheels
  var wheels = [], pivots = [];
  var wheelSpots = [[1.42, 0.34, 0.86, 0.34], [1.42, 0.34, -0.86, 0.34], [-1.42, 0.34, 0.86, 0.34], [-1.42, 0.34, -0.86, 0.34]];
  // roster: GGBot imported bodies only (the Meshy set was retired as "V1").
  // nMeshy pinned to 0 so pickN ranges over GG_TRAFFIC and the GG branch always
  // wins; the Meshy + procedural branches below stay as graceful fallbacks only
  // if ggbotvehs.js is ever missing.
  var nMeshy = (typeof GGBOT_VEHS !== 'undefined' && GG_TRAFFIC.length) ? 0 : (typeof MESHY_VEHS !== 'undefined' && MESHY_VEHS.length ? MESHY_VEHS.length : 0);
  var pickN = (Math.random() * (nMeshy + GG_TRAFFIC.length)) | 0;
  var e = null, s = 1, ends = null, ggw = null, vname = 'PROC';
  if (pickN >= nMeshy && GG_TRAFFIC.length) {
    // GGBot body: shipped variant texture, own wheel mesh at TRUE pivots
    var gi = GG_TRAFFIC[pickN - nMeshy];
    e = GGBOT_VEHS[gi];
    s = VEH_LEN / e.dims[0];
    // `mail` (always the LAST texs slot) is a rare livery: ~5% of van rolls
    var ti = e.mail !== undefined && Math.random() < 0.05 ? e.mail :
      (Math.random() * (e.mail !== undefined ? e.texs.length - 1 : e.texs.length)) | 0;
    var gmat = getGGMat(gi, ti);
    var vm3 = new THREE.Mesh(getGGGeo(gi), gmat);
    vm3.scale.set(s, s, s);
    body.add(vm3);
    ggw = { geo: getGGWheel(gi), mat: gmat };
    wheelSpots = e.wheels.map(function (w) { return [w[0] * s, w[1] * s, w[2] * s, w[3] * s]; });
    ends = ggEnds(gi);
    vname = e.n;
  } else if (nMeshy) {
    var vi = pickN;
    e = MESHY_VEHS[vi];
    s = VEH_LEN / e.dims[0];
    var vm2 = new THREE.Mesh(getVehGeo(vi), getVehMat(vi, (Math.random() * VEH_COLS.length) | 0));
    vm2.scale.set(s, s, s);
    body.add(vm2);
    ends = vehEnds(vi);
    vname = e.n;
    // spinning/steering wheel props must fully cover the baked wheels
    wheelSpots = e.wheels.map(function (w) {
      var fx = VEH_FLIP[e.n] ? -1 : 1;
      var t = VEH_WHEEL_TUNE[e.n];
      if (t) {
        var front = w[0] * fx > 0;
        var wr2 = front ? t[1] : t[3];
        var zOut = front ? t[4] : t[5];
        var halfW = WHEEL_BASE_W * (wr2 / 0.34) * t[6] / 2;
        var az = zOut > 0 ? zOut - halfW : Math.abs(w[2]) * s + 0.04;
        return [front ? t[0] : t[2], wr2, az * (w[2] > 0 ? 1 : -1) * fx, wr2, t[6]];
      }
      var wr = Math.min(0.44, Math.max(0.26, w[3] * s * 0.92));
      var wz = (Math.abs(w[2]) * s - 0.06) * (w[2] > 0 ? 1 : -1) * fx;
      return [w[0] * s * fx, wr, wz, wr, 1.3];
    });
  } else {
    var col = CARCOLS[(Math.random() * CARCOLS.length) | 0];
    body.add(new THREE.Mesh(carBodyGeo, phong({ color: col, shininess: 55, specular: 0x999999 })));
    body.add(new THREE.Mesh(carCabinGeo, glassMat));
    body.add(box(0.2, 0.24, 1.8, bumperM, 2.3, 0.34, 0)); body.add(box(0.2, 0.24, 1.8, bumperM, -2.3, 0.34, 0));
    body.add(box(0.06, 0.12, 0.32, lightF, 2.34, 0.68, 0.55)); body.add(box(0.06, 0.12, 0.32, lightF, 2.34, 0.68, -0.55));
    body.add(box(0.06, 0.12, 0.32, lightR, -2.36, 0.68, 0.55)); body.add(box(0.06, 0.12, 0.32, lightR, -2.36, 0.68, -0.55));
  }
  g.add(body);
  var mw = getMeshyWheel();
  wheelSpots.forEach(function (wp) {
    var pv = new THREE.Group(); pv.position.set(wp[0], wp[1], wp[2]);
    var w;
    if (ggw) {
      // GGBot: the car's own baked wheel, same unit space/scale as the body
      w = new THREE.Mesh(ggw.geo, ggw.mat);
      w.rotation.x = wp[2] > 0 ? Math.PI / 2 : -Math.PI / 2;   // axle local +Y -> car Z
      w.scale.set(s, s, s);
    } else if (mw) {
      w = new THREE.Mesh(mw.geo, mw.mat);
      // spoke face is local -Y: flip per side so the rim always faces out
      w.rotation.x = wp[2] > 0 ? Math.PI / 2 : -Math.PI / 2;
      var ws2 = mw.s * (wp[3] / 0.34);
      w.scale.set(ws2, ws2 * (wp[4] || 1), ws2);   // local Y = axle: widen the tire
    } else {
      w = new THREE.Mesh(wheelGeo, [tireMat, hubMat, hubMat]); w.rotation.x = Math.PI / 2;
      var ws = wp[3] / 0.34;
      w.scale.set(ws, 1, ws);   // scale the radius, keep the tire width
    }
    pv.add(w); g.add(pv); wheels.push(w); pivots.push(pv);
  });
  // front pivots first: sort by x so pivots[0]/[1] steer
  var ord = pivots.map(function (p, i) { return i; }).sort(function (a2, b2) { return pivots[b2].position.x - pivots[a2].position.x; });
  pivots = ord.map(function (i) { return pivots[i]; });
  wheels = ord.map(function (i) { return wheels[i]; });
  var beam = new THREE.Mesh(beamGeo, beamM);
  beam.position.y = 0.16; beam.visible = false;
  g.add(beam);
  // visible light glows at the nose (warm white) and tail (red, flares on brake)
  var glNX = 2.4, glTX = -2.42, glY = 0.68, glZ = 0.55;
  if (ends) {
    glNX = ends.nx * s + 0.06;   // just proud of the bumper so the quad never
    glTX = ends.tx * s - 0.06;   // gets swallowed by the body mesh
    glY = Math.min(0.62, e.dims[1] * s * 0.36);
    glZ = e.dims[2] * s * 0.5 * 0.58;
  }
  // measured painted-light centers per GGBot model (model units; validated by
  // pixel-reading night renders — the generic 0.36*h guess sat too LOW on every
  // body). Head and tail differ, so each gets its own y/z.
  var LT = GG_LIGHT_TUNE[vname];
  var hY = LT ? LT.hy * s : glY, hZ = LT ? LT.hz * s : glZ;
  var tY = LT ? LT.ty * s : glY, tZ = LT ? LT.tz * s : glZ;
  var tailM = makeTailGlowM();
  function glowQuad(mat, gx, gy, gz, sc) {
    var q = new THREE.Mesh(glowGeo, mat);
    q.position.set(gx, gy, gz);
    q.rotation.y = gx > 0 ? Math.PI / 2 : -Math.PI / 2;
    q.scale.set(sc, sc, 1);
    q.visible = false;
    body.add(q);
    return q;
  }
  var head1 = glowQuad(headGlowM, glNX, hY, hZ, 0.26), head2 = glowQuad(headGlowM, glNX, hY, -hZ, 0.26);
  var tail1 = glowQuad(tailM, glTX, tY, tZ, 0.2), tail2 = glowQuad(tailM, glTX, tY, -tZ, 0.2);
  g.add(blobShadow(2.4, 1.15, 0.1)); scene.add(g);
  return { group: g, body: body, wheels: wheels, pivots: pivots, beam: beam, head1: head1, head2: head2, tail1: tail1, tail2: tail2, tailM: tailM, tailS: 0.15, vname: vname };
}
function staticCar(x, z, ry) { var c = makeCar(); c.group.position.set(x, 0, z); c.group.rotation.y = ry || 0; }
// suspension spring + accel pitch + steer roll + front-wheel steering (visual only)
function updateCarFeel(c, dt, spd, accel, steer) {
  var cc = c.car;
  if (!cc.body) return;
  c.sy = c.sy || 0; c.svy = c.svy || 0;
  c.svy += (-140 * c.sy - 11 * c.svy) * dt;
  c.sy += c.svy * dt;
  var asp = Math.abs(spd);
  c.seedPh = c.seedPh || Math.random() * 6.28;
  var rumble = asp > 2 ? Math.sin(T * (7 + asp * 0.55) + c.seedPh) * 0.015 * Math.min(1, asp / 14) : 0;
  cc.body.position.y = Math.max(-0.12, Math.min(0.18, c.sy)) + rumble;
  c.pitchS = c.pitchS || 0; c.rollS = c.rollS || 0;
  var k = Math.min(1, 6 * dt);
  c.pitchS += ((accel || 0) * 0.0035 - c.pitchS) * k;
  c.rollS += (-(steer || 0) * Math.min(1, asp / 12) * 0.05 - c.rollS) * k;
  cc.body.rotation.z = c.pitchS;
  cc.body.rotation.x = c.rollS;
  var target = (steer || 0) * 0.42;
  c.steerA = c.steerA || 0;
  c.steerA += (target - c.steerA) * Math.min(1, 10 * dt);
  cc.pivots[0].rotation.y = c.steerA;
  cc.pivots[1].rotation.y = c.steerA;
}
// light glows: headlights/taillights follow the street lights; taillights also
// flare bright any time the car is braking (short hold so they don't flicker)
function updateCarLights(c, dt, braking) {
  var cc = c.car;
  if (!cc.head1) return;
  if (braking) c.brkT = 0.14; else if (c.brkT > 0) c.brkT -= dt;
  var brk = c.brkT > 0 && !c.exploded && !c.parked;
  var on = lampsOn && !c.exploded && !c.parked;   // parked = ignition off, no lights
  if (cc.head1.visible !== on) { cc.head1.visible = on; cc.head2.visible = on; }
  var tv = on || brk;
  if (cc.tail1.visible !== tv) { cc.tail1.visible = tv; cc.tail2.visible = tv; }
  if (cc.brkOn !== brk) {
    cc.brkOn = brk;
    var ts = brk ? cc.tailS * 2 : cc.tailS;
    cc.tail1.scale.set(ts, ts, 1); cc.tail2.scale.set(ts, ts, 1);
    cc.tailM.opacity = brk ? 1 : 0.85;
    cc.tailM.color.setHex(brk ? 0xff3020 : 0xd0261c);
  }
}

// ---------------- lake (transparent, swimmable, with fountain) ----------------
var fountainDrops = [];
(function lake() {
  // sloped sandy bed you can wade down into
  var bedGeo = new THREE.CircleGeometry(LAKE.r, 30, 0, Math.PI * 2);
  bedGeo.rotateX(-Math.PI / 2);
  var bp = bedGeo.attributes.position;
  for (var vi = 0; vi < bp.count; vi++) {
    var vx = bp.getX(vi), vz = bp.getZ(vi);
    var q = (vx * vx + vz * vz) / (LAKE.r * LAKE.r);
    bp.setY(vi, -LAKE_DEPTH * (1 - q));
  }
  bedGeo.computeVertexNormals();
  var bed = new THREE.Mesh(bedGeo, lamb({ color: 0xb09c72 }));
  bed.scale.set(1.25, 1, 0.85); bed.position.set(LAKE.x, 0.02, LAKE.z); scene.add(bed);
  // see-through water surface
  // NOTE: these meshes scale BEFORE their rotation, so world-z size comes
  // from scale.y (scale.z only squashes the plane's normal) — 0.85 goes in
  // y or the water overhangs the bed and covers grass
  var w = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r, 30),
    phong({ color: 0x3f82ae, shininess: 90, specular: 0xbbddee, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  w.rotation.x = -Math.PI / 2; w.scale.set(1.25, 0.85, 1); w.position.set(LAKE.x, WATER_Y, LAKE.z); scene.add(w);
  var rim = new THREE.Mesh(new THREE.RingGeometry(LAKE.r, LAKE.r + 3, 30), lamb({ color: 0xb9a778 }));
  rim.rotation.x = -Math.PI / 2; rim.scale.set(1.25, 0.85, 1); rim.position.set(LAKE.x, 0.19, LAKE.z); scene.add(rim);
  // NPCs/cops/cars still treat the water as a wall; the player wades in
  // (updatePlayer filters .lake colliders out of its pushOut list)
  colliders.push({ x0: LAKE.x - LAKE.r * 1.15, x1: LAKE.x + LAKE.r * 1.15, z0: LAKE.z - LAKE.r * 0.75, z1: LAKE.z + LAKE.r * 0.75, lake: true });
  // (shore oak ring removed — the lake is kept clear of trees)
  // fountain: stone base + column, droplets animated in updateWorldFx
  var stoneM = lamb({ color: 0xc9c2b2 });
  scene.add(cyl(2.4, 2.8, 1.1, 14, stoneM, LAKE.x, -0.4, LAKE.z));
  scene.add(cyl(0.45, 0.6, 2.6, 10, stoneM, LAKE.x, 1.0, LAKE.z));
  scene.add(cyl(1.3, 1.05, 0.35, 14, stoneM, LAKE.x, 2.3, LAKE.z));
  addCollider(LAKE.x, LAKE.z, 5.6, 5.6);   // can't swim through the fountain
  var dropGeo = new THREE.SphereGeometry(0.14, 6, 5);
  var dropM = new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.85 });
  for (var di = 0; di < 42; di++) {
    var dm = new THREE.Mesh(dropGeo, dropM);
    scene.add(dm);
    fountainDrops.push({ mesh: dm, vx: 0, vy: -1, vz: 0, delay: Math.random() * 1.4 });
  }
})();

// ---------------- lay out the city ----------------
// R3 venue placement (editor-authored): under WC_REMAP every landmark is built
// from REMAP_VENUES — {type,x,z,rot,w,d} authored in the in-game map editor.
// venueBuilder() maps a type to a builder that makes the landmark at the origin
// facing +z at its NATIVE size; placeVenueData() scales the built group to the
// authored footprint, rotates (+180 for builders whose storefront faces -z so
// facing matches the editor's front arrow) and translates it into place, then
// re-registers colliders as OBBs / minimap boxes / parking in world space.
// Legacy world (WC_REMAP off) uses the hardcoded axis calls in the else block.
var VENUE_FRONT180 = { racetrac: 1, dollar_tree: 1, dunkin: 1, strip: 1 };  // storefront authored at local -z
function venueBuilder(v) {
  var id = v.id || '';
  switch (v.type) {
    case 'racetrac':    return { fn: function () { gasStation(0, 0); }, nw: 36, nd: 22 };
    case 'publix':      return { fn: function () { supermarket(0, 0); }, nw: 74, nd: 44 };
    case 'farnell':     return { fn: function () { school(0, 0); }, nw: 82, nd: 32 };
    case 'bank':        return { fn: function () { bankBldg(0, 0, id === 'boa' ? 'BANK OF AMERICA' : id === 'regions' ? 'REGIONS BANK' : 'BANK'); }, nw: 26, nd: 20 };
    case 'pharmacy':    return { fn: function () { shop(0, 0, 24, 20, 6, '#e8dcc6', ['WESTCHASE PHARMACY'], '#1c4d8f', '#ffe9a0', { face: 1, mmColor: '#3f8fd0' }); }, nw: 24, nd: 20 };
    case 'sushi':       return { fn: function () { shop(0, 0, 28, 22, 7, '#c0392b', ['SAKURA SUSHI'], '#111111', '#ffcf3a', { face: 1, mmColor: '#d94f3d' }); }, nw: 28, nd: 22 };
    case 'dollar_tree': return { fn: function () { shop(0, 0, 30, 20, 6, '#3f7f4a', ['DOLLAR TREE'], '#1c5e2a', '#ffe9a0', { face: -1, mmColor: '#2fae4a' }); }, nw: 30, nd: 20 };
    case 'storage':     return { fn: function () { storage(0, 0); }, nw: 46, nd: 40 };
    case 'strip':       return { fn: function () { stripMall(0, 0, 50, id === 'strip_a' ? ['AUTO', 'GYM'] : id === 'strip_b' ? ['PIZZA', 'VAPE', 'TAX'] : ['NAILS', 'SUBS', 'LAUNDRY']); }, nw: 50, nd: 20 };
    case 'dunkin':      return { fn: function () { shop(0, 0, 12, 11, 5, '#e8862e', ['DUNKIN'], '#e01a7a', '#ff8c42', { face: -1, mmColor: '#e8862e' }); }, nw: 12, nd: 11 };
    case 'starbucks':   return { fn: function () { coffeeShop(0, 0); }, nw: 15, nd: 13 };
    case 'offices':     return { fn: function () { shop(0, 0, 20, 16, 6, '#e5d7bc', ['WEST PARK OFFICES'], '#3a3a3a', '#ffe9a0', { face: 1, mmColor: '#c9b98a' }); }, nw: 20, nd: 16 };
    case 'yoga':        return { fn: function () { shop(0, 0, 16, 14, 5, '#e0d2b8', ['YOGA'], '#5a2e6a', '#ffe9a0', { face: 1, mmColor: '#b07acd' }); }, nw: 16, nd: 14 };
    case 'townhouse':   return { fn: function () { townhouseRow(0, 0, 6, 0); }, nw: 48, nd: 10 };
    case 'red_house':   return { fn: function () { redHouse(0, 0); }, nw: 18, nd: 18 };
    case 'house':       return { fn: function () { house(0, 0); }, nw: 11, nd: 9 };
    default:            return { fn: function () { shop(0, 0, 20, 16, 6, '#cfc8b8', ['SHOP'], '#333333', '#ffe9a0', { face: 1, mmColor: '#b8b0a0' }); }, nw: 20, nd: 16 };
  }
}
// Merge a venue group's FLAT single-material meshes by material into one merged
// BufferGeometry each (manual attribute concat, r149-safe). Multi-material bodies,
// nested groups, transparent/unique-texture meshes (signs, awnings) are left alone.
function mergeVenueGroup(vg) {
  var groups = {}, order = [], keep = [];
  for (var i = 0; i < vg.children.length; i++) {
    var m = vg.children[i];
    if (!m.isMesh || Array.isArray(m.material) || !m.geometry || !m.geometry.attributes.position || m.material.transparent) { keep.push(m); continue; }
    var key = m.material.uuid;
    if (!groups[key]) { groups[key] = { mat: m.material, meshes: [] }; order.push(key); }
    groups[key].meshes.push(m);
  }
  var out = keep.slice();
  for (var k = 0; k < order.length; k++) {
    var grp = groups[order[k]];
    if (grp.meshes.length < 2) { out.push(grp.meshes[0]); continue; }
    var pos = [], nor = [], uvs = [], V = new THREE.Vector3(), NM = new THREE.Matrix3();
    for (var j = 0; j < grp.meshes.length; j++) {
      var me = grp.meshes[j]; me.updateMatrix();
      var geo = me.geometry.index ? me.geometry.toNonIndexed() : me.geometry;
      var p = geo.attributes.position, na = geo.attributes.normal, u = geo.attributes.uv;
      NM.getNormalMatrix(me.matrix);
      for (var vi = 0; vi < p.count; vi++) {
        V.set(p.getX(vi), p.getY(vi), p.getZ(vi)).applyMatrix4(me.matrix); pos.push(V.x, V.y, V.z);
        if (na) { V.set(na.getX(vi), na.getY(vi), na.getZ(vi)).applyMatrix3(NM).normalize(); nor.push(V.x, V.y, V.z); } else nor.push(0, 1, 0);
        if (u) uvs.push(u.getX(vi), u.getY(vi)); else uvs.push(0, 0);
      }
    }
    var mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    mg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
    mg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    out.push(new THREE.Mesh(mg, grp.mat));
  }
  while (vg.children.length) vg.remove(vg.children[0]);
  for (var o = 0; o < out.length; o++) vg.add(out[o]);
}
function placeVenueData(v) {
  var spec = venueBuilder(v);
  var sx = v.w / spec.nw, sz = v.d / spec.nd;
  var yaw = ((v.rot || 0) + (VENUE_FRONT180[v.type] ? 180 : 0)) * Math.PI / 180;
  var vg = new THREE.Group();
  var realAdd = scene.add.bind(scene), savedCol = addCollider, savedOBB = addColliderOBB;
  var cols = [], mbs = [], parks = [];
  scene.add = function (o) { vg.add(o); return scene; };
  addCollider = function (cx, cz, w, d) { cols.push([cx, cz, w / 2, d / 2, 0]); };
  addColliderOBB = function (cx, cz, hw, hd, y) { cols.push([cx, cz, hw, hd, y || 0]); };
  mapBuildings.push = function (e) { mbs.push(e); return mbs.length; };
  mapParking.push = function (e) { parks.push(e); return parks.length; };
  try { spec.fn(); }
  finally { delete scene.add; addCollider = savedCol; addColliderOBB = savedOBB; delete mapBuildings.push; delete mapParking.push; }
  mergeVenueGroup(vg);   // collapse repeated single-material depth boxes -> 1 draw each
  vg.position.set(v.x, 0, v.z); vg.rotation.y = yaw; vg.scale.set(sx, 1, sz);
  realAdd(vg); vg.updateMatrixWorld(true);
  var cy = Math.cos(yaw), sy = Math.sin(yaw), k, w;
  function toW(lx, lz) { var ax = lx * sx, az = lz * sz; return [ax * cy + az * sy + v.x, -ax * sy + az * cy + v.z]; }
  for (k = 0; k < cols.length; k++) { var c = cols[k]; w = toW(c[0], c[1]); addColliderOBB(w[0], w[1], c[2] * sx, c[3] * sz, yaw + c[4]); }
  for (k = 0; k < mbs.length; k++) {
    var e = mbs[k]; w = toW(e.x, e.z); var ew = e.w * sx, ed = e.d * sz;
    mapBuildings.push({ x: w[0], z: w[1], w: Math.abs(ew * cy) + Math.abs(ed * sy), d: Math.abs(ew * sy) + Math.abs(ed * cy), h: e.h, c: e.c, pad: e.pad });
  }
  for (k = 0; k < parks.length; k++) { var p = parks[k]; w = toW(p.x, p.z); mapParking.push({ x: w[0], z: w[1], w: p.w * sx, d: p.d * sz }); }
}
// editor-authored parking lots + pavement (rotated planes) under WC_REMAP
function remapSurfaces() {
  if (typeof REMAP_SURFACES === 'undefined') return;
  for (var i = 0; i < REMAP_SURFACES.length; i++) {
    var s = REMAP_SURFACES[i], park = s.kind === 'parking';
    var geo = new THREE.PlaneGeometry(s.w, s.d); geo.rotateX(-Math.PI / 2);
    var m = lamb({ map: (park ? parkingT : concreteT).clone() });
    m.map.repeat.set(Math.max(1, s.w / (park ? 22 : 6)), Math.max(1, s.d / (park ? 22 : 6))); m.map.needsUpdate = true;
    var mesh = new THREE.Mesh(geo, m);
    // per-surface y ladder so overlapping same-kind lots don't sit coplanar and
    // z-fight; kept in bands (parking ~0.100-0.107, pavement ~0.114-0.121) that
    // stay under the flanking sidewalks (y 0.1225+) and above the road ribbons
    mesh.position.set(s.x, (park ? 0.1 : 0.114) + i * 0.0004, s.z); mesh.rotation.y = s.rot * Math.PI / 180;
    scene.add(mesh);
    (park ? mapParking : mapPave).push({ x: s.x, z: s.z, w: s.w, d: s.d });
  }
}
// building entrances NPCs/cops can walk in/out of: {x,z (door on the face),
// sx,sz (stand point just outside), nx,nz (outward normal), yaw}
var npcDoors = [];
function registerDoor(doorX, doorZ, nx, nz, clear) {
  npcDoors.push({ x: doorX, z: doorZ, sx: doorX + nx * (clear || 2.5), sz: doorZ + nz * (clear || 2.5), nx: nx, nz: nz, yaw: Math.atan2(nx, nz) });
}
if (WC_REMAP && typeof REMAP_VENUES !== 'undefined') {
  remapSurfaces();
  for (var vqi = 0; vqi < REMAP_VENUES.length; vqi++) placeVenueData(REMAP_VENUES[vqi]);
  // register venue entrances: placeVenueData normalizes every storefront to
  // local +z (VENUE_FRONT180 flips), so the door sits at the front-face center.
  // skips: storage (front inverted, not walk-in), racetrac (functional robbable
  // door — NPCs must not path onto gasRob), red_house (door:false)
  for (var vdi = 0; vdi < REMAP_VENUES.length; vdi++) {
    var vd = REMAP_VENUES[vdi];
    if (vd.type === 'storage' || vd.type === 'racetrac' || vd.type === 'red_house') continue;
    var vr = vd.rot * Math.PI / 180, vnx = Math.sin(vr), vnz = Math.cos(vr);
    registerDoor(vd.x + vnx * vd.d / 2, vd.z + vnz * vd.d / 2, vnx, vnz, 2.5);
  }
  // gameplay anchors: spawn + dealer in the Publix lot, rob zone at RaceTrac
  player.x = -63; player.z = 4; spawnX = -63; spawnZ = 4; dealerPos.x = -60; dealerPos.z = 0;
  gasRob.x = 85; gasRob.z = -4;
} else {
  gasStation(55, 50);
  shop(-52, 48, 30, 20, 6, '#3f7f4a', ['DOLLAR TREE'], '#1c5e2a', '#ffe9a0', { face: -1, mmColor: '#2fae4a' });
  storage(-52, 116);
  stripMall(-120, 52, 50, ['NAILS', 'SUBS', 'LAUNDRY']);
  stripMall(-188, 54, 52, ['PIZZA', 'VAPE', 'TAX']);
  stripMall(-256, 56, 48, ['AUTO', 'GYM']);
  shop(-116, 31, 12, 11, 5, '#e8862e', ['DUNKIN'], '#e01a7a', '#ff8c42', { face: -1, mmColor: '#e8862e' });
  bankBldg(52, -48, 'REGIONS BANK');
  shop(52, -112, 24, 20, 6, '#e8dcc6', ['WESTCHASE PHARMACY'], '#1c4d8f', '#ffe9a0', { face: 1, mmColor: '#3f8fd0' });
  shop(108, -112, 28, 22, 7, '#c0392b', ['SAKURA SUSHI'], '#111111', '#ffcf3a', { face: 1, mmColor: '#d94f3d' });
  bankBldg(-48, -48, 'BANK OF AMERICA');
  supermarket(-72, -140);
  school(-72, -238);
  townhouseRow(-150, -120, 6, 0); townhouseRow(-150, -150, 6, 0);
  townhouseRow(-210, -215, 6, 0); townhouseRow(-210, -245, 6, 0);
  coffeeShop(-116, -30);
  shop(-135, -82, 20, 16, 6, '#e5d7bc', ['WEST PARK OFFICES'], '#3a3a3a', '#ffe9a0', { face: 1, mmColor: '#c9b98a' });
  shop(-108, -82, 16, 14, 5, '#e0d2b8', ['YOGA'], '#5a2e6a', '#ffe9a0', { face: 1, mmColor: '#b07acd' });
  redHouse(-278, -78);
}

// neighborhoods (moderate) — the survey houses (houses.js) fill the true-road
// neighborhoods under WC_REMAP, so the axis-grid subdivisions stay legacy-only
if (!WC_REMAP) {
  subdivision(70, -292, 5, 2, 20, 16);
  subdivision(255, -30, 3, 2, 22, 18);
  subdivision(-250, 130, 4, 2, 20, 16);
}

// interior forest patches (undeveloped green)
forestPatch(96, 200, -232, -120);
forestPatch(120, 210, 74, 158);
forestPatch(150, 300, -300, -230);
// (the two west patches around x-315 were removed — the lake now sits there)

// ---------------- map expansion: outer ring (survey-derived) ----------------
// Generated offline from the OSM/satellite survey (buildings_merged.json) by
// scratchpad expansion/gen_plan.js, pre-clipped against every existing
// building/collider/lot so nothing overlaps the hand-built core.
// EXP_ROADS entry: [cls, x0,z0, x1,z1, ...] polyline.
//   cls 0 arterial (hw14, dashed-lane texture — the Race Track Rd NE bend and
//   the Countryway Blvd SE bend), 1 collector (hw6.5), 2 residential (hw5.5),
//   3 local lane (hw4.5). Non-arterials get plain asphalt + sidewalks.
// EXP_PONDS: [x, z, rx, rz] — flat NON-swimmable retention ponds (no bed/
//   underwater support like the lake; the player just wades ankle-deep).
// EXP_FOREST: [x0, x1, z0, z1, oakCount] — impassable forest patches.
var EXP_ROADS = [
  [0, 340, 0, 430, -35, 520, -115, 600, -200],
  [0, 0, 340, 60, 375, 200, 428, 248, 462, 272, 510, 278, 600],
  [1, -71, 40, -77, 52, -98, 118, -110, 142, -124, 162],
  [3, -124, 162, -158, 197],
  [3, -158, 197, -130, 204, -121, 220, -120, 235, -140, 244, -200, 250, -283, 246],
  [1, -283, 246, -303, 223, -332, 196, -355, 143, -372, 137, -394, 77, -397, 14],
  [3, -355, 143, -352, 100, -358, 80, -370, 64],
  [1, 457, -59, 457, 120, 452, 300, 457, 530],
  [1, 216, 162, 199, 171, 189, 222, 261, 261],
  [1, 457, 160, 552, 158],
  [2, -382, -101, -338, -100],
  [2, -382, -164, -377, -129, -381, -98, -381, -14],
  [2, -219, -326, -140, -327, -74, -344, -16, -344],
  [2, -159, -257, -109, -316, -79, -345],
  [2, -147, -318, -102, -262],
  [2, -95, -211, -73, -198, -16, -198],
  [2, -129, -163, -100, -183, -79, -187, -68, -170],
  [2, -154, -42, -154, -14],
  [2, 11, 121, 34, 101, 50, 90, 60, 86],
  [2, 60, 86, 82, 92, 108, 92],
  [2, 11, 152, 48, 144, 79, 140, 103, 144],
  [2, 11, 190, 99, 179, 106, 175],
  [2, 86, 97, 65, 117, 41, 132, 24, 140, 16, 148],
  [2, 103, 144, 110, 202, 106, 230, 89, 245, 44, 261, 31, 280, 22, 298, 16, 270, 16, 156, 11, 152],
  [2, 261, 261, 266, 277, 295, 280, 357, 278, 366, 264, 367, 262, 357, 247, 325, 246, 295, 248, 270, 252, 261, 261],
  [2, 367, 262, 452, 262],
  [2, 165, 358, 261, 378, 255, 430, 249, 460],
  [2, 227, 507, 254, 508, 271, 511],
  [2, 361, 520, 390, 506, 422, 511, 457, 530],
  [2, 388, 450, 431, 444, 457, 454],
  [2, 460, 436, 498, 441, 543, 428],
  [2, 456, 470, 550, 463],
  [2, 489, 541, 531, 493, 543, 466],
  [2, 378, 367, 457, 368],
  [2, 402, 367, 403, 404, 409, 430],
  [2, 514, 357, 519, 396, 531, 430],
  [2, 457, 364, 511, 360],
  [2, 457, 377, 510, 374],
  [2, 457, 391, 515, 391],
  [2, 457, 244, 498, 240, 544, 250],
  [2, 399, 184, 432, 201, 432, 244, 449, 266, 457, 268],
  [2, 305, 97, 293, 123, 291, 142, 295, 160, 305, 173, 328, 194, 399, 184],
  [2, 370, 80, 394, 60, 422, 23, 457, 20],
  [2, 370, 80, 365, 130, 365, 190],
  [2, 422, 23, 442, 42, 457, 44],
  [2, 457, 25, 552, 26],
  [2, 537, 26, 539, 116],
  [2, 552, 158, 539, 131, 539, 116]
];
var EXP_PONDS = [[401, -195, 50, 44], [127, 304, 12, 62], [-78, 313, 20, 26], [-319, 275, 23, 18], [-401, 386, 20, 18], [115, 58, 26, 11], [-190, 116, 15, 17], [163, 181, 17, 12], [-253, 376, 14, 12], [315, 484, 8, 16], [239, 280, 9, 9], [304, 66, 8, 13], [539, 279, 8, 10]];
var EXP_FOREST = [[-564, -360, -576, -396, 16], [60, 324, -576, -396, 16], [-324, -60, -564, -396, 16], [384, 564, -564, -384, 16], [-288, -264, -324, -216, 4], [-264, -228, -312, -252, 3], [-228, -204, -300, -252, 2], [336, 420, -300, -252, 6], [-576, -468, -264, -60, 16], [-264, -240, -252, -216, 2], [17, 36, -108, -60, 2], [216, 300, -108, -48, 7], [-360, -336, -72, -24, 2], [-288, -264, -60, -20, 2], [84, 120, -60, -24, 2], [-264, -168, -48, -24, 3], [-300, -276, 20, 36, 2], [228, 300, 20, 36, 3], [-384, -336, 24, 48, 2], [240, 288, 48, 72, 2], [-576, -456, 60, 264, 16], [17, 36, 60, 84, 2], [-288, -228, 72, 108, 3], [252, 288, 72, 120, 3], [228, 252, 84, 228, 5], [-456, -396, 96, 168, 7], [252, 276, 120, 240, 4], [-264, -228, 156, 192, 2], [-456, -408, 168, 192, 2], [-264, -240, 192, 216, 2], [-204, -168, 192, 240, 3], [-456, -432, 204, 228, 2], [372, 420, 204, 252, 3], [-444, -420, 228, 252, 2], [-264, -144, 264, 360, 16], [60, 96, 264, 348, 4], [-144, -120, 276, 564, 10], [372, 420, 276, 324, 3], [336, 372, 288, 324, 2], [-444, -360, 300, 348, 6], [228, 252, 312, 348, 2], [-348, -312, 324, 408, 4], [-564, -456, 336, 564, 16], [564, 588, 336, 432, 3], [-312, -288, 348, 408, 2], [-108, -72, 348, 384, 2], [-228, -144, 360, 564, 16], [0, 24, 372, 456, 3], [156, 180, 372, 396, 2], [-108, -84, 384, 564, 7], [24, 48, 384, 456, 3], [-84, -36, 396, 564, 12], [48, 72, 396, 456, 2], [-264, -228, 408, 564, 8], [72, 96, 408, 456, 2], [96, 132, 420, 456, 2], [132, 168, 432, 456, 2], [-444, -300, 444, 564, 16], [300, 336, 504, 528, 2]];

// minimap registers for the expansion (drawMinimap reads these)
var mapRoads = [];   // {x1,z1,x2,z2,hw,cls}
var mapPonds = [];   // {x,z,rx,rz}

var EXP_HW = [14, 6.5, 5.5, 4.5];
// plain asphalt for collectors/residentials (no lane paint); arterial bends
// reuse the dashed roadT so they read like the roads they continue
var expResT = tex(128, function (g, s) {
  g.fillStyle = '#3d3e43'; g.fillRect(0, 0, s, s);
  noise(g, s, 700, 0.14, 0.05);
});
var expArtT = roadT.clone(); expArtT.needsUpdate = true;
var expArtM = lamb({ map: expArtT });
var expResM = lamb({ map: expResT });
var expWalkT = walkT.clone(); expWalkT.needsUpdate = true;
var expWalkM = lamb({ map: expWalkT });
// distinct y per polyline (ladder) so touching roads never sit coplanar;
// everything stays above pads (.13) and below the crosswalks (.165)
function expPolyY(idx) { return 0.137 + ((idx * 7) % 11) * 0.002; }
function expRoadPoly(idx, data) {
  var cls = data[0], hw = EXP_HW[cls];
  var y = cls === 0 ? 0.159 : expPolyY(idx);
  var sy = 0.1256 + ((idx * 3) % 5) * 0.0016;   // sidewalk layer ladder
  var nSeg = (data.length - 1) / 2 - 1;
  for (var s = 0; s < nSeg; s++) {
    var x1 = data[1 + s * 2], z1 = data[2 + s * 2], x2 = data[3 + s * 2], z2 = data[4 + s * 2];
    var dx = x2 - x1, dz = z2 - z1, L = Math.sqrt(dx * dx + dz * dz);
    if (L < 3) continue;
    var ang = Math.atan2(dz, dx), ux = dx / L, uz = dz / L;
    var mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    var geo = new THREE.PlaneGeometry(L, hw * 2);
    var uv = geo.attributes.uv;
    for (var i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * L / 16);
    geo.rotateX(-Math.PI / 2);
    var mesh = new THREE.Mesh(geo, cls === 0 ? expArtM : expResM);
    mesh.position.set(mx, y, mz); mesh.rotation.y = -ang;
    scene.add(mesh);
    mapRoads.push({ x1: x1, z1: z1, x2: x2, z2: z2, hw: hw, cls: cls });
    // joint disc fills the elbow wedge at interior bends
    if (s > 0) {
      var disc = new THREE.Mesh(new THREE.CircleGeometry(hw, 10), cls === 0 ? expArtM : expResM);
      disc.geometry.rotateX(-Math.PI / 2);
      disc.position.set(x1, y - 0.0012, z1); disc.rotation.y = -ang;
      scene.add(disc);
    }
    // flanking sidewalks (both sides); trimmed at the polyline's outer ends so
    // they don't overlap the core roads' own sidewalk strips at junctions
    var t0 = (s === 0 ? 6 : -1.7), t1 = L - (s === nSeg - 1 ? 6 : -1.7);
    var SL = t1 - t0;
    if (SL > 5) {
      var sw = cls === 0 ? 5 : 3.4, off = hw + sw / 2 + 0.6;
      var cx2 = x1 + ux * (t0 + t1) / 2, cz2 = z1 + uz * (t0 + t1) / 2;
      for (var side = -1; side <= 1; side += 2) {
        var sg = new THREE.PlaneGeometry(SL, sw);
        var suv = sg.attributes.uv;
        for (var si = 0; si < suv.count; si++) suv.setX(si, suv.getX(si) * SL / 8);
        sg.rotateX(-Math.PI / 2);
        var sm = new THREE.Mesh(sg, expWalkM);
        sm.position.set(cx2 - uz * off * side, sy, cz2 + ux * off * side);
        sm.rotation.y = -ang;
        scene.add(sm);
      }
    }
  }
}
// WC_REMAP: EVERY road (core legs + outer ring) renders from remapdata.js
// true polylines instead — buildRemapRoads registers the same mapRoads
// entries, so every downstream consumer (expClear, NPC walk tables, minimap)
// follows the true network automatically.
if (!WC_REMAP) { for (var eri = 0; eri < EXP_ROADS.length; eri++) expRoadPoly(eri, EXP_ROADS[eri]); }
else buildRemapRoads();

// retention ponds: sandy shore disc + still water disc; .lake-flagged collider
// blocks NPCs/cops/cars while the player can wade (no swimming — these have
// no sunken bed / underwater handling like the big lake)
var expShoreM = lamb({ color: 0xb9a778 });
var expWaterM = phong({ color: 0x3f82ae, shininess: 90, specular: 0xbbddee, transparent: true, opacity: 0.6, depthWrite: false });
function expPond(x, z, rx, rz) {
  var shore = new THREE.Mesh(new THREE.CircleGeometry(1, 22), expShoreM);
  shore.rotation.x = -Math.PI / 2; shore.scale.set(rx + 2.6, rz + 2.6, 1);
  shore.position.set(x, 0.045, z); scene.add(shore);
  var w = new THREE.Mesh(new THREE.CircleGeometry(1, 22), expWaterM);
  w.rotation.x = -Math.PI / 2; w.scale.set(rx, rz, 1);
  w.position.set(x, 0.16, z); scene.add(w);
  colliders.push({ x0: x - rx * 0.92, x1: x + rx * 0.92, z0: z - rz * 0.92, z1: z + rz * 0.92, lake: true });
  mapPonds.push({ x: x, z: z, rx: rx, rz: rz });
}
for (var epi = 0; epi < EXP_PONDS.length; epi++) {
  var epd = EXP_PONDS[epi];
  // remap: drop ponds the true roads now run through (they were placed
  // against the axis network); the survey re-stamp (R3/R4) re-sites them
  if (WC_REMAP && !remapRectClear(epd[0] - epd[2], epd[0] + epd[2], epd[1] - epd[3], epd[1] + epd[3], 1)) continue;
  expPond(epd[0], epd[1], epd[2], epd[3]);
}

for (var efi = 0; efi < EXP_FOREST.length; efi++) {
  var ef = EXP_FOREST[efi];
  forestPatch(ef[0], ef[1], ef[2], ef[3], ef[4]);
}

// ---- instanced forest fill (invisible-barrier fix) ----
// Every EXP_FOREST rect carries an impassable collider, but the budgeted
// per-patch oak counts above (~1 tree per 3000u^2 on the big ring patches)
// are far too sparse to read as forest — players walked across open-looking
// grass and slammed into the rect edge ("invisible walls"). Fill each rect
// with a dense tree LINE just inside its collider edges plus interior
// scatter, rendered as per-patch THREE.InstancedMesh chunks (shared pack-prop
// geometry/material, explicit bounding spheres so frustum culling still
// works). Fill trees are visuals only — not breakable, no colliders — the
// patch collider already keeps players/cars/NPCs out of reach.
var expFillPts = [];   // [x,z] of every fill tree (debug/audit)
(function expForestFill() {
  var props = [getPackProp('oak1'), getPackProp('oak2'), getPackProp('oak3')];
  if (!props[0] || !props[1] || !props[2]) return;   // prop pack absent -> keep old sparse look
  var bushP = [getPackProp('bush1'), getPackProp('bush2')].filter(Boolean);   // understory
  var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  // include the core patches too: their random count-based planting leaves
  // 15-25u bare gaps along their collider edges (same invisible-wall feel)
  var fillRects = EXP_FOREST.concat([[-330, -300, -120, -22], [-330, -300, 22, 120],
    [96, 200, -232, -120], [120, 210, 74, 158], [150, 300, -300, -230]]);
  for (var i = 0; i < fillRects.length; i++) {
    var f = fillRects[i], x0 = f[0], x1 = f[1], z0 = f[2], z1 = f[3];
    var w = x1 - x0, d = z1 - z0, pts = [], j;
    // tree line along each collider edge (the wall the player actually hits)
    var nx = Math.max(2, Math.round(w / 13)), nz = Math.max(2, Math.round(d / 13));
    for (j = 0; j < nx; j++) {
      var ex = x0 + (j + 0.5) / nx * w + (Math.random() - 0.5) * 4;
      pts.push([ex, z0 + 1.5 + Math.random() * 5]);
      pts.push([ex, z1 - 1.5 - Math.random() * 5]);
    }
    for (j = 0; j < nz; j++) {
      var ez = z0 + (j + 0.5) / nz * d + (Math.random() - 0.5) * 4;
      pts.push([x0 + 1.5 + Math.random() * 5, ez]);
      pts.push([x1 - 1.5 - Math.random() * 5, ez]);
    }
    // interior scatter — dense Florida hammock: ~1 canopy tree per 300u^2,
    // loosely clustered so the floor reads covered, not a regular grid
    var ni = Math.round(w * d / 340);
    for (j = 0; j < ni; j++) {
      if (j % 4 === 0 || pts.length === 0) { pts.push([x0 + 2 + Math.random() * (w - 4), z0 + 2 + Math.random() * (d - 4)]); }
      else { var an = pts[pts.length - 1]; pts.push([Math.max(x0 + 1, Math.min(x1 - 1, an[0] + (Math.random() - 0.5) * 16)), Math.max(z0 + 1, Math.min(z1 - 1, an[1] + (Math.random() - 0.5) * 16))]); }
    }
    // understory (low wide shrubs / palmetto clumps) — denser than the canopy
    var upts = [];
    var nu = bushP.length ? Math.round(w * d / 150) : 0;
    for (j = 0; j < nu; j++) upts.push([x0 + 1 + Math.random() * (w - 2), z0 + 1 + Math.random() * (d - 2)]);
    // remap: keep fill trees off the true road ribbons (visual-only trees
    // standing on the new diagonals would read as broken; the patch colliders
    // are already split around the roads by the forestPatch guard)
    var keep = function (fp) { return (!WC_REMAP || remapPointClear(fp[0], fp[1], 2.5)) && !inLake(fp[0], fp[1]); };
    pts = pts.filter(keep);
    upts = upts.filter(keep);
    // bucket by prop, one InstancedMesh per prop per patch
    var buckets = [[], [], []];
    for (j = 0; j < pts.length; j++) { buckets[(Math.random() * 3) | 0].push(pts[j]); expFillPts.push(pts[j]); }
    var sphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, 5, (z0 + z1) / 2), Math.sqrt(w * w + d * d) / 2 + 12);
    for (var b = 0; b < 3; b++) {
      var list = buckets[b];
      if (!list.length) continue;
      var pp = props[b];
      // new geometry sharing the prop's attribute arrays, own bounds for culling
      var cg = new THREE.BufferGeometry();
      cg.setAttribute('position', pp.geo.getAttribute('position'));
      cg.setAttribute('uv', pp.geo.getAttribute('uv'));
      cg.setAttribute('normal', pp.geo.getAttribute('normal'));
      cg.boundingSphere = sphere;
      var im = new THREE.InstancedMesh(cg, pp.mat, list.length);
      for (j = 0; j < list.length; j++) {
        // wide height spread (0.6-1.65) so canopy layers instead of a flat top
        var sc = 8.5 * (0.6 + Math.random() * Math.random() * 1.65) / pp.h;
        q.setFromAxisAngle(Y_UP, Math.random() * Math.PI * 2);
        pv.set(list[j][0], 0, list[j][1]); sv.set(sc, sc, sc);
        m4.compose(pv, q, sv);
        im.setMatrixAt(j, m4);
      }
      im.instanceMatrix.needsUpdate = true;
      scene.add(im);
    }
    // understory shrubs bucketed across the bush props (culled by patch sphere)
    if (upts.length) {
      var ubuckets = bushP.map(function () { return []; });
      for (j = 0; j < upts.length; j++) ubuckets[(Math.random() * bushP.length) | 0].push(upts[j]);
      for (var ub = 0; ub < bushP.length; ub++) {
        var ul = ubuckets[ub]; if (!ul.length) continue;
        var bp = bushP[ub];
        var ubg = new THREE.BufferGeometry();
        ubg.setAttribute('position', bp.geo.getAttribute('position'));
        ubg.setAttribute('uv', bp.geo.getAttribute('uv'));
        ubg.setAttribute('normal', bp.geo.getAttribute('normal'));
        ubg.boundingSphere = sphere;
        var uim = new THREE.InstancedMesh(ubg, bp.mat, ul.length);
        for (j = 0; j < ul.length; j++) {
          var uw = (1.0 + Math.random() * 1.6) / bp.h;   // low + wide (palmetto-ish)
          q.setFromAxisAngle(Y_UP, Math.random() * Math.PI * 2);
          pv.set(ul[j][0], 0, ul[j][1]); sv.set(uw, uw * (0.55 + Math.random() * 0.35), uw);
          m4.compose(pv, q, sv);
          uim.setMatrixAt(j, m4);
        }
        uim.instanceMatrix.needsUpdate = true;
        scene.add(uim);
      }
    }
    // one instanced shadow blob layer per patch
    var sg = new THREE.BufferGeometry();
    sg.setAttribute('position', shadowGeo.getAttribute('position'));
    sg.setAttribute('uv', shadowGeo.getAttribute('uv'));
    sg.setAttribute('normal', shadowGeo.getAttribute('normal'));
    sg.setIndex(shadowGeo.getIndex());
    sg.boundingSphere = sphere;
    var sm = new THREE.InstancedMesh(sg, shadowMat, pts.length);
    for (j = 0; j < pts.length; j++) {
      var ss = 1.7 + Math.random();
      q.set(0, 0, 0, 1); pv.set(pts[j][0], 0.05, pts[j][1]); sv.set(ss, 1, ss);
      m4.compose(pv, q, sv);
      sm.setMatrixAt(j, m4);
    }
    sm.instanceMatrix.needsUpdate = true;
    scene.add(sm);
  }
})();

// ---- merged forest-floor cover ----
// One dark leaf-litter quad under every forest patch, all merged into a single
// BufferGeometry (1 draw call). Covers the bright turf under the dense canopy
// so the floor reads as shaded forest litter. Inset a few units so its edge
// falls under the edge tree line (no hard dark rectangle on the open grass).
(function forestFloorCover() {
  if (!mapForest.length) return;
  var TS = 9, pos = [], uv = [], nrm = [], inset = 3;
  for (var i = 0; i < mapForest.length; i++) {
    var r = mapForest[i];
    var ax = r.x0 + inset, bx = r.x1 - inset, az = r.z0 + inset, bz = r.z1 - inset;
    if (bx - ax < 4 || bz - az < 4) continue;
    // two triangles, y just above the base grass plane
    var y = 0.06;
    var q = [[ax, az], [bx, az], [bx, bz], [ax, bz]];
    var tri = [0, 1, 2, 0, 2, 3];
    for (var t = 0; t < 6; t++) { var p = q[tri[t]]; pos.push(p[0], y, p[1]); uv.push(p[0] / TS, p[1] / TS); nrm.push(0, 1, 0); }
  }
  if (!pos.length) return;
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
  var ftex = forestFloorT.clone(); ftex.needsUpdate = true; ftex.repeat.set(1, 1);
  // DoubleSide: the merged quads are wound front-down, so a single-sided
  // material would backface-cull the whole cover when viewed from above.
  var fmat = lamb({ map: ftex, side: THREE.DoubleSide });
  fmat.polygonOffset = true; fmat.polygonOffsetFactor = -2; fmat.polygonOffsetUnits = -2;
  var fm = new THREE.Mesh(g, fmat); fm.frustumCulled = false;
  scene.add(fm);
})();

// keep random scatter off the new roads/ponds
function expClear(x, z, m) {
  var i;
  for (i = 0; i < mapRoads.length; i++) {
    var r = mapRoads[i];
    var ddx = r.x2 - r.x1, ddz = r.z2 - r.z1, L2 = ddx * ddx + ddz * ddz || 1;
    var t = ((x - r.x1) * ddx + (z - r.z1) * ddz) / L2;
    t = Math.max(0, Math.min(1, t));
    var px = r.x1 + ddx * t - x, pz = r.z1 + ddz * t - z;
    if (px * px + pz * pz < (r.hw + m) * (r.hw + m)) return false;
  }
  for (i = 0; i < mapPonds.length; i++) {
    var p = mapPonds[i];
    if (Math.abs(x - p.x) < p.rx + m && Math.abs(z - p.z) < p.rz + m) return false;
  }
  return true;
}

// ---------------- remap engine (R2): true-geometry world ----------------
// DORMANT unless WC_REMAP (flag at the top of the file). Data contract:
// remapdata.js — REMAP_ROADS (85 smoothed/densified polylines with per-class
// half-widths), REMAP_EXITS (6 perimeter exits + inward road direction),
// REMAP_CLEAR (venue footprints/parking polys the sidewalks leave gaps for).
// Provides: triangulated road ribbons + junction pads, sidewalk ribbons,
// perimeter walls/barriers at the true exits, a polyline traffic lane graph
// (RM.edges/RM.nodes) that replaces the axis lane spawner, and the core NPC
// sidewalk table. Venue/building relocation is R3 — legacy landmarks coexist
// (some straddle the new diagonals; accepted until R3 re-anchors them).
// NOTE: bare declaration — buildRemapRoads() is CALLED earlier (road section,
// ~L1575) than this line sits textually; `var` hoists so that call is valid,
// but a `= null` initializer here would re-run at load AFTER the call and
// clobber the built graph back to null. Leave it uninitialized (undefined ==
// falsy, same as the old null for the `if (RM …)` guards).
var RM;   // set by buildRemapRoads() when WC_REMAP

// distance-to-network guards (raw REMAP_ROADS — usable before RM exists).
// true when (x,z) is at least `pad` outside the asphalt of every true road.
function remapPointClear(x, z, pad) {
  if (typeof REMAP_ROADS === 'undefined') return true;
  for (var i = 0; i < REMAP_ROADS.length; i++) {
    var r = REMAP_ROADS[i], pts = r.pts, lim = r.hw + pad;
    for (var j = 0; j < pts.length - 1; j++) {
      var ax = pts[j][0], az = pts[j][1], bx = pts[j + 1][0], bz = pts[j + 1][1];
      if (x < (ax < bx ? ax : bx) - lim || x > (ax > bx ? ax : bx) + lim ||
          z < (az < bz ? az : bz) - lim || z > (az > bz ? az : bz) + lim) continue;
      var dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      var t = ((x - ax) * dx + (z - az) * dz) / L2;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      var px = ax + dx * t - x, pz = az + dz * t - z;
      if (px * px + pz * pz < lim * lim) return false;
    }
  }
  return true;
}
// true when the axis rect keeps `pad` clearance from every true road
// (segments sampled every 4u — load-time checks only)
function remapRectClear(x0, x1, z0, z1, pad) {
  if (typeof REMAP_ROADS === 'undefined') return true;
  for (var i = 0; i < REMAP_ROADS.length; i++) {
    var r = REMAP_ROADS[i], pts = r.pts, lim = r.hw + pad;
    var ex0 = x0 - lim, ex1 = x1 + lim, ez0 = z0 - lim, ez1 = z1 + lim;
    for (var j = 0; j < pts.length - 1; j++) {
      var ax = pts[j][0], az = pts[j][1], bx = pts[j + 1][0], bz = pts[j + 1][1];
      if ((ax < ex0 && bx < ex0) || (ax > ex1 && bx > ex1) || (az < ez0 && bz < ez0) || (az > ez1 && bz > ez1)) continue;
      var L = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
      var n = Math.max(1, Math.ceil(L / 4));
      for (var k = 0; k <= n; k++) {
        var sx = ax + (bx - ax) * k / n, sz = az + (bz - az) * k / n;
        if (sx > ex0 && sx < ex1 && sz > ez0 && sz < ez1) return false;
      }
    }
  }
  return true;
}
// point inside one of the venue clearance shapes (footprint OBBs expanded by
// `grow`, parking polys) — sidewalk ribbons break here so R3's aprons fit
function remapInClear(x, z, grow) {
  if (typeof REMAP_CLEAR === 'undefined') return false;
  for (var i = 0; i < REMAP_CLEAR.length; i++) {
    var c = REMAP_CLEAR[i];
    if (c.poly) {
      var inP = false, p = c.poly;
      for (var a = 0, b = p.length - 1; a < p.length; b = a++) {
        if ((p[a][1] > z) !== (p[b][1] > z) && x < (p[b][0] - p[a][0]) * (z - p[a][1]) / (p[b][1] - p[a][1]) + p[a][0]) inP = !inP;
      }
      if (inP) return true;
    } else {
      if (c._c === undefined) { var ra = (c.rot || 0) * Math.PI / 180; c._c = Math.cos(ra); c._s = Math.sin(ra); }
      var dx = x - c.x, dz = z - c.z;
      var u = dx * c._c - dz * c._s, v = dx * c._s + dz * c._c;
      if (Math.abs(u) < c.w / 2 + grow && Math.abs(v) < c.d / 2 + grow) return true;
    }
  }
  return false;
}
// project (x,z) on a polyline -> {s: chainage, d: distance}
function rmProject(pts, cum, x, z) {
  var bs = 0, bd = 1e9;
  for (var j = 0; j < pts.length - 1; j++) {
    var ax = pts[j][0], az = pts[j][1], bx = pts[j + 1][0], bz = pts[j + 1][1];
    var dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    var t = ((x - ax) * dx + (z - az) * dz) / L2;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    var px = ax + dx * t - x, pz = az + dz * t - z;
    var d2 = px * px + pz * pz;
    if (d2 < bd) { bd = d2; bs = cum[j] + Math.sqrt(L2) * t; }
  }
  return { s: bs, d: Math.sqrt(bd) };
}
function rmCum(pts) {
  var cum = [0];
  for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.sqrt((pts[i][0] - pts[i - 1][0]) * (pts[i][0] - pts[i - 1][0]) + (pts[i][1] - pts[i - 1][1]) * (pts[i][1] - pts[i - 1][1])));
  return cum;
}
// point + unit tangent at chainage s of a polyline (clamped)
function rmAt(pts, cum, s) {
  var n = pts.length, len = cum[n - 1];
  if (s <= 0) s = 0; if (s >= len) s = len;
  var lo = 0, hi = n - 1;
  while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
  var segL = cum[lo + 1] - cum[lo] || 1;
  var t = (s - cum[lo]) / segL;
  var ax = pts[lo][0], az = pts[lo][1], bx = pts[lo + 1][0], bz = pts[lo + 1][1];
  var ux = (bx - ax) / segL, uz = (bz - az) / segL;
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, ux: ux, uz: uz };
}
// per-vertex averaged (miter) normals of a polyline: returns [[nx,nz,scale]…]
function rmNormals(pts) {
  var out = [], n = pts.length;
  for (var i = 0; i < n; i++) {
    var p = pts[i > 0 ? i - 1 : 0], q = pts[i < n - 1 ? i + 1 : n - 1];
    var t1x = pts[i][0] - p[0], t1z = pts[i][1] - p[1];
    var t2x = q[0] - pts[i][0], t2z = q[1] - pts[i][1];
    var l1 = Math.sqrt(t1x * t1x + t1z * t1z) || 1, l2 = Math.sqrt(t2x * t2x + t2z * t2z) || 1;
    t1x /= l1; t1z /= l1; t2x /= l2; t2z /= l2;
    var mx = t1x + t2x, mz = t1z + t2z, ml = Math.sqrt(mx * mx + mz * mz);
    if (ml < 0.001) { mx = t2x; mz = t2z; ml = 1; }
    mx /= ml; mz /= ml;
    // miter compensation so the ribbon keeps width through bends (clamped —
    // the polylines are arc-smoothed, so this stays near 1)
    var sc = 1 / Math.max(0.667, mx * t2x + mz * t2z);
    out.push([-mz, mx, Math.min(1.5, sc)]);
  }
  return out;
}
// triangulated ribbon along a polyline. uScale: texture repeats per unit of
// chainage (baked into UVs); vMax: across-ribbon V at the +normal edge.
function remapRibbon(pts, hw, y, mat, uScale, vMax) {
  var n = pts.length;
  if (n < 2) return null;
  var nor = rmNormals(pts), cum = rmCum(pts);
  var pos = new Float32Array(n * 6), nrm = new Float32Array(n * 6), uv = new Float32Array(n * 4);
  for (var i = 0; i < n; i++) {
    var w = hw * nor[i][2], nx = nor[i][0], nz = nor[i][1];
    pos[i * 6] = pts[i][0] - nx * w; pos[i * 6 + 1] = y; pos[i * 6 + 2] = pts[i][1] - nz * w;
    pos[i * 6 + 3] = pts[i][0] + nx * w; pos[i * 6 + 4] = y; pos[i * 6 + 5] = pts[i][1] + nz * w;
    nrm[i * 6 + 1] = 1; nrm[i * 6 + 4] = 1;
    var u = cum[i] * uScale;
    uv[i * 4] = u; uv[i * 4 + 1] = 0; uv[i * 4 + 2] = u; uv[i * 4 + 3] = vMax || 1;
  }
  var idx = [];
  for (i = 0; i < n - 1; i++) {
    var a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  var mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  return mesh;
}
// offset copy of a polyline (side*dist along the averaged normals)
function rmOffsetPts(pts, off) {
  var nor = rmNormals(pts), out = [];
  for (var i = 0; i < pts.length; i++) out.push([pts[i][0] + nor[i][0] * off * nor[i][2], pts[i][1] + nor[i][1] * off * nor[i][2]]);
  return out;
}

function buildRemapRoads() {
  RM = { roads: [], edges: [], nodes: [], pads: [], coreWalk: [], laneLen: 0 };
  RM.coreWalk.total = 0;
  var dirtT = tex(128, function (g, s) {
    g.fillStyle = '#8a744f'; g.fillRect(0, 0, s, s);
    noise(g, s, 700, 0.18, 0.08);
    g.fillStyle = 'rgba(60,48,30,0.25)';
    g.fillRect(0, s * 0.32 - 3, s, 6); g.fillRect(0, s * 0.68 - 3, s, 6);   // wheel ruts
  });
  var dirtM = lamb({ map: dirtT });
  var i, j, r;
  // parsed roads with cumulative chainage
  for (i = 0; i < REMAP_ROADS.length; i++) {
    r = REMAP_ROADS[i];
    RM.roads.push({ id: r.id, cls: r.cls, hw: r.hw, dirt: !!r.dirt, pts: r.pts, cum: rmCum(r.pts) });
  }
  // ---- stitch points: road endpoints touching another road (<=3.5u) ----
  // every stitch gets a junction pad; stitches between lane-graph roads
  // (cls<=1) also split the traffic edges so cars can turn there
  var stitches = [];   // {x,z,ri (touched road), s, hw (max of pair), lane:bool}
  for (i = 0; i < RM.roads.length; i++) {
    var re = RM.roads[i];
    var ends = [re.pts[0], re.pts[re.pts.length - 1]];
    for (var ei = 0; ei < 2; ei++) {
      for (j = 0; j < RM.roads.length; j++) {
        if (j === i) continue;
        var ro = RM.roads[j];
        var pr = rmProject(ro.pts, ro.cum, ends[ei][0], ends[ei][1]);
        if (pr.d > 3.5) continue;
        stitches.push({ x: ends[ei][0], z: ends[ei][1], ri: j, s: pr.s, hw: Math.max(re.hw, ro.hw), lane: re.cls <= 1 && ro.cls <= 1 });
      }
    }
  }
  // ---- junction pads (merged within 8u; radius from the widest road) ----
  for (i = 0; i < stitches.length; i++) {
    var st = stitches[i], merged = false;
    for (j = 0; j < RM.pads.length; j++) {
      var pd = RM.pads[j];
      var ddx = pd.x - st.x, ddz = pd.z - st.z;
      if (ddx * ddx + ddz * ddz < 64) { pd.r = Math.max(pd.r, st.hw * 1.8); merged = true; break; }
    }
    if (!merged) RM.pads.push({ x: st.x, z: st.z, r: st.hw * 1.8 });
  }
  // ---- render ribbons + registers ----
  for (i = 0; i < RM.roads.length; i++) {
    r = RM.roads[i];
    var y = 0.14 + ((i * 7) % 11) * 0.0018;   // per-road y ladder: no coplanar overlaps
    var mat = r.dirt ? dirtM : (r.cls === 0 ? expArtM : expResM);
    remapRibbon(r.pts, r.hw, y, mat, 1 / 16, 1);
    // minimap / walk-table / scatter-clearance register (decimated polyline)
    var cum = r.cum, len = cum[cum.length - 1];
    var li = 0;
    for (j = 1; j < r.pts.length; j++) {
      var isLast = j === r.pts.length - 1;
      var ax2 = r.pts[li][0], az2 = r.pts[li][1], bx2 = r.pts[j][0], bz2 = r.pts[j][1];
      var chord = Math.sqrt((bx2 - ax2) * (bx2 - ax2) + (bz2 - az2) * (bz2 - az2));
      if (!isLast && cum[j] - cum[li] < 12 && cum[j] - cum[li] - chord < 0.35) continue;
      if (chord > 2) {
        mapRoads.push({ x1: ax2, z1: az2, x2: bx2, z2: bz2, hw: r.hw, cls: r.cls });
        // core NPC walk table: walkable-class segments near the junction
        var mx2 = (ax2 + bx2) / 2, mz2 = (az2 + bz2) / 2;
        if (r.cls <= 2 && !r.dirt && mx2 * mx2 + mz2 * mz2 < 190 * 190 && chord > 14) {
          RM.coreWalk.push({ x: ax2, z: az2, ux: (bx2 - ax2) / chord, uz: (bz2 - az2) / chord, L: chord, hw: r.hw, sw: r.cls === 0 ? 5 : 3.4 });
          RM.coreWalk.total += chord;
        }
      }
      li = j;
    }
    // ---- sidewalk ribbons (arterials/collectors/residentials, not tracks) ----
    if (r.cls <= 2 && !r.dirt) {
      var sw = r.cls === 0 ? 5 : 3.4, off = r.hw + sw / 2 + 0.6;
      var sy = 0.1225 + ((i * 3) % 5) * 0.0014;
      for (var side = -1; side <= 1; side += 2) {
        var opts = rmOffsetPts(r.pts, off * side);
        // break the ribbon at junction pads and venue clearance shapes
        var run = [];
        for (j = 0; j < opts.length; j++) {
          var keep = !remapInClear(opts[j][0], opts[j][1], 1.2);
          if (keep) {
            for (var pj = 0; pj < RM.pads.length; pj++) {
              var pd2 = RM.pads[pj];
              var pdx = opts[j][0] - pd2.x, pdz = opts[j][1] - pd2.z;
              if (pdx * pdx + pdz * pdz < (pd2.r + 2) * (pd2.r + 2)) { keep = false; break; }
            }
          }
          // also break where this sidewalk would lie on ANOTHER road's asphalt
          // (mid-road X-crossings form no junction pad, so they weren't clipped).
          // pad 1 < sw/2+0.6, so the ribbon's own parent road never self-clips.
          if (keep && !remapPointClear(opts[j][0], opts[j][1], 1)) keep = false;
          if (keep) run.push(opts[j]);
          else { if (run.length > 1) remapRibbon(run, sw / 2, sy, expWalkM, 1 / 8, sw / 8); run = []; }
        }
        if (run.length > 1) remapRibbon(run, sw / 2, sy, expWalkM, 1 / 8, sw / 8);
      }
    }
  }
  // junction pad discs (below every ribbon rung so lane paint runs onto them)
  var padGeo = new THREE.CircleGeometry(1, 20); padGeo.rotateX(-Math.PI / 2);
  for (i = 0; i < RM.pads.length; i++) {
    var pad = new THREE.Mesh(padGeo, expResM);
    pad.scale.set(RM.pads[i].r, 1, RM.pads[i].r);
    pad.position.set(RM.pads[i].x, 0.134, RM.pads[i].z);
    scene.add(pad);
  }
  buildRemapLanes(stitches);
}

// ---- traffic lane graph: polyline edges + junction nodes ----
function buildRemapLanes(stitches) {
  var i, j;
  // split chainages per lane-graph road (cls<=1)
  var splits = {};
  for (i = 0; i < stitches.length; i++) {
    var st = stitches[i];
    if (!st.lane) continue;
    (splits[st.ri] = splits[st.ri] || []).push(st.s);
  }
  for (i = 0; i < RM.roads.length; i++) {
    var r = RM.roads[i];
    if (r.cls > 1 || r.dirt) continue;
    var len = r.cum[r.cum.length - 1];
    var cuts = [0].concat(splits[i] || []).concat([len]);
    cuts.sort(function (a, b) { return a - b; });
    for (j = 0; j < cuts.length - 1; j++) {
      var s0 = cuts[j], s1 = cuts[j + 1];
      if (s1 - s0 < 10) continue;   // merged / duplicate stitches
      // cut the polyline at [s0,s1]
      var pts = [], k;
      var a0 = rmAt(r.pts, r.cum, s0), a1 = rmAt(r.pts, r.cum, s1);
      pts.push([a0.x, a0.z]);
      for (k = 0; k < r.pts.length; k++) if (r.cum[k] > s0 + 0.5 && r.cum[k] < s1 - 0.5) pts.push(r.pts[k]);
      pts.push([a1.x, a1.z]);
      var cum = rmCum(pts);
      // lanes: arterials 2/dir at |4.5|,|9.5|; collectors (+Nine Eagles) 1/dir
      var lanes = r.hw >= 11 ? [4.5, 9.5] : [r.hw * 0.55];
      // U-turn margin: stop short of the perimeter walls (barrier sits ~14 in)
      var m0 = Math.max(Math.abs(pts[0][0]), Math.abs(pts[0][1])) > HALF - 8 ? 30 : 3;
      var m1 = Math.max(Math.abs(pts[pts.length - 1][0]), Math.abs(pts[pts.length - 1][1])) > HALF - 8 ? 30 : 3;
      RM.edges.push({ rid: r.id, cls: r.cls, hw: r.hw, pts: pts, cum: cum, len: cum[cum.length - 1], lanes: lanes, m0: m0, m1: m1, node: [null, null], spdA: r.cls === 0 ? 10 : 6.5, spdB: r.cls === 0 ? 5 : 3 });
    }
  }
  // nodes: cluster edge endpoints within 5u
  for (i = 0; i < RM.edges.length; i++) {
    var e = RM.edges[i];
    var ends = [e.pts[0], e.pts[e.pts.length - 1]];
    for (var en = 0; en < 2; en++) {
      var nd = null;
      for (j = 0; j < RM.nodes.length; j++) {
        var dx = RM.nodes[j].x - ends[en][0], dz = RM.nodes[j].z - ends[en][1];
        if (dx * dx + dz * dz < 25) { nd = RM.nodes[j]; break; }
      }
      if (!nd) { nd = { x: ends[en][0], z: ends[en][1], legs: [], id: RM.nodes.length }; RM.nodes.push(nd); }
      nd.legs.push({ e: i, end: en });
      e.node[en] = nd;
    }
  }
  for (i = 0; i < RM.edges.length; i++) RM.laneLen += RM.edges[i].len;
}

// lane-frame sample: world pos/tangent for car c at chainage s on its edge.
// Lane offset rides the LEFT-normal frame: lateral = dir * off keeps traffic
// on its right-hand side for both directions.
function rmLanePos(c, s) {
  var e = RM.edges[c.rEdge];
  var p = rmAt(e.pts, e.cum, s);
  var lat = c.rDir * c.rOff;
  return { x: p.x - p.uz * lat, z: p.z + p.ux * lat, tx: p.ux * c.rDir, tz: p.uz * c.rDir };
}
function remapSeedCar(c, rng) {
  var rnd = rng || Math.random;
  // length-weighted edge pick
  var pick = rnd() * RM.laneLen, e = RM.edges[0], ei = 0;
  for (var i = 0; i < RM.edges.length; i++) { e = RM.edges[i]; ei = i; if (pick < e.len) break; pick -= e.len; }
  c.rEdge = ei;
  c.rDir = rnd() < 0.5 ? 1 : -1;
  c.rLane = (rnd() * e.lanes.length) | 0;
  c.rOff = e.lanes[c.rLane];
  c.rS = e.m0 + rnd() * Math.max(1, e.len - e.m0 - e.m1);
  c.cruise = e.spdA + rnd() * e.spdB;
  c.speed = c.cruise;
  var p = rmLanePos(c, c.rS);
  c.rTx = p.tx; c.rTz = p.tz;
  c.car.group.position.set(p.x, 0, p.z);
  c.car.group.rotation.y = Math.atan2(-p.tz, p.tx);
}
// advance chainage; at an edge end hop to a random continuing leg of the
// node (turn across the junction) or U-turn at dead ends / perimeter exits
function remapAdvance(c, dt) {
  var e = RM.edges[c.rEdge];
  c.rS += c.rDir * c.speed * dt;
  var lo = e.m0, hi = e.len - e.m1;
  if (c.rDir > 0 ? c.rS < hi : c.rS > lo) return;
  var nd = e.node[c.rDir > 0 ? 1 : 0];
  var opts = [];
  if (nd) for (var i = 0; i < nd.legs.length; i++) if (nd.legs[i].e !== c.rEdge) opts.push(nd.legs[i]);
  if (opts.length) {
    var pk = opts[(Math.random() * opts.length) | 0];
    var ne = RM.edges[pk.e];
    c.rEdge = pk.e;
    c.rDir = pk.end === 0 ? 1 : -1;
    c.rLane = Math.min(c.rLane, ne.lanes.length - 1);
    c.rOff = ne.lanes[c.rLane];
    c.rS = pk.end === 0 ? ne.m0 : ne.len - ne.m1;
    c.cruise = ne.spdA + Math.random() * ne.spdB;   // new free-flow target; keep current c.speed for a smooth turn
  } else {
    c.rDir = -c.rDir;   // dead end / ROAD CLOSED barrier: turn around
    c.rS = Math.max(lo, Math.min(hi, c.rS));
  }
}
// per-tick lane follower: chainage clock + pure-pursuit steer toward a
// lookahead point, with a soft spring to the exact lane point so deviation
// stays bounded (<~1u on the smoothed arcs)
function remapDriveCar(c, dt) {
  remapAdvance(c, dt);
  var look = 3.5 + c.speed * 0.4;
  var tgt = rmLanePos(c, c.rS + c.rDir * look);
  var base = rmLanePos(c, c.rS);
  var g = c.car.group;
  var px = g.position.x, pz = g.position.z;
  var dx = tgt.x - px, dz = tgt.z - pz, d = Math.sqrt(dx * dx + dz * dz);
  if (d > 0.01) {
    px += dx / d * c.speed * dt; pz += dz / d * c.speed * dt;
    c.rTx = dx / d; c.rTz = dz / d;
  } else { c.rTx = base.tx; c.rTz = base.tz; }
  var k = Math.min(1, dt * 2.4);
  px += (base.x - px) * k; pz += (base.z - pz) * k;
  g.position.set(px, 0, pz);
  // heading eases toward the travel direction
  var want = Math.atan2(-c.rTz, c.rTx);
  var dy = want - g.rotation.y;
  while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
  g.rotation.y += dy * Math.min(1, dt * 6);
}
// after a shove, rejoin the lane from wherever the car skidded to
function remapRejoinLane(c) {
  var e = RM.edges[c.rEdge];
  var pr = rmProject(e.pts, e.cum, c.sx, c.sz);
  c.rS = Math.max(e.m0, Math.min(e.len - e.m1, pr.s));
}

// ---- perimeter: +-600 walls with the 6 true exits ----
function remapPerimeter() {
  var t = 3, i, j;
  // gap half-width along the wall: road half-width over the crossing angle
  var gaps = { N: [], S: [], E: [], W: [] };
  for (i = 0; i < REMAP_EXITS.length; i++) {
    var e = REMAP_EXITS[i];
    var horiz = e.edge === 'N' || e.edge === 'S';
    var cosI = Math.abs(horiz ? e.dz : e.dx);   // inward component normal to the wall
    var g = e.hw / Math.max(0.35, cosI) + 8;
    gaps[e.edge].push({ at: horiz ? e.x : e.z, g: g });
  }
  var EDGES = [
    { k: 'N', horiz: true, c: -HALF }, { k: 'S', horiz: true, c: HALF },
    { k: 'W', horiz: false, c: -HALF }, { k: 'E', horiz: false, c: HALF }
  ];
  for (i = 0; i < EDGES.length; i++) {
    var ed = EDGES[i];
    var list = gaps[ed.k].slice().sort(function (a, b) { return a.at - b.at; });
    var cur = -HALF;
    for (j = 0; j <= list.length; j++) {
      var end = j < list.length ? list[j].at - list[j].g : HALF;
      if (end - cur > 8) {
        var mid = (cur + end) / 2, span = end - cur;
        if (ed.horiz) forestWall(mid, ed.c, span, t);
        else forestWall(ed.c, mid, t, span);
      }
      if (j < list.length) cur = list[j].at + list[j].g;
    }
  }
  // rotated ROAD CLOSED barriers ~14u inside each exit, square to the road
  for (i = 0; i < REMAP_EXITS.length; i++) remapBarrier(REMAP_EXITS[i]);
}
function remapBarrier(e) {
  var bx = e.x + e.dx * 14, bz = e.z + e.dz * 14;
  var rowX = -e.dz, rowZ = e.dx;              // barrier row runs square to the road
  var yaw = Math.atan2(-rowZ, rowX);          // OBB/box local +x along the row
  var half = e.hw + 4;
  var bm = lamb({ color: 0xdadada }), stripe = lamb({ color: 0xd88018 });
  var n = Math.max(2, Math.round(half * 2 / 3));
  for (var i = 0; i < n; i++) {
    var o = -half + (i + 0.5) / n * half * 2;
    var b = box(2.6, 1.1, 1, i % 2 ? stripe : bm, bx + rowX * o, 0.55, bz + rowZ * o);
    b.rotation.y = yaw;
    scene.add(b);
  }
  addColliderOBB(bx, bz, half, 0.8, yaw);
  signPlane(bx + e.dx * 1.2, 2.2, bz + e.dz * 1.2, Math.atan2(e.dx, e.dz), 6, 1.6, ['ROAD', 'CLOSED'], '#b03018', '#ffffff');
}

// ---- streetlight rows along the true arterials/collectors ----
// (replaces the axis rows; venue/lot spot lights stay as-is)
function remapStreetlightRows() {
  var side = 1;
  for (var i = 0; i < RM.roads.length; i++) {
    var r = RM.roads[i];
    if (r.cls > 1 || r.dirt) continue;
    var len = r.cum[r.cum.length - 1];
    for (var s = 30; s < len - 20; s += 55) {
      var p = rmAt(r.pts, r.cum, s);
      var off = r.hw + 5.5;
      var lx = p.x - p.uz * off * side, lz = p.z + p.ux * off * side;
      if (spotClear(lx, lz)) streetlight(lx, lz, p.uz * side, -p.ux * side);
      side = -side;
    }
  }
}
// NPC standing on true-road asphalt? return the nearest curb-side escape
// point (sidewalk band beside the closest road), else null. Scans mapRoads —
// with WC_REMAP on those ARE the decimated true-road segments.
function remapRoadEscape(x, z) {
  var best = null, bestD = 1e9;
  for (var i = 0; i < mapRoads.length; i++) {
    var r = mapRoads[i];
    var dx = r.x2 - r.x1, dz = r.z2 - r.z1, L2 = dx * dx + dz * dz || 1;
    var t = ((x - r.x1) * dx + (z - r.z1) * dz) / L2;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    var cx = r.x1 + dx * t, cz = r.z1 + dz * t;
    var px = x - cx, pz = z - cz, d2 = px * px + pz * pz;
    if (d2 < r.hw * r.hw && d2 < bestD) {
      bestD = d2;
      var d = Math.sqrt(d2);
      var nx, nz;
      if (d > 0.3) { nx = px / d; nz = pz / d; }
      else { var L = Math.sqrt(L2); nx = -dz / L; nz = dx / L; }   // dead-center: pick a side
      var off = r.hw + 2 + Math.random() * 2;
      best = [cx + nx * off, cz + nz * off];
    }
  }
  return best;
}
// remap core NPC sidewalk spot (RM.coreWalk shares the expWalk entry shape)
function remapCoreSpot() {
  if (RM && RM.coreWalk.length) return expWalkSpot(RM.coreWalk);
  return [WALK.x0 + Math.random() * (WALK.x1 - WALK.x0), WALK.z0 + Math.random() * (WALK.z1 - WALK.z0)];
}

// scattered street palms + oaks in the commercial core
// (remap: the hand-placed list hugs the axis intersection — several would
// stand on the Y-junction asphalt; keep only the ones clear of true roads)
[[20, 20], [-20, 20], [20, -20], [-20, -20], [-90, 22], [90, 22], [-90, -22], [30, -60], [-30, 70]].forEach(function (p) { if (!WC_REMAP || remapPointClear(p[0], p[1], 2)) palm(p[0], p[1]); });
for (var oi = 0; oi < 40; oi++) {
  var ox = -CORE + 40 + Math.random() * (CORE * 2 - 80), oz = -CORE + 40 + Math.random() * (CORE * 2 - 80);
  // keep oaks off the roads/core (and off the expansion roads/ponds)
  if (Math.abs(oz) > MAIN_HW + 6 && Math.abs(ox) > CROSS_HW + 6 && (Math.abs(ox) > 180 || Math.abs(oz) > 170) && expClear(ox, oz, 4) && !houseBlocksSpot(ox, oz) && !inLake(ox, oz)) oak(ox, oz);
}

// ---------------- surveyed neighborhoods: AI house clusters (houses.js) ----------------
// ~600 survey buildings (tools/housegen/plan.js) stamped into the expansion
// ring. PERFORMANCE CONTRACT: instances are NOT scene Groups — each cluster is
// built ONCE as a tagged triangle template (adapted from
// tools/housegen/runtime_buildhouse.js), then every instance is baked into ONE
// merged BufferGeometry per (cluster, variant) that samples a single 512px
// canvas ATLAS (the 9 housegen tiles + solid swatches, variant recolor baked
// in) — ~1 draw call per cluster-variant combo. Bullets/LOS hit invisible
// per-instance proxy boxes in solidMeshes (merged geometry is never raycast).
var HOUSE_ATLAS_S = 512;
// atlas rects in canvas px (y down). Pre-tiled regions (gable/roofbig) get
// their repeat grid drawn in; plain rects are sampled with a small inset.
var HOUSE_RECTS = {
  front: [4, 4, 120, 80], side: [132, 4, 120, 80], back: [260, 4, 120, 80],
  garage: [388, 4, 116, 58], trim: [388, 70, 56, 56], conc: [452, 70, 56, 56],
  door: [4, 92, 60, 120], glass: [72, 92, 24, 24], plain: [72, 124, 24, 24],
  ac: [72, 156, 24, 24], gable: [104, 92, 152, 152], roofone: [264, 92, 120, 120],
  roofbig: [4, 252, 504, 256]
};
// chroma-gated hue/sat/light shift (verified recolor from tools/housegen)
function houseHue2(p, q, t) {
  t = (t + 1) % 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
function houseShiftPixels(px, hueDeg, satMul, lightMul, baseHex) {
  var bn = parseInt((baseHex || '#c8b89a').slice(1), 16);
  var br = (bn >> 16 & 255) / 255, bg = (bn >> 8 & 255) / 255, bb = (bn & 255) / 255;
  var bav = (br + bg + bb) / 3, bcr = br - bav, bcg = bg - bav, bcb = bb - bav;
  for (var i = 0; i < px.length; i += 4) {
    var r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
    var av = (r + g + b) / 3;
    var dr = (r - av) - bcr, dg = (g - av) - bcg, db = (b - av) - bcb;
    var cd = Math.sqrt(dr * dr + dg * dg + db * db);
    var f = Math.min(1, Math.max(0, (0.09 - cd) / 0.045));
    if (f <= 0) continue;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    var h = 0, s = 0, d = mx - mn;
    if (d > 0.0001) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (mx === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    var h2 = (h + (hueDeg / 360) * f + 1) % 1;
    var s2 = Math.min(1, Math.max(0, s * (1 + (satMul - 1) * f)));
    var l2 = Math.min(1, Math.max(0, l * (1 + (lightMul - 1) * f)));
    var q = l2 < 0.5 ? l2 * (1 + s2) : l2 + s2 - l2 * s2, p = 2 * l2 - q;
    px[i] = Math.round(houseHue2(p, q, h2 + 1 / 3) * 255);
    px[i + 1] = Math.round(houseHue2(p, q, h2) * 255);
    px[i + 2] = Math.round(houseHue2(p, q, h2 - 1 / 3) * 255);
  }
}
function houseShiftHex(hex, shift) {
  if (!shift) return hex;
  var n = parseInt(hex.slice(1), 16);
  var px = [n >> 16 & 255, n >> 8 & 255, n & 255, 255];
  houseShiftPixels(px, shift[0], shift[1], shift[2], hex);
  return '#' + ((1 << 24) + (px[0] << 16) + (px[1] << 8) + px[2]).toString(16).slice(1);
}
// per-cluster repeat grids for the pre-tiled atlas regions
function houseRepeats(spec) {
  var w = spec.dims[0], d = spec.dims[1], roofH = spec.roofH || 0;
  var rx = spec.roofType === 'flat' ? Math.min(12, Math.max(1, Math.round(w / 8)))
    : Math.min(12, Math.max(2, w / 5));
  var ry = Math.min(6, Math.max(1, Math.round(d / 8)));
  var gRep = d > 20 ? 6.4 : 3.2;
  var gN = Math.max(1, Math.min(10, Math.ceil(Math.max(d / gRep, (roofH || 1) / gRep))));
  return { rx: rx, ry: ry, cols: Math.ceil(rx), rows: Math.ceil(ry), gRep: gRep, gN: gN };
}
// ---- atlas canvases: one per (cluster, variant), tiles drawn as they decode
var houseTileImgs = {};   // ci -> {name: {img, ok}}
var houseAtlases = {};    // 'ci|vi' -> {canvas, tex}
function houseDrawAtlas(ci) {
  var cl = HOUSE_CLUSTERS[ci], tiles = houseTileImgs[ci], spec = cl.spec;
  var rep = houseRepeats(spec);
  for (var vi = 0; vi < cl.variants.length; vi++) {
    var at = houseAtlases[ci + '|' + vi];
    if (!at) continue;
    var g = at.canvas.getContext('2d');
    var shift = cl.variants[vi].shift || 0;
    // solid swatches
    function fill(r, col) { g.fillStyle = col; g.fillRect(r[0] - 2, r[1] - 2, r[2] + 4, r[3] + 4); }
    fill(HOUSE_RECTS.plain, houseShiftHex(spec.wallColor || '#c8b89a', shift));
    fill(HOUSE_RECTS.glass, spec.glassColor || '#2a3742');
    fill(HOUSE_RECTS.ac, '#9aa0a2');
    if (!(tiles.trim && tiles.trim.ok)) fill(HOUSE_RECTS.trim, spec.trimColor || '#ece8dd');
    function draw(name, r) {
      var t = tiles[name];
      if (!t || !t.ok) return;
      // gutter first (edge-ish content), then the exact rect
      g.drawImage(t.img, r[0] - 4, r[1] - 4, r[2] + 8, r[3] + 8);
      g.drawImage(t.img, r[0], r[1], r[2], r[3]);
    }
    // never-shifted tiles
    draw('trim', HOUSE_RECTS.trim); draw('concrete', HOUSE_RECTS.conc);
    draw('door', HOUSE_RECTS.door); draw('garage', HOUSE_RECTS.garage);
    draw('roof', HOUSE_RECTS.roofone);
    // pre-tiled regions
    var rb = HOUSE_RECTS.roofbig, gb = HOUSE_RECTS.gable;
    if (tiles.roof && tiles.roof.ok) {
      var tw = rb[2] / rep.cols, th = rb[3] / rep.rows;
      for (var i = 0; i < rep.cols; i++) for (var j = 0; j < rep.rows; j++) g.drawImage(tiles.roof.img, rb[0] + i * tw, rb[1] + j * th, tw + 0.5, th + 0.5);
    }
    var gimg = tiles.gable && tiles.gable.ok ? tiles.gable.img : null;
    if (gimg) {
      var gt = gb[2] / rep.gN;
      for (var gi = 0; gi < rep.gN; gi++) for (var gj = 0; gj < rep.gN; gj++) g.drawImage(gimg, gb[0] + gi * gt, gb[1] + gj * gt, gt + 0.5, gt + 0.5);
    } else {
      fill(HOUSE_RECTS.gable, houseShiftHex(spec.wallColor || '#c8b89a', shift));
    }
    // wall tiles: variant recolor baked in
    ['front', 'side', 'back'].forEach(function (name) {
      var t = tiles[name === 'back' ? (tiles.back && tiles.back.ok ? 'back' : 'side') : name];
      var r = HOUSE_RECTS[name];
      if (!t || !t.ok) { fill(r, houseShiftHex(spec.wallColor || '#c8b89a', shift)); return; }
      if (!shift) { g.drawImage(t.img, r[0] - 4, r[1] - 4, r[2] + 8, r[3] + 8); g.drawImage(t.img, r[0], r[1], r[2], r[3]); return; }
      var tc = document.createElement('canvas');
      tc.width = r[2] + 8; tc.height = r[3] + 8;
      var tg = tc.getContext('2d');
      tg.drawImage(t.img, 0, 0, tc.width, tc.height);
      var id = tg.getImageData(0, 0, tc.width, tc.height);
      houseShiftPixels(id.data, shift[0], shift[1], shift[2], spec.wallColor);
      tg.putImageData(id, 0, 0);
      g.drawImage(tc, r[0] - 4, r[1] - 4);
    });
    at.tex.needsUpdate = true;
  }
}
function houseAtlasMat(ci, vi) {
  var key = ci + '|' + vi;
  if (houseAtlases[key]) return houseAtlases[key].mat;
  var cl = HOUSE_CLUSTERS[ci];
  var cv = document.createElement('canvas');
  cv.width = cv.height = HOUSE_ATLAS_S;
  var g = cv.getContext('2d');
  g.fillStyle = cl.spec.wallColor || '#c8b89a';
  g.fillRect(0, 0, HOUSE_ATLAS_S, HOUSE_ATLAS_S);
  var t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  if (typeof MAXANISO !== 'undefined') t.anisotropy = MAXANISO;
  var mat = lamb({ map: t });
  houseAtlases[key] = { canvas: cv, tex: t, mat: mat };
  // kick off (or reuse) this cluster's tile decode; the atlas is drawn ONCE
  // per cluster when every tile has decoded (per-tile redraws were 9x the
  // canvas + recolor + texture-upload work)
  if (!houseTileImgs[ci]) {
    var tiles = {};
    houseTileImgs[ci] = tiles;
    var names = ['front', 'side', 'back', 'roof', 'garage', 'door', 'trim', 'gable', 'concrete'];
    var want = 0, got = 0;
    names.forEach(function (name) {
      var url = cl.tex[name];
      if (!url) return;
      want++;
      var im = new Image();
      tiles[name] = { img: im, ok: false };
      im.onload = function () {
        tiles[name].ok = true;
        got++;
        if (got === want) houseDrawAtlas(ci);
      };
      im.src = url;
    });
  } else {
    var ready = true;
    for (var tk in houseTileImgs[ci]) if (!houseTileImgs[ci][tk].ok) ready = false;
    if (ready) houseDrawAtlas(ci);
  }
  return nightLit(mat, 0xffdca0);   // warm lit house windows at night
}
// ---- tagged template: buildHouse geometry with {t:...} tag stand-ins for
// materials (never rendered; the extractor bakes tags into atlas UVs)
function houseBuildTagged(cl) {
  var spec = cl.spec;
  var w = spec.dims[0], d = spec.dims[1], h = spec.dims[2];
  var roofH = spec.roofH || 2.6, ovh = 1.2;
  var feat = spec.feat || {};
  var rep = houseRepeats(spec);
  var g = new THREE.Group();
  var frontM = { t: 'front' }, sideM = { t: 'side' }, backM = { t: 'back' };
  // double-window fix: the side/back facade tiles bake a painted window in,
  // while feat.win extrudes 3D window boxes on those same walls — so a house
  // with feat.win showed painted AND geometry windows (misaligned, jarring).
  // Every cluster's FRONT tile is window-less siding/brick, so when a cluster
  // owns 3D window boxes we skin all four walls with the front (plain) tile:
  // the extruded boxes become the single, coherent window treatment. Clusters
  // without feat.win keep their painted-window side/back tiles (no doubling).
  var hasWinBoxes = feat.win && Object.keys(feat.win).length > 0;
  var wallSideM = hasWinBoxes ? frontM : sideM;
  var wallBackM = hasWinBoxes ? frontM : backM;
  var plainM = { t: 'plain' }, trimM = { t: 'trim' }, gableM = { t: 'gable', s: 1 / rep.gN, gRep: rep.gRep };
  var concM = { t: 'conc' }, glassM = { t: 'glass' }, doorM = { t: 'door' }, garM = { t: 'garage' };
  var roofM = { t: 'roofbig', sx: rep.rx / rep.cols, sy: rep.ry / rep.rows };
  var miniRoofM = { t: 'roofone' }, acM = { t: 'ac' };
  function box(bw, bh, bd, mat) { return new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat); }
  if (spec.canopy) {
    // fuel canopy: slab on columns (feat.boxes carries the columns/fascia),
    // no solid body — cars/players pass underneath
    var slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), [trimM, trimM, roofM, trimM, trimM, trimM]);
    slab.position.y = h + 0.3; g.add(slab);
  } else {
    var topM = spec.roofType === 'flat' ? roofM : plainM;
    var body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [wallSideM, wallSideM, topM, plainM, frontM, wallBackM]);
    body.position.y = h / 2 + 0.05;
    g.add(body);
  }
  // ---- roof
  if (spec.canopy) {
    // no main roof beyond the slab
  } else if (spec.roofType === 'hip') {
    var hipG = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4);
    hipG.rotateY(Math.PI / 4);
    var roof = new THREE.Mesh(hipG, roofM);
    roof.scale.set(w + ovh, roofH, d + ovh);
    roof.position.y = h + 0.05 + roofH / 2;
    g.add(roof);
  } else if (spec.roofType === 'gable') {
    var hd = (d + ovh) / 2, slant = Math.sqrt(hd * hd + roofH * roofH), ang = Math.atan2(roofH, hd);
    var s1 = box(w + ovh, 0.22, slant + 0.3, roofM);
    s1.position.set(0, h + 0.05 + roofH / 2, -hd / 2); s1.rotation.x = -ang; g.add(s1);
    var s2 = box(w + ovh, 0.22, slant + 0.3, roofM);
    s2.position.set(0, h + 0.05 + roofH / 2, hd / 2); s2.rotation.x = ang; g.add(s2);
    var tri = new THREE.Shape();
    tri.moveTo(-d / 2, 0); tri.lineTo(d / 2, 0); tri.lineTo(0, roofH); tri.lineTo(-d / 2, 0);
    var triG = new THREE.ShapeGeometry(tri);
    var uv = triG.attributes.uv;
    for (var ui = 0; ui < uv.count; ui++) uv.setXY(ui, (uv.getX(ui) + d / 2) / rep.gRep, uv.getY(ui) / rep.gRep);
    triG.rotateY(Math.PI / 2);
    var e1 = new THREE.Mesh(triG, gableM); e1.position.set(w / 2 - 0.01, h + 0.05, 0); g.add(e1);
    var e2 = new THREE.Mesh(triG, gableM); e2.rotation.y = Math.PI; e2.position.set(-w / 2 + 0.01, h + 0.05, 0); g.add(e2);
  } else { // flat: parapet lip wears the roof tile on top (housegen fix)
    var lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.5, d + 0.5), [plainM, plainM, roofM, plainM, plainM, plainM]);
    lip.position.y = h + 0.3; g.add(lip);
  }
  // ---- eave soffit
  if (feat.soffit && spec.roofType !== 'flat') {
    var sofW = w + ovh * 0.8, sofD = d + ovh * 0.8;
    if (spec.roofType === 'gable') sofW = w + ovh * 0.35;
    var sof = box(sofW, 0.16, sofD, trimM);
    sof.position.y = h + 0.02;
    g.add(sof);
  }
  // ---- windows
  function windowUnit(ww, wh) {
    var u = new THREE.Group();
    var fr = box(ww + 0.26, wh + 0.26, 0.14, trimM); u.add(fr);
    var gl = box(ww, wh, 0.2, glassM); gl.position.z = 0.02; u.add(gl);
    return u;
  }
  function placeOnWall(obj, face, frac, y) {
    if (face === 'f') { obj.position.set((frac - 0.5) * w, y, d / 2); }
    else if (face === 'b') { obj.position.set((0.5 - frac) * w, y, -d / 2); obj.rotation.y = Math.PI; }
    else if (face === 'r') { obj.position.set(w / 2, y, d / 2 - frac * d); obj.rotation.y = Math.PI / 2; }
    else { obj.position.set(-w / 2, y, d / 2 - frac * d); obj.rotation.y = -Math.PI / 2; }
    g.add(obj);
  }
  if (feat.win) {
    for (var fk in feat.win) {
      var list = feat.win[fk];
      for (var wi = 0; wi < list.length; wi++) {
        var wn = list[wi];
        placeOnWall(windowUnit(wn[2], wn[3]), fk, wn[0], wn[1] + 0.05);
      }
    }
  }
  // ---- front door (+ porch / recess)
  if (feat.door) {
    var dw = feat.door.w || 1.1, dh = feat.door.h || 2.1, dx = (feat.door.x - 0.5) * w;
    var sur = box(dw + 0.3, dh + 0.18, 0.1, trimM);
    sur.position.set(dx, (dh + 0.18) / 2 + 0.05, d / 2);
    g.add(sur);
    var dbx = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.16), [trimM, trimM, trimM, trimM, doorM, trimM]);
    dbx.position.set(dx, dh / 2 + 0.05, d / 2 + 0.02);
    g.add(dbx);
    var porch = feat.door.porch;
    if (porch) {
      var pd = porch.d || 1.6, pw = Math.max(dw + 1.5, porch.w || 0);
      var stoop = box(pw, 0.22, pd, concM);
      stoop.position.set(dx, 0.11, d / 2 + pd / 2); g.add(stoop);
      var step = box(pw * 0.72, 0.11, 0.42, concM);
      step.position.set(dx, 0.055, d / 2 + pd + 0.21); g.add(step);
      var prRot = 0.24, prY = Math.min(h - 0.15, dh + 0.95);
      var pr = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.5, 0.2, pd + 0.55), [trimM, trimM, miniRoofM, trimM, trimM, trimM]);
      pr.position.set(dx, prY, d / 2 + (pd + 0.2) / 2);
      pr.rotation.x = prRot;
      g.add(pr);
      var np = porch.posts || 2;
      var postH = prY - Math.sin(prRot) * (pd + 0.55) / 2 - 0.08 - 0.22;
      for (var pi = 0; pi < np; pi++) {
        var px = np === 1 ? dx : dx - pw / 2 + 0.22 + pi * (pw - 0.44) / (np - 1);
        var post = box(0.18, postH, 0.18, trimM);
        post.position.set(px, 0.22 + postH / 2, d / 2 + pd - 0.22);
        g.add(post);
      }
    } else if (feat.door.recess) {
      var p1 = box(0.3, dh + 0.2, 0.55, frontM);
      p1.position.set(dx - dw / 2 - 0.3, (dh + 0.2) / 2 + 0.05, d / 2 + 0.18); g.add(p1);
      var p2 = box(0.3, dh + 0.2, 0.55, frontM);
      p2.position.set(dx + dw / 2 + 0.3, (dh + 0.2) / 2 + 0.05, d / 2 + 0.18); g.add(p2);
      var hd2 = box(dw + 1.2, 0.35, 0.55, frontM);
      hd2.position.set(dx, dh + 0.25, d / 2 + 0.18); g.add(hd2);
      var stp = box(dw + 0.7, 0.14, 0.9, concM);
      stp.position.set(dx, 0.07, d / 2 + 0.45); g.add(stp);
    }
  }
  // ---- garage inset
  if (feat.garage && cl.tex.garage) {
    var gw = feat.garage.w || 4.8, gh = feat.garage.h || 2.3, gout = feat.garage.out || 0.4;
    var gx = (feat.garage.x - 0.5) * w;
    var gd = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, 0.12), [frontM, frontM, frontM, frontM, garM, frontM]);
    gd.position.set(gx, gh / 2 + 0.05, d / 2 + 0.01);
    g.add(gd);
    var gp1 = box(0.35, gh + 0.05, gout + 0.12, frontM);
    gp1.position.set(gx - gw / 2 - 0.17, (gh + 0.05) / 2 + 0.05, d / 2 + gout / 2); g.add(gp1);
    var gp2 = box(0.35, gh + 0.05, gout + 0.12, frontM);
    gp2.position.set(gx + gw / 2 + 0.17, (gh + 0.05) / 2 + 0.05, d / 2 + gout / 2); g.add(gp2);
    var gh3 = box(gw + 0.7, 0.42, gout + 0.12, frontM);
    gh3.position.set(gx, gh + 0.26, d / 2 + gout / 2); g.add(gh3);
    var apron = box(gw + 0.4, 0.08, 1.6, concM);
    apron.position.set(gx, 0.04, d / 2 + 0.8); g.add(apron);
  }
  // ---- chimney
  if (feat.chimney) {
    var cw = feat.chimney.w || 0.7;
    var chX = (feat.chimney.x - 0.5) * w, chZ = (feat.chimney.z - 0.5) * d;
    var chTop = h + roofH + 0.45;
    var ch = box(cw, chTop - h + 1.2, cw * 0.8, plainM);
    ch.position.set(chX, (chTop + h - 1.2) / 2, chZ); g.add(ch);
    var cap = box(cw + 0.18, 0.16, cw * 0.8 + 0.18, trimM);
    cap.position.set(chX, chTop + 0.08, chZ); g.add(cap);
  }
  // ---- dormer
  if (feat.dormer && spec.roofType !== 'flat') {
    var dmW = feat.dormer.w || 2.1, dmH = 1.7, dmD = 1.5;
    var dmX = ((feat.dormer.x || 0.5) - 0.5) * w;
    var hd3 = (d + ovh) / 2;
    var zf = hd3 * 0.5;
    var yb = h + 0.3;
    var dm = new THREE.Mesh(new THREE.BoxGeometry(dmW, dmH, dmD), [gableM, gableM, gableM, gableM, gableM, gableM]);
    dm.position.set(dmX, yb + dmH / 2, zf - dmD / 2);
    g.add(dm);
    var dwin = windowUnit(dmW - 1.0, dmH - 0.85);
    dwin.position.set(dmX, yb + dmH / 2 - 0.08, zf);
    g.add(dwin);
    var drRise = 0.42;
    var dra = Math.atan2(drRise, dmW / 2);
    var drs = Math.sqrt(dmW * dmW / 4 + drRise * drRise) + 0.3;
    var dr1 = box(drs, 0.1, dmD + 0.5, miniRoofM);
    dr1.position.set(dmX - dmW / 4, yb + dmH + 0.1, zf - dmD / 2);
    dr1.rotation.z = dra; g.add(dr1);
    var dr2 = box(drs, 0.1, dmD + 0.5, miniRoofM);
    dr2.position.set(dmX + dmW / 4, yb + dmH + 0.1, zf - dmD / 2);
    dr2.rotation.z = -dra; g.add(dr2);
  }
  // ---- generic feature boxes (balconies, canopy columns, fascia bands...)
  if (feat.boxes) {
    var bMats = { trim: trimM, wall: frontM, conc: concM, gable: gableM, glass: glassM, roof: miniRoofM, door: doorM, garage: garM };
    for (var bxi = 0; bxi < feat.boxes.length; bxi++) {
      var bspec = feat.boxes[bxi];
      var bmesh = box(bspec[4], bspec[5], bspec[6], bMats[bspec[0]] || trimM);
      bmesh.position.set(bspec[1], bspec[2], bspec[3]);
      g.add(bmesh);
    }
  }
  // ---- AC unit
  if (feat.ac) {
    var pad = box(1.1, 0.1, 0.6, concM);
    pad.position.set(w / 2 + 0.35, 0.05, d * 0.12); g.add(pad);
    var ac = box(0.75, 0.62, 0.42, acM);
    ac.position.set(w / 2 + 0.33, 0.41, d * 0.12); g.add(ac);
  }
  return g;
}
// ---- bake the tagged group into flat arrays with atlas-mapped UVs
var houseTemplates = {};
function houseTemplate(ci) {
  if (houseTemplates[ci]) return houseTemplates[ci];
  var cl = HOUSE_CLUSTERS[ci];
  var g = houseBuildTagged(cl);
  g.updateMatrixWorld(true);
  var pos = [], norm = [], uv = [];
  var V = new THREE.Vector3(), NM = new THREE.Matrix3();
  var S = HOUSE_ATLAS_S;
  g.traverse(function (mesh) {
    if (!mesh.isMesh) return;
    var geo = mesh.geometry, mw = mesh.matrixWorld;
    NM.getNormalMatrix(mw);
    var p = geo.attributes.position, n = geo.attributes.normal, u = geo.attributes.uv;
    var idx = geo.index;
    var total = idx ? idx.count : p.count;
    var groups = Array.isArray(mesh.material) && geo.groups.length ? geo.groups : [{ start: 0, count: total, materialIndex: 0 }];
    for (var gi = 0; gi < groups.length; gi++) {
      var gr = groups[gi];
      var tag = Array.isArray(mesh.material) ? mesh.material[gr.materialIndex] : mesh.material;
      var rname = tag.t === 'conc' ? 'conc' : tag.t;
      var R = HOUSE_RECTS[rname] || HOUSE_RECTS.plain;
      // inset plain rects to dodge atlas bleed; tiled regions use raw edges
      var tiled = rname === 'roofbig' || rname === 'gable';
      var inset = tiled ? 0.5 : 2;
      var u0 = (R[0] + inset) / S, du = (R[2] - inset * 2) / S;
      var v0 = 1 - (R[1] + R[3] - inset) / S, dv = (R[3] - inset * 2) / S;
      var sx = tag.sx || tag.s || 1, sy = tag.sy || tag.s || 1;
      var end = Math.min(gr.start + gr.count, total);
      for (var i = gr.start; i < end; i++) {
        var vi2 = idx ? idx.getX(i) : i;
        V.set(p.getX(vi2), p.getY(vi2), p.getZ(vi2)).applyMatrix4(mw);
        pos.push(V.x, V.y, V.z);
        V.set(n.getX(vi2), n.getY(vi2), n.getZ(vi2)).applyMatrix3(NM).normalize();
        norm.push(V.x, V.y, V.z);
        var uu = u.getX(vi2) * sx, vv = u.getY(vi2) * sy;
        if (!tiled) { uu = Math.min(1, Math.max(0, uu)); vv = Math.min(1, Math.max(0, vv)); }
        uv.push(u0 + uu * du, v0 + vv * dv);
      }
    }
  });
  houseTemplates[ci] = { pos: new Float32Array(pos), norm: new Float32Array(norm), uv: new Float32Array(uv) };
  return houseTemplates[ci];
}
// oak/scatter guard: keeps runtime-random trees out of house footprints
// (called from forestPatch, which runs BEFORE this section places anything —
// hoisting + the houses.js data make that safe)
var houseFootprints = null;
function houseBlocksSpot(x, z) {
  if (!STAMP_SURVEY_HOUSES || typeof HOUSE_INSTANCES === 'undefined') return false;
  if (!houseFootprints) {
    houseFootprints = [];
    for (var i = 0; i < HOUSE_INSTANCES.length; i++) {
      var t = HOUSE_INSTANCES[i];
      var cl2 = HOUSE_CLUSTERS[t[0]];
      if (!cl2) continue;
      var sc = t[5] || 1;
      var a = t[3] * Math.PI / 180;
      houseFootprints.push({
        x: t[1], z: t[2], c: Math.cos(a), s: Math.sin(a),
        hw: cl2.spec.dims[0] * sc / 2 + 1.6, hd: cl2.spec.dims[1] * sc / 2 + 1.6,
        r: Math.hypot(cl2.spec.dims[0], cl2.spec.dims[1]) * sc / 2 + 2
      });
    }
    // also cover parking lots (+car half-extent margin) so random oaks/bushes
    // never land in a house parking row — the parked-car spawner's
    // parkedSlotFree() consults breakables, and per-peer-random trees inside a
    // lot would make the seeded parked layout diverge across MP peers.
    if (typeof HOUSE_LOTS !== 'undefined') {
      for (var li = 0; li < HOUSE_LOTS.length; li++) {
        var L = HOUSE_LOTS[li], la = L[4] * Math.PI / 180;
        houseFootprints.push({
          x: L[0], z: L[1], c: Math.cos(la), s: Math.sin(la),
          hw: L[2] / 2 + 3, hd: L[3] / 2 + 3,
          r: Math.hypot(L[2], L[3]) / 2 + 3.5
        });
      }
    }
  }
  for (var j = 0; j < houseFootprints.length; j++) {
    var f = houseFootprints[j];
    var dx = x - f.x, dz = z - f.z;
    if (dx * dx + dz * dz > f.r * f.r) continue;
    // world -> local (rotation.y = a: local x axis = (cos a, -sin a))
    var u2 = dx * f.c - dz * f.s, v2 = dx * f.s + dz * f.c;
    if (Math.abs(u2) < f.hw && Math.abs(v2) < f.hd) return true;
  }
  return false;
}
// WC_REMAP: the house placement planner was authored before the true-road
// geometry settled, so at a few road-convergence hubs (notably the SE fork)
// instances landed on the asphalt. Drop any instance whose footprint clearly
// overlaps a true road — deterministic (same data every peer), so no desync,
// and it only removes on-road houses, not road-fronting ones (0.8 shrink +
// -1.5 pad = "clearly inside asphalt", need 2+ of center/corners to hit).
function houseOnRoad(x, z, w, d, rot, sc) {
  if (typeof REMAP_ROADS === 'undefined') return false;
  var a = rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  var hw = w * sc / 2 * 0.8, hd = d * sc / 2 * 0.8;
  var pts = [[0, 0], [hw, hd], [-hw, hd], [hw, -hd], [-hw, -hd]], hit = 0;
  for (var k = 0; k < pts.length; k++) {
    var lx = pts[k][0], lz = pts[k][1];
    var wx = lx * ca + lz * sa + x, wz = -lx * sa + lz * ca + z;
    if (!remapPointClear(wx, wz, -1.5)) hit++;
  }
  return hit >= 2;
}
var houseStats = { instances: 0, meshes: 0, tris: 0, colliders: 0, skipped: 0 };
var houseMeshesRef = [];   // merged house meshes (perf A/B toggle hook)
(function buildSurveyHouses() {
  if (!STAMP_SURVEY_HOUSES || typeof HOUSE_CLUSTERS === 'undefined') return;   // editor map has no survey-house fill
  var chunks = {};   // 'ci|vi' -> {pos:[],norm:[],uv:[]}
  var proxyGeo = new THREE.BoxGeometry(1, 1, 1);
  var proxyMat = lamb({ color: 0x808080 });
  for (var i = 0; i < HOUSE_INSTANCES.length; i++) {
    var inst = HOUSE_INSTANCES[i];
    var ci = inst[0], x = inst[1], z = inst[2], rot = inst[3], vi = inst[4], sc = inst[5] || 1;
    var cl = HOUSE_CLUSTERS[ci];
    if (!cl) continue;
    if (WC_REMAP && houseOnRoad(x, z, cl.spec.dims[0], cl.spec.dims[1], rot, sc)) { houseStats.skipped++; continue; }
    var tpl = houseTemplate(ci);
    var key = ci + '|' + vi;
    var ch = chunks[key];
    if (!ch) ch = chunks[key] = { pos: [], norm: [], uv: [] };
    var a = rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    var P = tpl.pos, N = tpl.norm;
    for (var v = 0; v < P.length; v += 3) {
      var lx = P[v] * sc, ly = P[v + 1], lz = P[v + 2] * sc;
      // rotation.y = a: world = (lx*ca + lz*sa, ly, -lx*sa + lz*ca)
      ch.pos.push(lx * ca + lz * sa + x, ly, -lx * sa + lz * ca + z);
      var nx = N[v], nz = N[v + 2];
      ch.norm.push(nx * ca + nz * sa, N[v + 1], -nx * sa + nz * ca);
    }
    for (var uvi = 0; uvi < tpl.uv.length; uvi++) ch.uv.push(tpl.uv[uvi]);
    // ---- colliders + proxy + registries
    var w = cl.spec.dims[0] * sc, d = cl.spec.dims[1] * sc, hgt = cl.spec.dims[2] + (cl.spec.roofH || 0);
    var co = Math.abs(ca), so = Math.abs(sa);
    var hx = (w * co + d * so) / 2, hz = (w * so + d * co) / 2;
    // register the front door (authored on the local +z face) so NPCs can
    // come and go from houses; canopy (hollow commercial) shells skip
    if (!cl.spec.canopy && cl.spec.feat && cl.spec.feat.door) {
      var dxl = (cl.spec.feat.door.x - 0.5) * w;
      registerDoor(dxl * ca + (d / 2) * sa + x, -dxl * sa + (d / 2) * ca + z, sa, ca, 2.2);
    }
    if (cl.spec.canopy) {
      // hollow: collide the columns only (walk/drive under the slab)
      var ft = (cl.spec.feat && cl.spec.feat.boxes) || [];
      for (var cb = 0; cb < ft.length; cb++) {
        if (ft[cb][0] !== 'door') continue;
        var clx = ft[cb][1] * sc, clz = ft[cb][3] * sc;
        addCollider(clx * ca + clz * sa + x, -clx * sa + clz * ca + z, 1.1, 1.1);
        houseStats.colliders++;
      }
    } else if (Math.min(co, so) > 0.25 && w > 22) {
      // long diagonal building: split the AABB along the local x axis so the
      // collider hugs the footprint instead of swallowing the street corner
      var k = Math.ceil(w / 16);
      for (var ki = 0; ki < k; ki++) {
        var lox = -w / 2 + (ki + 0.5) * (w / k);
        var cxk = lox * ca + x, czk = -lox * sa + z;
        addCollider(cxk, czk, (w / k) * co + d * so, (w / k) * so + d * co);
        houseStats.colliders++;
      }
    } else {
      addCollider(x, z, hx * 2, hz * 2);
      houseStats.colliders++;
    }
    // invisible raycast proxy (bullets, cop line-of-sight)
    var proxy = new THREE.Mesh(proxyGeo, proxyMat);
    proxy.visible = false;
    if (cl.spec.canopy) { proxy.scale.set(w, 0.6, d); proxy.position.set(x, cl.spec.dims[2] + 0.3, z); }
    else { proxy.scale.set(w, hgt, d); proxy.position.set(x, hgt / 2, z); }
    proxy.rotation.y = a;
    proxy.updateMatrixWorld(true);
    solidMeshes.push(proxy);
    var mmc = (cl.variants[vi] && cl.variants[vi].roof) || cl.spec.wallColor || '#b8a888';
    mapBuildings.push({ x: x, z: z, w: hx * 2, d: hz * 2, h: cl.spec.dims[2] + (cl.spec.roofH || 0), c: mmc, pad: false, hs: true });
    houseStats.instances++;
  }
  // ---- merged meshes: one per (cluster, variant)
  for (var key2 in chunks) {
    var ch2 = chunks[key2];
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ch2.pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(ch2.norm), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ch2.uv), 2));
    var parts = key2.split('|');
    var mesh = new THREE.Mesh(geo, houseAtlasMat(+parts[0], +parts[1]));
    geo.computeBoundingSphere();
    scene.add(mesh);
    houseMeshesRef.push(mesh);
    houseStats.meshes++;
    houseStats.tris += ch2.pos.length / 9;
  }
  // ---- parking aprons: ONE merged mesh for every lot
  if (typeof HOUSE_LOTS !== 'undefined' && HOUSE_LOTS.length) {
    var lp = [], ln = [], luv = [];
    for (var li = 0; li < HOUSE_LOTS.length; li++) {
      var L = HOUSE_LOTS[li];
      var lx = L[0], lz2 = L[1], lw = L[2], ld = L[3], la = L[4] * Math.PI / 180;
      var lc = Math.cos(la), ls = Math.sin(la);
      // corners in local space (y up), rotated like rotation.y
      var cs = [[-lw / 2, -ld / 2], [lw / 2, -ld / 2], [lw / 2, ld / 2], [-lw / 2, ld / 2]];
      var wc = cs.map(function (c2) { return [c2[0] * lc + c2[1] * ls + lx, -c2[0] * ls + c2[1] * lc + lz2]; });
      var us = [[0, 0], [lw / 22, 0], [lw / 22, ld / 22], [0, ld / 22]];
      [[0, 1, 2], [0, 2, 3]].forEach(function (t2) {
        for (var q = 0; q < 3; q++) {
          lp.push(wc[t2[q]][0], 0.1, wc[t2[q]][1]);
          ln.push(0, 1, 0);
          luv.push(us[t2[q]][0], us[t2[q]][1]);
        }
      });
      var hxL = (lw * Math.abs(lc) + ld * Math.abs(ls)) / 2, hzL = (lw * Math.abs(ls) + ld * Math.abs(lc)) / 2;
      mapParking.push({ x: lx, z: lz2, w: hxL * 2, d: hzL * 2 });
    }
    var lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lp), 3));
    lgeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(ln), 3));
    lgeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(luv), 2));
    var lt = parkingT.clone(); lt.needsUpdate = true;
    lt.wrapS = lt.wrapT = THREE.RepeatWrapping;
    var lmesh = new THREE.Mesh(lgeo, lamb({ map: lt }));
    scene.add(lmesh);
    houseStats.meshes++;
  }
})();
// minimap: houses are pre-rendered once into an offscreen layer so drawMinimap
// doesn't repaint ~600 rects every frame (entries carry .hs)
var houseMMCanvas = null;
function houseMMLayer(w2mFn, mmW, mmS) {
  if (houseMMCanvas) return houseMMCanvas;
  houseMMCanvas = document.createElement('canvas');
  houseMMCanvas.width = houseMMCanvas.height = mmW;
  var g = houseMMCanvas.getContext('2d');
  for (var b = 0; b < mapBuildings.length; b++) {
    var m = mapBuildings[b];
    if (!m.hs) continue;
    g.fillStyle = m.c;
    g.fillRect(w2mFn(m.x - m.w / 2), w2mFn(m.z - m.d / 2), Math.max(1.5, m.w * mmS), Math.max(1.5, m.d * mmS));
  }
  return houseMMCanvas;
}

// ---------------- pavement: pads under buildings + access roads ----------------
// concrete apron under every commercial building
mapBuildings.forEach(function (b) { if (b.pad) pavePad(b.x, b.z, b.w + 7, b.d + 7); });
// axis-grid forecourt / connector driveways / plaza parking — all keyed to the
// OLD landmark positions, so WC_REMAP suppresses them (the true roads already
// front the relocated venues; per-venue lots are R4). Legacy world keeps them.
if (!WC_REMAP) {
  // gas station forecourt (canopy + pumps)
  pavePad(47, 50, 44, 22);

  // smaller roads / driveways linking each cluster to the main & cross roads
  // SE — RaceTrac + Dunkin
  drive(40, 39, 74, 9);
  drive(40, 26.5, 9, 25);
  // SW — Dollar Tree + strip malls + storage
  drive(-160, 40, 232, 9);
  drive(-70, 26.5, 9, 25);
  drive(-250, 26.5, 9, 25);
  drive(-52, 80, 9, 78);
  // NE — Regions bank + pharmacy + sushi
  drive(52, -30, 9, 34);
  drive(30, -48, 42, 9);
  drive(52, -80, 9, 66);
  drive(80, -112, 58, 9);
  // NW — Bank of America + Publix + school + Starbucks + offices
  drive(-30, -48, 40, 9);
  drive(-72, -31, 10, 92);
  drive(-124, -113, 9, 254);
  drive(-122, -79, 62, 9);
  drive(-116, -22, 9, 18);

  // customer parking strips (satellite: every plaza fronts a small lot) —
  // registered in mapParking; the parked-car pass fills them with cars
  parkingLot(-160, 27.5, 220, 17);   // strip malls + Dollar Tree frontage
  parkingLot(61, 67, 22, 12);        // RaceTrac side lot
  parkingLot(74, -48, 16, 24);       // Regions Bank east lot
  parkingLot(-48, -68, 26, 12);      // Bank of America south lot
}

// ---------------- street furniture & landscaping ----------------
var bushMats = [lamb({ color: 0x3f6f2e }), lamb({ color: 0x4a7d34 }), lamb({ color: 0x355f28 })];
var bushGeo = new THREE.SphereGeometry(1, 7, 5);
function bush(x, z, scale) {
  scale = scale || (0.8 + Math.random() * 0.6);
  var pb = getPackProp(Math.random() < 0.5 ? 'bush1' : 'bush2');
  if (pb) {
    var gb = new THREE.Group();
    var bm2 = new THREE.Mesh(pb.geo, pb.mat);
    var bs = 1.3 * scale / pb.h;
    bm2.scale.set(bs, bs, bs);
    gb.add(bm2);
    gb.position.set(x, 0, z); gb.rotation.y = Math.random() * Math.PI * 2;
    scene.add(gb);
    registerBreakable(gb, x, z, 0.6, 'tree');
    return;
  }
  var m = bushMats[(Math.random() * 3) | 0], g = new THREE.Group();
  var n = 2 + (Math.random() * 2 | 0);
  for (var i = 0; i < n; i++) { var b = new THREE.Mesh(bushGeo, m); var r = (0.5 + Math.random() * 0.4) * scale; b.scale.set(r, r * 0.8, r); b.position.set((Math.random() - 0.5) * scale, r * 0.7, (Math.random() - 0.5) * scale); g.add(b); }
  g.position.set(x, 0, z); scene.add(g);
  registerBreakable(g, x, z, 0.6, 'tree');
}
var thinTrunkM = lamb({ color: 0x7a5a3a });
function crepeMyrtle(x, z) {
  var g = new THREE.Group(); var h = 3 + Math.random() * 1.6;
  g.add(cyl(0.11, 0.16, h, 6, thinTrunkM, 0, h / 2, 0));
  var bn = Math.random() < 0.5 ? 'bush1' : 'bush2';
  var pb = Math.random() < 0.4 ? getPackPropPink(bn) : getPackProp(bn);
  if (pb) {
    var cm = new THREE.Mesh(pb.geo, pb.mat);
    var cs = 2.7 / pb.h;
    cm.scale.set(cs, cs, cs);
    cm.position.y = h - 1.0;   // canopy card cluster caps the trunk
    cm.rotation.y = Math.random() * Math.PI * 2;
    g.add(cm);
  } else {
    var lm = Math.random() < 0.4 ? lamb({ color: 0xd98fb0 }) : bushMats[(Math.random() * 3) | 0];
    for (var i = 0; i < 4; i++) { var c = new THREE.Mesh(bushGeo, lm); var r = 0.8 + Math.random() * 0.5; c.scale.set(r, r * 0.9, r); c.position.set((Math.random() - 0.5) * 1.2, h + (Math.random() - 0.3), (Math.random() - 0.5) * 1.2); g.add(c); }
  }
  g.add(blobShadow(1, 1, 0.05)); g.position.set(x, 0, z); scene.add(g);
  registerBreakable(g, x, z, 0.7, 'tree', null, 0.18);
}

// mast-arm traffic signals — lamps register in signalLights and CYCLE
// (green→yellow→red, ~20 s loop; see updateSignals in the corridor-details block)
var poleMetal = lamb({ color: 0x8a8f94 });
var signalBox = lamb({ color: 0x1c1c20 });
var redM = new THREE.MeshBasicMaterial({ color: 0xff3b28 }), yelM = new THREE.MeshBasicMaterial({ color: 0xffc828 }), grnM = new THREE.MeshBasicMaterial({ color: 0x35d94a });
var redDkM = lamb({ color: 0x381210 }), yelDkM = lamb({ color: 0x383008 }), grnDkM = lamb({ color: 0x0c3212 });
var signalLights = [];   // {mesh, lit, dark, col:'r'|'y'|'g', grp:'main'|'cross'}
var dotGeo = new THREE.SphereGeometry(0.12, 8, 6);
function signalHead(parent, x, y, z, fx, fz) {
  parent.add(box(0.34, 1.0, 0.34, signalBox, x, y, z));
  // heads on arms spanning the main road face E/W traffic → 'main' group;
  // cross-road arms face N/S traffic → 'cross'. Lamps start dark; updateSignals
  // lights the correct one on the first frame.
  var off = 0.2, grp = fx !== 0 ? 'main' : 'cross';
  [[0.32, redM, redDkM, 'r'], [0, yelM, yelDkM, 'y'], [-0.32, grnM, grnDkM, 'g']].forEach(function (d) {
    var s = new THREE.Mesh(dotGeo, d[2]);
    s.position.set(x + fx * off, y + d[0], z + fz * off);
    parent.add(s);
    signalLights.push({ mesh: s, lit: d[1], dark: d[2], col: d[3], grp: grp });
  });
}
function greenSign(parent, x, y, z, ry, text) {
  var m = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 1.1), new THREE.MeshBasicMaterial({ map: signTex([text], '#1c6b3a', '#ffffff', 256, 52), side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.rotation.y = ry; parent.add(m);
}
function mastArm(px, pz, ax, az, len, nHeads, fx, fz, sign, signRy) {
  var g = new THREE.Group(); g.position.set(px, 0, pz);
  var poleH = 7.8, armY = poleH - 0.5;
  g.add(cyl(0.28, 0.34, poleH, 10, poleMetal, 0, poleH / 2, 0));
  addCollider(px, pz, 0.68, 0.68);   // signal pole base — static, not breakable
  g.add(box(Math.abs(ax) * len + 0.25, 0.22, Math.abs(az) * len + 0.25, poleMetal, ax * len / 2, armY, az * len / 2));
  for (var i = 0; i < nHeads; i++) {
    var t = (i + 1) / (nHeads + 1) * len;
    g.add(box(0.06, 0.5, 0.06, poleMetal, ax * t, armY - 0.3, az * t));
    signalHead(g, ax * t, armY - 0.78, az * t, fx, fz);
  }
  if (sign) greenSign(g, ax * len * 0.32, armY + 0.55, az * len * 0.32, signRy, sign);
  scene.add(g);
}
// main road (arms span the lanes in z); cross road (arms span in x)
// (remap: the axis-aligned arms would hang over the wrong asphalt at the
// 3-leg Y — the per-leg arms are R3 junction furniture)
if (!WC_REMAP) {
  mastArm(CROSS_HW + 9, -MAIN_HW - 7, 0, 1, 2 * MAIN_HW + 13, 4, -1, 0, 'RACE TRACK RD', -Math.PI / 2);
  mastArm(-(CROSS_HW + 9), MAIN_HW + 7, 0, -1, 2 * MAIN_HW + 13, 4, 1, 0, 'RACE TRACK RD', Math.PI / 2);
  mastArm(CROSS_HW + 7, MAIN_HW + 9, -1, 0, 2 * CROSS_HW + 13, 3, 0, -1, 'COUNTRYWAY BLVD', Math.PI);
  mastArm(-(CROSS_HW + 7), -(MAIN_HW + 9), 1, 0, 2 * CROSS_HW + 13, 3, 0, 1, 'COUNTRYWAY BLVD', 0);
}

// utility poles + power lines along the main road (south side, like the
// Street Views). Poles are breakable ('light'); the strung wires are static
// scene meshes and deliberately stay up when a pole snaps (accepted jank).
var woodPoleM = lamb({ color: 0x6a5236 }), wireM = lamb({ color: 0x1a1a1a }), xfmrM = lamb({ color: 0x555b60 });
function utilityPole(x, z) {
  var h = 10.6, g = new THREE.Group();
  g.add(cyl(0.16, 0.3, h, 6, woodPoleM, 0, h / 2, 0));
  // crossarm perpendicular to the wire run (wires run E-W → arm spans z)
  g.add(box(0.16, 0.16, 3.0, woodPoleM, 0, h - 0.55, 0));
  g.add(cyl(0.05, 0.05, 0.26, 5, woodPoleM, 0, h - 0.34, -1.15));
  g.add(cyl(0.05, 0.05, 0.26, 5, woodPoleM, 0, h - 0.34, 1.15));
  g.add(box(0.5, 0.75, 0.42, xfmrM, 0.34, h - 2.2, 0));
  g.position.set(x, 0, z);
  scene.add(g);
  registerBreakable(g, x, z, 0.45, 'light', null, 0.32);
  return { x: x, y: h - 0.3, z: z };
}
function wire(a, b) {
  var mid = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2 - 1.3, (a.z + b.z) / 2);
  var curve = new THREE.CatmullRomCurve3([new THREE.Vector3(a.x, a.y, a.z), mid, new THREE.Vector3(b.x, b.y, b.z)]);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.03, 4, false), wireM));
}
(function powerline() {
  if (WC_REMAP) return;   // the pole line runs along the vanished axis road (re-routed in R3)
  function onDrive(x, z) {   // driveway mouths cross the pole line — dodge them
    for (var i = 0; i < mapDrives.length; i++) {
      var d = mapDrives[i];
      if (x > d.x - d.w / 2 - 1.2 && x < d.x + d.w / 2 + 1.2 && z > d.z - d.d / 2 - 1.2 && z < d.z + d.d / 2 + 1.2) return true;
    }
    return false;
  }
  var prev = null;
  for (var x = -300; x <= 300; x += 46) {
    if (Math.abs(x) < CROSS_HW + 16) { prev = null; continue; }
    var px = x, tries = 0;
    while (onDrive(px, MAIN_HW + 9) && tries++ < 5) px += 3;
    var p = utilityPole(px, MAIN_HW + 9);
    if (prev) { wire({ x: prev.x, y: prev.y, z: prev.z - 1.15 }, { x: p.x, y: p.y, z: p.z - 1.15 }); wire({ x: prev.x, y: prev.y, z: prev.z + 1.15 }, { x: p.x, y: p.y, z: p.z + 1.15 }); }
    prev = p;
  }
})();

// landscaped median with palms down the center of the main road
var medGrassM = lamb({ map: grassT.clone() }); medGrassM.map.repeat.set(4, 1); medGrassM.map.needsUpdate = true;
var curbM = lamb({ color: 0xbdb7a8 });
function medianSeg(x0, x1) {
  var w = x1 - x0, cx = (x0 + x1) / 2;
  scene.add(box(w, 0.3, 3, medGrassM, cx, 0.26, 0));
  scene.add(box(w, 0.34, 0.28, curbM, cx, 0.28, -1.5));
  scene.add(box(w, 0.34, 0.28, curbM, cx, 0.28, 1.5));
  for (var px = x0 + 7; px < x1 - 5; px += 32) { if (Math.random() < 0.6) palm(px, 0); else crepeMyrtle(px, 0); }
}
if (!WC_REMAP) {   // median + corner islands are axis-junction furniture (R3 re-authors)
  medianSeg(CROSS_HW + 11, 300);
  medianSeg(-300, -(CROSS_HW + 11));

  // corner landscaping
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s) {
    var cx = s[0] * (CROSS_HW + 8), cz = s[1] * (MAIN_HW + 8);
    bush(cx, cz); bush(cx + s[0] * 2.2, cz + s[1] * 1.6); crepeMyrtle(cx + s[0] * 4, cz + s[1] * 3.2);
  });
}
// bushes fronting a few landmarks — these are axis-grid landmark fronts; under
// the remap world the venues moved, leaving these ON the road / inside Publix &
// townhouses, so only place them in the legacy world
if (!WC_REMAP) [[52, -37], [-48, -37], [-72, -116], [-52, 37], [-116, -22]].forEach(function (p) { bush(p[0], p[1]); bush(p[0] + 3, p[1]); bush(p[0] - 3, p[1]); });

// ---------------- corridor details (signal cycle, corner palms, paint) ----------------
// signal cycle: main green 8 s → main yellow 3 s → cross green 6 s → cross
// yellow 3 s (all-red in between is implicit) — opposing approaches share a
// group so pairs stay in sync. Visual only: traffic does NOT obey the lights
// yet (future work). Called from updateWorldFx.
var SIG_CYCLE = [['main', 'g', 8], ['main', 'y', 3], ['cross', 'g', 6], ['cross', 'y', 3]];
var SIG_TOTAL = 20, sigClock = 0, sigMain = '', sigCross = '';
function updateSignals(dt) {
  sigClock = (sigClock + dt) % SIG_TOTAL;
  var t = sigClock, m = 'r', x = 'r';
  for (var i = 0; i < SIG_CYCLE.length; i++) {
    var ph = SIG_CYCLE[i];
    if (t < ph[2]) { if (ph[0] === 'main') m = ph[1]; else x = ph[1]; break; }
    t -= ph[2];
  }
  if (m === sigMain && x === sigCross) return;
  sigMain = m; sigCross = x;
  for (var j = 0; j < signalLights.length; j++) {
    var L = signalLights[j], want = L.grp === 'main' ? m : x;
    L.mesh.material = L.col === want ? L.lit : L.dark;
  }
}

// ---- traffic control: car-following + red-light + stop-sign speed governor ----
// carSignals holds the signalized Y-junction approaches (populated by the R3
// junction furniture): {x,z, ux,uz (inbound unit dir toward junction), hw,
// grp:'main'|'cross', barX,barZ (stop-bar center)}. Cars read the live lamp
// color via sigMain/sigCross. Host-side only; clients mirror positions.
var carSignals = [];
var CAR_STOP_D = 5.6;     // center-to-center spacing when queued (car len 4.64 + gap)
var CAR_HEADWAY = 0.85;   // time-headway (s) turning gap into a target speed
// desired speed for a remap traffic car: the min of free-flow cruise, the gap
// to the leader ahead, the distance to a red light, and any stop-sign hold.
function carDesiredSpeed(c, idx, dt) {
  var des = c.cruise !== undefined ? c.cruise : c.speed;
  var m = c.car.group.position;
  var hx = c.rTx, hz = c.rTz;
  if (hx === undefined) { var hr = c.car.group.rotation.y; hx = Math.cos(hr); hz = -Math.sin(hr); }
  // (a) car-following: nearest car ahead in the same-lane cone
  var bestGap = Infinity;
  for (var j = 0; j < cars.length; j++) {
    if (j === idx) continue;
    var o = cars[j];
    if (o.exploded) continue;
    var om = o.car.group.position;
    var dx = om.x - m.x, dz = om.z - m.z;
    var fwd = dx * hx + dz * hz;
    if (fwd <= 0.05) continue;                        // behind or beside us
    if (fwd > 26) continue;                           // out of headway range
    var lat = -dx * hz + dz * hx; if (lat < 0) lat = -lat;
    if (lat > 2.3) continue;                          // different lane / off our path
    // ignore oncoming traffic (car forward = (cos ry, -sin ry) for every car)
    var oh = o.car.group.rotation.y, ohx = Math.cos(oh), ohz = -Math.sin(oh);
    if (!o.parked && (hx * ohx + hz * ohz) < 0.1) continue;
    if (fwd < bestGap) bestGap = fwd;
  }
  if (bestGap < Infinity) des = Math.min(des, Math.max(0, bestGap - CAR_STOP_D) / CAR_HEADWAY);
  // (b) red lights: stop at the bar of the approach we're driving toward
  for (var s = 0; s < carSignals.length; s++) {
    var lg = carSignals[s];
    var col = lg.grp === 'main' ? sigMain : sigCross;
    if (col !== 'r' && col !== 'y') continue;         // green -> go
    if (hx * lg.ux + hz * lg.uz < 0.6) continue;      // not heading in on this leg
    var bx = lg.barX - m.x, bz = lg.barZ - m.z;
    var bf = bx * hx + bz * hz;
    if (bf < -1.5) continue;                          // already through the bar
    var bl = -bx * hz + bz * hx; if (bl < 0) bl = -bl;
    if (bl > lg.hw + 2) continue;                     // not on this approach lane
    // on yellow only start stopping if there's comfortable room; else clear it
    if (col === 'y' && bf < 6) continue;
    des = Math.min(des, Math.max(0, bf - 1.8) / 0.65);
  }
  // (c) stop signs: brief hold at uncontrolled 3+ leg nodes (never the central
  // signal Y near the origin). Per-node one-shot with a hard timeout -> no deadlock.
  if (RM) {
    var e = RM.edges[c.rEdge], end = c.rDir > 0 ? 1 : 0, nd = e.node[end];
    if (nd && nd.legs.length >= 3 && (nd.x * nd.x + nd.z * nd.z) > 1600) {
      var distNode = c.rDir > 0 ? (e.len - c.rS) : c.rS;
      if (distNode < 8) {
        if (c._ssNode !== nd.id) { c._ssNode = nd.id; c._ssT = 1.2; }   // arrive: arm the stop
        if (c._ssT > 0) { c._ssT -= dt; des = Math.min(des, Math.max(0, distNode - 2.5) / 0.55); }
      }
    }
  }
  return des;
}
// ease actual speed toward the governor's target (firmer decel than accel)
function applyCarGovernor(c, idx, dt) {
  var des = carDesiredSpeed(c, idx, dt);
  var rate = des < c.speed ? 24 : 8;
  var d = des - c.speed, step = rate * dt;
  c.speed += d < -step ? -step : (d > step ? step : d);
  if (c.speed < 0) c.speed = 0;
}

// corner sabal-palm clusters — 3 per junction corner island (staggered heights
// & yaw come free from palm()), placed outside the sidewalks, crosswalks,
// mast-arm poles and corner bushes.
if (!WC_REMAP) {
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s) {
    palm(s[0] * 26, s[1] * 29);
    palm(s[0] * 29.5, s[1] * 26.5);
    palm(s[0] * 27.6, s[1] * 32.4);
  });
}

// intersection paint: white stop bars behind each crosswalk + left-turn
// stencil arrows in the turn pockets (satellite z19 reference). Thin planes
// above the road (0.05) / sidewalks (0.125) but under the crosswalks (0.165).
var stopBarM = new THREE.MeshBasicMaterial({ color: 0xdad8d0, transparent: true, opacity: 0.92, depthWrite: false });
var turnArrowT = (function () {
  var c = document.createElement('canvas'); c.width = 64; c.height = 128;
  var g = c.getContext('2d'); g.clearRect(0, 0, 64, 128);
  g.fillStyle = 'rgba(228,226,218,0.95)';
  g.fillRect(37, 36, 12, 88);                          // shaft
  g.fillRect(16, 36, 26, 12);                          // elbow toward the left
  g.beginPath(); g.moveTo(2, 42); g.lineTo(24, 20); g.lineTo(24, 64); g.closePath(); g.fill();  // head
  var t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
})();
var turnArrowM = new THREE.MeshBasicMaterial({ map: turnArrowT, transparent: true, depthWrite: false });
function stopBar(x, z, w, d) {
  var geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2);
  var m = new THREE.Mesh(geo, stopBarM); m.position.set(x, 0.15, z); scene.add(m);
}
function turnArrow(x, z, ry) {
  // texture "up" = direction of travel; head hooks left. ry turns it per approach.
  var geo = new THREE.PlaneGeometry(2.1, 4.4); geo.rotateX(-Math.PI / 2);
  var m = new THREE.Mesh(geo, turnArrowM); m.position.set(x, 0.155, z); m.rotation.y = ry; scene.add(m);
}
// right-hand traffic: each bar spans only the approach half of its road
// (remap: painted onto the axis junction — per-leg re-paint is R3)
if (!WC_REMAP) {
  stopBar(-16.4, 7.25, 1.1, 12.1);      // eastbound approach (from the west)
  stopBar(16.4, -7.25, 1.1, 12.1);      // westbound
  stopBar(-5.9, -19.4, 10.0, 1.1);      // southbound
  stopBar(5.9, 19.4, 10.0, 1.1);        // northbound
  turnArrow(-19.5, 2.4, -Math.PI / 2);  // eastbound left-turn pocket
  turnArrow(19.5, -2.4, Math.PI / 2);   // westbound
  turnArrow(-2.2, -22, Math.PI);        // southbound
  turnArrow(2.2, 22, 0);                // northbound
}

// ---------------- street lights ----------------
var streetLights = [];
// lit lens shows an actual BULB: white-hot core falling off to warm amber at
// the fixture rim (was a flat solid-color box) — the halo sprite now visually
// originates from the bulb instead of floating under a uniform slab
var lampBulbT = (function () {
  var c = document.createElement('canvas'); c.width = 64; c.height = 32;
  var g = c.getContext('2d');
  g.fillStyle = '#8a7448'; g.fillRect(0, 0, 64, 32);   // fixture rim
  var gr = g.createRadialGradient(32, 16, 2, 32, 16, 30);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, '#fff3c4'); gr.addColorStop(0.7, '#eec97c'); gr.addColorStop(1, '#a8874e');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 32);
  var t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
})();
var lampOnM = new THREE.MeshBasicMaterial({ map: lampBulbT });
var lampOffM = lamb({ color: 0x3a3d42 });
var lampGlowT = (function () {
  var c = document.createElement('canvas'); c.width = c.height = 64;
  var g = c.getContext('2d');
  var gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,235,170,0.9)'); gr.addColorStop(0.4, 'rgba(255,220,140,0.3)'); gr.addColorStop(1, 'rgba(255,220,140,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
var poolGeo = new THREE.CircleGeometry(4.5, 14); poolGeo.rotateX(-Math.PI / 2);
var poolM = new THREE.MeshBasicMaterial({ color: 0xffdf90, transparent: true, opacity: 0.16, depthWrite: false });
function streetlight(x, z, ax, az) {
  // silver cobra-head on a tapered pole, arm overhanging the road (matches the
  // Street Views). ax,az = unit direction toward the road; the arm is built
  // along +x inside its own group and yawed into place. Same lampsOn/breakable
  // contract as before (entry.head material swap + glow/pool visibility).
  var g = new THREE.Group();
  g.add(cyl(0.09, 0.18, 8.0, 8, poleMetal, 0, 4.0, 0));
  var arm = new THREE.Group();
  var rise = cyl(0.055, 0.075, 2.9, 6, poleMetal, 1.4, 8.08, 0);   // curves up from the pole top
  rise.rotation.z = -(Math.PI / 2 - 0.265);
  arm.add(rise);
  var neck = cyl(0.05, 0.055, 1.1, 6, poleMetal, 0, 0, 0);         // levels off into the head
  neck.rotation.z = -Math.PI / 2; neck.position.set(3.35, 8.46, 0);
  arm.add(neck);
  arm.add(box(1.15, 0.16, 0.34, poleMetal, 4.05, 8.44, 0));        // cobra body
  arm.add(box(0.34, 0.12, 0.26, poleMetal, 4.68, 8.4, 0));         // drooped nose
  var head = box(0.62, 0.07, 0.26, lampOffM, 4.05, 8.34, 0);       // lens underneath
  arm.add(head);
  var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: lampGlowT, transparent: true, depthWrite: false }));
  glow.scale.set(5, 5, 1); glow.position.set(4.05, 8.15, 0); glow.visible = false;
  arm.add(glow);
  var pool = new THREE.Mesh(poolGeo, poolM);
  pool.position.set(4.1, 0.17, 0); pool.visible = false;
  arm.add(pool);
  arm.rotation.y = Math.atan2(-az, ax);
  g.add(arm);
  g.position.set(x, 0, z);
  scene.add(g);
  var entry = { head: head, glow: glow, pool: pool, broken: false };
  streetLights.push(entry);
  registerBreakable(g, x, z, 0.6, 'light', entry, 0.22);
}
(function placeStreetlights() {
  if (WC_REMAP) remapStreetlightRows();   // chainage rows along the true arterials/collectors
  else {
    for (var x = -290; x <= 290; x += 58) {
      if (Math.abs(x) < CROSS_HW + 10) continue;
      streetlight(x, -(MAIN_HW + 5.5), 0, 1);
      streetlight(x + 29 <= 290 ? x + 29 : x - 29, MAIN_HW + 5.5, 0, -1);
    }
    for (var z = -290; z <= 290; z += 64) {
      if (Math.abs(z) < MAIN_HW + 10) continue;
      streetlight(-(CROSS_HW + 5.5), z, 1, 0);
      streetlight(CROSS_HW + 5.5, z + 32 <= 290 ? z + 32 : z - 32, -1, 0);
    }
  }
  // parking-lot lights (keyed to the OLD lot positions — legacy world only;
  // the remap streetlight rows already light the relocated venues' roads)
  if (!WC_REMAP) {
    streetlight(-92, -96, 1, 0); streetlight(-52, -96, -1, 0);        // Publix lot
    streetlight(-18, -238, -1, 0);                                    // school lot
    streetlight(-160, 34, 0, 1); streetlight(-250, 36, 0, 1);         // strip mall frontage
    streetlight(40, 33, 0, 1);                                        // RaceTrac frontage
    streetlight(-116, 22, 0, 1);                                      // Dunkin
  }
})();
var lampsOn = false;
function setLamps(on) {
  if (on === lampsOn) return;
  lampsOn = on;
  for (var i = 0; i < streetLights.length; i++) {
    var L = streetLights[i];
    L.head.material = on ? lampOnM : lampOffM;
    L.glow.visible = on && !L.broken;
    L.pool.visible = on && !L.broken;
  }
}

// ---------------- day/night + rain ----------------
var DAY_LEN = 360;             // full day/night cycle (6 min)
var envT = 60;                 // start in daylight
var raining = false, rainLeft = 0, nextRainCheck = 25;
var fogTmp = new THREE.Color(), skyTmp = new THREE.Color();
var C_DAY_FOG = new THREE.Color(0xcfe4ee), C_NIGHT_FOG = new THREE.Color(0x0b1018);
var C_RAIN_FOG = new THREE.Color(0x6a7580), C_RAINNIGHT_FOG = new THREE.Color(0x05070a);
var C_DAY_SKY = new THREE.Color(0xffffff), C_NIGHT_SKY = new THREE.Color(0x1a2540);
var C_RAIN_SKY = new THREE.Color(0x6a7078), C_RAINNIGHT_SKY = new THREE.Color(0x060a14);
// warm daylight sun vs cool moonlight key at night — tinting the one directional
// light gives the night a moonlit blue cast instead of just a dimmer noon
var C_SUN = new THREE.Color(0xfff0d0), C_MOON = new THREE.Color(0x9fb6e0), sunColTmp = new THREE.Color();
function dayFactor() {
  var a = (envT / DAY_LEN) * Math.PI * 2;
  return Math.max(0, Math.min(1, Math.sin(a) * 1.35 + 0.3));   // gentler dusk/dawn ramp
}
function groundHeightAt(x, z) {
  for (var i = 0; i < mapBuildings.length; i++) {
    var b = mapBuildings[i];
    if (b.rot) {
      // rotated footprint (remap venues, R3+): probe in building-local frame
      if (b._c === undefined) { var ra = b.rot * Math.PI / 180; b._c = Math.cos(ra); b._s = Math.sin(ra); }
      var dx = x - b.x, dz = z - b.z;
      var u = dx * b._c - dz * b._s, v = dx * b._s + dz * b._c;
      if (Math.abs(u) < b.w / 2 && Math.abs(v) < b.d / 2) return (b.h || 5) + 0.2;
      continue;
    }
    if (x > b.x - b.w / 2 && x < b.x + b.w / 2 && z > b.z - b.d / 2 && z < b.z + b.d / 2) return (b.h || 5) + 0.2;
  }
  return 0.16;
}

// rain particles (streaks around the player only) + splashes
var RAIN_N = 340;
var rainDrops = [];
var rainLines = (function () {
  var geo = new THREE.BufferGeometry();
  var pos = new Float32Array(RAIN_N * 6);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  var mat = new THREE.LineBasicMaterial({ color: 0xaebfd0, transparent: true, opacity: 0.45 });
  var lines = new THREE.LineSegments(geo, mat);
  lines.visible = false; lines.frustumCulled = false;
  scene.add(lines);
  for (var i = 0; i < RAIN_N; i++) rainDrops.push({ x: 0, y: -999, z: 0, landH: 0, speed: 24 });
  return lines;
})();
function respawnDrop(d) {
  d.x = player.x + (Math.random() - 0.5) * 46;
  d.z = player.z + (Math.random() - 0.5) * 46;
  d.y = 9 + Math.random() * 12;
  d.landH = groundHeightAt(d.x, d.z);
  d.speed = 22 + Math.random() * 9;
}
var SPLASH_N = 130, splashIdx = 0;
var splashPts = (function () {
  var geo = new THREE.BufferGeometry();
  var pos = new Float32Array(SPLASH_N * 3);
  for (var i = 0; i < SPLASH_N * 3; i += 3) pos[i + 1] = -999;
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  var mat = new THREE.PointsMaterial({ color: 0xdfeaf2, size: 0.1, transparent: true, opacity: 0.6 });
  var pts = new THREE.Points(geo, mat);
  pts.visible = false; pts.frustumCulled = false;
  scene.add(pts);
  return pts;
})();
var splashLife = new Float32Array(SPLASH_N);
function addSplash(x, y, z) {
  var p = splashPts.geometry.attributes.position.array;
  p[splashIdx * 3] = x; p[splashIdx * 3 + 1] = y + 0.08; p[splashIdx * 3 + 2] = z;
  splashLife[splashIdx] = 0.28;
  splashIdx = (splashIdx + 1) % SPLASH_N;
}
function updateRainFx(dt) {
  var show = raining && !inside;
  rainLines.visible = show;
  splashPts.visible = show;
  if (!show) return;
  var pos = rainLines.geometry.attributes.position.array;
  for (var i = 0; i < RAIN_N; i++) {
    var d = rainDrops[i];
    d.y -= d.speed * dt;
    if (d.y <= d.landH) {
      addSplash(d.x, d.landH, d.z);
      respawnDrop(d);
    }
    // drift out of range: recycle
    if (Math.abs(d.x - player.x) > 30 || Math.abs(d.z - player.z) > 30) respawnDrop(d);
    pos[i * 6] = d.x; pos[i * 6 + 1] = d.y; pos[i * 6 + 2] = d.z;
    pos[i * 6 + 3] = d.x; pos[i * 6 + 4] = d.y - 0.85; pos[i * 6 + 5] = d.z;
  }
  rainLines.geometry.attributes.position.needsUpdate = true;
  var sp = splashPts.geometry.attributes.position.array;
  for (i = 0; i < SPLASH_N; i++) {
    if (splashLife[i] > 0) {
      splashLife[i] -= dt;
      sp[i * 3 + 1] += dt * 0.9;   // little upward pop
      if (splashLife[i] <= 0) sp[i * 3 + 1] = -999;
    }
  }
  splashPts.geometry.attributes.position.needsUpdate = true;
}
function updateEnv(dt) {
  envT += dt;
  // the sky dome (r=520) is smaller than the expanded map — keep it centered
  // on the camera so the far corners never poke outside it
  if (skyDome) { skyDome.position.x = camera.position.x; skyDome.position.z = camera.position.z; }
  // rain scheduling (clients follow the host's weather instead)
  if (!isClient()) {
    if (raining) {
      rainLeft -= dt;
      if (rainLeft <= 0) { raining = false; nextRainCheck = 30 + Math.random() * 40; }
    } else {
      nextRainCheck -= dt;
      if (nextRainCheck <= 0) {
        nextRainCheck = 25 + Math.random() * 35;
        if (Math.random() < 0.4) { raining = true; rainLeft = 35 + Math.random() * 35; }
      }
    }
  }
  var f = dayFactor();
  var night = f < 0.3;
  setLamps(night);
  // targets — raised the NIGHT floor (was sun 0.06 / hemi 0.14 ≈ pitch black)
  // to a moody-but-visible moonlit level; day peaks unchanged
  var sunT = raining ? (0.12 + 0.26 * f) : (0.17 + 0.57 * f);
  var hemiT = raining ? (0.22 + 0.3 * f) : (0.32 + 0.42 * f);
  var k = Math.min(1, dt * 1.2);
  sun.intensity += (sunT - sun.intensity) * k;
  hemi.intensity += (hemiT - hemi.intensity) * k;
  sunColTmp.copy(C_MOON).lerp(C_SUN, f); sun.color.lerp(sunColTmp, k);   // cool moonlight at night → warm by day
  // lit windows: fade the building/house emissive glow in as it gets dark
  var nightGlow = Math.max(0, Math.min(1, 1 - f * 1.6));
  for (var ne = 0; ne < nightEmis.length; ne++) nightEmis[ne].emissiveIntensity = nightGlow * (nightEmis[ne].userData.emisBase || 0.24);
  if (raining) skyTmp.copy(C_RAINNIGHT_SKY).lerp(C_RAIN_SKY, f);
  else skyTmp.copy(C_NIGHT_SKY).lerp(C_DAY_SKY, f);
  if (skyDome) skyDome.material.color.lerp(skyTmp, k);
  // rain brings a dense fog the color of the rain sky; both fade with the
  // same lerp when the rain stops
  if (raining) fogTmp.copy(skyTmp);
  else fogTmp.copy(C_NIGHT_FOG).lerp(C_DAY_FOG, f);
  scene.fog.color.lerp(fogTmp, k);
  var farT = raining ? 95 : (120 + 400 * f);
  scene.fog.far += (farT - scene.fog.far) * k;
  scene.fog.near += ((raining ? 12 : 60 + 60 * f) - scene.fog.near) * k;
  // rain sound
  if (rainGain) {
    var tgt = raining ? (inside ? 0.02 : 0.07) : 0;
    rainGain.gain.value += (tgt - rainGain.gain.value) * Math.min(1, dt * 2);
  }
  updateRainFx(dt);
}

// ---------------- people ----------------
// ---------------- PSX characters ----------------
// One 256px canvas atlas per character carries ALL the painted detail
// (face, hair, clothes) on a boxy segmented body — style inspired by
// JashiPSX's "Simple Character PSX" (rebuilt procedurally, no assets).
var CSKIN = ['#f0cba2', '#e8b88a', '#c98d5e', '#a06a40', '#8a5a38', '#6e4428'];
var CHAIRC = ['#2a1c10', '#4a3520', '#111111', '#8a5a20', '#c8a04a', '#c8c2b4', '#8a2a1a', '#c845c8'];
var CSHIRT = ['#c04434', '#3d6fb8', '#4a9a50', '#d8c447', '#b86fb8', '#e8e4da', '#e07f3c', '#4ab0b0', '#22252a', '#7a4898'];
var CPANTS = ['#31435c', '#4a4a4e', '#6e5a3a', '#3a5a3a', '#7c8288', '#20242c', '#8a6a4a', '#b0a890'];
var CSHOE = ['#26221e', '#e8e4da', '#8a2a1a', '#4a4a4e'];
var CHAT = ['#c03024', '#22252a', '#3d6fb8', '#e8e4da', '#6e5a3a', '#d8c447'];
var HAIRN = ['BALD', 'BUZZ', 'SHORT', 'LONG', 'MOHAWK', 'AFRO', 'PONYTAIL'];
var EYESN = ['CHILL', 'WIDE', 'SLEEPY', 'MAD', 'BEADY'];
var MOUTHN = ['SMILE', 'FLAT', 'OPEN', 'FROWN', 'SMIRK'];
var FACEXN = ['NONE', 'STUBBLE', 'FRECKLES', 'LIPSTICK'];
var SHIRTN = ['PLAIN', 'STRIPES', 'GRAPHIC', 'V-NECK', 'HOODIE', 'TANK'];
var LEGSN = ['PANTS', 'SHORTS'];
var HATN = ['NONE', 'CAP', 'BEANIE', 'COWBOY', 'POLICE'];
var GLASSN = ['NONE', 'SHADES', 'GLASSES'];
var GEARN = ['NONE', 'PURSE', 'BACKPACK', 'CHAIN'];
var CC_FIELDS = ['skin', 'hair', 'hairC', 'eyes', 'mouth', 'faceX', 'shirt', 'shirtC', 'shirtC2', 'pants', 'pantsC', 'shoeC', 'hat', 'hatC', 'glasses', 'extra', 'build', 'preset'];
var CC_MAX = { skin: CSKIN.length, hair: HAIRN.length, hairC: CHAIRC.length, eyes: EYESN.length, mouth: MOUTHN.length, faceX: FACEXN.length, shirt: SHIRTN.length, shirtC: CSHIRT.length, shirtC2: CSHIRT.length, pants: LEGSN.length, pantsC: CPANTS.length, shoeC: CSHOE.length, hat: HATN.length, hatC: CHAT.length, glasses: GLASSN.length, extra: GEARN.length, build: 5, preset: 4 + ((typeof MESHY_CHARS !== 'undefined') ? MESHY_CHARS.filter(function (m) { return !m.role || m.role === 'civ'; }).length : 0) };
function seededRng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function randomCharConfig(rng) {
  rng = rng || Math.random;
  var cfg = {};
  for (var i = 0; i < CC_FIELDS.length; i++) { var k = CC_FIELDS[i]; cfg[k] = (rng() * CC_MAX[k]) | 0; }
  cfg.hat = rng() < 0.3 ? 1 + ((rng() * 3) | 0) : 0;        // street hats only (POLICE reserved)
  cfg.glasses = rng() < 0.3 ? 1 + ((rng() * 2) | 0) : 0;
  cfg.extra = rng() < 0.4 ? 1 + ((rng() * 3) | 0) : 0;
  cfg.faceX = rng() < 0.35 ? 1 + ((rng() * 3) | 0) : 0;
  // never the plain blocky procedural look (preset 0, "V1"): mostly Meshy
  // skinned civilians, occasionally a painted PSX preset (JESS/MARCUS/SPIKE)
  cfg.preset = (MESHY_CIVS.length && rng() < 0.85) ? 4 + ((rng() * MESHY_CIVS.length) | 0) : 1 + ((rng() * PSX_SKINS.length) | 0);
  return cfg;
}
// v2 ('b' prefix): every field is one base36 char EXCEPT preset (the last
// field), which is two chars — preset is data-driven (4 + Meshy civ count, now
// 39) and one char caps at 35, which silently turned the newest presets
// (DON/ALEX/XANDER) into JESS on reload and for remote players. 'a'-prefix
// strings (old saves) still decode with the legacy one-char preset.
function encodeCC(cfg) {
  var s = 'b';
  for (var i = 0; i < CC_FIELDS.length; i++) {
    var v = (cfg[CC_FIELDS[i]] | 0);
    if (CC_FIELDS[i] === 'preset') { var p2 = v.toString(36); s += (p2.length < 2 ? '0' : '') + p2; }
    else s += Math.min(35, v).toString(36);
  }
  return s;
}
function decodeCC(s) {
  if (!s) return null;
  var v2 = s.charAt(0) === 'b';
  if (!v2 && s.charAt(0) !== 'a') return null;
  if (s.length < CC_FIELDS.length + 1 + (v2 ? 1 : 0)) return null;
  var cfg = {}, pos = 1;
  for (var i = 0; i < CC_FIELDS.length; i++) {
    var k = CC_FIELDS[i], v;
    if (v2 && k === 'preset') { v = parseInt(s.substr(pos, 2), 36); pos += 2; }
    else { v = parseInt(s.charAt(pos), 36); pos += 1; }
    if (isNaN(v)) v = 0;
    cfg[k] = Math.max(0, Math.min(CC_MAX[k] - 1, v));
  }
  return cfg;
}
function shade(hex, f) {
  var n = parseInt(hex.slice(1), 16);
  var r = Math.min(255, ((n >> 16) & 255) * f | 0), g = Math.min(255, ((n >> 8) & 255) * f | 0), b = Math.min(255, (n & 255) * f | 0);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
var PSX_MESH = {"anchors":{"nose":[200.9,120.2],"chest":[56.6,58],"collar":[178.4,115.7],"chin":[206.1,120.5],"top":[246.2,125.9],"eyeL":[230.4,118.1],"eyeR":[228.2,134.2]},"parts":{"armL":{"pv":[0.1937,1.3942,-0.034],"n":101,"p":"CAARAFH/ZQE3/6b/9P9L/5X/UwHT/1sAwAHC/2IAmQEbAPz/9P9L/5X/UAE3/2YA8f9L/3QAegFcAAQAfAHi/23/FwCeAP//YAHi/5UACAARAKcAZAEkAAAAYAHi/5UAUwHT/1sASQFq/z4AZQE3/6b/VwFq/8b/fAHi/23/ZQHV/6P/egFcAAQAUAE3/2YA3AHE/6v/mwHM/57/VwFq/8b/mwHM/57/jAFh/8L/zAFZ/87/uAFZ/0UAZQHV/6P/SQFq/z4ANQK7/4EA2gNa/5EA3gOC/5wAZAEkAAAA3AHE/6v/QgJN/9j/VAK8/7H/7wOD/xEA6wO4/1wATQISABsAVAK8/7H/7wOD/xEAKwJN/2AA1gETAAgAQf93/2MARP93/6T//wR//28AUAUz/9IAagVD/3gABAVj/wIATQUd/5kA3gRF/7YA3gRF/7YAUAUz/9IA4wRc/+0AZQUr/yMABAVj/wIA7wOD/xEAbQSX/2AAcAR3//r/3gOC/5wATQRF//cAfgRy/9YA7wOD/xEAawRW/60A2gNa/5EA6wO4/1wAfgRy/9YAcAR3//r/UATp/iMBcgTw/hwBBQQy/+kA3gOC/5wAawRW/60ATQRF//cAPwQm/9YAPwQm/9YAAAQc/80AUATp/iMBWQTc/vcAcgTw/hwBRwTY/gYBUATp/iMBcgTw/hwBWQTc/vcAagVD/3gATQUd/5kAZQUr/yMAZQE3/6b/ZQHV/6P/RP93/6T/4wRc/+0AZQUr/yMATQUd/5kABQQy/+kARwTY/gYBWQTc/vcAUAUz/9IA","u":"mxwyApsfkwCbHJMAZxHgE2QR0BSKElAUmxzHCJsfCAebHAgHmx/YA5sfMgKbHNgDmx95BZsceQXsEg8QqRPxDrMTdA94FPYPlRRWEUgU7xD/EksRSRPgEGcS7w/vFMUPjBP0FJ0TYBRjD/4Tag5rFF0PaRRtD/AUbRDWFI4T8RNuEOUTYRHRFdoQMRkxETMZfRLfE3YOAxV5D+MVhg4RFrkPXhnnEUAZaxLaFYYT+RWmEmUZgxDEFXoS3BQaGwgHGhvHCF4eaxiXHVIZXh5oGTwcmRkHHVcYEBwWGFsbsBVvGgEWZhstFhgfaBlEH3YYFB86FmEeNxdGHzwXpR0vFuMcLRdkHYYX+hlRGR0bGBjpGTYYVh4kFjoc7xUEG5QZ+xv8FiMcgBfvGVcXkxk+GEkcgRXVHOMV6hyBFckajxcvGoYXwhv4FnkbWxfXG4AXmBq+Fl8ajxalHeYVmx2BFVoevBkBHg8a/x4PGpsfxwhqDv4TGhuTAE0dYxgnHVIZYBqBFcYckRZ5G+4W/xrlFpMdzBk=","c":"AQEBAAAAAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAQAAAAAAAAA=","i":"AAABAAIAAwAEAAUABgAHAAgAAAAJAAoACwAMAAkACAAMAA0ADgAPABAAEQASABMAEwAUABUADgAUABYAEQAPABcABQAYABkAGgAbABwAHAAdAB4AHwAFABkAIAAEAAMAIQAiACMAGgAcACAAJAADAAUAHAAlAB0AIAAcAB4AJgAnACgAIgAmACgAIQApACoAKwApACwAHQAtAB4ALgArABgABAAqAC4AJQAmAB0ABAAtACEADQAvAAgABAAuAAUACAAwAAYAMQAyADMANAA1ADYANwA4ADkAMQA6ADsAPAA9AD4APwBAAEEAQgBDAEQAPwA9AEUAPgAxADsARgA3ADkARwA2AEMAQQAxAD0AQABIAEkARABKAEsATABNAE4ARABPAFAAUQBSAFMASgBUAFUATgBWAFcATwBUAFAALQAmACIAWABZAFoAAAAKAAEABgBbAAcAAAALAAkACwANAAwACAAHAAwADgAWAA8AEQAXABIAEwASABQADgAVABQAEQAQAA8ABQAuABgAGgBcABsAHwAkAAUAIAAeAAQAIQAtACIAHAAbACUAIQAjACkAKwAqACkAHQAmAC0ALgAqACsABAAhACoAJQAnACYABAAeAC0AAAACAF0AMQBeADIANABfADUANwBgADgAMQAzADoAPABFAD0APwBhAEAAQgBHAEMAPwBBAD0APgA9ADEARgBMADcARwA0ADYAQQBeADEAQABhAEgARABQAEoATABGAE0ARABDAE8AUQBiAFIASgBQAFQATgBNAFYATwBjAFQAWABkAFkA"},"torso":{"pv":[0,0,0],"n":163,"p":"jAH1Cg3/xwBbCmD/2QAECyb/mgGCC7r/2QAEC0sAjAH1CmMA5QB9C7r/KP8EC0sAZ/6CC7r/df71CmMAKP8ECyb/df71Cg3/xQBbCh4AdQEvCjAAxwBbCmD/PP9bCh4AOv9bCmD/HP99C7r/Ov9bCmD/jP4vCjAAjAGCBssARAGLBioBLwGfBusAiAHxClgAQgE5C14ArQCmBh0BKQE2CpwAcwE4CigABgCcBlQBKwHIB/8ABgDtByoBBgAJCfsAIQHkCNMA3QDAC0r/SwH+CgH/iwAiC+D+gQA8CtX+BgAJCR3/BgBDCuf+BgB3Bvz+CgHMBzb/EgFsBv3+ZwHeCIAAdAHCB6QARAGLBioBjAGCBssACQHmCBr/gQA8CtX+OwE2CuX+ogB2C2QABgBNCtEAdAHCB8L/hgF1Bm//ZwHeCIX/ZwHeCIX/BgCRC2kABgBDCuf+3QDAC0r/+QCwC8n/BgCFBhT/0QB9Bhb/HAC0BS//OwE2CuX+SwH+CgH/7/+0BS//HAC0BfEA7/+0BfEABgCcBlQBrQCmBh0BHAC0BfEALwGfBusABgDtByT/BgAJCR3/BgDYC2b/BgAvC/H+BgCvBj0BogB2C2QABgDTC+T/BgCRC2kA0QB9Bhb/BgB3Bvz+EgFsBv3+BgDYC2b/gP6CBssAx/6LBioBg/7xClgAyv45C14Aav6EC7r/Xv+mBh0B4v42CpwA4P7IB/8Ax/6LBioBLv/AC0r/gP8iC+D+wP7+CgH/iv88CtX+Av/MBzb/+f5sBv3+pP7eCIAAmf44CigAl/7CB6QA6/7kCNMAiv88CtX+A//mCBr/0f42CuX+af92C2QAhf51Bm//l/7CB8L/l/7CB8L/gP6CBssApP7eCIX/pP7eCIX/av6EC7r/E/+wC8n/Lv/AC0r/7/+0BS//oP7EBG7/6v57Bkr/wP7+CgH/BgCcBlQBXv+mBh0B3P6fBusA7/+0BfEA0f42CuX+mP6KBhUABgCvBj0BBgDTC+T/Ov99Bhb/BgB3Bvz+BgCFBhT/6v57Bkr/+f5sBv3+BgDYC2b/E/+wC8n/hf51Bm//BgCvBj0BdAHCB8L/hgF1Bm//Ov99Bhb/IQF7Bkr/HAC0BS//BgCFBhT/+QCwC8n/iv88CtX+BgAJCR3/A//mCBr/hf51Bm//BgBDCuf+gP8iC+D+af92C2QAm/8GDBsAof+CC43/uv9kCy8ANQD1C0EAAABcC0gARgBkCy8AXgCCC43/AACAC2f/AAALDH3/ZQAGDBsAy//1C0EAAAALDH3/AACAC2f/","u":"mxwyAhobkwAaGzICmxzYAxobeQWbHHkFGhvYA88aeQVPGdgDTxl5Bc8aMgJPGTICGhsIB5scCAcaG8cIzxoIB88akwDPGtgDzxrHCE8ZCAe/FZARLxVcEvUU1xHiCQ4DUQmmAu8TUhJhCZ4EfQpdBBQHhwyaCeEJFAelCRQHQAd4CXIHKRCkAFEPUgLhEB0C6xD7A/cRqAb3EfED9xFlDKQPdAm+D48MYQpcB5YKygnTCZwM1wqJDLAP7QbrEPsDbQ8ABCwIWAIUB6EEUwxiCZQNBQyMDhkHYwzlBhQHPQL3EfED7ggkAPYINAFmD+EMvA3hDDYP2Q4JDaYDVAwSAokTYx3oE7cZiRO3GaES7RIACOEMwwbZDicJ4Qz3ESoJ9xGoBvcRUQD3EfgBlxKwEiwIWAIUBywBFAc9Aj4U/A2bEqcNyhTFDRQHJAC/FZARLxVcEkUEDgPXBKYCyAN8Ae8TUhLGBJ8EjgThCVQEnAzFE6QADhMdAp4UUgIDE/sDSxR0CTAUjwzGA1wHqgNeBJIDygmwBHIHAxP7Az4U7QaCFAAE+wVZAnoVagzEFYcJ1QFiCVADiQxiFRkHxQHlBqgVowAyBTQBOQUkAJUP2Q4MErcQDBLhDNMBEgKhEu0SIwXhDPwD4QxgBtkOHwGmA4QVFhCXErASFAcsAT4U/A2bEqcNlxLiDeMUag7KFMUNFAckADIFNAG1FbwOkgbhDCoOhwl0DmoMDxHhDMAM4QzoE2MdlxLiDfYINAEDE/sD9xGoBj4U7QaUAAUM9xHxAw4THQL7BVkCKhY1EKIXbxG8F80PSxZ1DsMXEA+8F1QOohexDJoXsgs6FtYLKhbsDUsWqw86FkoSmhdvEg==","c":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQECAgIBAQICAgECAgIBAQEBAQAAAAEBAQEBAQEBAQEBAQEBAQEAAQEBAQEBAQEBAQEBAQEBAQEBAQICAgEBAgICAQEBAQEBAQEBAAABAgEBAgIBAQACAgIBAgIAAAAAAAAAAAAAAAAAAA==","i":"AAABAAIAAwAEAAUAAwACAAYABwAIAAkACAAKAAsABQAEAAwAAwAGAAQAAwAAAAIADQAMAA4ADwAHAAkACwAKABAABwARAAgACAARAAoAEgAPABMAFAAVABYAFwAOABgAGQAWABUAFwAaABsAHAAdAB4AGgAfACAAIQAiACMAJAAlACYAJwAoACkAGgAqABsAIAArACoAKwAsAC0ALgAvADAAGgAxADIAMwAtADQANQAoAC4AKgAzADYAMAA1AC4AGwAqADYAIQACACIAMgAxADcAOAAjAC8ADgA5ADoAOwA8AD0AMQAYADoAGAAOADoAGwA+AD8AQABBAEIAGQAVAEMARABFAEYALgBHAEgASQAjAEoALwAiADAAPgAbADYABAAUABYAIAAeAB0ASwAZAEMATABNAE4ATwBQAFEAUgA6ADkAUwARAFQAVQBWAFcAWABUABEAVQBZAFYAHABaAFsAWQAfADIAXABdAF4AXwAmACUAYAAnAGEAYgBZAGMAZABlAGIAZABbAFoAZgBnAGgAaQBZADIAYABqAGsAbABtAGQAYABuAGcAbABiAG8AaABnAG4AYwBvAGIAXABeAHAAMgA3AGkAOABdAEoAVwBxAHIAcwB0AHUAaQBxAFYAVgBxAFcAdgBjAFUAWAB3AFQAeAB5AHoAZwBHAGAASQBdAFwAZgBeAF0AewBvAGMAfAARAFMAZQAeAB8AfQB3AFgAaQB+AHEAfwCAAIEAggCDAH8AhACFAE0AgwCCAIYARACHAEUAhwB4AHoAFwAYABoAHAAsAB0AGgAyAB8AJwBHACgAGgAgACoAIAAdACsAKwAdACwALgBIAC8AGgAYADEAKACIAIkAMwArAC0ANQCIACgAKgArADMAOABKACMAPQBzADsAcwCKADsAPQA8AIsAPwAOABcAFwAbAD8ADwCMAAUALgAoAEcASQAhACMALwAjACIAIAAfAB4AMQA6AH4ATwCNAFAAhABNAI4AVQBjAFkAHAAeAFoAWQBlAB8AYABHACcAYgBlAFkAZABaAGUAZABtAFsAjwCQAJEAaQBWAFkAYABhAGoAbACSAG0AYABrAG4AbABkAGIAkwCPAJQAdQCKAHMAVQBXAHYAdgB7AGMAZwBIAEcASQBKAF0AZgBoAF4AZQBaAB4AlQBOAE0AfwCDAIAAUgByAHEAlgCXAJgAmQCaAJsAnACdAJ4AnwCbAJwAmACaAKAAoQCiAJcA"},"armR":{"pv":[-0.1937,1.3942,-0.034],"n":104,"p":"nP43/6b/+f8RAFH/DQBL/5X/rv7T/1sAaP4bAPz/Qf7C/2IAsf43/2YADQBL/5X/EABL/3QAh/5cAAQA6v+eAP//of7i/5UA+f8RAKcAof7i/5UAnf4kAAAArv7T/1sAnP43/6b/uP5q/z4Aqv5q/8b/hf7i/23/nP7V/6P/Jf7E/6v/Zv7M/57/qv5q/8b/Zv7M/57/nP7V/6P/df5h/8L/Sf5Z/0UANf5Z/87/nP7V/6P/nf4kAAAAuP5q/z4AzP27/4EAJ/xa/5EA1v1N/2AAJf7E/6v/v/1N/9j/EvyD/xEArf28/7H/Fvy4/1wAtP0SABsArf28/7H/K/4TAAgAwAB3/2MAvQB3/6T/vQB3/6T/Avt//28Asfoz/9IAHvtc/+0AtPod/5kA/fpj/wIAI/tF/7YAsfoz/9IAI/tF/7YAHvtc/+0AnPor/yMA/fpj/wIAEvyD/xEAlPuX/2AAFvy4/1wAtPtF//cAI/yC/5wAg/ty/9YAlvtW/60AEvyD/xEAJ/xa/5EAkft3//r/g/ty/9YAlvtW/60Akft3//r/sfvp/iMB/Psy/+kA/Psy/+kAI/yC/5wAtPtF//cAwvsm/9YAsfvp/iMBqPvc/vcAuvvY/gYBuvvY/gYBAfwc/80Awvsm/9YAj/vw/hwBl/pD/3gAtPod/5kAsfoz/9IAhf7i/23/nP43/6b/h/5cAAQAsf43/2YAI/yC/5wAEvyD/xEAl/pD/3gAnPor/yMAtPod/5kAnPor/yMAl/pD/3gAAvt//28Aj/vw/hwBj/vw/hwBsfvp/iMBqPvc/vcAqPvc/vcAnPor/yMA","u":"ThaTAE8ZMgJPGZMAFBbeE/EUThQXFs4UThYIB08ZxwhPGQgHThbYA08Z2ANOFnkFTxl5Bf8SSxFIFO8QSRPgEKkT8Q7sEg8QsxN0D+8UxQ94FPYP7xPyFN4TXRQYGPwTERlpFBEZ+xMeGGYUDRfUFA4Y7hTsE+8T/hTdEw0X4xMaFs8VoRYuGfcWwhUFGQEVAhjhFcIXWxn1GA8WlBU+GRAV2BX1E/cVARXZFM8aCAfPGpMAzxrHCF4emhyXHbIbTR2iHAodrRxNHGMbEBziHIAamh5aGxEfehuYHhgfnRtEH48cFB/LHmEezh1WHuEe4xzYHaUd1h5kHX8dHRvXHAgakhvrGawcRh/IHUEc+R49HGgfFBtaG/sbCR7GHHQe5xmLHZYZoRzYHCAfwxpcHbobDR5xG6odcRsXHokaKx4qGl8d3ByEH6UdQB9aHl8bAR4NG5MdTxtOFjICThbHCJUUVhFnEu8PShYxGdUUYxleHp0bNB2yG1saFR8YH50bXh6dG14emhwjHIUdzxuFHU8aVx6KHaIf8xoJHv8eDRs=","c":"AQEBAAAAAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQAAAAAAAAABAQEAAAAAAAA=","i":"AAABAAIAAwAEAAUABgAHAAgAAQAJAAoACgALAAwACwAIAAwADQAOAA8AEAARABIAEwASABQADgATABQAEQANAA8AFQAEABYAFwAYABkAGgAbABwAHQAEAB4AHwAFABsAIAAhACIAFwAfABoAHgAEAAMAGgAjABgAHwAbABoAJAAlACYAIQAlACQAJwAgACgAKQAnACgAIgAcABsAKQAqABUAKAAFACoAJAAjABwABQAiABsAKwAMAAgABQAEACoAAQAsAAIALQAIAAcALgAvADAAMQAyADMANAA1ADYANwAuADgAOQA6ADsAPAA9AD4APwBAAEEAOgA9ADsAQgAuADoAQwA1AEQAMwBFAD8ALgA+ADoAPABGAEcASABBAEkARABKAEMAQQBLAD8ATABNAE4ASABPAFAAUQBSAEoATwBLAFAAIgAhACQAUwBUAFUAAABWAAEABgBXAAcAAQBWAAkACgAJAAsACwAGAAgADQBYAA4AEABZABEAEwAQABIADgBYABMAEQBZAA0AFQAqAAQAFwAaABgAHQAWAAQAHwADAAUAIABaACEAGgAcACMAJwBaACAAKQBbACcAIgAkABwAKQAoACoAKAAgAAUAJAAmACMABQAgACIALgBcAC8AMQBdADIANABeADUAXwBgAGEAOQBCADoAPABHAD0APwBFAEAAOgA+AD0AQgA4AC4AQwA2ADUAMwAyAEUALgAwAD4APABiAEYASABQAEEARABRAEoAQQBQAEsATABjAE0ASABkAE8AUQBlAFIATwBmAEsAUwBnAFQA"},"legL":{"pv":[0.1064,0.8886,0.0178],"n":113,"p":"iwDT/dQAsv+I/IoAqwCI/IoAlgDT/Ur/xP+I/CX/dv/T/T3/nwCY//H/WgCu/8gANQDaABL/sQCE/0z/PQB7/9n+ywDT/ez/dv/T/T3/j/+I/Ov/a//T/ez/sQCE/0z/nwCY//H/TACK/yb/twCR/6cAhwCY/FcA7v84/FoAlAA4/FoAa//T/ez/sv+I/IoAg//T/bQASP/D/gv/4wCI/Ov/SP/D/gv/SP/D/s0A9P+Y/FcAqwCI/IoAsv+I/IoAhACY/Fj/xP+I/CX/qwCI/DX/4wCI/Ov/rQCY/On/j/+I/Ov/x/+Y/OH/hwCY/FcA7P+Y/Fj/sgA4/NH/hgDk+z8ArQDk+9H/x/+Y/OH/7P+Y/Fj/wv84/Mr/x/+Y/OH/9P+Y/FcAhADk+x//rQCY/On/7P/k+x//vv/k+8r/hACY/Fj/wv84/Mr/+//k+z8ACwDZ+XH/9P/Z+cL/vv/k+8r/DADZ+QgAcgDZ+QQAlwDZ+cL/dwDZ+W7/9P/Z+cL/BAAP+VX/7f8P+fX/cgDZ+QQApAAP+RIAlwDZ+cL/CwDZ+XH/fAAP+VL/BAAP+VX/tQBM+TwB1P8P+VQBtQAP+U4BngBw+bsA0/9M+UIBtQBM+TwBDADZ+QgAtQAP+U4BpAAP+RIA7f8P+fX/1P8P+VQB0/9M+UIB4f9w+cEAfAAP+VL/7f8P+fX/pAAP+RIA1P8P+VQB/P+M//P+PQB7/9n+SP/D/s0ASP/D/gv/Mf++/xoBGv/D/s0Ag//T/bQAlgDT/Ur/qwCI/DX/xP+I/CX/TACK/yb/xP+I/CX/sv+I/IoA4wCI/Ov/9P/Z+cL/CwDZ+XH/CwDZ+XH/dwDZ+W7/tQBM+TwB0/9M+UIB1P8P+VQBBAAP+VX/fAAP+VL/tQAP+U4B","u":"VAm3EMAHdRPWCXUTwAy3EGoOdRPpDrcQDwvhDCcJ4QykD3QJdA5qDL4Pjww8C7cQ6BX8HKoYkhvmFY4btRW8DoQVFhDjFGoOvxWQEekJ1RPkCIAU6QmAFOYVjhuoGD4a7hXnGegTYx05C3UTNg/ZDsMG2Q6uF3AJjRY1CQ8YGgnrFgsLGxhGC7MWRgtIFjIKnBYvClcYDAoCGCEKyxaBCdgX+grUCoAU6QlAFdQKQBWwDdUTxgzVE7ANehT3B9UT5AjVE8ELQBXUCtUTxgxAFbANQBXBC9UT9weAFOQIQBXGDJEZsA2RGfcHQBXkCJEZ6QmRGdQKkRnBC5EZ6AltG7UHIBtPCGIcCQsPHLgM0xxXC3Mb7AvOGWwNNhuuDVEaZgtQH4oJ0h9kC9IfUwsGHo0JUB9mC1AfGwoPHNELox+4DNMcTwhiHB0Jkx+NCVAfrgkGHmwNNhvdBtEd7QUCHgsH1B8+FPwNyhTFDegTtxnoE2MdkgbhDGAG2Q43B7cQwAy3EMAMdRNqDnUTwAzhDK4YPx2oGD4aOQt1E/cHkRmbCcMa7AvOGasLtBpmC1AfjQlQH4oJ0h+4BugcGwbnHOIF0h8=","c":"AgICAgICAgICAgICAgICAgICAgAAAAMDAwICAgIDAwMDAwMDAwMDAwMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwMDAwMDBAQEBAQEAwMDAwQEBAQEAwMDAwMCAgMDAgICAwMDAgICAwADAwMCAgIDAwM=","i":"AAABAAIAAwAEAAUAAAAGAAcACAAJAAoAAwAGAAsADAANAA4ADwAQABEADwASABAAEwAUABUAFgAXABgAGQAMAA4AGgADAAsAAgALAAAAAwAFABsAHAAAAAcAHQAeAB8AIAAhACIAIAAjACQAHQAlACYAJwAjAB4AKAAlACEAKQAqACsALAAtAC4ALwAUADAAKQArADEAMgAVACkAMwA0AC4AMgApADUAFAAqABUALQAzAC4ANgA3ABQANQApADEANAA4ADkAOgA7ADcAMQA4ADMAKwA8AD0AKwA+ADEANQAzAC0APwBAAEEAQgBDAEQARQBGAEcASABJAEoASwBMAE0ATgBLAEIASABPAFAAUQBSAFMATgBBAFQASwBNAEMAVABBAEwAVQBEAEMANwA8ACoAVgBXAFgAEQBZAFoAGABbABYAWwBcABYAWgAPABEAHABdAF4AAABfAAEAYABhAGIAAAALAAYAAwBjAAYADABkAA0AEwAwABQADgANAGUAZgBhAGAAAgAaAAsAYwADABsAHABfAAAAHQAnAB4AIAAoACEAIAAiACMAHQAfACUAJwAkACMAKAAmACUAKQAVACoALwA2ABQAMgATABUAFAA3ACoANgA6ADcANAAzADgAOgBnADsAMQA+ADgAKwAqADwAKwA9AD4ANQAxADMAPwBoAEAAQgBLAEMAaQBqAFUAawBsAG0ASwBUAEwATgBUAEsATgA/AEEAVQBqAEQANwA7ADwAVgBuAG8AbwBXAFYAVwBwAFgA"},"legR":{"pv":[-0.1064,0.8886,0.0178],"n":116,"p":"gf/T/dQAWQCI/IoAiADT/bQARwCI/CX/df/T/Ur/lQDT/T3/bP+Y//H/QP/T/ez/df/T/Ur/fACI/Ov/lQDT/T3/oADT/ez/Wv+E/0z/v/+K/yb/bP+Y//H/VP+R/6cAhP+Y/FcAHQA4/FoAFwCY/FcAWQCI/IoAoADT/ez/iADT/bQAxADD/gv/lQDT/T3/KP+I/Ov/YP+I/DX/YP+I/IoAgf/T/dQAxADD/s0Asf+u/8gAFwCY/FcAYP+I/IoAhP+Y/FcAh/+Y/Fj/RwCI/CX/HwCY/Fj/KP+I/Ov/Xv+Y/On/fACI/Ov/RACY/OH/Wf84/NH/hf/k+z8Ad/84/FoARACY/OH/SQA4/Mr/HwCY/Fj/RACY/OH/Wf84/NH/h//k+x//X//k+9H/Xv+Y/On/HwDk+x//TQDk+8r/h/+Y/Fj/EADk+z8ASQA4/Mr/AADZ+XH////Z+QgATQDk+8r/mf/Z+QQAlf/Z+W7/FwDZ+cL/BwAP+VX/AADZ+XH/mf/Z+QQAZ/8P+RIAbf9w+bsAAADZ+XH/kP8P+VL/lf/Z+W7/V/9M+TwBNwAP+VQBOABM+UIBOABM+UIBKgBw+cEA///Z+QgAV/9M+TwBZ/8P+RIAVv8P+U4BHgAP+fX/OABM+UIBNwAP+VQBHgAP+fX/FwDZ+cL/V/9M+TwBdP/Z+cL/Z/8P+RIAkP8P+VL/HgAP+fX/xADD/s0ARwCI/CX/YP+I/DX/df/T/Ur/sf+u/8gAv/+K/yb/fACI/Ov/RwCI/CX/xADD/gv/xADD/s0AWQCI/IoAYP+I/DX/FwDZ+cL/FwDZ+cL/dP/Z+cL/HgAP+fX/AADZ+XH/BwAP+VX/kP8P+VL/Vv8P+U4BNwAP+VQBBwAP+VX/HgAP+fX/NwAP+VQBZ/8P+RIANwAP+VQBVv8P+U4B","u":"zwO3EGMFdRPsBbcQYRB1EwwStxDiD7cQFALhDOcBtxBjALcQ0g6SG4gR/ByLEY4btRW8DuMUag6EFRYQvxWQES0EzRMyBXgUMgXNE9IOPhqLEY4bgxHnGYkTYx2IEfwc6gF1E2MAdRNNA3UTzwO3EGAG2Q78A+EMrhdwCY0WNQnLFoEJ6xYLCxsYRgvYF/oKSBYyCpwWLwpXGAwKAhghCkADeBQtBCQVLQR4FGMAzRNjAHgUUAHNEx0GzRNAA34UVQIkFUADJBVAA80TUAEkFWMAJBVVAs0TMgUkFR0GeBRQAXsZMgV7GR0GJBUtBHsZVQJ7GV4EoBs+BiAbtgTVGu8CFBxBAdscqAILHgYCzBmLAD8bTAK6GpYCVR9zBNcfcARVH3AEVR9MBAse3QMUHJYCVR9BAdscLAKqH6kFZBxwBFUf4ASWH6kFZBxeBKAblgJVH6ACeRswCAYeBQjqHEAH0h2JE7cZYRB1EwwSdRMMErcQ/APhDGMA4QzSDpIb0w4/HZUP2Q5gBtkODxgaCbMWRgtjAHsZHQZ7GUADexmpBWQcBgLMGUUAURqLAD8bmQLXH3ME1x9oB+kcQAfSHQsH1B8wCAYeCwfUHzQI1h8=","c":"AgICAgICAgICAwMDAgICAgAAAAICAgICAgICAwMDAwMDAwMDAwMDAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAICAgMDAwMDAwICAgMDAwQEBAQEBAMDAwMDAwMCAwMDAgICAgICAwMAAAACBAQEBAQDAgICAwM=","i":"AAABAAIAAwAEAAUAAAAGAAcABgAIAAcACQAKAAsADAANAA4ADAAOAA8AEAARABIAEwAUABUAFgAUABcAGAAIABkAGgAHABgAGwAcAB0AHgAfACAAIQAiACMAJAAhACUAJgAeACcAIAAkACUAIwAmACcAKAApACoAKwAsAC0AEQAuABIALwAwADEAMgAqABAAMwAsADQAMgA1AC8AKQARACoALQAsADMANgA3ABEANQAwAC8ANAA4ADMAOQA6ADYAOAAwADMAMQA7ACkAPAAxADAANQAzADAAPQA+AD8AQABBAEIAQwBEAEUARgBHAEgAQgBJAEoAQgBLAEAATABNAE4ATwBQAFEASwBSAFMAQgBBAFQASgBJAFIARABVAEUAOwA2ACkAVgBXAFgAFQAUAFkAWQAUABYAAAAaAAEAWgBbAFwAAABdAAYABgBeAAgAXwBgABcAEAAqABEAEwBfABQAGAAHAAgAGgAAAAcAYQAFAAQAAAACAGIAHgBjAB8AIQBkACIAJABkACEAJgBjAB4AIAAfACQAIwAiACYAKAAxACkAEQA3AC4AMgAoACoAKQA2ABEANgA6ADcANABlADgAOQBmADoAOAA8ADAAMQBnADsAPABnADEANQAtADMAPQBoAD4AQABVAEEAaQBqAGsATABsAG0AQgBUAEkAQgBKAEsASwBKAFIARABBAFUAOwA5ADYAVwBuAFgAbwBwAHEAcgBzAFYA"},"head":{"pv":[0,0,0],"n":185,"p":"AADSDX8AdQCwDYwAcQDADUkAtgB8DTYAAADoDdz/ngCmDbr/nwBFDXYAxABJDdj/VwAqDbEAhAAeDXQAZwBaDbwAAAArDc4AqQDnDMb/owA9DVL/iABrDIn/AABvDDz/VwDADC//AAALDH3/AACDDRb/UQCoDV3/owDkDP7/AAAPDQ7/qQDnDMb/oQCUDN3/iwCUDNr/lgCJDPz/jQDNDFEAiAB9DD0AowDkDP7/tADnDMf/lgCJDPz/hAAeDXQAbwDqDIIAAADNDMwAAACBDPYALQB7DLIALQB7DLIAAACBDPYAAABqDNMA0v97DLIAAABGDMAAAABqDNMAvv/8C4MAwf9WDKYAeP99DD0AAADzC6gAbwCmDIMAaQDNDH8AGADNDKoAAADNDMwALQB7DLIA6P/NDKoAkf+mDIMAIgDsDKoAbwDqDIIAIgDsDKoAAAArDc4AVwAqDbEAAADsDMYAYwASDMH/AADnC14AQgD8C4MAowDkDP7/AADBDVf/AACqDc4AnADHDGj/iwCUDNr/ZQAGDBsANQD1C0EARgBkCy8AZQAGDBsANQD1C0EAXgCCC43/AAALDH3/YwASDMH/YwASDMH/oQCUDN3/i/+wDYwAAADSDX8Ajv/ADUkASv98DTYAAADoDdz/Yv+mDbr/PP9JDdj/Yf9FDXYAqf8qDbEAmf9aDbwAV//nDMb/Xf89DVL/d/9rDIn/qf/ADC//AABvDDz/AAALDH3/AACDDRb/r/+oDV3/Xf/kDP7/AAAPDQ7/X/+UDN3/V//nDMb/df+UDNr/TP/nDMf/Xf/kDP7/av+JDPz/fP8eDXQAc//NDFEAkf/qDIIA0v97DLIA0v97DLIAPwBWDKYAl//NDH8A3v/sDKoAqf8qDbEAnf8SDMH/AADnC14Ay//1C0EAXf/kDP7/AADBDVf/AACqDc4AAABhDecAZP/HDGj/df+UDNr/uv9kCy8Ay//1C0EAm/8GDBsAm/8GDBsAAAALDH3/of+CC43/nf8SDMH/X/+UDN3/av+JDPz/AABcC0gAAADnC14AlgCJDPz/jQDNDFEAtADnDMf/fP8eDXQAkf/qDIIA3v/sDKoAav+JDPz/TP/nDMf/6P/NDKoAl//NDH8Akf+mDIMAc//NDFEAnf8SDMH/hP+rDJAAb//mDIwAfv+jDI0Adv/0DJEAdv/nDI8Asv8ADawAbv/7DI4A7v/vDMEAsv/3DKsAw/+fDKAAw/+nDKEA3P+wDLQA4v+pDLUA+P/jDMQA8v/qDMIAAADlDMcAAAD0DMkAXv/vDC8AUf/tDLD/V//VDK7/Xf/8DDEAewCrDJAAkQDmDIwAiQDnDI8AigD0DJEATgAADawATgD3DKsAEgDvDMEAPQCfDKAAPQCnDKEAJACwDLQACADjDMQADgDqDMIAogDvDC8ArgDtDLD/owD8DDEAkgD7DI4AgQCjDI0AHgCpDLUAqQDVDK7/","u":"Ph/JEOMd2hAVHoYRRx2ZETMf3BJvHZoSAR3zELQcNxLzHBUQqBzCEGgdQhAZHRAPzxstEnkcPRO2GtMSLhpoFFob1RP/GIsTTR3HFJAdoBP0G7YRDRz2FE4Y5QwmGf4MLxnHDBYbrBHZG+8QDhsEEcQXxwxIGAENfhn6DKgcwhA3HHAQZhgNDxwZBQ/hGGYOixiVDg8YEQ9mGA0PLRuPDrYaEA8XGxAP1RlhDtEaZQ4OGxwNxBkQD4kbWhDqG2AQ/Rt4D/gbEA8tG5EP/RuoDokbxg1MHI8PNxxwEEwcjw8ZHRAP8xwVEFIcEA+lGTUSGxmvD9UZvw/0G7YRPh4+FMYevg+GGwsTGhsdEqIZBRFLFnUOvBdUDioW7A1qGWUQohexDDoW1gsqFgQNpRk1EhobHRLjHUYNPh9XDRUemgxHHYcMMx9EC28dhgu0HOkLAR0uDfMcCw5oHd4NzxvzC3kc4wq2Gk0LWhtLCi4auAn/GJUKTR1aCZAdgAr0G2oMDRwqCSkZJhFSGD8RMhldEUsYIhHHF10RgRkpEagcXw3ZGzENNxyxDeYYrQ+QGIAP0Rq7D+obwA1MHJEO8xwLDqUZ6wsbGXEOahm8DfQbagw+HuIJxh5iDvIdEA+GGxYLGhsDDLwXzQ9LFqsPKhY1EKIZGw06FkoSohdvESoWHBEaGwMMFht0DMMXEA9iFhAPFhusEdkb7xDPGy0SqBxfDTccsQ1MHJEOFht0DM8b8wv9G6gO6hvADYkbxg3ZGzENpRnrCwgSMx+xEXoe8xFMH8wRTB7NEXUepxIdHrARNB52E00epxI4HtYSVh/UEjsfNxMZH0wTLx+WE3IeghNbHrITaR6yEzoehhB9HvAOtR71DgEfhRBVHl0VMx+zFXoelxV1HpgVTB69FB0evhQ4Hu8TTR6PFFYfkBQ7Hy0UGR/OE3Ie4xNbHt4WfR50GLUe3xZVHrUVNB5yFUwfGRQvH3AYAR8=","c":"BQUFBQUFBQUFBQUFBQUFBQUFBQUFBQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQUAAAAFAAAABQUFBQAAAAAAAAAAAAAFBQUFBQUFBQUFBQUFBQUFBQUFBQAAAAAAAAAAAAAAAAAAAAUAAAAFBQUFBQAAAAAAAAAAAAAABQUABQUFBQAFBQUFAAUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU=","i":"AAABAAIAAgABAAMAAAACAAQAAgADAAUAAwAGAAcAAQAGAAMABgAIAAkACgALAAgADAANAAcADgAPABAADwAOABEAEgATAA0ABgAUAAcAEAAPABUABQAHAA0AFgAXABgAGQAaABsAFgAcAB0AGAAXAB4AHwAgABoAIQAiACMAJAAlACYAJwAoACkAKgArACwALQAoACsALgAaAC8ALgAbABoAMAAxADIAMwA0ACcALwAaACAALwA1ADAANgAIADcAOAA1ADkAOgAwADUADgA7ABEAPAA9AC0APgAfABoAEwAEAAUAEgA/ABMAPwAEABMAQAAKAAEAEwAFAA0ABQADAAcADAAHABQAEAAVAA0AFQASAA0AQQANAAwAQgAOAAwAQQAOABAADQBBABAADgBBAAwABAACAAUAQgA7AA4AQwAZABsARABFAEYARwBDAD0ASABJAEoARgBIAEoASwAZAEMATAA+ABkATQBOAE8ATwBQAE0ATgBRAE8ATwBSAFAAUABTAFQAVABNAFAAVABVAFYACwBWAFUAVwBTAFgAWQBaAFsAWwBcAFkAXQBYAF4AXwBUAFMAWgBgAFsAUgBYAFMAYQBiAGMAYgBkAGUAYwBmAGEAZwBoAGkAIQBqACIAawAmACUAbAA9ABsALgAwADIANABtAGgALAA0AGgAKwA0ACwAMwAnADEAbQBpAGgAbQBuAGkAaQBvAGcAbgA4AG8AMwA6AG4AWQBcAHAAcQAqAHIAcwBoAGcAXgBSAFEAXQBeAHQAdABeAFEAdQBWAHYAXgBYAFIAUgBTAFAAVwBfAFMAWgBYAGAAYABYAF0AdwBXAFgAeABXAFkAdwBaAFkAWABaAHcAWQBXAHcAUQBSAE8AeABZAHAAeQB6AHsAcgAqAHwAfQB+AH8AcwCAAIEAggBEAIMAegCCAIMAAABAAAEAAQAKAAYABgAKAAgACgB2AAsABgAJABQAFgAdABcAhAAUAIUALgBsABsALwAgADUAIAAfADkAOAA6ADUAOgAxADAAPABHAD0AQAB2AAoAOwBCAIQATACGAD4ATQB1AE4AVABWAE0AVACHAFUACwB2AFYAXwCHAFQAYQBkAGIAbQAzAG4AiACJAFUAbgA6ADgAMwAxADoAcQAtACoAdQBNAFYAewB/AH4AigB4AHAAcwCLAIAAKAAtAGwAMgAoAGwAgQB8ACwAJwArACgAjACNAI4AfAAqACwALgAvADAAXwCKAI8AgQAsAGgAKwAnADQALgAyAGwAKgAtACsAMgApACgAgQCQAHwALQA9AGwAPQBDABsAkQCSAJMAlACSAJUAlACWAJcAmACWAJkAkQCaAJsAnACaAJ0AnACeAJ8AnwCeAKAAnwChAJgAogCjAKQAkgClAKIApgCnAKgApwCpAKgAqQCqAKsAqgCsAKsArQCmAK4ArwCtAK4AsACvALEAsQCgALAAoQCxAKwAsgCzALQApwC0ALUAkQCVAJIAlACXAJIAlACZAJYAmAChAJYAkQCTAJoAnACbAJoAnACdAJ4AnwCgAKEAogClAKMAkgCXAKUApgC2AKcApwC1AKkAqQC1AKoAqgChAKwArQC2AKYArwC3AK0AsAC3AK8AoQCgALEAsgC4ALMApwCyALQA"},"glasses":{"pv":[0,0,0],"n":16,"p":"sv/3DKsAdv/0DJEAdv/nDI8AJACwDLQAPQCnDKEATgD3DKsAhP+rDJAAw/+nDKEA3P+wDLQA8v/qDMIA7v/vDMEAewCrDJAAiQDnDI8AigD0DJEAEgDvDMEADgDqDMIA","u":"pxI4HswRTB7NEXUeLRQZH5AUOx++FDgeCBIzH9QSOx83ExkfghNbHnYTTR5dFTMflxV1HpgVTB7vE00e4xNbHg==","c":"AAAAAAAAAAAAAAAAAAAAAA==","i":"AAABAAIAAwAEAAUAAgAGAAAABgAHAAAABwAIAAAACAAJAAoAAAAIAAoABAALAAUACwAMAAUADAANAAUABQAOAAMADgAPAAMA"}},"headBB":[[-0.098,1.454,-0.121],[0.098,1.78,0.123]]};
/* PSX_MESH above: geometry reverse-engineered from the JashiPSX asset
   "Simple Character PSX" (https://jashi-psx.itch.io, free license for use
   in projects; credit JashiPSX). The skinned GLB was split into rigid parts
   by dominant bone, triangles were classified by sampling the original
   texture (skin/shirt/pants/shoe/sock/hair), positions quantized to mm.
   The 256px atlas is repainted procedurally per character below, using
   face/chest anchors computed from the mesh, so the creator can vary
   everything while keeping the asset's exact 762-triangle shape. */
var PSX_SKINS = [{"n":"JESS","d":"data:image/jpeg;base64,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"},{"n":"MARCUS","d":"data:image/jpeg;base64,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"},{"n":"SPIKE","d":"data:image/jpeg;base64,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"}];
/* PSX_SKINS: complete character textures for the asset's UV layout, made by
   the offline projection workflow: render the mesh in T-pose (front+back,
   clay, white bg) -> gpt-image-1 paints the character over it -> project
   the painted views back onto the UV atlas (per-limb segment remapping,
   background-mask erosion, despeckle, dilation). No runtime painting. */
function b64Bytes(s) { var bin = atob(s), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
var psxParts = null;
function getPSXParts() {
  if (psxParts) return psxParts;
  psxParts = {};
  for (var k in PSX_MESH.parts) {
    var P = PSX_MESH.parts[k];
    var pos = new Int16Array(b64Bytes(P.p).buffer);
    var uvq = new Uint16Array(b64Bytes(P.u).buffer);
    var idx = new Uint16Array(b64Bytes(P.i).buffer);
    var cls = b64Bytes(P.c);
    var fp = new Float32Array(pos.length), fu = new Float32Array(uvq.length);
    for (var i = 0; i < pos.length; i++) fp[i] = pos[i] / 2000;
    for (i = 0; i < uvq.length; i += 2) { fu[i] = uvq[i] / 8192; fu[i + 1] = 1 - uvq[i + 1] / 8192; }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(fu, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    psxParts[k] = { geo: geo, pv: P.pv, pos: fp, uvq: uvq, idx: idx, cls: cls };
  }
  return psxParts;
}
// ---- Meshy AI characters (optional meshychars.js, loaded before game.js) --
var MESHY_LIST = (typeof MESHY_CHARS !== 'undefined') ? MESHY_CHARS : [];
var MESHY_CIVS = [], MESHY_COPS = [], MESHY_ROLE = {};
for (var mli = 0; mli < MESHY_LIST.length; mli++) {
  var mr = MESHY_LIST[mli].role || 'civ';
  if (mr === 'civ') MESHY_CIVS.push(mli);
  else if (mr === 'cop') MESHY_COPS.push(mli);
  else MESHY_ROLE[mr] = mli;
}
var meshyPartsCache = [], meshyTexCache = [];
function getMeshyParts(mi) {
  if (meshyPartsCache[mi]) return meshyPartsCache[mi];
  var out = {};
  var P0 = MESHY_LIST[mi].parts;
  for (var k in P0) {
    var P = P0[k];
    var pos = new Int16Array(b64Bytes(P.p).buffer);
    var uvq = new Uint16Array(b64Bytes(P.u).buffer);
    var idx = new Uint16Array(b64Bytes(P.i).buffer);
    var fp = new Float32Array(pos.length), fu = new Float32Array(uvq.length);
    for (var i = 0; i < pos.length; i++) fp[i] = pos[i] / 2000;
    for (i = 0; i < uvq.length; i += 2) { fu[i] = uvq[i] / 8192; fu[i + 1] = 1 - uvq[i + 1] / 8192; }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(fu, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    out[k] = { geo: geo, pv: P.pv };
  }
  meshyPartsCache[mi] = out;
  return out;
}
function getMeshyTex(mi) {
  if (!meshyTexCache[mi]) {
    var im = new Image();
    var tx = new THREE.Texture(im);
    tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false;
    im.onload = function () { tx.needsUpdate = true; };
    im.src = MESHY_LIST[mi].tex;
    meshyTexCache[mi] = tx;
  }
  return meshyTexCache[mi];
}
function buildMeshyChar(cfg, mi) {
  var g = new THREE.Group();
  var M = lamb({ map: getMeshyTex(mi) });
  var PP = getMeshyParts(mi);
  var torso = new THREE.Mesh(PP.torso.geo, M);
  var head = new THREE.Mesh(PP.head.geo, M);
  function pivotGroup(k, rz) {
    var gr = new THREE.Group();
    gr.position.set(PP[k].pv[0], PP[k].pv[1], PP[k].pv[2]);
    gr.add(new THREE.Mesh(PP[k].geo, M));
    if (rz) gr.rotation.z = rz;
    return gr;
  }
  var legL = pivotGroup('legL', 0), legR = pivotGroup('legR', 0);
  var armL = pivotGroup('armL', -1.42), armR = pivotGroup('armR', 1.42);
  g.add(torso, head, legL, legR, armL, armR);
  var shadow = blobShadow(0.42, 0.42, 0.16); g.add(shadow);
  g.userData.limbs = { legL: legL, legR: legR, armL: armL, armR: armR };
  g.userData.shadow = shadow;
  g.userData.cc = encodeCC(cfg);
  var sc = 0.92 + (cfg.build || 0) * 0.045;
  g.scale.set(sc, sc, sc);
  return g;
}
var meshySkinCache = [], meshySharedDecoded = {};
function getMeshySkin(mi) {
  if (meshySkinCache[mi]) return meshySkinCache[mi];
  var e = MESHY_LIST[mi], d = {};
  d.parents = e.skel.parents;
  d.bt = new Int16Array(b64Bytes(e.skel.t).buffer);
  d.br = new Int16Array(b64Bytes(e.skel.r).buffer);
  d.rootI = 0;
  for (var i = 0; i < d.parents.length; i++) if (d.parents[i] < 0) d.rootI = i;
  var qp = new Int16Array(b64Bytes(e.geo.p).buffer), qu = new Uint16Array(b64Bytes(e.geo.u).buffer);
  var fp = new Float32Array(qp.length), fu = new Float32Array(qu.length);
  for (i = 0; i < qp.length; i++) fp[i] = qp[i] / 2000;
  for (i = 0; i < qu.length; i += 2) { fu[i] = qu[i] / 8192; fu[i + 1] = 1 - qu[i + 1] / 8192; }
  var si = b64Bytes(e.geo.si), sw = b64Bytes(e.geo.sw);
  var fsi = new Uint16Array(si.length), fsw = new Float32Array(sw.length);
  for (i = 0; i < si.length; i++) { fsi[i] = si[i]; fsw[i] = sw[i] / 255; }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(fu, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(fsi, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(fsw, 4));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(b64Bytes(e.geo.i).buffer), 1));
  g.computeVertexNormals();
  d.geo = g;
  d.clips = {};
  var gyWalk = (e.clips.walk && e.clips.walk.gy) || 0;
  if (typeof MESHY_SHARED_CLIPS !== 'undefined') {
    var map = [];
    for (var si = 0; si < MESHY_SHARED_CLIPS.names.length; si++) map.push(e.skel.names.indexOf(MESHY_SHARED_CLIPS.names[si]));
    // retarget deltas: each shared clip carries ITS source rig's local
    // rotations (walk and run come from different reference characters);
    // each target's bind differs (100°+ at hips) — transfer the delta:
    // q_final = q_clip * inv(bindSrc) * bindTgt, with bindSrc taken from
    // the clip's own bind when present (fallback: the set-wide bind)
    var qs = new THREE.Quaternion(), qt = new THREE.Quaternion();
    function makePost(srcBind) {
      var p = new Float32Array(map.length * 4);
      for (var si2 = 0; si2 < map.length; si2++) {
        var bi2 = map[si2];
        qs.set(srcBind[si2 * 4] / 16383, srcBind[si2 * 4 + 1] / 16383, srcBind[si2 * 4 + 2] / 16383, srcBind[si2 * 4 + 3] / 16383).invert();
        if (bi2 >= 0) qt.set(d.br[bi2 * 4] / 16383, d.br[bi2 * 4 + 1] / 16383, d.br[bi2 * 4 + 2] / 16383, d.br[bi2 * 4 + 3] / 16383);
        else qt.identity();
        qs.multiply(qt);
        p[si2 * 4] = qs.x; p[si2 * 4 + 1] = qs.y; p[si2 * 4 + 2] = qs.z; p[si2 * 4 + 3] = qs.w;
      }
      return p;
    }
    var basePost = makePost(new Int16Array(b64Bytes(MESHY_SHARED_CLIPS.bind).buffer));
    for (var k in MESHY_SHARED_CLIPS.clips) {
      var sh = MESHY_SHARED_CLIPS.clips[k];
      if (!meshySharedDecoded[k]) meshySharedDecoded[k] = { q: new Int16Array(b64Bytes(sh.q).buffer), y: new Int16Array(b64Bytes(sh.y).buffer) };
      var gy = (e.clips[k] && e.clips[k].gy !== undefined) ? e.clips[k].gy : gyWalk;
      var post = sh.bind ? makePost(new Int16Array(b64Bytes(sh.bind).buffer)) : basePost;
      var shSt = (e.clips[k] && e.clips[k].st) || sh.st;   // per-char stride (leg lengths differ) over the clip-set average
      d.clips[k] = { d: sh.d, f: sh.f, q: meshySharedDecoded[k].q, y: meshySharedDecoded[k].y, gy: gy, map: map, post: post, st: shSt };
    }
  }
  for (var k2 in e.clips) {
    var c = e.clips[k2];
    if (c.q) d.clips[k2] = { d: c.d, f: c.f, q: new Int16Array(b64Bytes(c.q).buffer), y: new Int16Array(b64Bytes(c.y).buffer), gy: c.gy || 0, st: c.st };
  }
  meshySkinCache[mi] = d;
  return d;
}
var _poseQ = null;
function meshyPose(sk, clipKey, cycles, oneshot) {
  if (!_poseQ) _poseQ = new THREE.Quaternion();
  var d = sk.d, c = d.clips[clipKey] || d.clips.walk;
  var nj = d.parents.length;
  var cyc = oneshot ? Math.min(cycles, 0.999) : (cycles - Math.floor(cycles));
  var ft = cyc * (c.f - 1);
  var f0 = Math.floor(ft), f1 = Math.min(c.f - 1, f0 + 1), a = ft - f0;
  var srcN = c.map ? c.map.length : nj;
  for (var i = 0; i < srcN; i++) {
    var b = sk.bones[c.map ? c.map[i] : i];
    if (!b) continue;
    var o0 = (f0 * srcN + i) * 4, o1 = (f1 * srcN + i) * 4;
    b.quaternion.set(c.q[o0] / 16383, c.q[o0 + 1] / 16383, c.q[o0 + 2] / 16383, c.q[o0 + 3] / 16383);
    _poseQ.set(c.q[o1] / 16383, c.q[o1 + 1] / 16383, c.q[o1 + 2] / 16383, c.q[o1 + 3] / 16383);
    b.quaternion.slerp(_poseQ, a);
    if (c.post) { _poseQ.set(c.post[i * 4], c.post[i * 4 + 1], c.post[i * 4 + 2], c.post[i * 4 + 3]); b.quaternion.multiply(_poseQ); }
  }
  sk.bones[d.rootI].position.y = sk.rootBindY + (c.gy || 0) + (c.y[f0] / 2000) * (1 - a) + (c.y[f1] / 2000) * a;
}
function buildMeshySkinned(cfg, mi) {
  var d = getMeshySkin(mi);
  var g = new THREE.Group();
  var nj = d.parents.length, bones = [], root = null;
  for (var i = 0; i < nj; i++) {
    var b = new THREE.Bone();
    b.position.set(d.bt[i * 3] / 2000, d.bt[i * 3 + 1] / 2000, d.bt[i * 3 + 2] / 2000);
    b.quaternion.set(d.br[i * 4] / 16383, d.br[i * 4 + 1] / 16383, d.br[i * 4 + 2] / 16383, d.br[i * 4 + 3] / 16383);
    bones.push(b);
  }
  for (i = 0; i < nj; i++) { if (d.parents[i] >= 0) bones[d.parents[i]].add(bones[i]); else root = bones[i]; }
  var mesh = new THREE.SkinnedMesh(d.geo, lamb({ map: getMeshyTex(mi), side: THREE.DoubleSide }));   // thin hair/clothes shells show holes when single-sided
  mesh.add(root);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.frustumCulled = false;
  g.add(mesh);
  var names = MESHY_LIST[mi].skel.names, bi = {};
  for (i = 0; i < nj; i++) bi[names[i]] = i;
  var sk = { d: d, bones: bones, rootBindY: bones[d.rootI].position.y };
  g.userData.skin = sk;
  meshyPose(sk, 'walk', 0);   // natural stance instead of T-pose
  g.userData.limbs = { armL: bones[bi.LeftArm], armR: bones[bi.RightArm], legL: bones[bi.LeftUpLeg], legR: bones[bi.RightUpLeg] };
  g.userData.handR = bones[bi.RightHand] || bones[bi.RightForeArm] || bones[bi.RightArm];
  var shadow = blobShadow(0.42, 0.42, 0.16); g.add(shadow);
  g.userData.shadow = shadow;
  g.userData.cc = encodeCC(cfg);
  var sc = 0.92 + (cfg.build || 0) * 0.045;
  g.scale.set(sc, sc, sc);
  return g;
}
var presetTexCache = [];
function getPresetTex(i) {
  if (!presetTexCache[i]) {
    var im = new Image();
    var tx = new THREE.Texture(im);
    tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false;
    im.onload = function () { tx.needsUpdate = true; };
    im.src = PSX_SKINS[i].d;
    presetTexCache[i] = tx;
  }
  return presetTexCache[i];
}
function charAtlas(cfg) {
  var skin = cfg.skinHex || CSKIN[cfg.skin], hair = cfg.hairHex || CHAIRC[cfg.hairC];
  var shirt = cfg.shirtHex || CSHIRT[cfg.shirtC], shirt2 = CSHIRT[cfg.shirtC2];
  var pants = cfg.pantsHex || CPANTS[cfg.pantsC];
  var shoe = CSHOE[cfg.shoeC];
  if (shirt2 === shirt) shirt2 = CSHIRT[(cfg.shirtC2 + 3) % CSHIRT.length];
  var c = document.createElement('canvas'); c.width = c.height = 256;
  var g = c.getContext('2d');
  g.fillStyle = '#161616'; g.fillRect(0, 0, 256, 256);
  var PP = getPSXParts(), A = PSX_MESH.anchors;
  function triPath(P, t) {
    var a = P.idx[t * 3] * 2, b = P.idx[t * 3 + 1] * 2, d = P.idx[t * 3 + 2] * 2;
    g.moveTo(P.uvq[a] / 32, P.uvq[a + 1] / 32);
    g.lineTo(P.uvq[b] / 32, P.uvq[b + 1] / 32);
    g.lineTo(P.uvq[d] / 32, P.uvq[d + 1] / 32);
    g.closePath();
  }
  function centY(P, t) {
    var a = P.idx[t * 3] * 3, b = P.idx[t * 3 + 1] * 3, d = P.idx[t * 3 + 2] * 3;
    return (P.pos[a + 1] + P.pos[b + 1] + P.pos[d + 1]) / 3 + P.pv[1];
  }
  function maxY(P, t) {
    var a = P.idx[t * 3] * 3, b = P.idx[t * 3 + 1] * 3, d = P.idx[t * 3 + 2] * 3;
    return Math.max(P.pos[a + 1], P.pos[b + 1], P.pos[d + 1]) + P.pv[1];
  }
  function colorFor(k, cls, cy, my) {
    if (cls === 5) return (cfg.hair === 0 || cfg.hair === 4) ? skin : hair;
    if (cls === 1) return (cfg.shirt === 5 && k.charAt(0) === 'a') ? skin : shirt;   // tank top: bare arms
    if (cls === 2) return pants;
    if (cls === 3) return (k.charAt(0) === 'l' && my > 0.3) ? shade(pants, 0.8) : shoe;
    if (cls === 4) return (cfg.pants === 0 || my > 0.3) ? pants : '#e8e4da';   // socks vanish under long pants
    // skin-class triangles:
    if (k === 'torso' && cy < 1.385 && cfg.shirt !== 3) return shirt;   // authored collar dip — fill unless v-neck
    if (k.charAt(0) === 'l') return (cfg.pants === 0 || my > 0.66) ? pants : skin;  // any tri reaching the groin is covered
    return skin;
  }
  var order = ['torso', 'legL', 'legR', 'armL', 'armR', 'head'];
  for (var pi = 0; pi < order.length; pi++) {
    var k = order[pi], P = PP[k];
    for (var t = 0; t < P.idx.length / 3; t++) {
      var col = colorFor(k, P.cls[P.idx[t * 3]], centY(P, t), maxY(P, t));
      g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 1.4;
      g.beginPath(); triPath(P, t); g.fill(); g.stroke();
    }
  }
  // shirt-style overlays, clipped to the torso's shirt triangles
  if (cfg.shirt === 1 || cfg.shirt === 2 || cfg.shirt === 3 || cfg.shirt === 4) {
    g.save();
    var TP = PP.torso;
    g.beginPath();
    for (t = 0; t < TP.idx.length / 3; t++) if (TP.cls[TP.idx[t * 3]] === 1) triPath(TP, t);
    g.clip();
    var chx = A.chest[0], chy = A.chest[1];
    if (cfg.shirt === 1) { g.fillStyle = shirt2; for (var sy = 8; sy < 100; sy += 20) g.fillRect(0, sy, 256, 8); }
    else if (cfg.shirt === 2) {
      var motif = cfg.shirtC2 % 4, gx = chx, gy = chy - 16;
      function Q(x, y, w, h) { g.fillRect(gx + x, gy + y, w, h); }
      g.fillStyle = shirt2;
      if (motif === 0) { Q(-3, -12, 6, 24); Q(-12, -3, 24, 6); Q(-8, -8, 4, 4); Q(4, -8, 4, 4); Q(-8, 4, 4, 4); Q(4, 4, 4, 4); }
      else if (motif === 1) { Q(-10, -10, 20, 20); g.fillStyle = shirt; Q(-5, -5, 4, 4); Q(2, -5, 4, 4); Q(-4, 3, 9, 3); }
      else if (motif === 2) { Q(-2, -12, 8, 10); Q(-8, -4, 10, 8); Q(-2, 2, 8, 10); }
      else { Q(-9, -11, 18, 14); g.fillStyle = '#1a1a1a'; Q(-6, -7, 4, 5); Q(3, -7, 4, 5); g.fillStyle = shirt2; Q(-4, 3, 2, 4); Q(-1, 3, 2, 4); Q(2, 3, 2, 4); }
    }
    else if (cfg.shirt === 3) { g.fillStyle = skin; g.fillRect(chx - 8, 0, 16, 8); g.fillRect(chx - 4, 8, 8, 5); g.fillStyle = shade(shirt, 0.7); g.fillRect(chx - 11, 0, 3, 12); g.fillRect(chx + 8, 0, 3, 12); }
    else if (cfg.shirt === 4) { g.fillStyle = '#e8e4da'; g.fillRect(chx - 8, 0, 3, 18); g.fillRect(chx + 5, 0, 3, 18); g.fillStyle = shade(shirt, 0.8); g.fillRect(chx - 18, 50, 36, 16); }
    g.restore();
  }
  // ---- face, painted along the reverse-engineered face basis ----
  var nx = A.nose[0], ny = A.nose[1];
  var dwn = [A.chin[0] - A.top[0], A.chin[1] - A.top[1]];
  var fl = Math.sqrt(dwn[0] * dwn[0] + dwn[1] * dwn[1]) || 1; dwn[0] /= fl; dwn[1] /= fl;
  var rgt = [A.eyeL[0] - A.eyeR[0], A.eyeL[1] - A.eyeR[1]];
  var rl = Math.sqrt(rgt[0] * rgt[0] + rgt[1] * rgt[1]) || 1; rgt[0] /= rl; rgt[1] /= rl;
  var ang = Math.atan2(rgt[1], rgt[0]);
  var emx = (A.eyeL[0] + A.eyeR[0]) / 2, emy = (A.eyeL[1] + A.eyeR[1]) / 2;
  var eyeFy = (emx - nx) * dwn[0] + (emy - ny) * dwn[1];      // eye line offset from nose
  var eyeFx = rl / 2;                                          // half eye separation
  function F(fx, fy, w, h, col) {
    var px = nx + rgt[0] * fx + dwn[0] * fy, py = ny + rgt[1] * fx + dwn[1] * fy;
    g.save(); g.translate(px, py); g.rotate(ang); g.fillStyle = col; g.fillRect(-w / 2, -h / 2, w, h); g.restore();
  }
  // eyes
  function eye(sgn) {
    var fx = sgn * eyeFx;
    if (cfg.eyes === 1) { F(fx, eyeFy, 7, 6, '#f4f2ea'); F(fx, eyeFy, 3, 4, '#1a1a1a'); F(fx, eyeFy - 5.5, 7, 2, hair); }
    else if (cfg.eyes === 2) { F(fx, eyeFy + 1, 6.5, 3, '#f4f2ea'); F(fx, eyeFy + 1, 3, 2, '#1a1a1a'); F(fx, eyeFy - 4, 6.5, 2, hair); }
    else if (cfg.eyes === 3) { F(fx, eyeFy, 6.5, 4.5, '#f4f2ea'); F(fx, eyeFy, 3, 3, '#1a1a1a'); F(fx + sgn, eyeFy - 5, 7, 2, hair); F(fx - sgn * 1.5, eyeFy - 3.8, 4, 1.5, hair); }
    else if (cfg.eyes === 4) { F(fx, eyeFy, 3, 4, '#1a1a1a'); F(fx, eyeFy - 5, 6, 1.5, hair); }
    else { F(fx, eyeFy, 6.5, 5, '#f4f2ea'); F(fx, eyeFy, 3, 3.5, '#1a1a1a'); F(fx, eyeFy - 5.5, 6.5, 2, hair); }
  }
  eye(1); eye(-1);
  F(0, 1.5, 3.5, 6, shade(skin, 0.84));                        // nose
  var mc = cfg.faceX === 3 ? '#c22a4a' : '#7a3a2a';
  if (cfg.mouth === 0) { F(0, 8.5, 9, 2.2, mc); F(-5, 7.4, 2, 2, mc); F(5, 7.4, 2, 2, mc); }
  else if (cfg.mouth === 1) F(0, 8.5, 8, 2.2, mc);
  else if (cfg.mouth === 2) { F(0, 8.5, 7, 5, '#5a1e14'); F(0, 8.5, 4, 2.5, '#2a0c08'); }
  else if (cfg.mouth === 3) { F(0, 8.5, 9, 2.2, mc); F(-5, 9.6, 2, 2, mc); F(5, 9.6, 2, 2, mc); }
  else { F(1.5, 8.5, 6, 2.2, mc); F(5, 7.4, 2, 2, mc); }
  if (cfg.faceX === 1) { g.globalAlpha = 0.28; F(0, 10, 20, 9, '#2a1c10'); g.globalAlpha = 1; }
  if (cfg.faceX === 2) { var fc = shade(skin, 0.72); F(-7, 3, 1.5, 1.5, fc); F(-9, 4.5, 1.5, 1.5, fc); F(7, 3.5, 1.5, 1.5, fc); F(9, 4.8, 1.5, 1.5, fc); }
  // hairline fringe over the forehead (over the photo too)
  var fr = { 0: 0, 1: 3, 2: 5, 3: 6, 4: 0, 5: 3, 6: 5 }[cfg.hair];
  if (fr) F(0, eyeFy - 9 - fr / 2, 30, fr, hair);
  if (cfg.hair === 3) { F(-12, eyeFy + 6, 5, 34, hair); F(12, eyeFy + 6, 5, 34, hair); }
  // painted frames to match the 3D lens
  if (cfg.glasses === 1) F(0, eyeFy, 22, 7, '#16181c');
  else if (cfg.glasses === 2) {
    F(-eyeFx, eyeFy, 9, 7.5, '#16181c'); F(eyeFx, eyeFy, 9, 7.5, '#16181c');
    F(-eyeFx, eyeFy, 6.5, 5, '#bcd2e0'); F(eyeFx, eyeFy, 6.5, 5, '#bcd2e0'); F(0, eyeFy, 3, 1.5, '#16181c');
  }
  var t2 = new THREE.CanvasTexture(c);
  t2.magFilter = THREE.NearestFilter; t2.minFilter = THREE.NearestFilter; t2.generateMipmaps = false;
  return t2;
}
var eyeM = lamb({ color: 0x1a1a1a });
var goldM = lamb({ color: 0xd8ac30 });
function buildCharacter(cfg) {
  // presets beyond the painted PSX skins are full Meshy-generated meshes
  var mci = cfg.preset - 1 - PSX_SKINS.length;
  if (cfg.preset > PSX_SKINS.length && MESHY_CIVS[mci] !== undefined) {
    var mi = MESHY_CIVS[mci];
    return MESHY_LIST[mi].skel ? buildMeshySkinned(cfg, mi) : buildMeshyChar(cfg, mi);
  }
  var g = new THREE.Group();
  var M = (cfg.preset > 0 && PSX_SKINS[cfg.preset - 1])
    ? lamb({ map: getPresetTex(cfg.preset - 1) })
    : lamb({ map: charAtlas(cfg) });
  var PP = getPSXParts();
  // the asset's real meshes: torso + head static, arms/legs pivoted rigid
  // parts (arms are authored in T-pose — dropped to the sides here)
  var torso = new THREE.Mesh(PP.torso.geo, M);
  var head = new THREE.Mesh(PP.head.geo, M);
  function pivotGroup(k, rz) {
    var gr = new THREE.Group();
    gr.position.set(PP[k].pv[0], PP[k].pv[1], PP[k].pv[2]);
    gr.add(new THREE.Mesh(PP[k].geo, M));
    if (rz) gr.rotation.z = rz;
    return gr;
  }
  var legL = pivotGroup('legL', 0), legR = pivotGroup('legR', 0);
  var armL = pivotGroup('armL', -1.42), armR = pivotGroup('armR', 1.42);
  g.add(torso, head, legL, legR, armL, armR);
  // give PSX / painted-preset avatars a right-hand gun mount (skinned-Meshy
  // chars get one from their bones) so their held weapon is visible to OTHER
  // players — without this a preset player firing looks empty-handed to peers.
  // arm parts are authored relative to the shoulder pivot; the hand is the far
  // end of the T-pose arm (largest |x|), so anchor there.
  (function () {
    var ab = PP.armR.geo; if (!ab.boundingBox) ab.computeBoundingBox();
    var bb = ab.boundingBox, hand = new THREE.Group();
    hand.position.set(Math.abs(bb.min.x) > Math.abs(bb.max.x) ? bb.min.x : bb.max.x, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2);
    armR.add(hand); g.userData.handR = hand;
  })();
  // the asset's actual glasses lens mesh doubles as shades / eyeglasses
  if (cfg.glasses === 1) {
    g.add(new THREE.Mesh(PP.glasses.geo, phong({ color: 0x14181e, shininess: 70, specular: 0x556677 })));
  } else if (cfg.glasses === 2) {
    var lensM = phong({ color: 0x9fc0d4, shininess: 90, specular: 0xffffff });
    lensM.transparent = true; lensM.opacity = 0.55;
    g.add(new THREE.Mesh(PP.glasses.geo, lensM));
  }
  // hair meshes for styles paint can't do (fitted to the asset's head)
  if (cfg.preset > 0) cfg = (function (o) { var c2 = {}; for (var kk in o) c2[kk] = o[kk]; c2.hair = 0; return c2; })(cfg);
  var hairM = lamb({ color: new THREE.Color(cfg.hairHex || CHAIRC[cfg.hairC]) });
  if (cfg.hair === 4) g.add(box(0.045, 0.12, 0.26, hairM, 0, 1.82, -0.01));
  if (cfg.hair === 5) { var af = sph(0.135, hairM, 0, 1.71, -0.01, 9, 7); af.scale.set(1.18, 1.02, 1.12); g.add(af); }
  if (cfg.hair === 6) { g.add(sph(0.05, hairM, 0, 1.62, -0.125, 6, 5)); g.add(box(0.05, 0.2, 0.045, hairM, 0, 1.5, -0.135)); }
  // hats
  var hatM = lamb({ color: new THREE.Color(cfg.hatHex || CHAT[cfg.hatC]) });
  if (cfg.hat === 1) { g.add(cyl(0.115, 0.118, 0.095, 10, hatM, 0, 1.762, -0.015)); g.add(box(0.15, 0.022, 0.11, hatM, 0, 1.732, 0.135)); }
  else if (cfg.hat === 2) { var bn = sph(0.122, hatM, 0, 1.723, -0.005, 10, 7); bn.scale.y = 0.82; g.add(bn); g.add(cyl(0.121, 0.121, 0.045, 10, hatM, 0, 1.685, -0.005)); }
  else if (cfg.hat === 3) { g.add(cyl(0.1, 0.12, 0.12, 8, hatM, 0, 1.815, -0.01)); g.add(cyl(0.205, 0.205, 0.02, 12, hatM, 0, 1.757, -0.01)); }
  else if (cfg.hat === 4) { var cm = lamb({ color: 0x14213f }); g.add(cyl(0.115, 0.118, 0.085, 10, cm, 0, 1.762, -0.015)); g.add(box(0.15, 0.022, 0.1, cm, 0, 1.732, 0.14)); g.add(box(0.05, 0.04, 0.02, goldM, 0, 1.775, 0.105)); }
  // gear
  if (cfg.extra === 1) {
    var pm = lamb({ color: new THREE.Color(CHAT[(cfg.hatC + 2) % CHAT.length]) });
    var strap = box(0.03, 0.52, 0.02, pm, -0.075, 1.2, 0.105); strap.rotation.z = 0.4; g.add(strap);
    g.add(box(0.15, 0.12, 0.06, pm, -0.205, 0.97, 0.04));
  } else if (cfg.extra === 2) {
    var bm = lamb({ color: new THREE.Color(CHAT[(cfg.hatC + 1) % CHAT.length]) });
    g.add(box(0.26, 0.3, 0.11, bm, 0, 1.22, -0.165));
    g.add(box(0.045, 0.26, 0.018, bm, -0.09, 1.3, 0.1)); g.add(box(0.045, 0.26, 0.018, bm, 0.09, 1.3, 0.1));
  } else if (cfg.extra === 3) {
    g.add(box(0.13, 0.03, 0.018, goldM, 0, 1.372, 0.1));
    g.add(box(0.04, 0.05, 0.014, goldM, 0, 1.328, 0.105));
  }
  var shadow = blobShadow(0.42, 0.42, 0.16); g.add(shadow);
  g.userData.limbs = { legL: legL, legR: legR, armL: armL, armR: armR };
  g.userData.shadow = shadow;
  g.userData.cc = encodeCC(cfg);
  var sc = 0.92 + (cfg.build || 0) * 0.045;
  g.scale.set(sc, sc, sc);
  return g;
}
// legacy shim: old call sites pass raw colors — feed them through as overrides
function buildPerson(shirtC, pantsC, skinC, opts) {
  opts = opts || {};
  var cfg = randomCharConfig();
  cfg.hat = 0; cfg.extra = 0; cfg.glasses = 0; cfg.faceX = 0; cfg.shirt = 0;
  cfg.pants = 0; cfg.shoeC = 0; cfg.preset = 0;   // uniforms/fixed NPCs: long pants, dark shoes, custom paint
  cfg.shirtHex = shirtC; cfg.pantsHex = pantsC;
  cfg.skinHex = typeof skinC === 'number' ? '#' + ('000000' + skinC.toString(16)).slice(-6) : skinC;
  if (opts.hairColor !== undefined) cfg.hairHex = '#' + ('000000' + opts.hairColor.toString(16)).slice(-6);
  if (opts.shades) cfg.glasses = 1;
  if (opts.cap) cfg.hat = 4;
  if (opts.chain) cfg.extra = 3;
  return buildCharacter(cfg);
}

var npcs = [];
var NPC_COUNT = 138;  // 3x density pass (was 46) — busy-street population
// home-zone weights: core intersection / residential neighborhoods / collectors+Lynmar
var NPC_W_CORE = 0.60, NPC_W_RES = 0.32;   // remainder (~0.08) = collectors
var WALK = WC_REMAP ? { x0: -240, x1: 120, z0: -180, z1: 170 }   // recentred on the true venue span
                    : { x0: -270, x1: 150, z0: -160, z1: 150 };
function randTarget() { return [WALK.x0 + Math.random() * (WALK.x1 - WALK.x0), WALK.z0 + Math.random() * (WALK.z1 - WALK.z0)]; }
function sidewalkSpot() {
  // remap: length-weighted pick over the core-leg sidewalk ribbons
  if (WC_REMAP) return remapCoreSpot();
  // random point on the sidewalk strips flanking the two roads
  var side = Math.random() < 0.5 ? 1 : -1;
  if (Math.random() < 0.55) {
    var x = WALK.x0 + Math.random() * (WALK.x1 - WALK.x0);
    return [x, side * (MAIN_HW + 1.5 + Math.random() * 3)];
  }
  var z = WALK.z0 + Math.random() * (WALK.z1 - WALK.z0);
  return [side * (CROSS_HW + 1.5 + Math.random() * 3), z];
}
function npcTarget() { return Math.random() < 0.85 ? sidewalkSpot() : randTarget(); }
// ---- expansion sidewalks: spawn/wander tables for the outer map ----
// Built from mapRoads (every EXP_ROADS segment registers there at load, above
// this section). Sidewalk strips flank each segment at hw+0.6 .. hw+0.6+sw
// (see expRoadPoly); residential streets (cls 2/3) vs collectors/arterial
// bends incl. Lynmar (cls 0/1) get separate tables.
var expWalkRes = [], expWalkCol = [];
(function () {
  for (var i = 0; i < mapRoads.length; i++) {
    var r = mapRoads[i];
    var dx = r.x2 - r.x1, dz = r.z2 - r.z1, L = Math.sqrt(dx * dx + dz * dz);
    if (L < 16) continue;   // strips are end-trimmed ~6 each side; skip stubs
    var list = r.cls >= 2 ? expWalkRes : expWalkCol;
    list.push({ x: r.x1, z: r.z1, ux: dx / L, uz: dz / L, L: L, hw: r.hw, sw: r.cls === 0 ? 5 : 3.4 });
    list.total = (list.total || 0) + L;
  }
})();
// length-weighted random point on one of the strips (either side of the road)
function expWalkSpot(list) {
  var pick = Math.random() * (list.total || 1), e = list[0], i;
  for (i = 0; i < list.length; i++) { e = list[i]; if (pick < e.L) break; pick -= e.L; }
  var t = 6 + Math.random() * Math.max(1, e.L - 12);        // match the mesh end-trim
  var off = e.hw + 1.1 + Math.random() * (e.sw - 1);        // inside the strip
  var side = Math.random() < 0.5 ? 1 : -1;
  return [e.x + e.ux * t - e.uz * off * side, e.z + e.uz * t + e.ux * off * side];
}
// spawn rejection: refuse points inside house/fence/forest/pond colliders
function spotClear(x, z) {
  var p = pushOut(x, z, 0.5);
  var mx = p.x - x, mz = p.z - z;
  return mx * mx + mz * mz < 0.01;
}
// full accept test for an expansion sidewalk spot: collider-free AND at least
// a curb width (0.6) off the asphalt of every road incl. CROSSING ones — the
// spot's own road is ≥ hw+1.1 away by construction, so it always passes
function expSpotOK(c) { return spotClear(c[0], c[1]) && expClear(c[0], c[1], 0.6); }
// segments of `list` within R of (x,z) — a neighborhood NPC's roaming turf
function expSegsNear(list, x, z, R) {
  var out = [];
  out.total = 0;
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    var t = Math.max(0, Math.min(e.L, (x - e.x) * e.ux + (z - e.z) * e.uz));
    var px = e.x + e.ux * t - x, pz = e.z + e.uz * t - z;
    if (px * px + pz * pz < R * R) { out.push(e); out.total += e.L; }
  }
  return out;
}
// roll a home zone (0 core / 1 residential / 2 collector) and outfit `n` with
// a collider-clear spawn spot + local roaming turf. Used at spawn AND on
// respawn, so the population keeps the same distribution over time.
function assignNpcHome(n) {
  var r = Math.random();
  var zone = r < NPC_W_CORE ? 0 : (r < NPC_W_CORE + NPC_W_RES ? 1 : 2);
  var list = zone === 1 ? expWalkRes : expWalkCol;
  var s = null;
  if (zone > 0 && list.length) {
    for (var tr = 0; tr < 12 && !s; tr++) {
      var c = expWalkSpot(list);
      if (expSpotOK(c)) s = c;
    }
  }
  if (!s) {
    // core zone (or fallback): the old strips, now with the same collider
    // rejection — street props/parked clutter can overlap a few strip points
    zone = 0;
    s = sidewalkSpot();
    for (var tc = 0; tc < 12 && !spotClear(s[0], s[1]); tc++) s = sidewalkSpot();
  }
  n.zone = zone; n.homeX = s[0]; n.homeZ = s[1];
  n.turf = zone === 0 ? null : expSegsNear(list, s[0], s[1], 100);
  if (n.turf && !n.turf.length) { n.zone = 0; n.turf = null; }
  n.x = s[0]; n.z = s[1];
}
// an NPC placed somewhere explicitly (bailed carjack driver) adopts that spot
// as home so it wanders locally instead of trekking cross-map
function rehomeNpc(n) {
  n.homeX = n.x; n.homeZ = n.z;
  if (Math.abs(n.x) <= CORE && Math.abs(n.z) <= CORE) { n.zone = 0; n.turf = null; return; }
  var turf = expSegsNear(expWalkRes, n.x, n.z, 110);
  var col = expSegsNear(expWalkCol, n.x, n.z, 110);
  for (var i = 0; i < col.length; i++) { turf.push(col[i]); turf.total += col[i].L; }
  n.zone = turf.length ? 1 : 0;
  n.turf = turf.length ? turf : null;
}
// wander target honoring the NPC's home zone: core NPCs use the old picker,
// neighborhood NPCs roam their local streets (jaywalking — no crosswalks out
// there), keeping them within ~100u of their home street
function npcTargetFor(n) {
  if (!n || !n.turf) return npcTarget();
  for (var tr = 0; tr < 8; tr++) {
    var c = expWalkSpot(n.turf);
    var hx = c[0] - n.homeX, hz = c[1] - n.homeZ;
    if (hx * hx + hz * hz > 14400) continue;   // turf segs can outrun the 100u radius — cap at 120
    if (expSpotOK(c)) return c;
  }
  return [n.homeX, n.homeZ];
}
// pick a fresh wander target for an NPC; if the straight line to it crosses a
// road, usually route through the intersection crosswalk pads first (single
// waypoint in n.wayX/n.wayZ — no pathfinding)
function setNpcTarget(n) {
  var t = npcTargetFor(n); n.tx = t[0]; n.tz = t[1];
  n.wayX = undefined; n.wayZ = undefined;
  // core crosswalk routing only — neighborhood walkers jaywalk their streets
  // (remap: the axis crosswalk pads don't exist — everyone jaywalks; the
  // 3-leg Y crosswalk pads are R3 junction furniture)
  if (!WC_REMAP && !n.turf && Math.random() < 0.7) {
    if ((n.z >= MAIN_HW && n.tz <= -MAIN_HW) || (n.z <= -MAIN_HW && n.tz >= MAIN_HW)) {
      // crossing the E-W main road: pads at (+-13.5, 0)
      n.wayX = (n.x < 0 ? -1 : 1) * (CROSS_HW + 2.5); n.wayZ = 0;
    } else if ((n.x >= CROSS_HW && n.tx <= -CROSS_HW) || (n.x <= -CROSS_HW && n.tx >= CROSS_HW)) {
      // crossing the N-S cross road: pads at (0, +-16.5)
      n.wayX = 0; n.wayZ = (n.z < 0 ? -1 : 1) * (MAIN_HW + 2.5);
    }
  }
}
// scan traffic for a car bearing down on this NPC; returns the unit
// perpendicular (away from the car's path) to sprint along, or null
function npcCarThreat(n) {
  for (var i = 0; i < cars.length; i++) {
    var c = cars[i];
    if (c.exploded) continue;
    var m = c.car.group.position;
    var dx = n.x - m.x, dz = n.z - m.z;
    var d2 = dx * dx + dz * dz;
    if (d2 > 49) continue;
    var vx, vz;
    if (c.berserk) { vx = c.bvx; vz = c.bvz; }
    else if (c.shoveT > 0) { vx = c.svx; vz = c.svz; }
    else if (c.stolen || carDrivenByPlayer(c) || c === driving) {
      // a car driven by a REMOTE player is a synced world car (host mirrors its
      // pos via drivenBy) — use that remote's mirrored velocity so it registers
      // as a threat between the 14Hz updates; local/host-driven cars fall back
      // to the per-frame position-delta sample (c._pvx/_pvz).
      var rd = (c.drivenBy && net.remotes) ? net.remotes[c.drivenBy] : null;
      if (rd) { vx = rd.vx || c._pvx || 0; vz = rd.vz || c._pvz || 0; }
      else { vx = c._pvx || 0; vz = c._pvz || 0; }
    }
    else { vx = c.axis === 'x' ? c.dir * c.speed : 0; vz = c.axis === 'z' ? c.dir * c.speed : 0; }
    var sp = Math.sqrt(vx * vx + vz * vz);
    if (sp < 2.5) continue;                                 // parked / crawling
    var d = Math.sqrt(d2) || 1;
    if ((vx * dx + vz * dz) / (sp * d) < 0.6) continue;     // not headed this way
    var pxn = -vz / sp, pzn = vx / sp;                      // perpendicular to travel
    var side = dx * pxn + dz * pzn >= 0 ? 1 : -1;           // dodge to the nearer clear side
    return { x: pxn * side, z: pzn * side };
  }
  return null;
}
// which roster characters are women — keeps generic yelps/barks gender-true
// (must sit ABOVE the load-time spawnNPC loop: vars don't hoist)
var MESHY_FEM = ['MARISOL', 'KEISHA', 'DENISE', 'PHUONG', 'GLORIA', 'AISHA', 'SUMMER', 'PATTY', 'BECCA', 'TINA', 'NIA', 'RAVEN', 'YUKI', 'COP_DIAZ', 'COP_WASHINGTON'];
function femFromCfg(cfg) {
  var mn = meshyNameFromCfg(cfg);
  if (mn) return MESHY_FEM.indexOf(mn) >= 0;
  if (cfg.preset === 1) return true;                       // JESS
  if (cfg.preset === 2 || cfg.preset === 3) return false;  // MARCUS, SPIKE
  if (cfg.faceX === 3 || cfg.extra === 1) return true;     // lipstick / purse
  if (cfg.faceX === 1) return false;                       // stubble
  if (cfg.hair === 3 || cfg.hair === 6) return Math.random() < 0.75;   // long / ponytail
  return Math.random() < 0.35;   // ambiguous look: rolled once, stored, consistent for life
}
function spawnNPC() {
  var cfg = randomCharConfig();
  // pedestrians always wear the Meshy roster — the old blocky PSX bodies
  // (custom + JESS/MARCUS/SPIKE) are player-creator-only now — and no
  // townsfolk doppelgangers: pick the least-used look on the street
  if (MESHY_CIVS.length) {
    var use = {}, ui, un;
    for (ui = 0; ui < npcs.length; ui++) { un = npcs[ui].vname; if (un) use[un] = (use[un] || 0) + 1; }
    var pool = [], bestC = 1e9;
    for (ui = 0; ui < MESHY_CIVS.length; ui++) {
      var uc = use[MESHY_LIST[MESHY_CIVS[ui]].n] || 0;
      if (uc < bestC) { bestC = uc; pool = [ui]; }
      else if (uc === bestC) pool.push(ui);
    }
    cfg.preset = 1 + PSX_SKINS.length + pool[(Math.random() * pool.length) | 0];
  }
  var mesh = buildCharacter(cfg);
  var n = { mesh: mesh, x: 0, z: 0, tx: 0, tz: 0, hp: 100, state: 'walk', speed: 1.5 + Math.random() * 1.1, phase: Math.random() * 9, pause: 0, fleeT: 0, fleeDX: 0, fleeDZ: 0, downT: 0, hurtFlash: 0, vname: meshyNameFromCfg(cfg), fem: femFromCfg(cfg) };
  assignNpcHome(n);
  mesh.position.set(n.x, 0, n.z); mesh.userData.npc = n;
  scene.add(mesh); npcs.push(n); setNpcTarget(n); return n;
}
for (var ni = 0; ni < NPC_COUNT; ni++) spawnNPC();

// dealer
var dealer = MESHY_ROLE.dealer !== undefined ? buildMeshySkinned(randomCharConfig(), MESHY_ROLE.dealer) : buildPerson('#1b1b1f', '#141418', 0xc98d5e, { shades: true, hairColor: 0x111111, chain: true });
dealer.position.set(dealerPos.x, 0, dealerPos.z);
scene.add(dealer);
var dollarSprite = (function () {
  var c = document.createElement('canvas'); c.width = c.height = 64;
  var g = c.getContext('2d'); g.font = 'bold 52px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ffd94a'; g.strokeStyle = '#000'; g.lineWidth = 6; g.strokeText('$', 32, 34); g.fillText('$', 32, 34);
  var t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter;
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true }));
  sp.scale.set(1.1, 1.1, 1); sp.position.set(dealerPos.x, 3.1, dealerPos.z); scene.add(sp); return sp;
})();

// ---------------- gas station interior (hidden under the map) ----------------
var INT = { x0: 44, x1: 66, z0: 32, z1: 48, y: -60 };
var inside = false, robbedVisit = false, copsCalledVisit = false, gasClosedUntil = -9999;
var doorIn = { x: 55, z: 45.8 };      // just inside the door
var doorOut = { x: 61, z: 40.5 };     // on the sidewalk outside the store
var clerkPos = { x: 62.6, z: 40.5 };
var intColliders = [];
function addIntCollider(cx, cz, w, d) { intColliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 }); }

(function buildInterior() {
  var Y = INT.y;
  var cx = (INT.x0 + INT.x1) / 2, cz = (INT.z0 + INT.z1) / 2;
  var W = INT.x1 - INT.x0, D = INT.z1 - INT.z0;
  var tileT = tex(64, function (g, s) {
    g.fillStyle = '#d8d4c8'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#c8c4b6'; g.fillRect(0, 0, s / 2, s / 2); g.fillRect(s / 2, s / 2, s / 2, s / 2);
    noise(g, s, 80, 0.04, 0.04);
  }, W / 2, D / 2);
  var wallIntT = tex(64, function (g, s) {
    g.fillStyle = '#e8e2d2'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#c0392b'; g.fillRect(0, 10, s, 6);
    noise(g, s, 100, 0.04, 0.04);
  }, 8, 1);
  var shelfT = tex(64, function (g, s) {
    g.fillStyle = '#b8b2a4'; g.fillRect(0, 0, s, s);
    var cols = ['#e8c020', '#d84a2a', '#2a8ad8', '#3fae4a', '#c845c8', '#f08030'];
    for (var y = 4; y < s; y += 20) for (var x = 2; x < s; x += 11) {
      g.fillStyle = cols[(Math.random() * cols.length) | 0];
      g.fillRect(x, y, 9, 14);
    }
    g.fillStyle = '#8a8478';
    for (y = 0; y < s; y += 20) g.fillRect(0, y, s, 3);
  }, 3, 1);
  var fridgeT = tex(64, function (g, s) {
    g.fillStyle = '#22303c'; g.fillRect(0, 0, s, s);
    var gr = g.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(0, 'rgba(160,220,255,0.5)'); gr.addColorStop(1, 'rgba(40,80,110,0.5)');
    g.fillStyle = gr; g.fillRect(4, 4, s - 8, s - 8);
    var cols = ['#d84a2a', '#2a8ad8', '#3fae4a', '#e8c020', '#f0f0f0'];
    for (var y = 12; y < s - 6; y += 16) for (var x = 8; x < s - 8; x += 9) {
      g.fillStyle = cols[(Math.random() * cols.length) | 0];
      g.fillRect(x, y, 5, 11);
    }
    g.strokeStyle = '#b8c4cc'; g.lineWidth = 3; g.strokeRect(2, 2, s - 4, s - 4);
  }, 4, 1);

  var floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), lamb2(tileT));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, Y, cz); scene.add(floor);
  var ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), lamb({ color: 0xd8d8d2 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, Y + 4, cz); scene.add(ceil);
  for (var lx = -6; lx <= 6; lx += 6) {
    var lightPanel = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1), new THREE.MeshBasicMaterial({ color: 0xf8f6e8 }));
    lightPanel.rotation.x = Math.PI / 2;
    lightPanel.position.set(cx + lx, Y + 3.96, cz);
    scene.add(lightPanel);
  }
  var wallM = lamb2(wallIntT);
  function wall(x, z, w, d) {
    var m = box(w, 4, d, wallM, x, Y + 2, z);
    scene.add(m); solidMeshes.push(m); addIntCollider(x, z, w, d);
  }
  wall(cx, INT.z0, W, 0.5);            // north (fridge wall)
  wall(cx, INT.z1, W, 0.5);            // south (door wall)
  wall(INT.x0, cz, 0.5, D);            // west
  wall(INT.x1, cz, 0.5, D);            // east
  // door (visual) on the south wall
  var doorM = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.2), phong({ color: 0x35485a, shininess: 90, specular: 0xaaccdd }));
  doorM.position.set(doorIn.x, Y + 1.6, INT.z1 - 0.28); doorM.rotation.y = Math.PI; scene.add(doorM);
  var exitSign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ map: signTex(['EXIT'], '#103a18', '#4aff6a', 128, 40) }));
  exitSign.position.set(doorIn.x, Y + 3.5, INT.z1 - 0.28); exitSign.rotation.y = Math.PI; scene.add(exitSign);

  // fridges along the back (north) wall
  for (var fx = INT.x0 + 3; fx < INT.x1 - 3; fx += 2.6) {
    var fr = box(2.4, 2.6, 0.9, [lamb({ color: 0x9aa2aa }), lamb({ color: 0x9aa2aa }), lamb({ color: 0x9aa2aa }), lamb({ color: 0x9aa2aa }), lamb2(fridgeT), lamb({ color: 0x9aa2aa })], fx, Y + 1.3, INT.z0 + 0.75);
    scene.add(fr);
  }
  addIntCollider(cx, INT.z0 + 0.75, W - 4, 1.2);

  // two snack aisles in the middle
  [[52, 40], [57, 40]].forEach(function (a) {
    var sh = box(1.1, 1.5, 6, [lamb2(shelfT), lamb2(shelfT), lamb({ color: 0xb8b2a4 }), lamb({ color: 0xb8b2a4 }), lamb2(shelfT), lamb2(shelfT)], a[0], Y + 0.75, a[1]);
    scene.add(sh); solidMeshes.push(sh); addIntCollider(a[0], a[1], 1.1, 6);
  });

  // counter + register (east side), clerk stands behind it
  var counter = box(1.4, 1.1, 5, lamb({ color: 0x8a6a48 }), 61.2, Y + 0.55, 40.5);
  scene.add(counter); solidMeshes.push(counter); addIntCollider(61.2, 40.5, 1.4, 5);
  scene.add(box(0.7, 0.5, 0.6, lamb({ color: 0x2a2e34 }), 61.2, Y + 1.35, 39.5));    // register
  scene.add(box(0.5, 0.35, 0.05, new THREE.MeshBasicMaterial({ color: 0x3fae6a }), 61.2, Y + 1.55, 39.2)); // register screen
  // coffee maker on a side counter (west wall)
  var side = box(3.5, 1, 0.9, lamb({ color: 0xb8b2a4 }), INT.x0 + 2.3, Y + 0.5, 44);
  scene.add(side); addIntCollider(INT.x0 + 2.3, 44, 3.5, 0.9);
  scene.add(box(0.5, 0.7, 0.5, lamb({ color: 0x1c1c20 }), INT.x0 + 1.6, Y + 1.35, 44));
  scene.add(cyl(0.12, 0.12, 0.25, 8, lamb({ color: 0x3a2a1a }), INT.x0 + 1.6, Y + 1.15, 43.8));
})();

// clerk NPC (behind the counter)
var clerk = MESHY_ROLE.clerk !== undefined ? buildMeshySkinned(randomCharConfig(), MESHY_ROLE.clerk) : buildPerson('#c0392b', '#31435c', CSKIN[2], { hairColor: 0x2a1c10 });
clerk.position.set(clerkPos.x, INT.y, clerkPos.z);
clerk.rotation.y = -Math.PI / 2; // faces the store (west)
scene.add(clerk);

function enterStore() {
  if (T < gasClosedUntil) { popup2('STORE CLOSED — come back later'); sfx('deny'); return; }
  inside = true; robbedVisit = false; copsCalledVisit = false;
  setZoom(false);
  player.x = doorIn.x; player.z = doorIn.z; player.y = INT.y + EYE;
  yaw = 0; pitch = 0;   // facing into the store
  // greet AFTER the teleport — earshot is checked against the interior room
  playVoiceAny(['clerk_hello_1', 'clerk_hello_2'], 0.55, 'clerkHi', 50, { ref: clerk });
}
// robbery lockouts are server-wide: one heist closes the store for everyone.
// keyed by store so future robbable spots inherit the same sync for free.
function applyRobCD(store, left) {
  if (store === 'gas') gasClosedUntil = Math.max(gasClosedUntil, T + left);
}
function netSendRobCD(store, secs) {
  if (!netActive()) return;
  var m = { t: 'robCD', store: store, left: secs };
  if (net.mode === 'host') netBroadcast(m); else netToHost(m);
}
function exitStore(diedInside) {
  inside = false;
  for (var i = cops.length - 1; i >= 0; i--) if (cops[i].interior) { scene.remove(cops[i].mesh); cops.splice(i, 1); }
  if (robbedVisit || copsCalledVisit) { gasClosedUntil = T + 180; netSendRobCD('gas', 180); }
  robbedVisit = false; copsCalledVisit = false;
  if (!diedInside) {
    player.x = doorOut.x; player.z = doorOut.z; player.y = EYE;
    yaw = Math.PI; pitch = 0;
  }
}
function refreshClerk() {
  var say = document.getElementById('clerkSay');
  var rows = document.getElementById('clerkRows');
  rows.innerHTML = '';
  say.textContent = copsCalledVisit ? '"The cops are on their way, you thug!"'
    : (robbedVisit ? '"T-the register is empty, please just go!"' : '"Welcome in! How can I help you today?"');
  function addBtn(label, fn, disabled) {
    var row = document.createElement('div'); row.className = 'row';
    var b = document.createElement('button'); b.textContent = label; b.disabled = !!disabled; b.onclick = fn;
    row.appendChild(b); rows.appendChild(row);
  }
  addBtn('Buy a snack — $20  (+50 hp when eaten)', function () {
    if (state.money < 20) { sfx('deny'); popup2("You can't afford it"); return; }
    state.money -= 20; state.snacks++; playVoice('clerk_snack', 0.5, 10, { ref: clerk });
    sfx('buy'); popup('+1 SNACK (equip it in TAB)');
    if (state.equipped === 'snack') setEquipped('snack');   // refresh the held-count HUD
    refreshClerk();
  });
  if (!robbedVisit && !copsCalledVisit) addBtn('Rob the register', function () {
    var armed = GUN_LIST.indexOf(state.equipped) >= 0;
    if (armed) {
      var take = 100 + ((Math.random() * 201) | 0);
      state.money += take; robbedVisit = true;
      playVoiceAny(['clerk_rob_1', 'clerk_rob_2'], 0.6, 'clerkRob', 6, { ref: clerk });
      popup('ROBBED  +$' + take);
      sfx('alarm');
      if (state.wanted < 2) setWanted(2); else lastCrimeT = T;
      closeMenus();
    } else {
      copsCalledVisit = true; robbedVisit = true;
      playVoice('clerk_panic', 0.6, 8, { ref: clerk });
      popup2('You threaten him with... fists? He hits the panic button!');
      sfx('alarm');
      if (state.wanted < 2) setWanted(2); else lastCrimeT = T;
      spawnInteriorCops(2);
      closeMenus();
    }
  });
  addBtn('Never mind', function () { closeMenus(); });
}

// ---------------- street props (AI PSX props: streetprops.js) ----------------
// 30 Meshy-generated quantized props placed contextually around the map.
// Prop INTERACTION FX (vending machine, payphone, newspaper box, hydrant
// jets) are singleplayer-local, like interiors — deliberately NOT net-synced.
// ATM/meter CASH is routed to the host (spawnCashNet) so it snapshots to
// everyone; weapon drops sync via the world snapshot + dropGun/takeDrop.
var streetPropCache = {};
var streetPropInteractables = [];   // {kind,x,z,fx,fz,g,cd,robbed}
var hydrantJets = [];               // {x,z,t,parts:[mesh],sT}
state.sodas = 0;                    // soda cans bought from vending machines

function getStreetProp(name) {
  // mirror of getUfoMesh, minus rescaling (props are authored in meters),
  // plus optional 'i' index buffer support (set BEFORE computeVertexNormals)
  if (typeof STREET_PROPS === 'undefined') return null;
  if (streetPropCache[name]) return streetPropCache[name].clone();
  var e = null;
  for (var i = 0; i < STREET_PROPS.length; i++) if (STREET_PROPS[i].n === name) e = STREET_PROPS[i];
  if (!e) return null;
  var qp = new Int16Array(b64Bytes(e.p).buffer), qu = new Uint16Array(b64Bytes(e.u).buffer);
  var fp = new Float32Array(qp.length), fu = new Float32Array(qu.length);
  for (i = 0; i < qp.length; i++) fp[i] = qp[i] / e.q;
  for (i = 0; i < qu.length; i += 2) { fu[i] = qu[i] / 8192; fu[i + 1] = 1 - qu[i + 1] / 8192; }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(fu, 2));
  if (e.i) geo.setIndex(new THREE.BufferAttribute(new Uint16Array(b64Bytes(e.i).buffer), 1));
  geo.computeVertexNormals();
  var im = new Image();
  var tx = new THREE.Texture(im);
  tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false;
  im.onload = function () { tx.needsUpdate = true; };
  im.src = e.tex;
  var g = new THREE.Group();
  g.add(new THREE.Mesh(geo, lamb({ map: tx })));
  g.userData.spDims = e.dims;
  streetPropCache[name] = g;
  return g.clone();
}

// props big enough to block movement (AABB collider)
var SP_SOLID = { dumpster: 1, busshelter: 1, vendingmachine: 1, atm: 1, transformerbox: 1, icechest: 1, propanecage: 1, jerseybarrier: 1, picnictable: 1, planter: 1, bench: 1, mailbox: 1, homemailbox: 1, bikerack: 1, tirestack: 1, acunit: 1 };
// props cars snap: 'light' = metal pole crunch, 'tree' = punted clutter
var SP_SNAP = { stopsign: 'light', yieldsign: 'light', speedsign: 'light', onewaysign: 'light', parkingmeter: 'light', payphone: 'light', hydrant: 'light', cone: 'tree', barricade: 'tree', trashcan: 'tree', wheeliebin: 'tree', shoppingcart: 'tree', newsbox: 'tree' };
// breakable street props that also block on foot: half-width of the small
// base/pole collider handed to registerBreakable (deactivates while toppled).
// Cones / barricades / shopping carts stay pass-through — steppable clutter.
var SP_BLOCKR = { hydrant: 0.24, parkingmeter: 0.15, payphone: 0.3, stopsign: 0.14, yieldsign: 0.14, speedsign: 0.14, onewaysign: 0.14, newsbox: 0.24, trashcan: 0.36, wheeliebin: 0.35 };
var SP_INTERACT = { vendingmachine: 'vend', payphone: 'phone', atm: 'atm', newsbox: 'news' };
// authored front is -x; face = direction the front should point in the world
var SP_FACE = { W: 0, E: Math.PI, N: -Math.PI / 2, S: Math.PI / 2 };

// hand-authored placements: [name, x, z, face(W/E/N/S or radians), y?]
// sidewalks: main |z| 14..19, cross |x| 11..16; nothing on main/cross asphalt
// except the roadwork scene on the cross-road east shoulder (z 82..118).
var SP_PLACES = [
  // --- RaceTrac (SE corner; store front wall z=43.5, door zone x 59.5..62.5 kept clear)
  ['newsbox', 54.8, 42.4, 'N'], ['icechest', 57.2, 42.6, 'N'],
  ['trashcan', 63.3, 42.5, 'N'], ['payphone', 65.2, 42.6, 'N'],
  ['vendingmachine', 67.2, 42.6, 'N'], ['propanecage', 69.9, 46, 'E'],
  ['cone', 44, 45, 0.4], ['cone', 50, 55, 1.2],
  // --- Dollar Tree (front wall z=38)
  ['vendingmachine', -62, 36.8, 'N'], ['atm', -59, 36.8, 'N'],
  ['bench', -43, 36.9, 'N'], ['planter', -66, 36.9, 'N'], ['trashcan', -48.5, 36.9, 'N'],
  ['acunit', -35.9, 52, 'E'],
  ['shoppingcart', -46, 36.2, 0.9], ['shoppingcart', -57, 35.4, 2.3], ['shoppingcart', -38.5, 36.4, 4.0],
  // --- strip malls (storefront walkway z~40.7; drives z 35.5..44.5; backs z 62+)
  ['bench', -107, 40.7, 'N'], ['bench', -133, 40.7, 'N'], ['bench', -195, 40.7, 'N'],
  ['planter', -98, 40.7, 'N'], ['planter', -142, 40.7, 'N'], ['planter', -234, 40.9, 'N'],
  ['trashcan', -120, 40.7, 'N'], ['trashcan', -188, 40.7, 'N'],
  ['payphone', -158, 41.0, 'N'],
  ['dumpster', -110, 64, 'S'], ['dumpster', -178, 66, 'S'], ['dumpster', -246, 68, 'S'],
  ['dumpster', -44, 61.2, 'E'],
  // parking meter row on the main-road south sidewalk fronting the malls
  ['parkingmeter', -100, 16.3, 'N'], ['parkingmeter', -110, 16.3, 'N'], ['parkingmeter', -120, 16.3, 'N'],
  ['parkingmeter', -130, 16.3, 'N'], ['parkingmeter', -140, 16.3, 'N'],
  // --- self-storage backlot (rows end z=134)
  ['pallet', -62, 139.2, 0.3], ['pallet', -59.6, 141.6, 1.1], ['tirestack', -47, 139.5, 0],
  // --- Publix (front wall z=-118, entrance x=-72; lot z -116..-76; spawn (-72,-97) kept clear)
  ['bikerack', -77, -116.5, 'S'], ['bench', -66, -116.3, 'S'],
  ['planter', -84, -116.3, 'S'], ['planter', -59, -116.3, 'S'],
  ['mailbox', -53, -116.2, 'S'], ['newsbox', -56.5, -116.2, 'S'],
  ['shoppingcart', -80, -91, 0.4], ['shoppingcart', -78.7, -89.9, 0.9],
  ['shoppingcart', -63, -88, 2.1], ['shoppingcart', -96, -84, 5.5],
  ['dumpster', -95, -165.8, 'N'], ['transformerbox', -110.4, -150, 'W'], ['acunit', -110.3, -128, 'W'],
  // --- banks (porticos face +z at z=-37.5)
  ['atm', 47.5, -36.6, 'S'], ['planter', 56, -36.5, 'S'],
  ['atm', -52, -36.6, 'S'], ['planter', -44, -36.5, 'S'],
  // --- Farnell Middle School (front z=-222, on its concrete pad)
  ['busshelter', -96, -219.4, 'S'], ['bench', -64, -219.6, 'S'], ['bikerack', -88, -219.6, 'S'],
  // --- bus shelters along the main road sidewalks
  ['busshelter', 90, 16.8, 'N'], ['busshelter', -150, 16.8, 'N'], ['busshelter', 140, -16.8, 'S'],
  // --- road signs (sidewalk edges + drive exits, never on asphalt)
  ['stopsign', 46.5, 20.5, 'S'], ['stopsign', -64, 20.5, 'S'],
  ['stopsign', 46.5, -19.8, 'N'], ['stopsign', -78.5, -19.8, 'N'],
  ['yieldsign', -245, 20.5, 'S'],
  ['onewaysign', 34, 20.5, 'S'], ['onewaysign', -58, -19.8, 'N'],
  ['speedsign', 120, 16.3, 'W'], ['speedsign', -200, 16.3, 'W'], ['speedsign', 160, -16.3, 'E'],
  // --- hydrants (~every 80m along the sidewalks)
  ['hydrant', -220, 17.5, 'N'], ['hydrant', -95, 17.6, 'N'], ['hydrant', 25, 17.5, 'N'], ['hydrant', 105, 17.5, 'N'],
  ['hydrant', -180, -17.5, 'S'], ['hydrant', -40, -17.5, 'S'], ['hydrant', 75, -17.5, 'S'],
  ['hydrant', 13.4, 70, 'W'], ['hydrant', -13.4, -70, 'E'],
  // --- roadwork scene: cross-road east shoulder z 82..118 (the ONE asphalt exception)
  ['cone', 8.8, 82, 0, 0.1], ['cone', 9.4, 86, 0.5, 0.1], ['cone', 10, 90, 1.1, 0.1],
  ['barricade', 9.9, 93.5, 'N', 0.1], ['barricade', 9.9, 118, 'S', 0.1],
  ['jerseybarrier', 9.8, 98, 'W', 0.1], ['jerseybarrier', 9.8, 103, 'W', 0.1], ['jerseybarrier', 9.8, 108, 'W', 0.1],
  ['speedsign', 13.6, 78, 'N'],
  // --- townhouses (garage fronts at +z of each row)
  ['homemailbox', -228, -207.8, 'S', 0.02], ['homemailbox', -212, -207.8, 'S', 0.02], ['homemailbox', -196, -207.8, 'S', 0.02],
  ['homemailbox', -218, -237.6, 'S', 0.02],
  ['homemailbox', -158, -112.6, 'S', 0.02], ['homemailbox', -142, -112.6, 'S', 0.02],
  ['wheeliebin', -190, -208.3, 1.0, 0.02], ['wheeliebin', -224, -238, 2.2, 0.02],
  // --- lake shore picnic tables (ellipse rx 77 rz 52 around (-255,-150) — kept dry)
  ['picnictable', -176, -130, 'W', 0.02], ['picnictable', -172, -168, 'E', 0.02], ['picnictable', -232, -92, 'N', 0.02],
  // --- odds and ends
  ['trashcan', 13.5, 24, 'W'], ['newsbox', -110.5, -22.4, 'N'],
  ['acunit', 65.2, -110, 'E']
];

function spOverlapsBuilding(x, z, hx, hz) {
  for (var i = 0; i < mapBuildings.length; i++) {
    var b = mapBuildings[i];
    if (x + hx > b.x - b.w / 2 - 0.05 && x - hx < b.x + b.w / 2 + 0.05 &&
        z + hz > b.z - b.d / 2 - 0.05 && z - hz < b.z + b.d / 2 + 0.05) return true;
  }
  return false;
}
(function spawnStreetProps() {
  if (typeof STREET_PROPS === 'undefined') return;   // file absent -> game unaffected
  // SP_PLACES are hand-authored against the OLD landmark walls; WC_REMAP moved
  // the venues, so suppress them rather than strand benches/ATMs on grass at
  // the old spots. Per-venue remap props are R4.
  if (WC_REMAP) return;
  for (var i = 0; i < SP_PLACES.length; i++) {
    var P = SP_PLACES[i], name = P[0], x = P[1], z = P[2];
    var ry = typeof P[3] === 'string' ? SP_FACE[P[3]] : (P[3] || 0);
    var g = getStreetProp(name);
    if (!g) continue;
    var dims = g.userData.spDims || [1, 1, 1];
    // world-axis half extents after yaw (AABB of the rotated box, cheap)
    var c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    var hx = (dims[0] * c + dims[2] * s) / 2, hz = (dims[0] * s + dims[2] * c) / 2;
    if (spOverlapsBuilding(x, z, hx, hz)) { console.warn('[streetprops] skipped ' + name + ' @ ' + x + ',' + z + ' (building overlap)'); continue; }
    g.position.set(x, P[4] !== undefined ? P[4] : 0.13, z);
    g.rotation.y = ry;
    scene.add(g);
    if (SP_SOLID[name]) {
      addCollider(x, z, hx * 2, hz * 2);
      solidMeshes.push(g);   // bullets stop on the big stuff
    }
    if (SP_SNAP[name]) {
      registerBreakable(g, x, z, Math.max(hx, hz) + 0.15, SP_SNAP[name], null, SP_BLOCKR[name] || 0);
      var bb = breakables[breakables.length - 1];
      if (name === 'parkingmeter') bb.kind = 'meter';
      if (name === 'hydrant') bb.kind = 'hydrant';
    }
    if (SP_INTERACT[name]) {
      var it = { kind: SP_INTERACT[name], x: x, z: z, fx: -Math.cos(ry), fz: Math.sin(ry), g: g, cd: -99, robbed: false };
      if (it.kind === 'atm') { g.userData.atm = it; if (!SP_SOLID[name]) solidMeshes.push(g); }
      streetPropInteractables.push(it);
    }
  }
})();

// ============================================================
// PHASE 3 — DENSITY LAYER (WC_REMAP only)
// Re-adds the detail layer the true-geometry cutover left un-placed
// (street/yard trees, contextual street props, Y-junction traffic
// furniture, frontage landscaping) AND integrates the 54
// densityprops.js assets (decals / signs / clutter / fences).
// All static scenery: render-only, never simulated or net-synced.
// Decals/signs/clutter/fences of one texture merge into a single
// BufferGeometry (one draw call per distinct asset) to stay well
// under the added-draw-call budget; only solid props/fences take
// colliders.
// ============================================================
var densityStats = { trees: 0, props: 0, decals: 0, signs: 0, clutter: 0, fence: 0, batches: 0 };
if (WC_REMAP) (function densityLayer() {
  var deg = Math.PI / 180;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  // ---- shared unit geometries, baked through a matrix into merged batches ----
  var UDECAL = new THREE.PlaneGeometry(1, 1); UDECAL.rotateX(-Math.PI / 2);   // faces +y (XZ plane)
  var USIGN = new THREE.PlaneGeometry(1, 1);                                    // faces +z (XY plane)
  var UBOX = new THREE.BoxGeometry(1, 1, 1);
  var UCYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  function mtx(px, py, pz, ry, sx, sy, sz) {
    var m = new THREE.Matrix4();
    return m.compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromAxisAngle(Y_UP, ry || 0), new THREE.Vector3(sx, sy, sz));
  }
  // ---- DENSITY_PROPS registry + keyed textures ----
  var dAsset = {};
  if (typeof DENSITY_PROPS !== 'undefined') for (var di = 0; di < DENSITY_PROPS.length; di++) dAsset[DENSITY_PROPS[di].n] = DENSITY_PROPS[di];
  // every sign is authored on a black field -> key the gutter transparent; a
  // handful of decals/clutter/fences read best keyed too (luminance < thr -> clear)
  var KEY = {};
  ['billboard_ad', 'storefront_sign', 'grand_opening_banner', 'flyer_sheet', 'for_sale_sign', 'menu_board', 'bus_route_sign', 'graffiti_panel', 'wall_mural', 'roadwork_sign', 'stop_sign', 'gas_price_sign', 'yard_sign', 'lost_pet_flyer', 'neon_bar_sign', 'parking_sign', 'speed_limit_sign', 'garage_sale_sign'].forEach(function (n) { KEY[n] = 40; });
  ['grass_tuft', 'leaves_scatter', 'litter_scatter', 'crosswalk', 'center_line', 'road_arrow', 'skid_marks', 'chainlink_fence', 'potted_plant'].forEach(function (n) { KEY[n] = 46; });
  var dTexCache = {};
  function dTex(name) {
    if (dTexCache[name] !== undefined) return dTexCache[name];
    var a = dAsset[name]; if (!a) return (dTexCache[name] = null);
    var keyed = KEY[name], cnv = document.createElement('canvas'); cnv.width = cnv.height = 256;
    var tx = new THREE.CanvasTexture(cnv);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.magFilter = THREE.LinearFilter; tx.minFilter = THREE.LinearMipmapLinearFilter;
    var im = new Image();
    im.onload = (function (tx, cnv, keyed, im) { return function () {
      var g = cnv.getContext('2d'); g.drawImage(im, 0, 0, 256, 256);
      if (keyed) {
        var d = g.getImageData(0, 0, 256, 256), p = d.data;
        for (var k = 0; k < p.length; k += 4) { if (p[k] * 0.299 + p[k + 1] * 0.587 + p[k + 2] * 0.114 < keyed) p[k + 3] = 0; }
        g.putImageData(d, 0, 0);
      }
      tx.needsUpdate = true;
    }; })(tx, cnv, keyed, im);
    im.src = a.tex;
    return (dTexCache[name] = { tex: tx, keyed: !!keyed });
  }
  // ---- merged batches: one draw call per key ----
  var BATCH = {}, _NM = new THREE.Matrix3(), _V = new THREE.Vector3(), _N = new THREE.Vector3();
  function batch(key, meta) { var e = BATCH[key]; if (!e) e = BATCH[key] = { pos: [], norm: [], uv: [], meta: meta || {} }; return e; }
  function bake(key, meta, geo, m) {
    var e = batch(key, meta);
    _NM.getNormalMatrix(m);
    var p = geo.attributes.position, u = geo.attributes.uv, nm = geo.attributes.normal, idx = geo.index;
    var count = idx ? idx.count : p.count;
    for (var i = 0; i < count; i++) {
      var vi = idx ? idx.getX(i) : i;
      _V.set(p.getX(vi), p.getY(vi), p.getZ(vi)).applyMatrix4(m); e.pos.push(_V.x, _V.y, _V.z);
      if (nm) { _N.set(nm.getX(vi), nm.getY(vi), nm.getZ(vi)).applyMatrix3(_NM).normalize(); e.norm.push(_N.x, _N.y, _N.z); } else e.norm.push(0, 1, 0);
      e.uv.push(u ? u.getX(vi) : 0, u ? u.getY(vi) : 0);
    }
  }
  function flush() {
    var n = 0;
    for (var key in BATCH) {
      var e = BATCH[key]; if (!e.pos.length) continue;
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(e.pos), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(e.norm), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(e.uv), 2));
      var o = e.meta, mo = {};
      if (o.texName) { var t = dTex(o.texName); if (t) { mo.map = t.tex; if (t.keyed) { mo.transparent = true; mo.alphaTest = 0.5; mo.side = THREE.DoubleSide; } } }
      if (o.color !== undefined) mo.color = o.color;
      if (o.double) mo.side = THREE.DoubleSide;
      var mat = lamb(mo);
      if (o.decal) { mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2; }
      var mesh = new THREE.Mesh(g, mat); if (o.decal) mesh.frustumCulled = false;
      scene.add(mesh); n++;
    }
    densityStats.batches = n;
  }
  // helpers to place one asset instance into the right batch
  function dDecal(name, x, z, y, ry, scale) { if (!dAsset[name]) return; var a = dAsset[name]; var w = a.dims[0] * (scale || 1), d = a.dims[1] * (scale || 1); bake('d_' + name, { texName: name, decal: true }, UDECAL, mtx(x, y, z, ry || 0, w, 1, d)); densityStats.decals++; }
  function dSign(name, x, y, z, ry, scale) { if (!dAsset[name]) return; var a = dAsset[name]; bake('d_' + name, { texName: name, double: true }, USIGN, mtx(x, y, z, ry, a.dims[0] * (scale || 1), a.dims[1] * (scale || 1), 1)); densityStats.signs++; }
  function dBoxAsset(name, x, y, z, ry) { if (!dAsset[name]) return; var a = dAsset[name]; bake('d_' + name, { texName: name }, UBOX, mtx(x, y, z, ry || 0, a.dims[0], a.dims[1], a.dims[2])); densityStats.clutter++; }
  function dCylAsset(name, x, y, z) { if (!dAsset[name]) return; var a = dAsset[name]; bake('d_' + name, { texName: name }, UCYL, mtx(x, y, z, 0, a.dims[0], a.dims[1], a.dims[0])); densityStats.clutter++; }
  // waist-high+ poles (roadside sign posts, billboard legs) block the player;
  // short yard-sign stakes (h < 1.5) stay pass-through
  function pole(x, z, h, r) { r = r || 0.11; bake('_pole', { color: 0x8a8f94 }, UCYL, mtx(x, h / 2, z, 0, r * 2, h, r * 2)); if (h >= 1.5) addCollider(x, z, Math.max(0.26, r * 2), Math.max(0.26, r * 2)); }
  // tileable fence/wall run A->B, height H, texture repeating along its length
  function fenceRun(ax, az, bx, bz, name, solid) {
    var a = dAsset[name]; if (!a) return;
    var H = a.dims[0], dx = bx - ax, dz = bz - az, L = Math.sqrt(dx * dx + dz * dz);
    if (L < 0.6) return;
    var rep = Math.max(1, Math.round(L / (H * 1.4)));
    var g = new THREE.PlaneGeometry(L, H), uv = g.attributes.uv;
    for (var i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * rep);
    var ry = Math.atan2(-dz, dx);
    bake('d_' + name, { texName: name, double: true }, g, mtx((ax + bx) / 2, H / 2 + 0.02, (az + bz) / 2, ry, 1, 1, 1));
    if (solid) addColliderOBB((ax + bx) / 2, (az + bz) / 2, L / 2, 0.25, ry);
    densityStats.fence++;
  }
  function fenceRect(cx, cz, w, d, rot, name, solid) {
    var r = rot * deg, c = Math.cos(r), s = Math.sin(r), hw = w / 2, hd = d / 2;
    function cp(u, v) { return [cx + u * c + v * s, cz - u * s + v * c]; }
    var p0 = cp(-hw, -hd), p1 = cp(hw, -hd), p2 = cp(hw, hd), p3 = cp(-hw, hd);
    fenceRun(p0[0], p0[1], p1[0], p1[1], name, solid); fenceRun(p1[0], p1[1], p2[0], p2[1], name, solid);
    fenceRun(p2[0], p2[1], p3[0], p3[1], name, solid); fenceRun(p3[0], p3[1], p0[0], p0[1], name, solid);
  }
  // a sign mounted on a fresh pole/stake
  function poleSign(name, x, z, ry, mountY, poleH, poleR) {
    pole(x, z, poleH, poleR);
    var a = dAsset[name]; if (!a) return;
    dSign(name, x + Math.sin(ry) * 0.06, mountY, z + Math.cos(ry) * 0.06, ry);
  }

  // ---- surface geometry references ----
  var SURF = (typeof REMAP_SURFACES !== 'undefined') ? REMAP_SURFACES : [];
  var VENUES = (typeof REMAP_VENUES !== 'undefined') ? REMAP_VENUES : [];
  var EXITS = (typeof REMAP_EXITS !== 'undefined') ? REMAP_EXITS : [];
  var COMM = { racetrac: 1, publix: 1, dollar_tree: 1, storage: 1, starbucks: 1, bank: 1, strip: 1, dunkin: 1, offices: 1, yoga: 1, pharmacy: 1, sushi: 1, farnell: 1 };
  // The branded storefront always ends up facing (sin rot, cos rot): non-FRONT180
  // venues author it at local +z (yaw=rot); FRONT180 venues author it at local -z
  // and the group is spun +180 so that -z face lands on the same world heading.
  // So frontage decor must key off rot alone — NOT the FRONT180 build spin, or the
  // whole storefront (benches, signs, landscaping) lands on the back wall while the
  // dumpster/junk pile ends up at the door.
  function vFront(v) { var yaw = (v.rot || 0) * deg; return { yaw: yaw, fx: Math.sin(yaw), fz: Math.cos(yaw), rx: Math.cos(yaw), rz: -Math.sin(yaw) }; }
  // scatter a local point in a rotated rect -> world [x,z]
  function rectPt(s, u, v) { var r = (s.rot || 0) * deg, c = Math.cos(r), sn = Math.sin(r); return [s.x + u * c + v * sn, s.z - u * sn + v * c]; }

  // ============ 1. STREET / YARD TREES + FRONTAGE LANDSCAPING ============
  var TREE_CAP = 130, side = 1;
  if (RM) {
    for (var ri = 0; ri < RM.roads.length; ri++) {
      var r = RM.roads[ri]; if (r.cls > 2 || r.dirt) continue;
      var len = r.cum[r.cum.length - 1], step = r.cls <= 1 ? 30 : 42;
      for (var sc = 18; sc < len - 14 && densityStats.trees < TREE_CAP; sc += step) {
        var pt = rmAt(r.pts, r.cum, sc), off = r.hw + (r.cls <= 1 ? 4.5 : 3.2);
        var tx = pt.x - pt.uz * off * side, tz = pt.z + pt.ux * off * side; side = -side;
        if (!remapPointClear(tx, tz, 2) || inLake(tx, tz) || houseBlocksSpot(tx, tz) || remapInClear(tx, tz, 1) || !spotClear(tx, tz)) continue;
        if (Math.random() < 0.34) palm(tx, tz); else oak(tx, tz, 0.78 + Math.random() * 0.42);
        densityStats.trees++;
      }
    }
  }
  // parking-lot island trees (edge midpoints of the bigger lots)
  for (var pj = 0; pj < SURF.length; pj++) {
    var su = SURF[pj]; if (su.kind !== 'parking' || su.w * su.d < 900) continue;
    var e1 = rectPt(su, 0, su.d / 2 - 1.5), e2 = rectPt(su, 0, -su.d / 2 + 1.5);
    // The short-edge midpoint that abuts the storefront drops a palm straight
    // through the entrance awning / gas canopy (their overhang reaches past the
    // building footprint) — skip any island spot within reach of a venue front.
    [e1, e2].forEach(function (p) { if (spotClear(p[0], p[1]) && !inLake(p[0], p[1]) && !remapInClear(p[0], p[1], 3)) { palm(p[0], p[1]); } });
  }
  // frontage bushes + crepe myrtles at each commercial venue
  for (var vf = 0; vf < VENUES.length; vf++) {
    var v = VENUES[vf]; if (!COMM[v.type]) continue;
    var f = vFront(v), fpx = v.x + f.fx * (v.d / 2 + 2.2), fpz = v.z + f.fz * (v.d / 2 + 2.2);
    var e = v.w / 2 - 1.5;
    bush(fpx + f.rx * e, fpz + f.rz * e); bush(fpx - f.rx * e, fpz - f.rz * e);
    if (Math.random() < 0.7) crepeMyrtle(fpx + f.rx * (e * 0.4), fpz + f.rz * (e * 0.4));
  }

  // ============ 2. Y-JUNCTION TRAFFIC FURNITURE ============
  // mast-arm signals + stop bars + crosswalk paint on the true approaches to
  // the main junction at the origin (a 3-leg Y). Legs identified from the roads
  // that pass near (0,0); approach tangent points inward toward the junction.
  if (RM) {
    var legs = [];
    for (var li = 0; li < RM.roads.length; li++) {
      var rd = RM.roads[li]; if (rd.cls > 1 || rd.dirt) continue;
      // sample this road's closest approach to the origin, gather inbound dirs
      var lenR = rd.cum[rd.cum.length - 1];
      for (var ss = 0; ss <= lenR; ss += 4) {
        var q = rmAt(rd.pts, rd.cum, ss), dd = q.x * q.x + q.z * q.z;
        if (dd < 34 * 34 && dd > 15 * 15) {
          // inbound tangent = pointing toward origin
          var towardX = -q.x, towardZ = -q.z, tl = Math.sqrt(dd) || 1;
          var dot = (q.ux * towardX + q.uz * towardZ);
          var dir = dot >= 0 ? 1 : -1;
          legs.push({ x: q.x, z: q.z, ux: q.ux * dir, uz: q.uz * dir, hw: rd.hw, d: Math.sqrt(dd) });
          break;
        }
      }
    }
    // de-dupe near-parallel legs, keep up to 4 approaches
    var kept = [];
    for (var ki = 0; ki < legs.length && kept.length < 4; ki++) {
      var lg = legs[ki], dup = false;
      for (var kk = 0; kk < kept.length; kk++) { if (Math.abs(kept[kk].ux * lg.ux + kept[kk].uz * lg.uz) > 0.9 && (kept[kk].x * lg.x + kept[kk].z * lg.z) > 0) dup = true; }
      if (!dup) kept.push(lg);
    }
    // rotation-correct mast arm: arm along local +x, whole rig yawed (the legacy
    // mastArm() only handles axis-aligned arms — it degenerates to a square
    // plate on the diagonal Y approaches). Reuses signalHead() so the lamps
    // register in signalLights and cycle via updateSignals.
    function yMastArm(px, pz, armDirX, armDirZ, len, nHeads, grpMain) {
      var g = new THREE.Group(); g.position.set(px, 0, pz);
      g.rotation.y = Math.atan2(-armDirZ, armDirX);   // local +x -> (armDirX,armDirZ)
      var poleH = 7.8, armY = poleH - 0.5;
      g.add(cyl(0.28, 0.34, poleH, 10, poleMetal, 0, poleH / 2, 0));
      addCollider(px, pz, 0.68, 0.68);   // signal pole base — static, not breakable
      g.add(box(len + 0.25, 0.22, 0.25, poleMetal, len / 2, armY, 0));
      for (var i = 0; i < nHeads; i++) {
        var t = (i + 1) / (nHeads + 1) * len;
        g.add(box(0.06, 0.5, 0.06, poleMetal, t, armY - 0.3, 0));
        signalHead(g, t, armY - 0.78, 0, grpMain ? 1 : 0, grpMain ? 0 : 1);
      }
      scene.add(g);
    }
    for (var kj = 0; kj < kept.length; kj++) {
      var L = kept[kj];
      var perpX = -L.uz, perpZ = L.ux;             // across-road direction
      var poleX = L.x + perpX * (L.hw + 3), poleZ = L.z + perpZ * (L.hw + 3);
      // opposing/alternating approaches share a signal group so the cycle pairs up
      yMastArm(poleX, poleZ, -perpX, -perpZ, 2 * L.hw + 6, 3, (kj % 2) === 0);
      // rotated stop bar + crosswalk paint just inside the junction
      var ry = Math.atan2(-perpZ, perpX);          // bar long axis spans the road
      var barX = L.x + L.ux * 1.6, barZ = L.z + L.uz * 1.6;
      // register this approach so traffic stops at the bar on red (same grp
      // mapping as the lamps: alternating legs share the main/cross cycle)
      carSignals.push({ x: L.x, z: L.z, ux: L.ux, uz: L.uz, hw: L.hw, grp: (kj % 2) === 0 ? 'main' : 'cross', barX: barX, barZ: barZ });
      var sbar = box(L.hw * 2 - 1, 0.04, 0.9, stopBarM, barX, 0.165, barZ); sbar.rotation.y = ry; scene.add(sbar);
      var cwX = L.x + L.ux * 4.2, cwZ = L.z + L.uz * 4.2, cwRy = Math.atan2(L.ux, L.uz);
      for (var cb = -1; cb <= 1; cb++) {
        dDecal('crosswalk', cwX - perpX * cb * 2.4, cwZ - perpZ * cb * 2.4, 0.175, cwRy, 1.0);
      }
      // left-turn arrow decal on the approach lane
      dDecal('road_arrow', L.x + L.ux * 8 - perpX * (L.hw * 0.4), L.z + L.uz * 8 - perpZ * (L.hw * 0.4), 0.172, cwRy, 1.1);
    }
  }

  // ============ 3. DECALS (roads / lots / sidewalks / verges) ============
  var ROAD_DEC = ['oil_stain', 'asphalt_cracks', 'asphalt_patch', 'manhole', 'skid_marks', 'storm_drain', 'utility_plate'];
  var LOT_DEC = ['oil_stain', 'asphalt_patch', 'asphalt_cracks', 'manhole', 'utility_plate'];
  var WALK_DEC = ['sidewalk_gum', 'litter_scatter', 'leaves_scatter', 'cracked_slab'];
  var VERGE_DEC = ['grass_tuft', 'leaves_scatter', 'puddle', 'mud_patch', 'litter_scatter'];
  // road surface decals + dashed centreline
  if (RM) {
    for (var rd2 = 0; rd2 < RM.roads.length; rd2++) {
      var rr = RM.roads[rd2]; if (rr.cls > 2 || rr.dirt) continue;
      var lenA = rr.cum[rr.cum.length - 1];
      for (var s2 = 8; s2 < lenA - 6; s2 += rr.cls <= 1 ? 7 : 11) {
        var pa = rmAt(rr.pts, rr.cum, s2), ry2 = Math.atan2(pa.ux, pa.uz);
        // dashed centre line on arterials/collectors
        if (rr.cls <= 1 && (s2 % 14 < 7)) dDecal('center_line', pa.x, pa.z, 0.172, ry2, 1);
        if (Math.random() < 0.5) {
          var lane = rnd(-rr.hw * 0.6, rr.hw * 0.6);
          var dx2 = pa.x - pa.uz * lane, dz2 = pa.z + pa.ux * lane;
          dDecal(pick(ROAD_DEC), dx2, dz2, 0.17, rnd(0, 6.28), rnd(0.8, 1.3));
        }
      }
    }
  }
  // parking-lot + pavement surface decals
  for (var sp2 = 0; sp2 < SURF.length; sp2++) {
    var sf = SURF[sp2], n2 = Math.min(28, Math.round(sf.w * sf.d / 60));
    for (var q2 = 0; q2 < n2; q2++) {
      var u2 = rnd(-sf.w / 2 + 1, sf.w / 2 - 1), vv = rnd(-sf.d / 2 + 1, sf.d / 2 - 1), wp = rectPt(sf, u2, vv);
      if (inLake(wp[0], wp[1])) continue;
      dDecal(pick(LOT_DEC), wp[0], wp[1], sf.kind === 'parking' ? 0.13 : 0.14, rnd(0, 6.28), rnd(0.8, 1.2));
    }
  }
  // sidewalk + verge decals along the core-leg ribbons
  if (RM && RM.coreWalk) {
    for (var cw2 = 0; cw2 < RM.coreWalk.length; cw2++) {
      var w2 = RM.coreWalk[cw2];
      for (var t2 = 4; t2 < w2.L - 4; t2 += rnd(6, 12)) {
        var sideS = Math.random() < 0.5 ? 1 : -1;
        var offW = w2.hw + 0.8 + Math.random() * (w2.sw - 1);
        var wx = w2.x + w2.ux * t2 - w2.uz * offW * sideS, wz = w2.z + w2.uz * t2 + w2.ux * offW * sideS;
        if (spotClear(wx, wz)) dDecal(pick(WALK_DEC), wx, wz, 0.14, rnd(0, 6.28), rnd(0.8, 1.1));
        // verge decal a little further out onto the grass
        var offV = w2.hw + w2.sw + 1 + Math.random() * 4;
        var vx = w2.x + w2.ux * t2 - w2.uz * offV * sideS, vz = w2.z + w2.uz * t2 + w2.ux * offV * sideS;
        if (Math.random() < 0.5 && spotClear(vx, vz) && !inLake(vx, vz) && !remapInClear(vx, vz, 0)) dDecal(pick(VERGE_DEC), vx, vz, 0.06, rnd(0, 6.28), rnd(0.8, 1.2));
      }
    }
  }

  // ============ 4. SIGNS (facades / poles / yards / billboards / walls) ============
  // NOTE: the generic 'storefront_sign' ("SHOP") prop was dropped — every venue's
  // builder already paints its own branded storefront sign (DUNKIN / DOLLAR TREE /
  // SAKURA SUSHI / …), so mounting a second "SHOP" placard on the same wall just
  // read as a wrong/duplicate sign.
  var FACADE = {
    racetrac: [], publix: ['grand_opening_banner'], starbucks: ['menu_board'],
    strip: ['neon_bar_sign'], dunkin: ['menu_board'],
    yoga: ['neon_bar_sign'], sushi: ['neon_bar_sign'],
    storage: ['graffiti_panel'], farnell: ['wall_mural']
  };
  for (var vg = 0; vg < VENUES.length; vg++) {
    var vv2 = VENUES[vg], fl = FACADE[vv2.type]; if (!fl) continue;
    var f2 = vFront(vv2), wallx = vv2.x + f2.fx * (vv2.d / 2 + 0.12), wallz = vv2.z + f2.fz * (vv2.d / 2 + 0.12);
    for (var fi = 0; fi < fl.length; fi++) {
      var nm = fl[fi], a2 = dAsset[nm]; if (!a2) continue;
      var lateral = (fi - (fl.length - 1) / 2) * Math.min(vv2.w * 0.4, 6);
      var mount = (nm === 'wall_mural' || nm === 'graffiti_panel') ? a2.dims[1] / 2 + 1.0 : 3.4;
      dSign(nm, wallx + f2.rx * lateral, mount, wallz + f2.rz * lateral, f2.yaw, nm === 'grand_opening_banner' ? 1 : 1);
    }
    // gas pylon out at the RaceTrac frontage
    if (vv2.type === 'racetrac') { var px = vv2.x + f2.fx * (vv2.d / 2 + 7), pz = vv2.z + f2.fz * (vv2.d / 2 + 7); pole(px, pz, 3.2, 0.14); dSign('gas_price_sign', px, 4.2, pz, f2.yaw); }
    // freestanding entrance clutter markers
  }
  // billboards on 2-post frames at two road exits (facing inward)
  for (var xi = 0; xi < EXITS.length && xi < 2; xi++) {
    var ex = EXITS[xi], bx = ex.x + ex.dx * 24, bz = ex.z + ex.dz * 24, byaw = Math.atan2(ex.dx, ex.dz) + Math.PI;
    pole(bx - ex.dz * 5, bz + ex.dx * 5, 6, 0.2); pole(bx + ex.dz * 5, bz - ex.dx * 5, 6, 0.2);
    dSign('billboard_ad', bx, 6.6, bz, byaw);
  }
  // roadside sign poles along arterials/collectors: stop at junction approaches,
  // speed/parking/bus elsewhere
  if (RM) {
    for (var rs = 0; rs < RM.roads.length; rs++) {
      var rc = RM.roads[rs]; if (rc.cls > 1 || rc.dirt) continue;
      var lenS = rc.cum[rc.cum.length - 1], sd = 1;
      for (var sv = 40; sv < lenS - 30; sv += 78) {
        var ps = rmAt(rc.pts, rc.cum, sv), of = rc.hw + 2.4;
        var sx = ps.x - ps.uz * of * sd, sz = ps.z + ps.ux * of * sd; sd = -sd;
        if (!spotClear(sx, sz) || remapInClear(sx, sz, 0)) continue;
        var facing = Math.atan2(-ps.ux, -ps.uz);   // face oncoming traffic
        var kind = pick(['speed_limit_sign', 'parking_sign', 'bus_route_sign', 'roadwork_sign']);
        poleSign(kind, sx, sz, facing, kind === 'bus_route_sign' ? 2.2 : 1.7, kind === 'bus_route_sign' ? 2.6 : 2.1);
      }
    }
  }
  // yard signs near residential frontages
  if (RM) {
    for (var yr = 0; yr < RM.roads.length; yr++) {
      var ry3 = RM.roads[yr]; if (ry3.cls < 2 || ry3.dirt) continue;
      var lenY = ry3.cum[ry3.cum.length - 1], yd = 1;
      for (var yv = 30; yv < lenY - 20; yv += 46) {
        var py = rmAt(ry3.pts, ry3.cum, yv), oy = ry3.hw + rnd(3, 6);
        var yx = py.x - py.uz * oy * yd, yz = py.z + py.ux * oy * yd; yd = -yd;
        if (!spotClear(yx, yz) || inLake(yx, yz) || remapInClear(yx, yz, 0)) continue;
        if (Math.random() < 0.55) { var yk = pick(['for_sale_sign', 'yard_sign', 'garage_sale_sign', 'lost_pet_flyer']); pole(yx, yz, 0.9, 0.05); dSign(yk, yx, 0.9, yz, rnd(0, 6.28)); }
      }
    }
  }

  // ============ 5. CLUTTER (behind commercial, wall units, entrances) ============
  var BACK_CLUTTER = ['cardboard_box', 'wooden_crate', 'trash_bags', 'wood_pallet', 'blue_tarp', 'bucket'];
  for (var vc = 0; vc < VENUES.length; vc++) {
    var vv3 = VENUES[vc]; if (!COMM[vv3.type]) continue;
    var f3 = vFront(vv3);
    // dumpster + junk pile behind the store (opposite the front)
    var backx = vv3.x - f3.fx * (vv3.d / 2 + 2.6), backz = vv3.z - f3.fz * (vv3.d / 2 + 2.6);
    var byaw2 = Math.atan2(-f3.fx, -f3.fz);
    if (typeof getStreetProp !== 'undefined') spFull('dumpster', backx, backz, byaw2 + Math.PI / 2);
    for (var jc = 0; jc < 4; jc++) {
      var jx = backx + f3.rx * rnd(-vv3.w * 0.3, vv3.w * 0.3) + f3.fx * rnd(-1, 1);
      var jz = backz + f3.rz * rnd(-vv3.w * 0.3, vv3.w * 0.3) + f3.fz * rnd(-1, 1);
      var cn = pick(BACK_CLUTTER), ca = dAsset[cn]; if (!ca) continue;
      if (cn === 'bucket') dCylAsset(cn, jx, ca.dims[1] / 2 + 0.02, jz);
      else dBoxAsset(cn, jx, ca.dims[1] / 2 + 0.02, jz, rnd(0, 6.28));
    }
    // AC condenser + utility box against a side wall
    var sidex = vv3.x + f3.rx * (vv3.w / 2 + 0.6), sidez = vv3.z + f3.rz * (vv3.w / 2 + 0.6);
    dBoxAsset('ac_condenser', sidex, 0.4, sidez, f3.yaw);
    dBoxAsset('utility_box', sidex + f3.fx * 2, 0.5, sidez + f3.fz * 2, f3.yaw);
    if (Math.random() < 0.6) dCylAsset('propane_tank', sidex - f3.fx * 2, 0.6, sidez - f3.fz * 2);
    // potted plants + mulch bed flanking the entrance
    var frx = vv3.x + f3.fx * (vv3.d / 2 + 1.3), frz = vv3.z + f3.fz * (vv3.d / 2 + 1.3), ee = Math.min(vv3.w / 2 - 1, 4);
    dBoxAsset('potted_plant', frx + f3.rx * ee, 0.35, frz + f3.rz * ee, 0);
    dBoxAsset('potted_plant', frx - f3.rx * ee, 0.35, frz - f3.rz * ee, 0);
    dDecal('mulch_bed', frx, frz, 0.13, f3.yaw, 1);
  }
  // barrel delineators + sandbags at the road-closed barriers
  for (var xb = 0; xb < EXITS.length; xb++) {
    var eb = EXITS[xb], cbx = eb.x + eb.dx * 16, cbz = eb.z + eb.dz * 16, rrx = -eb.dz, rrz = eb.dx;
    for (var bd = -2; bd <= 2; bd++) {
      var dbx = cbx + rrx * bd * 2.2, dbz = cbz + rrz * bd * 2.2;
      if (bd % 2) dCylAsset('barrel_delineator', dbx, 0.5, dbz); else dBoxAsset('sandbag', dbx, 0.13, dbz, Math.atan2(rrx, rrz));
    }
  }

  // ============ 6. FENCES (property lines / lot edges / yards) ============
  // chainlink around the self-storage + school footprints
  for (var vh = 0; vh < VENUES.length; vh++) {
    var vv4 = VENUES[vh];
    if (vv4.type === 'storage') fenceRect(vv4.x, vv4.z, vv4.w + 6, vv4.d + 6, vv4.rot || 0, 'chainlink_fence', true);
    if (vv4.type === 'farnell') fenceRect(vv4.x, vv4.z, vv4.w + 10, vv4.d + 14, vv4.rot || 0, 'chainlink_fence', true);
    // hedge along the back of each townhouse row
    if (vv4.type === 'townhouse') {
      var f4 = vFront(vv4), hw2 = vv4.w / 2 - 1, bx2 = vv4.x - f4.fx * (vv4.d / 2 + 1.2), bz2 = vv4.z - f4.fz * (vv4.d / 2 + 1.2);
      fenceRun(bx2 - f4.rx * hw2, bz2 - f4.rz * hw2, bx2 + f4.rx * hw2, bz2 + f4.rz * hw2, Math.random() < 0.5 ? 'hedge_row' : 'privacy_fence', true);
    }
    // low brick wall along the street edge of Publix / BofA lots
    if (vv4.id === 'publix' || vv4.id === 'boa') {
      var f5 = vFront(vv4), ew2 = vv4.w / 2 + 2, fx5 = vv4.x + f5.fx * (vv4.d / 2 + 6), fz5 = vv4.z + f5.fz * (vv4.d / 2 + 6);
      fenceRun(fx5 - f5.rx * ew2, fz5 - f5.rz * ew2, fx5 + f5.rx * ew2, fz5 + f5.rz * ew2, 'brick_low_wall', false);
    }
  }

  // ============ 7. CONTEXTUAL STREET PROPS (streetprops.js) ============
  // Reuses getStreetProp; keeps colliders/interactions (vending/atm/hydrant)
  // intact. Modest count to respect the draw-call budget.
  function spFull(name, x, z, ry, y) {
    if (typeof getStreetProp === 'undefined') return;
    var g = getStreetProp(name); if (!g) return;
    var dims = g.userData.spDims || [1, 1, 1];
    var c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    var hx = (dims[0] * c + dims[2] * s) / 2, hz = (dims[0] * s + dims[2] * c) / 2;
    if (spOverlapsBuilding(x, z, hx, hz)) return;
    g.position.set(x, y === undefined ? 0.13 : y, z); g.rotation.y = ry; scene.add(g);
    if (SP_SOLID[name]) { addCollider(x, z, hx * 2, hz * 2); solidMeshes.push(g); }
    if (SP_SNAP[name]) { registerBreakable(g, x, z, Math.max(hx, hz) + 0.15, SP_SNAP[name], null, SP_BLOCKR[name] || 0); var bb = breakables[breakables.length - 1]; if (name === 'parkingmeter') bb.kind = 'meter'; if (name === 'hydrant') bb.kind = 'hydrant'; }
    if (SP_INTERACT[name]) { var it = { kind: SP_INTERACT[name], x: x, z: z, fx: -Math.cos(ry), fz: Math.sin(ry), g: g, cd: -99, robbed: false }; if (it.kind === 'atm') { g.userData.atm = it; if (!SP_SOLID[name]) solidMeshes.push(g); } streetPropInteractables.push(it); }
    densityStats.props++;
  }
  if (typeof STREET_PROPS !== 'undefined') {
    // storefront benches / trashcans / bike racks / a vending machine per commercial venue
    for (var vp = 0; vp < VENUES.length; vp++) {
      var vv5 = VENUES[vp]; if (!COMM[vv5.type]) continue;
      var f6 = vFront(vv5), fpx2 = vv5.x + f6.fx * (vv5.d / 2 + 1.4), fpz2 = vv5.z + f6.fz * (vv5.d / 2 + 1.4);
      var frontYaw = Math.atan2(f6.fx, f6.fz);   // prop front (-x authored) faces outward
      var lat = Math.min(vv5.w / 2 - 2, 5);
      spFull('bench', fpx2 + f6.rx * lat, fpz2 + f6.rz * lat, frontYaw);
      spFull('trashcan', fpx2 - f6.rx * lat, fpz2 - f6.rz * lat, frontYaw);
      if (vv5.type === 'publix' || vv5.type === 'dollar_tree') spFull('vendingmachine', fpx2 + f6.rx * (lat * 0.4), fpz2 + f6.rz * (lat * 0.4), frontYaw);
      if (vv5.type === 'bank') spFull('atm', fpx2, fpz2, frontYaw);
      if (vv5.type === 'farnell' || vv5.type === 'publix') spFull('bikerack', fpx2 + f6.rx * (lat * 0.7), fpz2 + f6.rz * (lat * 0.7), frontYaw);
    }
    // hydrants ~ every 90u + occasional bus shelter along arterials/collectors
    if (RM) {
      for (var hp = 0; hp < RM.roads.length; hp++) {
        var hr = RM.roads[hp]; if (hr.cls > 1 || hr.dirt) continue;
        var lenH = hr.cum[hr.cum.length - 1], hd2 = 1;
        for (var hv = 50; hv < lenH - 30; hv += 90) {
          var ph = rmAt(hr.pts, hr.cum, hv), ofh = hr.hw + 2.0;
          var hx2 = ph.x - ph.uz * ofh * hd2, hz2 = ph.z + ph.ux * ofh * hd2; hd2 = -hd2;
          if (spotClear(hx2, hz2) && !remapInClear(hx2, hz2, 0)) spFull('hydrant', hx2, hz2, 0);
        }
        // one bus shelter per long arterial
        if (hr.cls === 0 && lenH > 120) {
          var pbs = rmAt(hr.pts, hr.cum, lenH * 0.5), ofb = hr.hw + 3.4;
          var bsx = pbs.x - pbs.uz * ofb, bsz = pbs.z + pbs.ux * ofb;
          if (spotClear(bsx, bsz)) spFull('busshelter', bsx, bsz, Math.atan2(pbs.ux, pbs.uz));
        }
      }
    }
    // mailboxes at townhouse rows
    for (var mp = 0; mp < VENUES.length; mp++) {
      var vv6 = VENUES[mp]; if (vv6.type !== 'townhouse') continue;
      var f7 = vFront(vv6), mfx = vv6.x + f7.fx * (vv6.d / 2 + 1.2), mfz = vv6.z + f7.fz * (vv6.d / 2 + 1.2);
      for (var me = -1; me <= 1; me += 2) { var mx = mfx + f7.rx * (vv6.w / 2 - 4) * me, mz = mfz + f7.rz * (vv6.w / 2 - 4) * me; spFull('homemailbox', mx, mz, Math.atan2(f7.fx, f7.fz), 0.02); }
    }
  }

  flush();
})();

// ============================================================
// REUSABLE FENCE SYSTEM  (WC_REMAP)
// ------------------------------------------------------------
// buildFenceRun(pts, type, opts) builds a fence that hugs the ground along a
// polyline of [x,z] game-coord waypoints. Each polyline edge is segmented into
// post-spaced panels; geometry of one type merges into a few draw calls.
//
//   'picket'    - flat white pointed-picket ALPHA CARDS (2D billboards, ~0
//                 thickness) + slightly-raised square posts. Procedural alpha
//                 texture (vertical slats, pointed tops, keyed-transparent gaps).
//   'chainlink' - see-through diamond-mesh ALPHA CARD (reuses the densityprops
//                 chainlink texture if present, else procedural diamond mesh) +
//                 real vertical POLE posts every ~2.5u + a top rail.
//   'wood'      - solid privacy PLANKS with a SMALL thickness (~0.06u extruded
//                 box panels, reuses the densityprops privacy texture) + posts.
//
// Colliders: one thin oriented-box (OBB) per polyline edge so the player is
// BLOCKED by every fence type (picket + chainlink block too). Segments whose
// midpoint sits within `roadGuard` u of any true road's asphalt are skipped, so
// a run never walls off a road or driveway (pass opts.noClip to override).
//
// >>> HOW TO ADD A FENCE (the reusable workflow) <<<
//   Append ONE row to the FENCE_RUNS table below:
//       { type:'picket'|'chainlink'|'wood', h:<height u>, pts:[[x,z],[x,z],...] }
//   Optional per-row keys: color (0xRRGGBB post/pole tint, e.g. black pond
//   chainlink), roadGuard (u, default 1.2), noClip:true (skip road rejection).
//   Waypoints are game coords — Street-View anchored to REMAP_VENUES /
//   REMAP_ROADS (see remapdata.js). Keep them clear of roads/sidewalks/props.
//   That's it: the loader below segments, tiles, posts, colliders + merges it.
// ============================================================
// STEP 2 — authored, Street-View-anchored placement (see tools/FENCES.md).
// Real Westchase fences studied on Google Street View at the actual venues,
// then mapped onto this stylized map's faithfully-arranged footprints:
//   * schools (Farnell/Bryant) ring their fields with DARK metal-mesh fence
//   * self-storage lots are chainlink-secured
//   * townhome back/side yards use WOOD privacy fence
//   * retention-pond banks get LOW dark chainlink
//   * lakeside park lawns + single-family yards use white PICKET
// Every segment was validated clear of roads / the lake / building footprints.
var FENCE_RUNS = [
  // --- chainlink ---
  { type: 'chainlink', h: 2.0, color: 0x2b2f31, pts: [[-150, -92], [-150, -60], [-40, -60]] }, // Farnell school field, W+front (dark)
  { type: 'chainlink', h: 2.2,                  pts: [[8, 84], [54, 84], [54, 130]] },          // self-storage lot, N+E
  { type: 'chainlink', h: 1.0, color: 0x2b2f31, pts: [[-330, -12], [-244, -12]] },              // retention-pond N bank (low, dark)
  // --- wood privacy (townhome back/side yards, SW cluster) ---
  { type: 'wood', h: 1.8, pts: [[-206, -90], [-158, -90]] },   // behind e281 row
  { type: 'wood', h: 1.8, pts: [[-182, -148], [-150, -148]] }, // NW of e285
  { type: 'wood', h: 1.8, pts: [[-220, -135], [-220, -165]] }, // W of e283/e285
  { type: 'wood', h: 1.8, pts: [[-215, -100], [-215, -140]] }, // W of e281
  { type: 'wood', h: 1.8, pts: [[-130, -210], [-75, -212]] },  // S of e287/e289
  { type: 'wood', h: 1.8, pts: [[-150, -178], [-115, -182]] }, // between e285/e287
  { type: 'wood', h: 1.8, pts: [[-180, -200], [-120, -205]] }, // S-far cluster edge
  // --- picket (lakeside park lawns + single-family yard) ---
  { type: 'picket', h: 1.1, pts: [[-188, 0], [-188, 60]] },      // lake E promenade
  { type: 'picket', h: 1.1, pts: [[-268, 118], [-300, 120]] },   // lake SW lawn
  { type: 'picket', h: 1.1, pts: [[-290, 120], [-290, 158]] },   // red-house W yard
  { type: 'picket', h: 1.1, pts: [[-330, 122], [-296, 122]] }    // SW pond-lawn park edge
];
var FENCE_H = { picket: 1.1, chainlink: 2.0, wood: 1.8 };
function buildFenceRun() { return null; }   // replaced by the closure export below
if (WC_REMAP) (function fenceSystem() {
  // ---- shared unit geometry (baked through a matrix into merged batches) ----
  function mtx(px, py, pz, ry) {
    return new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz),
      new THREE.Quaternion().setFromAxisAngle(Y_UP, ry || 0), new THREE.Vector3(1, 1, 1));
  }
  // ---- densityprops texture lookup (chainlink + privacy reuse) ----
  var dRec = {};
  if (typeof DENSITY_PROPS !== 'undefined') for (var di = 0; di < DENSITY_PROPS.length; di++) dRec[DENSITY_PROPS[di].n] = DENSITY_PROPS[di];
  // async data-URL -> CanvasTexture, optional luminance keying (dark -> clear)
  function loadTex(dataurl, thr) {
    var cnv = document.createElement('canvas'); cnv.width = cnv.height = 256;
    var tx = new THREE.CanvasTexture(cnv);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.magFilter = THREE.LinearFilter;
    // keyed (alpha) textures must NOT mipmap — averaging fills the transparent gaps
    if (thr) { tx.minFilter = THREE.LinearFilter; tx.generateMipmaps = false; } else tx.minFilter = THREE.LinearMipmapLinearFilter;
    var im = new Image();
    im.onload = (function (tx, cnv, thr, im) { return function () {
      var g = cnv.getContext('2d'); g.drawImage(im, 0, 0, 256, 256);
      if (thr) { var d = g.getImageData(0, 0, 256, 256), p = d.data; for (var k = 0; k < p.length; k += 4) { if (p[k] * 0.299 + p[k + 1] * 0.587 + p[k + 2] * 0.114 < thr) p[k + 3] = 0; } g.putImageData(d, 0, 0); }
      tx.needsUpdate = true;
    }; })(tx, cnv, thr, im);
    im.src = dataurl;
    return tx;
  }
  // procedural white pointed-picket alpha card (transparent gaps)
  function picketTex() {
    var s = 128, c = document.createElement('canvas'); c.width = c.height = s;
    var g = c.getContext('2d'); g.clearRect(0, 0, s, s);
    var n = 4, cw = s / n, gap = 0.36;
    for (var i = 0; i < n; i++) {
      var x0 = i * cw + cw * gap * 0.5, w = cw * (1 - gap);
      var shoulder = s * 0.26, peak = s * 0.06;   // canvas top = fence top (flipY)
      g.fillStyle = '#eef0ea';
      g.beginPath(); g.moveTo(x0, s); g.lineTo(x0, shoulder); g.lineTo(x0 + w / 2, peak); g.lineTo(x0 + w, shoulder); g.lineTo(x0 + w, s); g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(x0 + w - 2, shoulder, 2, s - shoulder);   // slat edge shade
    }
    // two horizontal rails
    g.fillStyle = '#e2e4de'; g.fillRect(0, s * 0.44, s, s * 0.05); g.fillRect(0, s * 0.74, s, s * 0.05);
    var tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.LinearFilter; tx.generateMipmaps = false;   // mipmaps average alpha -> gaps fill in; keep crisp
    return tx;
  }
  // procedural chainlink diamond-mesh alpha card
  function chainProcTex() {
    var s = 128, c = document.createElement('canvas'); c.width = c.height = s;
    var g = c.getContext('2d'); g.clearRect(0, 0, s, s);
    g.strokeStyle = 'rgba(190,196,200,1)'; g.lineWidth = 2; var step = 16;
    for (var d = -s; d < s * 2; d += step) { g.beginPath(); g.moveTo(d, 0); g.lineTo(d + s, s); g.stroke(); g.beginPath(); g.moveTo(d, 0); g.lineTo(d - s, s); g.stroke(); }
    var tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.magFilter = THREE.LinearFilter; tx.minFilter = THREE.LinearFilter; tx.generateMipmaps = false;   // keep the see-through diamonds crisp
    return tx;
  }
  // procedural vertical-plank privacy texture (wood fallback)
  function woodProcTex() {
    var s = 128, c = document.createElement('canvas'); c.width = c.height = s;
    var g = c.getContext('2d'); g.fillStyle = '#8a7150'; g.fillRect(0, 0, s, s);
    for (var i = 0; i < 8; i++) { var x = i * s / 8; g.fillStyle = i % 2 ? '#7d6547' : '#93794f'; g.fillRect(x, 0, s / 8 - 1, s); g.fillStyle = 'rgba(60,45,25,0.5)'; g.fillRect(x + s / 8 - 1, 0, 1, s); }
    var tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    return tx;
  }
  var _picketTex, _chainTex, _woodTex;
  function picketMap() { return _picketTex || (_picketTex = picketTex()); }
  function chainMap() { return _chainTex || (_chainTex = dRec.chainlink_fence ? loadTex(dRec.chainlink_fence.tex, 46) : chainProcTex()); }
  function woodMap() { return _woodTex || (_woodTex = dRec.privacy_fence ? loadTex(dRec.privacy_fence.tex, 0) : woodProcTex()); }

  // ---- merged batches: one draw call per material key ----
  var FB = {}, _NM = new THREE.Matrix3(), _V = new THREE.Vector3(), _N = new THREE.Vector3();
  function fbatch(key, meta) { var e = FB[key]; if (!e) e = FB[key] = { pos: [], norm: [], uv: [], meta: meta }; return e; }
  function fbake(key, meta, geo, m) {
    var e = fbatch(key, meta); _NM.getNormalMatrix(m);
    var p = geo.attributes.position, u = geo.attributes.uv, nm = geo.attributes.normal, idx = geo.index;
    var count = idx ? idx.count : p.count;
    for (var i = 0; i < count; i++) {
      var vi = idx ? idx.getX(i) : i;
      _V.set(p.getX(vi), p.getY(vi), p.getZ(vi)).applyMatrix4(m); e.pos.push(_V.x, _V.y, _V.z);
      if (nm) { _N.set(nm.getX(vi), nm.getY(vi), nm.getZ(vi)).applyMatrix3(_NM).normalize(); e.norm.push(_N.x, _N.y, _N.z); } else e.norm.push(0, 1, 0);
      e.uv.push(u ? u.getX(vi) : 0, u ? u.getY(vi) : 0);
    }
  }
  function fflush() {
    for (var key in FB) {
      var e = FB[key]; if (!e.pos.length) continue;
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(e.pos), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(e.norm), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(e.uv), 2));
      var o = e.meta, mo = {};
      if (o.map) { mo.map = o.map; }
      if (o.alpha) { mo.transparent = true; mo.alphaTest = o.alpha; mo.side = THREE.DoubleSide; }
      if (o.color !== undefined) mo.color = o.color;
      var mesh = new THREE.Mesh(g, lamb(mo));
      scene.add(mesh);
    }
  }

  // ---- panel + post builders (bake into the right batch) ----
  function cardPanel(key, meta, cx, cz, ry, len, h, rep) {
    var pg = new THREE.PlaneGeometry(len, h), uv = pg.attributes.uv;
    for (var i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * rep);
    fbake(key, meta, pg, mtx(cx, h / 2 + 0.02, cz, ry));
  }
  function boxPanel(key, meta, cx, cz, ry, len, h, thick) {
    var bg = new THREE.BoxGeometry(len, h, thick);
    fbake(key, meta, bg, mtx(cx, h / 2 + 0.02, cz, ry));
  }
  function postBox(key, meta, x, z, h, r) {
    fbake(key, meta, new THREE.BoxGeometry(r * 2, h, r * 2), mtx(x, h / 2, z, 0));
  }
  function postCyl(key, meta, x, z, h, r) {
    fbake(key, meta, new THREE.CylinderGeometry(r, r, h, 8), mtx(x, h / 2, z, 0));
  }
  function railBox(key, meta, cx, cz, ry, len, y, r) {
    fbake(key, meta, new THREE.BoxGeometry(len, r * 2, r * 2), mtx(cx, y, cz, ry));
  }

  // ---- the public builder ----
  function buildRun(pts, type, opts) {
    opts = opts || {};
    if (!pts || pts.length < 2) return;
    var h = opts.h || FENCE_H[type] || 1.5;
    var guard = opts.roadGuard === undefined ? 1.2 : opts.roadGuard;
    var postClr = opts.color !== undefined ? opts.color : (type === 'wood' ? 0x8a7150 : type === 'chainlink' ? 0x8a8f94 : 0xf0f0ea);
    var spacing = type === 'chainlink' ? 2.5 : 2.4;
    for (var s = 0; s < pts.length - 1; s++) {
      var ax = pts[s][0], az = pts[s][1], bx = pts[s + 1][0], bz = pts[s + 1][1];
      var dx = bx - ax, dz = bz - az, L = Math.sqrt(dx * dx + dz * dz);
      if (L < 0.4) continue;
      var mx = (ax + bx) / 2, mz = (az + bz) / 2;
      // never wall off a road/driveway
      if (!opts.noClip && !remapPointClear(mx, mz, guard)) continue;
      var ry = Math.atan2(-dz, dx);
      var ux = dx / L, uz = dz / L;
      var panels = Math.max(1, Math.round(L / spacing)), pl = L / panels;
      for (var q = 0; q < panels; q++) {
        var t = (q + 0.5) * pl, pcx = ax + ux * t, pcz = az + uz * t;
        if (type === 'picket') {
          cardPanel('fence_picket', { map: picketMap(), alpha: 0.45 }, pcx, pcz, ry, pl, h, pl / (h * 1.0));
        } else if (type === 'chainlink') {
          cardPanel('fence_chain', { map: chainMap(), alpha: 0.25 }, pcx, pcz, ry, pl, h, pl / h);
          railBox('fence_chainpost', { color: postClr }, pcx, pcz, ry, pl, h - 0.06, 0.035);   // top rail
        } else {   // wood
          boxPanel('fence_wood', { map: woodMap() }, pcx, pcz, ry, pl, h, 0.06);
        }
      }
      // posts at every panel boundary (incl. both ends)
      for (var b = 0; b <= panels; b++) {
        var pt2 = b * pl, px2 = ax + ux * pt2, pz2 = az + uz * pt2;
        if (type === 'chainlink') postCyl('fence_chainpost', { color: postClr }, px2, pz2, h + 0.12, 0.05);
        else if (type === 'wood') postBox('fence_woodpost', { color: postClr }, px2, pz2, h + 0.15, 0.06);
        else postBox('fence_picketpost', { color: postClr }, px2, pz2, h + 0.14, 0.05);
      }
      // one thin OBB collider spanning the whole edge (fences are solid to the player)
      addColliderOBB(mx, mz, L / 2, 0.14, ry);
    }
  }
  // expose for tests / future callers
  buildFenceRun = function (pts, type, opts) { return buildRun(pts, type, opts); };

  // ---- build every authored run ----
  for (var fr = 0; fr < FENCE_RUNS.length; fr++) {
    var R = FENCE_RUNS[fr];
    buildRun(R.pts, R.type, { h: R.h, color: R.color, roadGuard: R.roadGuard, noClip: R.noClip });
  }
  fflush();
})();

// ---- interactions (E key + prompt; local-only) ----
function streetPropNear() {
  if (!state.running || state.dead || driving || inside) return null;
  var best = null, bd = 2.2 * 2.2;
  for (var i = 0; i < streetPropInteractables.length; i++) {
    var p = streetPropInteractables[i];
    var dx = player.x - p.x, dz = player.z - p.z, d2 = dx * dx + dz * dz;
    if (d2 < bd) { best = p; bd = d2; }
  }
  return best;
}
function streetPropPrompt() {
  var p = streetPropNear();
  if (!p) return '';
  if (p.kind === 'vend') return '[E] SODA — $2';
  if (p.kind === 'phone') return T < p.cd ? '' : '[E] USE PAYPHONE';
  if (p.kind === 'atm') return '[E] USE ATM';
  if (p.kind === 'news') return T < p.cd ? '' : '[E] NEWSPAPER BOX';
  return '';
}
function streetPropInteract() {
  var p = streetPropNear();
  if (!p) return false;
  if (p.kind === 'vend') {
    if (state.money < 2) { sfx('deny'); popup2('Need $2'); return true; }
    state.money -= 2;
    sfx('buy');
    beep(880, 0.05, 0.1, 'square'); setTimeout(function () { beep(660, 0.05, 0.1, 'square'); }, 90);
    setTimeout(function () { noiseBurst(0.09, 500, 0.35); beep(120, 0.08, 0.25, 'square', 60); }, 420);   // can drops
    (function (pp) { setTimeout(function () { spawnSodaDrop(pp.x + pp.fx * 0.9, pp.z + pp.fz * 0.9); }, 500); })(p);
    popup('SODA dispensed');
  } else if (p.kind === 'phone') {
    if (T < p.cd) return true;
    p.cd = T + 8;
    beep(350, 0.9, 0.06, 'sine'); beep(440, 0.9, 0.06, 'sine');   // dial tone
    setTimeout(function () {
      var r = Math.random();
      if (r < 0.05) {          // ...something else on the line
        beep(160, 0.5, 0.12, 'sawtooth', 70); noiseBurst(0.7, 400, 0.12);
        setTimeout(function () { beep(95, 0.8, 0.14, 'sawtooth', 55); noiseBurst(0.5, 300, 0.1); }, 550);
        popup2('...it whispers your name');
      } else if (r < 0.5) {    // busy
        beep(480, 0.28, 0.09, 'square'); setTimeout(function () { beep(480, 0.28, 0.09, 'square'); }, 560);
        setTimeout(function () { beep(480, 0.28, 0.09, 'square'); }, 1120);
      } else {                 // a random townsperson picks up (earpiece = non-spatial)
        var names = typeof NPC_VOICES !== 'undefined' ? Object.keys(NPC_VOICES).filter(function (k) { return NPC_VOICES[k].chat; }) : [];
        if (names.length) playNpcVoice(names[(Math.random() * names.length) | 0], 'chat', 0.4, 0.1);
        else { beep(480, 0.28, 0.09, 'square'); }
      }
    }, 1100);
  } else if (p.kind === 'atm') {
    if (T < p.cd) return true;
    p.cd = T + 2;
    beep(1050, 0.07, 0.1, 'square'); setTimeout(function () { beep(1050, 0.07, 0.1, 'square'); }, 160);
    setTimeout(function () { sfx('deny'); }, 480);
    popup2('OUT OF SERVICE');
  } else if (p.kind === 'news') {
    if (T < p.cd) return true;
    p.cd = T + 30;
    noiseBurst(0.07, 1100, 0.35);
    setTimeout(function () { noiseBurst(0.06, 900, 0.3); beep(320, 0.05, 0.1, 'square'); }, 100);
    if (Math.random() < 1 / 6) { spawnCash(p.x + p.fx * 0.7, p.z + p.fz * 0.7, 5); sfx('cash'); popup('Someone left change!'); }
    else popup('Just old news.');
  }
  return true;
}
// shooting an ATM bursts it open once — cash + instant 2 stars
function shootAtm(a, point) {
  puff(point, a.robbed ? 0xbbbbbb : 0xffe9a8);
  if (a.robbed) return;
  a.robbed = true;
  var total = 50 + ((Math.random() * 101) | 0);
  spawnCashNet(a.x + a.fx * 1.1, a.z + a.fz * 1.1, Math.ceil(total / 3));
  spawnCashNet(a.x + a.fx * 1.5, a.z + a.fz * 1.5, Math.ceil(total / 3));
  spawnCashNet(a.x + a.fx * 1.3 + 0.5, a.z + a.fz * 1.3 - 0.5, Math.floor(total / 3));
  sfx('alarm'); sfx('cash');
  popup('ATM CRACKED');
  if (state.wanted < 2) setWanted(2); else lastCrimeT = T;
}
// called from breakProp for props with a .kind tag
function onStreetPropBreak(b) {
  if (b.kind === 'meter') {
    spawnCashNet(b.x, b.z, 5 + ((Math.random() * 11) | 0));
    sfx('cash', { x: b.x, z: b.z, range: 50 });
  } else if (b.kind === 'hydrant') {
    var parts = [];
    var jm = new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.85 });
    var jg = new THREE.SphereGeometry(0.13, 6, 5);
    for (var i = 0; i < 18; i++) {
      var m = new THREE.Mesh(jg, jm);
      m.visible = false;
      scene.add(m);
      parts.push({ mesh: m, vx: 0, vy: -1, vz: 0, delay: Math.random() * 0.8 });
    }
    hydrantJets.push({ x: b.x, z: b.z, t: 30, parts: parts, sT: 0 });
    noiseBurst(0.5, 800, 0.5);
  }
}
// soda pickup drop (reuses the drops[] pattern with kind 'soda')
function sodaDropMesh() {
  var g = new THREE.Group();
  g.add(cyl(0.11, 0.11, 0.32, 10, lamb({ color: 0xc0392b }), 0, 0, 0));
  g.add(cyl(0.115, 0.115, 0.03, 10, phong({ color: 0xd8dce0, shininess: 90 }), 0, 0.16, 0));
  g.add(box(0.222, 0.1, 0.02, lamb({ color: 0xf0e6d8 }), 0, 0.02, 0.105));
  return g;
}
function spawnSodaDrop(x, z) {
  var g = sodaDropMesh();
  g.position.set(x, 0.7, z);
  scene.add(g);
  drops.push({ mesh: g, kind: 'soda', life: 180 });
}
function consumeSoda() {
  if (state.sodas <= 0) return;
  state.sodas--;
  state.hp = Math.min(100, state.hp + 25);
  sfx('eat');
  popup('+25 HP');
  if (state.sodas <= 0) setEquipped('fists');
  else setEquipped('soda');   // refresh the held-count HUD
}
// TAB inventory row (called from refreshInv)
function sodaInvRow(rows) {
  if (state.sodas <= 0) return;
  var srow = document.createElement('div'); srow.className = 'row';
  var sleft = document.createElement('div');
  sleft.innerHTML = '<b class="' + (state.equipped === 'soda' ? 'equipped' : '') + '">SODA &times;' + state.sodas + (state.equipped === 'soda' ? ' &#9668; equipped' : '') + '</b><small>drink to restore 25 hp</small>';
  srow.appendChild(sleft);
  var sbtn = document.createElement('button');
  if (state.equipped === 'soda') { sbtn.textContent = 'UNEQUIP'; sbtn.onclick = function () { setEquipped('fists'); refreshInv(); }; }
  else { sbtn.textContent = 'EQUIP'; sbtn.onclick = function () { setEquipped('soda'); refreshInv(); }; }
  srow.appendChild(sbtn); rows.appendChild(srow);
}
// hydrant water jets (called from the main loop next to updateWorldFx)
function updateStreetProps(dt) {
  for (var i = hydrantJets.length - 1; i >= 0; i--) {
    var j = hydrantJets[i];
    j.t -= dt;
    if (j.t <= 0) {
      for (var k = 0; k < j.parts.length; k++) scene.remove(j.parts[k].mesh);
      hydrantJets.splice(i, 1);
      continue;
    }
    j.sT -= dt;
    if (j.sT <= 0) {   // soft recurring splash while it gushes
      j.sT = 1.4;
      var sdx = j.x - player.x, sdz = j.z - player.z;
      if (sdx * sdx + sdz * sdz < 1600) noiseBurst(0.35, 700, 0.12);
    }
    for (var p = 0; p < j.parts.length; p++) {
      var fd = j.parts[p];
      if (fd.delay > 0) { fd.delay -= dt; continue; }
      var fp = fd.mesh.position;
      if (!fd.mesh.visible || fp.y < 0) {
        fd.mesh.visible = true;
        fp.set(j.x, 0.4, j.z);
        var a = Math.random() * Math.PI * 2, sp = 0.3 + Math.random() * 0.9;
        fd.vx = Math.cos(a) * sp; fd.vz = Math.sin(a) * sp;
        fd.vy = 6.5 + Math.random() * 3;
      }
      fd.vy -= 9.5 * dt;
      fp.x += fd.vx * dt; fp.y += fd.vy * dt; fp.z += fd.vz * dt;
    }
  }
}

// ============================================================
// ENV PROPS (envprops.js) — 46 environment / street-furniture assets placed
// contextually around the WC_REMAP world. Decoded EXACTLY like getStreetProp
// (int16 p / q, uint16 uv with 1-v flip, non-indexed, NearestFilter Lambert
// map). High-count pure-static props MERGE by asset into one buffer/draw-call
// (perf, like the density layer + houses); animated + interactive props stay
// as individually-addressable Group instances (registered in `envProps` so
// STEP-2 animation drivers + STEP-3 E-interactions can find them).
// All render-only + singleplayer-local — never simulated or net-synced.
// ============================================================
var envProps = [];              // instanced (animated/interactive) records
var envPropInteractables = [];  // subset with an interact flag (STEP 3 E-hooks)
var envStats = { placed: 0, merged: 0, colliders: 0, batches: 0, byCat: {} };
var ENV_BY_NAME = {};
if (typeof ENV_PROPS !== 'undefined') for (var epi = 0; epi < ENV_PROPS.length; epi++) ENV_BY_NAME[ENV_PROPS[epi].n] = ENV_PROPS[epi];

var envGeoCache = {}, envTexCache = {};
function envDecodeGeo(e) {
  if (envGeoCache[e.n]) return envGeoCache[e.n];
  var qp = new Int16Array(b64Bytes(e.p).buffer), qu = new Uint16Array(b64Bytes(e.u).buffer);
  var fp = new Float32Array(qp.length), fu = new Float32Array(qu.length);
  for (var i = 0; i < qp.length; i++) fp[i] = qp[i] / e.q;
  for (i = 0; i < qu.length; i += 2) { fu[i] = qu[i] / 8192; fu[i + 1] = 1 - qu[i + 1] / 8192; }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(fu, 2));
  if (e.i) geo.setIndex(new THREE.BufferAttribute(new Uint16Array(b64Bytes(e.i).buffer), 1));
  geo.computeVertexNormals();
  return (envGeoCache[e.n] = geo);
}
function envTex(e) {
  if (envTexCache[e.n]) return envTexCache[e.n];
  var im = new Image(), tx = new THREE.Texture(im);
  tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false;
  im.onload = function () { tx.needsUpdate = true; };
  im.src = e.tex;
  return (envTexCache[e.n] = tx);
}
// build a fresh Group instance (one Mesh) — used for animated/interactive props
function getEnvProp(name) {
  var e = ENV_BY_NAME[name]; if (!e) return null;
  var g = new THREE.Group();
  var mesh = new THREE.Mesh(envDecodeGeo(e), lamb({ map: envTex(e) }));
  g.add(mesh);
  g.userData.envDims = e.dims; g.userData.envName = name;
  return g;
}

// ---- placement (WC_REMAP only; SP_PLACES-style suppression otherwise) ----
if (WC_REMAP && typeof ENV_PROPS !== 'undefined') (function envPropsLayer() {
  var deg = Math.PI / 180;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  var VENUES = (typeof REMAP_VENUES !== 'undefined') ? REMAP_VENUES : [];
  var SURF = (typeof REMAP_SURFACES !== 'undefined') ? REMAP_SURFACES : [];
  var EXITS = (typeof REMAP_EXITS !== 'undefined') ? REMAP_EXITS : [];
  var byId = {}, byType = {};
  for (var vi = 0; vi < VENUES.length; vi++) { byId[VENUES[vi].id] = VENUES[vi]; (byType[VENUES[vi].type] = byType[VENUES[vi].type] || []).push(VENUES[vi]); }
  function surfById(kind, minArea) { var o = []; for (var i = 0; i < SURF.length; i++) if (SURF[i].kind === kind && SURF[i].w * SURF[i].d >= (minArea || 0)) o.push(SURF[i]); return o; }
  // outward-front frame for a venue (matches the density layer convention)
  function vFront(v) { var yaw = (v.rot || 0) * deg; return { yaw: yaw, fx: Math.sin(yaw), fz: Math.cos(yaw), rx: Math.cos(yaw), rz: -Math.sin(yaw) }; }
  // yaw that points the authored front (-x) toward world dir (dx,dz)
  function faceDir(dx, dz) { return Math.atan2(dz, -dx); }

  // high-count pure-static assets merge into one buffer/draw-call per asset
  var MERGE = { handrail: 1, retaining_wall: 1, pond_fence: 1, screen_wall: 1, bollard: 1, chain_post: 1, concrete_planter: 1, tiered_planter: 1, raised_bed: 1, bird_bath: 1, mailbox_cluster: 1, park_lamp: 1, garden_gnome: 1, flamingo: 1 };
  // props big enough that rain should shadow them (also drawn on minimap)
  var BIGMAP = { food_truck: 1, icecream_truck: 1, playground_climber: 1, skate_ramp: 1 };
  var EM = {};   // merged batches: name -> {pos,uv,norm}
  var _V = new THREE.Vector3(), _N = new THREE.Vector3(), _NM = new THREE.Matrix3();
  function bake(name, m) {
    var e = ENV_BY_NAME[name]; if (!e) return; var geo = envDecodeGeo(e);
    var b = EM[name] || (EM[name] = { pos: [], uv: [], norm: [] });
    _NM.getNormalMatrix(m);
    var p = geo.attributes.position, u = geo.attributes.uv, nm = geo.attributes.normal, idx = geo.index;
    var count = idx ? idx.count : p.count;
    for (var i = 0; i < count; i++) {
      var vx = idx ? idx.getX(i) : i;
      _V.set(p.getX(vx), p.getY(vx), p.getZ(vx)).applyMatrix4(m); b.pos.push(_V.x, _V.y, _V.z);
      _N.set(nm.getX(vx), nm.getY(vx), nm.getZ(vx)).applyMatrix3(_NM).normalize(); b.norm.push(_N.x, _N.y, _N.z);
      b.uv.push(u.getX(vx), u.getY(vx));
    }
  }
  function mtx(x, y, z, ry) { return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(Y_UP, ry || 0), new THREE.Vector3(1, 1, 1)); }

  // core placement: name at (x,z), authored-front yaw ry. opts:
  //   y (ground offset, def 0), noCol (skip collider), mapB (force rain/minimap),
  //   scale (uniform, instances only)
  function place(name, x, z, ry, opts) {
    var e = ENV_BY_NAME[name]; if (!e) return null;
    opts = opts || {}; ry = ry || 0; var y = opts.y || 0, dims = e.dims;
    if (MERGE[name] && !opts.instance) {
      bake(name, mtx(x, y, z, ry)); envStats.merged++;
    } else {
      var g = getEnvProp(name); if (!g) return null;
      if (opts.scale) g.scale.set(opts.scale, opts.scale, opts.scale);
      g.position.set(x, y, z); g.rotation.y = ry; scene.add(g);
      var rec = { name: name, g: g, x: x, z: z, ry: ry, dims: dims, anim: e.anim || '', cat: e.cat };
      g.userData.envRec = rec; envProps.push(rec);
      if (e.solid && !opts.noCol) solidMeshes.push(g);   // bullets stop on solid instances
    }
    if (e.solid && !opts.noCol) { addColliderOBB(x, z, dims[0] / 2, dims[2] / 2, ry); envStats.colliders++; }
    if (opts.mapB || BIGMAP[name]) {
      var c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
      mapBuildings.push({ x: x, z: z, w: dims[0] * c + dims[2] * s, d: dims[0] * s + dims[2] * c, c: 0x8a8f94, pad: 0, h: dims[1] });
    }
    if (e.interact) {
      var it = { kind: e.interact, name: name, x: x, z: z, ry: ry, fx: -Math.cos(ry), fz: Math.sin(ry), dims: dims, spawns: !!e.spawns, cd: -99, g: opts.instance || !MERGE[name] ? g : null };
      envPropInteractables.push(it);
    }
    envStats.placed++; envStats.byCat[e.cat] = (envStats.byCat[e.cat] || 0) + 1;
    return name;
  }
  // tileable run A->B repeating a ~segLen unit; ry keeps the authored front facing +normal
  function run(ax, az, bx, bz, name, faceOut) {
    var e = ENV_BY_NAME[name]; if (!e) return; var seg = e.dims[0];
    var dx = bx - ax, dz = bz - az, L = Math.sqrt(dx * dx + dz * dz); if (L < seg * 0.5) return;
    var n = Math.max(1, Math.round(L / seg)), ux = dx / L, uz = dz / L;
    // authored front -x should face perpendicular to the run (outward = faceOut side)
    var nx = -uz * faceOut, nz = ux * faceOut, ry = faceDir(nx, nz);
    for (var i = 0; i < n; i++) { var t = (i + 0.5) / n * L; place(name, ax + ux * t, az + uz * t, ry, { y: 0 }); }
  }
  function ring(cx, cz, rr, name, a0, a1, count) {
    for (var i = 0; i < count; i++) {
      var a = a0 + (a1 - a0) * (i + 0.5) / count;
      var x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      place(name, x, z, faceDir(Math.cos(a), Math.sin(a)));   // front faces outward from centre
    }
  }

  // ---------- 1. CAFE FRONTAGES (Dunkin / Starbucks / Sakura) ----------
  var cafes = [byId.dunkin, byId.starbucks, byId.sushi];
  for (var ci = 0; ci < cafes.length; ci++) {
    var v = cafes[ci]; if (!v) continue; var f = vFront(v);
    var fpx = v.x + f.fx * (v.d / 2 + 2.4), fpz = v.z + f.fz * (v.d / 2 + 2.4);
    var out = faceDir(f.fx, f.fz), lat = Math.min(v.w / 2 - 1, 3.4);
    for (var s = -1; s <= 1; s += 2) {
      var cx = fpx + f.rx * lat * s, cz = fpz + f.rz * lat * s;
      place('cafe_set', cx, cz, out);
      place('patio_umbrella', cx, cz, out, { instance: true });   // canopy sways (STEP 2)
    }
    place('aframe_sign', v.x + f.fx * (v.d / 2 + 0.9), v.z + f.fz * (v.d / 2 + 0.9), out);
    place('bench_back', fpx + f.rx * (lat + 2.2), fpz + f.rz * (lat + 2.2), out);
    place('concrete_planter', fpx - f.rx * (lat + 2.2), fpz - f.rz * (lat + 2.2), 0);
  }

  // ---------- 2. STOREFRONT WALKS: bollards + planters + handrails ----------
  var COMM = ['racetrac', 'publix', 'dollar_tree', 'bank'];
  function isComm(t) { return COMM.indexOf(t) >= 0; }
  for (var vp = 0; vp < VENUES.length; vp++) {
    var vv = VENUES[vp]; if (!isComm(vv.type)) continue; var ff = vFront(vv);
    var wx = vv.x + ff.fx * (vv.d / 2 + 1.2), wz = vv.z + ff.fz * (vv.d / 2 + 1.2);
    var outw = faceDir(ff.fx, ff.fz), ew = Math.min(vv.w / 2 - 1.5, 8);
    // bollard row across the frontage, leaving a door gap in the centre
    for (var bo = -2; bo <= 2; bo++) { if (bo === 0) continue; var bfx = wx + ff.rx * (ew * bo / 2.4), bfz = wz + ff.rz * (ew * bo / 2.4); place('bollard', bfx, bfz, 0); }
    // flanking planters
    place('concrete_planter', wx + ff.rx * ew, wz + ff.rz * ew, 0);
    place('concrete_planter', wx - ff.rx * ew, wz - ff.rz * ew, 0);
    if (vv.type === 'bank') place('tiered_planter', vv.x + ff.fx * (vv.d / 2 + 2.6), vv.z + ff.fz * (vv.d / 2 + 2.6), 0);
    // an ADA handrail run along one side of the frontage
    if (vv.type === 'publix' || vv.type === 'racetrac') {
      var h0x = wx + ff.rx * (ew + 0.8), h0z = wz + ff.rz * (ew + 0.8);
      var h1x = wx + ff.rx * (ew + 5.2), h1z = wz + ff.rz * (ew + 5.2);
      run(h0x, h0z, h1x, h1z, 'handrail', 1);
    }
  }

  // ---------- 3. VENDING / ARCADE cluster near shopfronts (exterior) ----------
  function vendCluster(v, list) {
    if (!v) return; var f = vFront(v);
    var bx = v.x + f.fx * (v.d / 2 + 1.3), bz = v.z + f.fz * (v.d / 2 + 1.3), out = faceDir(f.fx, f.fz);
    var lat = Math.min(v.w / 2 - 2, 6);
    for (var i = 0; i < list.length; i++) {
      var t = (i / Math.max(1, list.length - 1) - 0.5) * 2 * lat;
      place(list[i], bx + f.rx * t, bz + f.rz * t, out, { instance: true });
    }
  }
  vendCluster(byId.racetrac, ['soda_machine', 'gumball_machine', 'claw_machine']);
  vendCluster(byId.dollar_tree, ['soda_machine', 'gumball_machine']);
  vendCluster(byId.publix, ['gumball_machine', 'soda_machine']);
  // arcade + jukebox on a strip storefront (pizza unit) + boombox on a bench
  if (byType.strip && byType.strip[0]) { var sp0 = byType.strip[0], sf0 = vFront(sp0), o0 = faceDir(sf0.fx, sf0.fz); var ax0 = sp0.x + sf0.fx * (sp0.d / 2 + 1.2), az0 = sp0.z + sf0.fz * (sp0.d / 2 + 1.2); place('arcade_cabinet', ax0 + sf0.rx * 4, az0 + sf0.rz * 4, o0, { instance: true }); place('jukebox', ax0 - sf0.rx * 4, az0 - sf0.rz * 4, o0, { instance: true }); place('pizza_sign', ax0 + sf0.rx * 10, az0 + sf0.rz * 10, o0, { instance: true }); place('barber_pole', ax0 - sf0.rx * 10, az0 - sf0.rz * 10, o0, { instance: true }); }

  // ---------- 4. SIGNS: monuments at exits, flags at civic corners ----------
  for (var xi = 0; xi < EXITS.length && xi < 3; xi++) {
    var ex = EXITS[xi], mx = ex.x + ex.dx * 30, mz = ex.z + ex.dz * 30;
    place('monument_sign', mx, mz, faceDir(-ex.dx, -ex.dz));   // face inbound traffic
  }
  var flags = [byId.regions, byId.boa, byId.farnell];
  for (var fl = 0; fl < flags.length; fl++) { var fv = flags[fl]; if (!fv) continue; var f2 = vFront(fv); place('flagpole', fv.x + f2.fx * (fv.d / 2 + 4), fv.z + f2.fz * (fv.d / 2 + 4), 0, { instance: true }); }

  // ---------- 5. PLAYGROUND SETS (near townhouses + school) ----------
  function playground(cx, cz, rot) {
    place('playground_climber', cx, cz, rot);
    place('slide', cx + 3.2 * Math.cos(rot), cz + 3.2 * Math.sin(rot), rot + Math.PI);
    place('swing_set', cx - 3.6 * Math.cos(rot), cz - 3.6 * Math.sin(rot), rot + Math.PI / 2, { instance: true });
    place('basketball_hoop', cx + 5.5 * Math.sin(rot), cz - 5.5 * Math.cos(rot), rot);
    place('drinking_fountain', cx + 5.5 * Math.sin(rot) + 1.5, cz - 5.5 * Math.cos(rot), rot, { instance: true });
    place('bench_back', cx - 5.5 * Math.sin(rot), cz + 5.5 * Math.cos(rot), rot + Math.PI);
  }
  playground(-104, -52, 0);                 // open lawn between school and townhouses
  if (byId.farnell) { var fa = byId.farnell, faf = vFront(fa); playground(fa.x + 22, fa.z + faf.fz * (fa.d / 2 + 8), Math.PI / 2); }
  // skate ramp in an open cul-de-sac
  place('skate_ramp', -46, -150, Math.PI / 2, { instance: true });

  // ---------- 6. LAKESIDE PICNIC + QUIRKY WATERFRONT ----------
  // All anchored on the BANK — outside inLake()'s ellipse (semi-axes 1.25r x
  // 0.85r, threshold 1.25). bankPt(theta,out) returns a point just past that
  // boundary at angle theta; props face the water (front toward LK centre).
  var LK = (typeof LAKE !== 'undefined') ? LAKE : { x: -280, z: 55, r: 62 };
  function bankPt(theta, out) { var k = 1.118 * (out || 1.06), A = LK.r * 1.25 * k, B = LK.r * 0.85 * k; return [LK.x + A * Math.cos(theta), LK.z + B * Math.sin(theta)]; }
  function faceLake(x, z) { return faceDir(LK.x - x, LK.z - z); }
  function placeBank(name, theta, out, opts) { var p = bankPt(theta, out); if (typeof inLake === 'function' && inLake(p[0], p[1])) return; place(name, p[0], p[1], faceLake(p[0], p[1]), opts); }
  // east-bank picnic run (theta 0 = due east, negative = toward the road/N)
  placeBank('bench_back', -0.15, 1.06);
  placeBank('patio_umbrella', -0.15, 1.14, { instance: true });
  placeBank('bbq_grill', -0.34, 1.07, { instance: true });
  placeBank('fire_pit', -0.5, 1.08, { instance: true });
  placeBank('bird_bath', 0.05, 1.1);
  placeBank('bench_back', 0.22, 1.06);
  placeBank('park_lamp', -0.62, 1.12); placeBank('park_lamp', 0.34, 1.12);
  placeBank('fountain', -0.02, 1.24, { instance: true });   // set back from the water
  placeBank('windmill', 0.55, 1.16, { instance: true });
  placeBank('flamingo', 0.12, 1.04); placeBank('flamingo', 0.16, 1.045);
  // decorative pond-fence arc on the road-facing (E/NE) bank
  for (var pf = 0; pf < 8; pf++) { var a = bankPt(-0.7 + 0.9 * (pf + 0.05) / 8, 1.0), b = bankPt(-0.7 + 0.9 * (pf + 0.95) / 8, 1.0); place('pond_fence', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, faceLake((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)); }

  // ---------- 7. TOWNHOUSE YARDS: mailboxes, beds, quirky décor ----------
  var ths = byType.townhouse || [];
  for (var th = 0; th < ths.length; th++) {
    var tv = ths[th], tf = vFront(tv);
    var fx = tv.x + tf.fx * (tv.d / 2 + 1.3), fz = tv.z + tf.fz * (tv.d / 2 + 1.3), tout = faceDir(tf.fx, tf.fz);
    place('mailbox_cluster', fx + tf.rx * (tv.w / 2 - 3), fz + tf.rz * (tv.w / 2 - 3), tout);
    if (th % 2 === 0) place('raised_bed', fx - tf.rx * (tv.w / 2 - 4), fz - tf.rz * (tv.w / 2 - 4), tout);
    if (th % 3 === 0) place('garden_gnome', fx + tf.rx * rnd(-3, 3), fz + tf.rz * rnd(-3, 3), rnd(0, 6.28));
    if (th % 3 === 1) place('flamingo', fx + tf.rx * rnd(-3, 3), fz + tf.rz * rnd(-3, 3), rnd(0, 6.28));
    if (th % 4 === 0) place('bird_bath', fx + tf.rx * rnd(-2, 2), fz + tf.rz * rnd(-2, 2), 0);
    if (th === 0) { place('lemonade_stand', fx + tf.rx * 5, fz + tf.rz * 5, tout, { instance: true }); place('fire_pit', tv.x - tf.fx * 4, tv.z - tf.fz * 4, 0, { instance: true }); }
    if (th === 2) place('bbq_grill', tv.x - tf.fx * 4, tv.z - tf.fz * 4, tout, { instance: true });
  }
  // red-house ornamental yard
  if (byId.red_house) { var rh = byId.red_house, rf = vFront(rh); place('windmill', rh.x + rf.fx * (rh.d / 2 + 4), rh.z + rf.fz * (rh.d / 2 + 4), 0, { instance: true }); place('garden_gnome', rh.x + rf.fx * (rh.d / 2 + 3) + rf.rx * 3, rh.z + rf.fz * (rh.d / 2 + 3) + rf.rz * 3, rnd(0, 6.28)); place('bird_bath', rh.x + rf.fx * (rh.d / 2 + 3) - rf.rx * 3, rh.z + rf.fz * (rh.d / 2 + 3) - rf.rz * 3, 0); }

  // ---------- 8. FOOD TRUCKS / CARTS / TUBE-MAN in lots + forecourts ----------
  var lots = surfById('parking', 900);
  if (lots[0]) place('food_truck', lots[0].x, lots[0].z, (lots[0].rot || 0) * deg + Math.PI / 2, { instance: true });
  if (lots[1]) place('icecream_truck', lots[1].x, lots[1].z, (lots[1].rot || 0) * deg + Math.PI / 2, { instance: true });
  if (byId.racetrac) { var rt = byId.racetrac, rtf = vFront(rt); place('hotdog_cart', rt.x + rtf.fx * (rt.d / 2 + 5), rt.z + rtf.fz * (rt.d / 2 + 5), faceDir(rtf.fx, rtf.fz), { instance: true }); place('tube_man', rt.x + rtf.fx * (rt.d / 2 + 9), rt.z + rtf.fz * (rt.d / 2 + 9), 0, { instance: true }); }
  // tube-man promo at a strip mall too
  if (byType.strip && byType.strip[1]) { var sp1 = byType.strip[1], sf1 = vFront(sp1); place('tube_man', sp1.x + sf1.fx * (sp1.d / 2 + 6), sp1.z + sf1.fz * (sp1.d / 2 + 6), 0, { instance: true }); }

  // ---------- 9. ROADWORK / UTILITY (porta-potty + screen walls) ----------
  if (byId.storage) { var st = byId.storage, stf = vFront(st); place('porta_potty', st.x - stf.fx * (st.d / 2 + 3), st.z - stf.fz * (st.d / 2 + 3), faceDir(stf.fx, stf.fz), { instance: true }); place('trash_recycle', st.x - stf.fx * (st.d / 2 + 3) + stf.rx * 3, st.z - stf.fz * (st.d / 2 + 3) + stf.rz * 3, 0, { instance: true }); }
  // screen walls hiding the mechanical yard behind a bank/strip
  if (byId.regions) { var rg = byId.regions, rgf = vFront(rg); var scx = rg.x - rgf.fx * (rg.d / 2 + 2), scz = rg.z - rgf.fz * (rg.d / 2 + 2); run(scx - rgf.rx * 2.5, scz - rgf.rz * 2.5, scx + rgf.rx * 2.5, scz + rgf.rz * 2.5, 'screen_wall', -1); }

  // ---------- 10. PARK LAMPS + retaining-wall accents along a lot edge ----------
  if (lots[0]) { var lo = lots[0], loc = Math.cos((lo.rot || 0) * deg), los = Math.sin((lo.rot || 0) * deg); var ex0 = lo.x - loc * (lo.w / 2 + 2), ez0 = lo.z + los * (lo.w / 2 + 2); place('park_lamp', ex0, ez0, 0); place('park_lamp', lo.x + loc * (lo.w / 2 + 2), lo.z - los * (lo.w / 2 + 2), 0); run(lo.x - lo.w / 2 * loc, lo.z + lo.w / 2 * los, lo.x + lo.w / 2 * loc, lo.z - lo.w / 2 * los, 'retaining_wall', 1); }

  // ---- flush merged batches (one draw call per asset) ----
  for (var nm in EM) {
    var b = EM[nm]; if (!b.pos.length) continue;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(b.norm), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(b.uv), 2));
    scene.add(new THREE.Mesh(g, lamb({ map: envTex(ENV_BY_NAME[nm]) })));
    envStats.batches++;
  }
})();

// ---- STEP 2 (animations) + STEP 3 (interactions) drivers: filled in below.
function updateEnvProps(dt) { /* STEP 2 */ }
function envPropPrompt() { return ''; }     /* STEP 3 */
function envPropInteract() { return false; } /* STEP 3 */

// ---------------- police / wanted system ----------------
var cops = [];
var copNid = 1;   // stable per-cop id: the cops array is spliced on despawn, so
                  // clients must address dmgCop by id, not array index
var copSpawnT = 0, lastCrimeT = -99;
var badgeM = new THREE.MeshBasicMaterial({ color: 0xffd94a });
var holsterM = lamb({ color: 0x16181c });

function updateStarsHUD() {
  var el = document.getElementById('stars'); if (!el) return;
  var h = '';
  for (var i = 0; i < 5; i++) h += '<span class="' + (i < state.wanted ? 'on' : '') + '">&#9733;</span>';
  el.innerHTML = h;
}
function setWanted(v) {
  v = Math.max(0, Math.min(5, v));
  if (v > state.wanted) sfx('alarm');
  state.wanted = v; lastCrimeT = T;
  updateStarsHUD();
}
function addStar(n) { setWanted(state.wanted + (n || 1)); }
// star thresholds double per level: 5 civs for the 1st star, 10 more for the
// 2nd, 20 more for the 3rd... cops: any damage = 1st star, 3 kills = 2nd,
// 6 more = 3rd, doubling likewise. Counters reset when the heat fully dies.
var CIV_STAR_KILLS = [5, 15, 35, 75, 155];
var COP_STAR_KILLS = [3, 9, 21, 45];   // stars 2-5 (star 1 comes from just hurting one)
function creditCivKill() {
  state.civKills++;
  lastCrimeT = T;
  if (CIV_STAR_KILLS.indexOf(state.civKills) >= 0) { addStar(1); popup2('WANTED LEVEL UP'); }
}
function creditCopKill() {
  state.copKills++;
  lastCrimeT = T;
  if (state.wanted < 1) setWanted(1);   // you can't kill one without damaging one
  if (COP_STAR_KILLS.indexOf(state.copKills) >= 0) { addStar(1); popup2('WANTED LEVEL UP'); }
}

function buildCop() {
  if (MESHY_COPS.length) {
    var cfg = randomCharConfig(); cfg.preset = 0; cfg.build = 1 + ((Math.random() * 3) | 0);
    var mi = MESHY_COPS[(Math.random() * MESHY_COPS.length) | 0];   // repeats are fine for uniforms
    var cg = buildMeshySkinned(cfg, mi);
    cg.userData.vname = MESHY_LIST[mi].n;
    return cg;
  }
  var g = buildPerson('#1e3a6e', '#16233f', CSKIN[(Math.random() * CSKIN.length) | 0],
    { cap: true, shades: true, hairColor: 0x111111 });
  g.add(box(0.05, 0.06, 0.02, badgeM, -0.09, 1.28, 0.125));   // badge
  g.add(box(0.06, 0.1, 0.16, holsterM, 0.24, 0.82, 0.06));    // holster
  return g;
}
// where the police response converges: the highest-wanted ALIVE player, local
// or remote. Matters on a world-bot host (its own "player" is parked off-map)
// and fixes cops mobbing a clean host while a remote player rampages.
function hottestPlayerPos() {
  var hx = player.x, hz = player.z, hw = (state.dead || inside || WC_BOT) ? -1 : (state.wanted || 0);
  // LOAD-ORDER: boot-time spawnCop calls run before `var net` is assigned —
  // guard or the whole IIFE dies at load (broke boot once; caught by test)
  if (net && net.remotes) for (var id in net.remotes) { var r = net.remotes[id]; if (r && !r.dead && (r.w || 0) > hw) { hw = r.w; hx = r.x; hz = r.z; } }
  return { x: hx, z: hz };
}
function spawnCop(nearPlayer) {
  var mesh = buildCop(), x, z, doorYaw = null;
  var hp0 = hottestPlayerPos();
  if (nearPlayer) {
    var a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 30;
    x = Math.max(-HALF + 6, Math.min(HALF - 6, hp0.x + Math.cos(a) * r));
    z = Math.max(-HALF + 6, Math.min(HALF - 6, hp0.z + Math.sin(a) * r));
  } else { var t = randTarget(); x = t[0]; z = t[1]; }
  // officers step OUT of a nearby building entrance instead of materializing
  // in the open — snap the picked point to the nearest registered door (but
  // never one right on top of the player: responding cops shouldn't pop out
  // of the store you're standing in front of)
  if (npcDoors.length) {
    var bd = -1, bdd = 55 * 55;
    for (var di = 0; di < npcDoors.length; di++) {
      var dq = npcDoors[di];
      var qdx = dq.sx - x, qdz = dq.sz - z, qd2 = qdx * qdx + qdz * qdz;
      var pdx = dq.sx - hp0.x, pdz = dq.sz - hp0.z;
      if (qd2 < bdd && pdx * pdx + pdz * pdz > 30 * 30) { bdd = qd2; bd = di; }
    }
    if (bd >= 0) { x = npcDoors[bd].sx; z = npcDoors[bd].sz; doorYaw = npcDoors[bd].yaw; }
  }
  var p = pushOut(x, z, 0.6); x = p.x; z = p.z;
  var t2 = randTarget();
  var c = { mesh: mesh, nid: copNid++, x: x, z: z, hp: 100, state: 'patrol', tx: t2[0], tz: t2[1], phase: Math.random() * 9, fireT: 0.5 + Math.random(), downT: 0, hurtFlash: 0, vname: mesh.userData.vname || null, fem: MESHY_FEM.indexOf(mesh.userData.vname || '') >= 0 };
  // no gun at spawn: patrol cops keep it holstered, updateCops draws it on
  // 'engage'. (This also dodges a load-order trap: the boot-time spawnCop
  // calls ran before the var gun materials existed -> all-white pistols.)
  mesh.position.set(x, 0, z); if (doorYaw !== null) mesh.rotation.y = doorYaw;
  mesh.userData.cop = c;
  scene.add(mesh); cops.push(c); return c;
}
function spawnInteriorCops(n) {
  for (var i = 0; i < n; i++) {
    var mesh = buildCop();
    var c = { mesh: mesh, x: doorIn.x - 2 + i * 4, z: doorIn.z - 1, hp: 100, state: 'engage', tx: 0, tz: 0, phase: Math.random() * 9, fireT: 0.7 + i * 0.5, downT: 0, hurtFlash: 0, interior: true, baseY: INT.y, vname: mesh.userData.vname || null, fem: MESHY_FEM.indexOf(mesh.userData.vname || '') >= 0 };
    attachHeldGun(mesh, state.wanted >= 4 ? 'smg' : 'pistol');
    mesh.position.set(c.x, INT.y, c.z);
    mesh.userData.cop = c;
    scene.add(mesh); cops.push(c);
  }
}
// cops (host-simmed) must scale to the HIGHEST-heat player, not just the host —
// otherwise a high-wanted remote paired with a clean host gets under-policed
function maxWanted() {
  var w = (state.dead || inside) ? 0 : (state.wanted || 0);
  for (var id in net.remotes) { var r = net.remotes[id]; if (r && !r.dead && (r.w || 0) > w) w = r.w; }
  return w;
}
function desiredCops() { var w = maxWanted(); return w === 0 ? 2 : 2 + w * 2; }
function copWeapon() {
  return maxWanted() >= 4
    ? { range: 46, dmg: 4, rate: 0.14, acc: 0.32, sfx: 'copsmg' }   // full-auto SMGs
    : { range: 21, dmg: 9, rate: 1.05, acc: 0.38, sfx: 'copshot' }; // sidearms, short range
}
var copRay = new THREE.Raycaster();
function copHasLOS(c, tgt) {
  var oy = (c.baseY || 0) + 1.4;
  var dir = new THREE.Vector3(tgt.x - c.x, (tgt.y || EYE) - oy, tgt.z - c.z);
  var dist = dir.length(); dir.normalize();
  copRay.set(new THREE.Vector3(c.x, oy, c.z), dir); copRay.far = Math.max(0.1, dist - 0.6);
  return copRay.intersectObjects(solidMeshes, true).length === 0;
}
// pick the closest wanted player (local or remote) this cop can go after
function copPickTarget(c) {
  var best = null, bd = 1e9;
  function cand(x, z, y, w, id) {
    if (w < 1) return;
    var dx = x - c.x, dz = z - c.z, d2 = dx * dx + dz * dz;
    if (!(w >= 2 || d2 < 256 || c.state === 'engage')) return;
    if (d2 < bd) { bd = d2; best = { x: x, z: z, y: y, id: id, d: Math.sqrt(d2) }; }
  }
  if (!state.dead && !inside) cand(player.x, player.z, player.y, state.wanted, null);
  // remotes below y -30 are in the gas-station interior (its room sits under
  // the map) — street cops can't see them and must not shoot the pavement
  for (var id in net.remotes) { var r = net.remotes[id]; if (!r.dead && !(r.y < -30)) cand(r.x, r.z, r.y || EYE, r.w || 0, id); }
  return best;
}
// point the gun arm at the target — runs AFTER animPerson each frame (same
// post-anim bone tweak trick as the clerk hands-up). One-joint measured IK:
// rotate the shoulder by the world-space delta between the current
// shoulder->fist line and the shoulder->target line (robust across models and
// idle/walk clip phases), then snap the gun's world rotation so the barrel
// (-Z) looks dead at the target — copMuzzle lands exactly on the shot line.
var copAimQ = null, copAimDQ = null, copAimPQ = null, copAimV1 = null, copAimV2 = null, copAimV3 = null, copAimM = null;
function copAimArm(c, m, tgt) {
  var L = m.userData.limbs, hand = m.userData.handR;
  if (!L || !L.armR || !hand) return;
  if (!copAimQ) {
    copAimQ = new THREE.Quaternion(); copAimDQ = new THREE.Quaternion(); copAimPQ = new THREE.Quaternion();
    copAimV1 = new THREE.Vector3(); copAimV2 = new THREE.Vector3(); copAimV3 = new THREE.Vector3(); copAimM = new THREE.Matrix4();
  }
  m.updateMatrixWorld(true);   // animPerson just re-posed the bones
  L.armR.getWorldPosition(copAimV1);                       // shoulder
  hand.getWorldPosition(copAimV2);                         // fist
  copAimV3.set(tgt.x, (tgt.y || EYE) - 0.15, tgt.z);       // gun rides a touch under the eye line
  copAimV2.sub(copAimV1).normalize();                      // current arm dir
  copAimV3.sub(copAimV1).normalize();                      // desired arm dir
  copAimDQ.setFromUnitVectors(copAimV2, copAimV3);         // world-space delta
  L.armR.parent.getWorldQuaternion(copAimPQ);
  copAimQ.copy(copAimPQ).invert().multiply(copAimDQ).multiply(copAimPQ);   // into shoulder-local space
  L.armR.quaternion.premultiply(copAimQ);
  var gun = m.userData.heldGun;
  if (gun) {
    L.armR.updateMatrixWorld(true);                        // re-derive hand/gun matrices after the swing
    gun.getWorldPosition(copAimV1);
    copAimV3.set(tgt.x, (tgt.y || EYE) - 0.15, tgt.z);
    copAimM.lookAt(copAimV1, copAimV3, Y_UP);              // camera-style basis: local -Z on the target
    copAimDQ.setFromRotationMatrix(copAimM);
    hand.getWorldQuaternion(copAimPQ);
    gun.quaternion.copy(copAimPQ.invert()).multiply(copAimDQ);
    gun.updateMatrixWorld(true);
  }
}
// world-space muzzle tip of the cop's held gun (null while holstered)
// front-of-barrel z for each held (dropMesh) gun = -halfDepth of its main body
// box, so the world/cop muzzle flash sits ON the tip (not floating past it)
var HELD_MUZZLE_Z = { pistol: -0.225, smg: -0.30, rifle: -0.475, auto: -0.425, rocket: -0.5, raygun: -0.30 };
function copMuzzle(c) {
  var gun = c.mesh.userData.heldGun;
  if (!gun) return null;
  c.mesh.updateMatrixWorld(true);   // copAimArm may have just re-rotated the gun
  var mz = HELD_MUZZLE_Z[c.mesh.userData.heldKind];
  return new THREE.Vector3(0, 0, mz === undefined ? -0.35 : mz).applyMatrix4(gun.matrixWorld);
}
function copShoot(c, wpn, dt, tgt) {
  c.fireT -= dt;
  if (c.fireT > 0) return;
  c.fireT = wpn.rate;
  if (!c.interior && !copHasLOS(c, tgt)) return;   // interior is one small room — they can always see you
  if (!tgt.id) {   // barks only for the local player
    var copAt = { x: c.x, z: c.z, y: (c.baseY || 0) + 1.6, yell: true, net: c.interior ? 0 : 1, ref: c };
    if (state.wanted >= 4) playVoiceAny(c.fem ? ['cop_fire_f_1', 'cop_fire_f_2'] : ['cop_fire_1', 'cop_fire_2'], 0.6, 'copBark', 12, copAt);
    else if (!playNpcVoice(c.vname, 'quirk', 0.6, 12, copAt)) playVoiceAny(c.fem ? ['cop_engage_f_1', 'cop_engage_f_2'] : ['cop_engage_1', 'cop_engage_2'], 0.6, 'copBark', 12, copAt);
  }
  sfx(wpn.sfx, { x: c.x, z: c.z, y: (c.baseY || 0) + 1.4, range: 150 });
  var dx = tgt.x - c.x, dz = tgt.z - c.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
  // muzzle flash at the gun's barrel tip; chest-height fallback if holstered
  var mz3 = copMuzzle(c) || new THREE.Vector3(c.x + dx / d * 0.5, (c.baseY || 0) + 1.45, c.z + dz / d * 0.5);
  puff(mz3, 0xffe08a);
  var hitChance = wpn.acc * Math.max(0.1, 1 - d / wpn.range);
  var hitV = null;   // where a round landed on a person (for the client blood puff)
  if (Math.random() < hitChance) {
    if (tgt.id) { hitV = new THREE.Vector3(tgt.x, (tgt.y || 0) + 1.1, tgt.z); netSendHit(tgt.id, wpn.dmg); }   // remote player: their client applies (car redirect included)
    else if (!state.dead) {
      if (driving) {
        // rounds slam into your car instead
        var cp2 = driving.car.group.position;
        puff(new THREE.Vector3(cp2.x + (Math.random() - 0.5) * 2, 1 + Math.random(), cp2.z + (Math.random() - 0.5) * 2), 0xd8c860);
        driving.carHP = (driving.carHP === undefined ? 100 : driving.carHP) - wpn.dmg * 2;
        if (driving.carHP <= 0) igniteCar(driving);
      } else { hitV = new THREE.Vector3(player.x, player.y - 0.2, player.z); hurtPlayer(wpn.dmg); }
    }
  }
  // clients only MIRROR street cops — they never run copShoot — so broadcast
  // the shot and let each peer render the muzzle flash / gunshot / blood
  if (net.mode === 'host') recordCopFx(mz3, wpn, hitV);
}
// buffer a cop-fire event for the next world snapshot; entry =
// [mx,my,mz ×10, flags(bit0=smg, bit1=hit)] (+ [hx,hy,hz ×10] when a hit)
function recordCopFx(mz, wpn, hitV) {
  var buf = net.copFxBuf;
  if (buf.length > 48) return;   // burst-fire flood guard
  var e = [Math.round(mz.x * 10), Math.round(mz.y * 10), Math.round(mz.z * 10), (wpn.sfx === 'copsmg' ? 1 : 0) | (hitV ? 2 : 0)];
  if (hitV) { e.push(Math.round(hitV.x * 10), Math.round(hitV.y * 10), Math.round(hitV.z * 10)); }
  buf.push(e);
}
function damageCop(c, dmg, kx, kz, silent) {
  if (c.state === 'down') return;
  c.hp -= dmg; c.hurtFlash = 0.12;
  c.x += (kx || 0) * 0.4; c.z += (kz || 0) * 0.4;
  lastCrimeT = T;
  if (c.hp <= 0) {
    c.state = 'down'; c.downT = 10;
    if (c.mesh.userData.shadow) c.mesh.userData.shadow.visible = false;
    stopNpcVoice(c.vname);
    spawnCash(c.x, c.z, 10 + ((Math.random() * 30) | 0), c.baseY || 0);
    sfx('ko', { x: c.x, z: c.z, y: (c.baseY || 0) + 1.2, range: 50 });
    if (!silent) { popup('COP DOWN!'); creditCopKill(); }
  } else {
    c.state = 'engage';
    if (!silent && state.wanted < 1) setWanted(1);
    sfx('hit', { x: c.x, z: c.z, y: (c.baseY || 0) + 1.2, range: 50 });
  }
}
function updateCops(dt) {
  var wpn = copWeapon();
  // officers keep a professional distance from each other (no conjoined twins)
  for (var s1 = 0; s1 < cops.length; s1++) {
    var ca = cops[s1];
    if (ca.state === 'down') continue;
    for (var s2 = s1 + 1; s2 < cops.length; s2++) {
      var cb = cops[s2];
      if (cb.state === 'down' || !!ca.interior !== !!cb.interior) continue;
      var sdx = cb.x - ca.x, sdz = cb.z - ca.z, sd2 = sdx * sdx + sdz * sdz;
      if (sd2 < 0.0001) { cb.x += 0.3; cb.z += 0.1; continue; }
      if (sd2 < 1.69) {
        var sd = Math.sqrt(sd2), push = (1.3 - sd) * 0.5 / sd;
        ca.x -= sdx * push; ca.z -= sdz * push;
        cb.x += sdx * push; cb.z += sdz * push;
      }
    }
  }
  if (state.wanted === 1 && !state.dead && !inside) {
    for (var wI = 0; wI < cops.length; wI++) {
      var wc2 = cops[wI];
      if (wc2.state === 'down' || wc2.interior) continue;
      var wdx = wc2.x - player.x, wdz = wc2.z - player.z;
      if (wdx * wdx + wdz * wdz < 150) { playVoice(wc2.fem ? 'cop_warn_f' : 'cop_warn', 0.55, 30, { x: wc2.x, z: wc2.z, yell: true, net: 1, ref: wc2 }); break; }
    }
  }
  if (!isClient()) {
    copSpawnT -= dt;
    var alive = 0;
    for (var i0 = 0; i0 < cops.length; i0++) if (cops[i0].state !== 'down' && !cops[i0].interior) alive++;
    if (alive < desiredCops() && copSpawnT <= 0) { spawnCop(state.wanted >= 2); copSpawnT = 2.6; }
  }
  var tierGun = state.wanted >= 4 ? 'smg' : 'pistol';   // 4-star tier swaps sidearms for SMGs
  for (var i = 0; i < cops.length; i++) {
    var c = cops[i], m = c.mesh;
    if (isClient() && !c.interior) { scene.remove(m); cops.splice(i, 1); i--; continue; }   // street cops come from the host
    var baseY = c.baseY || 0;
    if (c.interior && !inside && c.state !== 'down') { scene.remove(m); cops.splice(i, 1); i--; continue; }
    if (c.hurtFlash > 0) c.hurtFlash -= dt;
    if (c.state === 'down') {
      c.downT -= dt;
      m.rotation.x = Math.max(-1.45, m.rotation.x - dt * 7);
      if (c.downT <= 0) { scene.remove(m); cops.splice(i, 1); i--; continue; }
      m.position.set(c.x, baseY + (c.hurtFlash > 0 ? 0.06 : 0), c.z);
      continue;
    }
    if (state.wanted === 0 && c.state === 'engage' && !c.interior) c.state = 'patrol';
    var tgt;
    if (c.interior) tgt = (inside && !state.dead) ? { x: player.x, z: player.z, y: player.y, id: null, d: Math.sqrt((player.x - c.x) * (player.x - c.x) + (player.z - c.z) * (player.z - c.z)) } : null;
    else tgt = copPickTarget(c);
    if (!c.interior) { if (tgt) c.state = 'engage'; else if (c.state === 'engage') c.state = 'patrol'; }
    // holstered until they mean it: gun out only while engaging (interior cops always)
    var wantGun = (c.state === 'engage' || c.interior) ? tierGun : null;
    if (m.userData.handR && (m.userData.heldKind || null) !== wantGun) attachHeldGun(m, wantGun);
    var vx = 0, vz = 0, spd = 0, moving = false, aimTgt = null;
    if (tgt) {
      var dx = tgt.x - c.x, dz = tgt.z - c.z, d = tgt.d;
      if (d > wpn.range * 0.65 || (c.interior && d > 5)) { vx = dx / d; vz = dz / d; spd = 4.4; moving = true; }
      m.rotation.y = Math.atan2(dx, dz);
      if (d < wpn.range) aimTgt = tgt;   // aim + fire below, after animPerson poses the bones
    } else {
      if (c.interior) { animPerson(m, 0, dt); m.position.set(c.x, baseY, c.z); continue; }
      var tdx = c.tx - c.x, tdz = c.tz - c.z, td = Math.sqrt(tdx * tdx + tdz * tdz);
      if (td < 1) { var t = randTarget(); c.tx = t[0]; c.tz = t[1]; }
      else { vx = tdx / td; vz = tdz / td; spd = 1.6; moving = true; m.rotation.y = Math.atan2(vx, vz); }
    }
    if (moving) {
      c.x += vx * spd * dt; c.z += vz * spd * dt;
      c.x = Math.max(-HALF + 3, Math.min(HALF - 3, c.x));
      c.z = Math.max(-HALF + 3, Math.min(HALF - 3, c.z));
      var pos = pushOut(c.x, c.z, 0.45, c.interior ? intColliders : colliders); c.x = pos.x; c.z = pos.z;
      c.phase += spd * dt * 3.4;
    }
    m.position.set(c.x, baseY + (c.hurtFlash > 0 ? 0.06 : 0), c.z);
    animPerson(m, moving ? spd : 0, dt, c.phase);
    if (aimTgt) { copAimArm(c, m, aimTgt); copShoot(c, wpn, dt, aimTgt); }
  }
  // lose the heat: 18s with no crimes and no cops within 50 units
  if (state.wanted > 0 && T - lastCrimeT > 18) {
    var nearCop = false;
    for (i = 0; i < cops.length; i++) {
      var cc = cops[i];
      if (cc.state === 'down') continue;
      var qdx = cc.x - player.x, qdz = cc.z - player.z;
      if (qdx * qdx + qdz * qdz < 2500) { nearCop = true; break; }
    }
    // on a client the host's street cops live in copsM (spliced out of `cops`),
    // so also check the mirror or heat decays while cops are actively hunting
    if (!nearCop && isClient()) for (i = 0; i < copsM.length; i++) {
      var cmc = copsM[i]; if (cmc.down) continue;
      var mdx = cmc.x - player.x, mdz = cmc.z - player.z;
      if (mdx * mdx + mdz * mdz < 2500) { nearCop = true; break; }
    }
    if (!nearCop) {
      state.wanted--; lastCrimeT = T; updateStarsHUD();
      if (state.wanted === 0) { popup('You lost the heat'); state.civKills = 0; state.copKills = 0; }   // fresh spree, fresh thresholds
    }
  }
}
for (var ci = 0; ci < 3; ci++) spawnCop(false);

// ---------------- cars: traffic ----------------
var cars = [];
// traffic stays on the ORIGINAL core roads: the expansion roads have no
// traffic lanes yet, so cars wrap at the old map edge (next step: extend)
var EDGE = CORE - 14;
function addCar(axis, lane, dir) {
  var c = { car: makeCar(), axis: axis, lane: lane, lane0: lane, dir: dir, pos: -EDGE + Math.random() * (EDGE * 2), speed: 8 + Math.random() * 6, dmgT: 0, berserk: false, exploded: false, respawnT: 0, smokeT: 0, eng: null };
  c.car.group.userData.trafficCar = c;
  cars.push(c);
}
// remap traffic car: same entry shape as addCar, but driven by the lane
// graph (RM.edges) instead of the axis lanes. Seeded placement keeps
// host/client cars[] identical in count/order for world-snapshot mapping.
function addRemapCar(rng) {
  var c = { car: makeCar(), axis: 'x', lane: 0, lane0: 0, dir: 1, pos: 0, speed: 10, dmgT: 0, berserk: false, exploded: false, respawnT: 0, smokeT: 0, eng: null };
  c.car.group.userData.trafficCar = c;
  remapSeedCar(c, rng);
  cars.push(c);
}
if (!WC_REMAP) {
  // 3x density pass: three cars per lane-slot instead of one
  [5, 10].forEach(function (l) { addCar('x', l, 1); addCar('x', l, 1); addCar('x', l, 1); addCar('x', l, 1); addCar('x', l, 1); addCar('x', l, 1); });
  [-5, -10].forEach(function (l) { addCar('x', l, -1); addCar('x', l, -1); addCar('x', l, -1); addCar('x', l, -1); addCar('x', l, -1); addCar('x', l, -1); });
  [4, 8].forEach(function (l) { addCar('z', l, 1); addCar('z', l, 1); addCar('z', l, 1); addCar('z', l, 1); addCar('z', l, 1); addCar('z', l, 1); });
  [-4, -8].forEach(function (l) { addCar('z', l, -1); addCar('z', l, -1); addCar('z', l, -1); addCar('z', l, -1); addCar('z', l, -1); addCar('z', l, -1); });
} else {
  // 3x density pass: 48-car budget (was 16), spread length-weighted over arterial+collector edges
  var rmCarRng = seededRng(0x52454D01);
  for (var rmci = 0; rmci < 48; rmci++) addRemapCar(rmCarRng);
}

// ---- parked cars: the lots hold empty cars you can break into (E, 0.9s) ----
// Deterministic layout (seeded RNG + deterministic slot rejection) so host and
// clients build cars[] in the same order/count — world snapshots map by index.
// Models/colors stay per-peer random, same as traffic.
function addParkedCar(x, z, ry) {
  var c = { car: makeCar(), axis: 'x', lane: 0, lane0: 0, dir: 1, pos: 0, speed: 0, dmgT: 0, berserk: false, exploded: false, respawnT: 0, smokeT: 0, eng: null, parked: true, slot: { x: x, z: z, ry: ry } };
  c.car.group.position.set(x, 0, z);
  c.car.group.rotation.y = ry;
  c.car.group.userData.trafficCar = c;
  cars.push(c);
  return c;
}
// hand-authored slot rows inside the mapParking lots: rows run along each
// lot's long axis, cars nose-in toward the building, ~3.2u stall pitch.
// n = how many of the row's slots get a car (random subset = natural gaps).
// Venue lot rows are keyed to the OLD lot positions; WC_REMAP suppresses them
// (the venues relocated, and their axis lots with them). The survey
// neighborhoods still contribute HOUSE_PARKED_ROWS below.
// WC_REMAP: derive parked rows straight from the editor-authored parking
// surfaces (REMAP_SURFACES) so the true-geometry lots fill with cars. Rows run
// along each lot's long (local-x) axis with a central aisle; every candidate
// slot is still vetted by parkedSlotFree (never on a road/collider/spawn), so
// bad slots simply drop out. Deterministic order (REMAP_SURFACES order) keeps
// host/client cars[] indices aligned for world snapshots.
function buildRemapParkedRows() {
  if (typeof REMAP_SURFACES === 'undefined') return [];
  var rows = [], placed = 0, CAP = 40;
  for (var i = 0; i < REMAP_SURFACES.length && placed < CAP; i++) {
    var s = REMAP_SURFACES[i];
    if (s.kind !== 'parking') continue;
    var th = s.rot * Math.PI / 180;
    var ux = Math.cos(th), uz = Math.sin(th);     // local +x (row runs this way)
    var vx = -Math.sin(th), vz = Math.cos(th);    // local +z (rows stack across)
    var pitch = 3.4, rowGap = 6.6;
    var wUse = s.w - 5, dUse = s.d - 5;
    if (wUse < 6 || dUse < 3) continue;
    var nSlots = Math.floor(wUse / pitch);
    var nRows = Math.max(1, Math.min(2, Math.floor(dUse / rowGap)));   // 1-2 rows/lot
    for (var rIdx = 0; rIdx < nRows && placed < CAP; rIdx++) {
      var zoff = nRows === 1 ? 0 : (-dUse / 2 + rowGap / 2 + rIdx * rowGap);
      var startX = -wUse / 2 + pitch / 2;
      var rx = s.x + ux * startX + vx * zoff, rz = s.z + uz * startX + vz * zoff;
      var face = th + (zoff <= 0 ? Math.PI / 2 : -Math.PI / 2);   // nose toward the aisle
      var want = Math.max(1, Math.min(5, Math.round(nSlots * 0.4)));
      rows.push({ x: rx, z: rz, dx: ux * pitch, dz: uz * pitch, slots: nSlots, ry: face, n: want });
      placed += want;
    }
  }
  return rows;
}
var PARKED_ROWS = WC_REMAP ? buildRemapParkedRows() : [
  // Publix (78x40 lot; aisle at z~-96 stays clear: player spawn -72,-97 + dealer -72,-106)
  { x: -106, z: -104, dx: 3.2, dz: 0, slots: 20, ry: Math.PI / 2, n: 5 },
  { x: -106, z: -88, dx: 3.2, dz: 0, slots: 20, ry: -Math.PI / 2, n: 4 },
  // strip malls + Dollar Tree frontage strip
  { x: -254, z: 32, dx: 3.3, dz: 0, slots: 58, ry: -Math.PI / 2, n: 6 },
  // RaceTrac side lot
  { x: 53, z: 66.5, dx: 3.3, dz: 0, slots: 6, ry: Math.PI / 2, n: 2 },
  // Regions Bank east lot
  { x: 70, z: -56, dx: 0, dz: 3.3, slots: 6, ry: Math.PI, n: 2 },
  // Bank of America south lot
  { x: -58, z: -68, dx: 3.3, dz: 0, slots: 7, ry: -Math.PI / 2, n: 2 },
  // Farnell school east lot (single row — the lot's east half hugs the cross road)
  { x: -24, z: -255, dx: 0, dz: 3.3, slots: 11, ry: Math.PI, n: 4 }
];
var PARKED_CLEAR = WC_REMAP ? [[-63, 4], [-60, 0]] : [[-72, -97], [-72, -106]];   // player spawn + gun dealer
// survey-neighborhood lots contribute extra deterministic rows (houses.js)
if (typeof HOUSE_PARKED_ROWS !== 'undefined') PARKED_ROWS = PARKED_ROWS.concat(HOUSE_PARKED_ROWS);
function parkedHalfExt(ry) {
  var co = Math.abs(Math.cos(ry)), si = Math.abs(Math.sin(ry));
  return { hx: 2.5 * co + 1.3 * si, hz: 2.5 * si + 1.3 * co };
}
function parkedSlotFree(x, z, ry) {
  var h = parkedHalfExt(ry), hx = h.hx, hz = h.hz, i;
  if (WC_REMAP) {
    if (!remapRectClear(x - hx, x + hx, z - hz, z + hz, 1)) return false;   // never on a true road
  } else {
    if (Math.abs(z) - hz < MAIN_HW + 2) return false;          // never on the main road
    if (Math.abs(x) - hx < CROSS_HW + 2) return false;         // never on the cross road
  }
  for (i = 0; i < colliders.length; i++) {                     // buildings/solid props/lake/fountain
    var b = colliders[i];
    if (x + hx > b.x0 - 0.2 && x - hx < b.x1 + 0.2 && z + hz > b.z0 - 0.2 && z - hz < b.z1 + 0.2) return false;
  }
  for (i = 0; i < mapDrives.length; i++) {                     // keep the access lanes open
    var d = mapDrives[i];
    if (x + hx > d.x - d.w / 2 && x - hx < d.x + d.w / 2 && z + hz > d.z - d.d / 2 && z - hz < d.z + d.d / 2) return false;
  }
  for (i = 0; i < breakables.length; i++) {                    // trees/lights/signs/carts/…
    var br = breakables[i];
    var qx = Math.max(x - hx, Math.min(br.x, x + hx)), qz = Math.max(z - hz, Math.min(br.z, z + hz));
    var ddx = br.x - qx, ddz = br.z - qz;
    if (ddx * ddx + ddz * ddz < (br.r + 0.4) * (br.r + 0.4)) return false;
  }
  for (i = 0; i < PARKED_CLEAR.length; i++) {
    var pc = PARKED_CLEAR[i], cx = pc[0] - x, cz = pc[1] - z;
    if (cx * cx + cz * cz < 30) return false;
  }
  for (i = 0; i < cars.length; i++) {                          // other parked cars
    if (!cars[i].parked) continue;
    var oh = parkedHalfExt(cars[i].slot.ry);
    var om = cars[i].car.group.position;
    if (Math.abs(om.x - x) < hx + oh.hx + 0.3 && Math.abs(om.z - z) < hz + oh.hz + 0.3) return false;
  }
  return true;
}
(function spawnParkedCars() {
  var rng = seededRng(0x9A7CED);
  for (var r = 0; r < PARKED_ROWS.length; r++) {
    var row = PARKED_ROWS[r];
    var free = [];
    for (var s = 0; s < row.slots; s++) {
      var sx = row.x + row.dx * s, sz = row.z + row.dz * s;
      if (parkedSlotFree(sx, sz, row.ry)) free.push([sx, sz]);
    }
    var want = Math.min(row.n, free.length);
    for (var k = 0; k < want; k++) {
      var pick = (rng() * free.length) | 0;
      var sp2 = free.splice(pick, 1)[0];
      addParkedCar(sp2[0], sp2[1], row.ry);
    }
  }
})();

// ---- procedural car engine (layered synth driven by an RPM model) ----
// speed maps to revs through gear steps, so an accelerating car audibly
// climbs and then drops on each upshift. Every car runs a cheap 5-node
// stack (two detuned saws + a sine sub -> lowpass -> gain); the player's
// car lazily adds an exhaust-noise band + roughness LFO on top.
var ENG_SHIFTS = [6.5, 12.5, 19, 26.5];   // upshift speeds (world units/s)
var ENG_IDLE = 850, ENG_MAX = 4200;       // rpm span of the model
function engineRPM(sp) {
  sp = Math.abs(sp);
  var lo = 0, gi = 0;
  while (gi < ENG_SHIFTS.length - 1 && sp > ENG_SHIFTS[gi]) { lo = ENG_SHIFTS[gi]; gi++; }
  var t = Math.min(1, (sp - lo) / (ENG_SHIFTS[gi] - lo));
  // each gear starts a little higher but tops out at the same redline
  return ENG_IDLE + gi * 220 + t * (2900 - gi * 220);
}
var engNoiseBuf = null;
function engNoise() {   // one shared noise second for every exhaust layer
  if (!engNoiseBuf) {
    var n = ac.sampleRate, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    engNoiseBuf = b;
  }
  return engNoiseBuf;
}
function ensureEngine(c) {
  if (c.eng || !ac) return;
  var o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 40;
  var o2 = ac.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 81;  // ~2x, detuned for beating
  var sub = ac.createOscillator(); sub.type = 'sine'; sub.frequency.value = 20;   // body
  var f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 280; f.Q.value = 1.2;
  var g = ac.createGain(); g.gain.value = 0;
  o.connect(f); o2.connect(f); sub.connect(f); f.connect(g); g.connect(ac.destination);
  o.start(); o2.start(); sub.start();
  c.eng = { o: o, o2: o2, sub: sub, f: f, g: g, rpm: ENG_IDLE };
}
function ensureEngineRich(c) {
  // the player's car earns the full stack: band-passed combustion noise
  // that follows the revs, plus a per-rev amplitude LFO for roughness
  ensureEngine(c);
  if (!c.eng || c.eng.rich || !ac) return;
  var ns = ac.createBufferSource(); ns.buffer = engNoise(); ns.loop = true;
  var nf = ac.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 500; nf.Q.value = 1.2;
  var ng = ac.createGain(); ng.gain.value = 0;
  ns.connect(nf); nf.connect(ng); ng.connect(c.eng.g);   // rides the master gain (distance/mute)
  var lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 28;
  var lg = ac.createGain(); lg.gain.value = 0;
  lfo.connect(lg); lg.connect(c.eng.g.gain);
  ns.start(); lfo.start();
  c.eng.rich = { ns: ns, nf: nf, ng: ng, lfo: lfo, lg: lg };
}
function engineTick(c, dt, sp, throttle, dist, drivenLoud) {
  if (!c.eng) return;
  var e = c.eng;
  // revs chase the gear model; throttle blips them up, lift-off sags slower
  var target = engineRPM(sp) + (throttle > 0 ? 260 : 0);
  if (c.berserk) target = ENG_MAX * 0.92;
  target = Math.max(ENG_IDLE * 0.9, Math.min(ENG_MAX, target));
  e.rpm += (target - e.rpm) * Math.min(1, dt * (target > e.rpm ? 4.5 : 2.2));
  // one doppler factor scales the whole layer stack
  var dop = dopplerShift(c, dist, dt);
  var f0 = Math.max(20, Math.min(400, (e.rpm / 22) * dop));   // firing fundamental
  e.o.frequency.value = f0;
  e.o2.frequency.value = Math.min(820, f0 * 2.04);
  e.sub.frequency.value = Math.max(14, f0 * 0.5);
  e.f.frequency.value = Math.max(140, Math.min(1400, 150 + e.rpm * 0.16));
  // loudness: distance falloff x rev-dependent presence (all gains clamped)
  var revs = Math.min(1, (e.rpm - ENG_IDLE) / 2600);
  var base;
  if (drivenLoud) base = 0.05 + revs * 0.085 + (throttle > 0 ? 0.02 : 0);
  else {
    var vol = Math.max(0, 1 - dist / 80);
    base = vol * vol * (c.berserk ? 0.1 : 0.05) * (0.45 + 0.55 * revs);
  }
  e.g.gain.value = Math.max(0, Math.min(0.16, base));
  if (e.rich) {
    var on = drivenLoud ? 1 : 0;
    e.rich.ng.gain.value = Math.min(0.4, on * (0.1 + (throttle > 0 ? 0.18 : 0.05) * Math.min(1, e.rpm / 3000)));
    e.rich.nf.frequency.value = Math.max(160, Math.min(3000, (260 + e.rpm * 0.5) * dop));
    e.rich.lfo.frequency.value = Math.max(8, Math.min(75, e.rpm / 60));
    e.rich.lg.gain.value = on * e.g.gain.value * 0.3;   // subtle AM roughness
  }
}
function engineTickMirror(c, dt) {
  // cars we don't sim (host snapshot mirrors, remote-driven cars): estimate
  // speed from frame-to-frame movement, keep the lighter traffic voicing
  var m = c.car.group.position;
  var edx = player.x - m.x, edz = player.z - m.z;
  var ed = Math.sqrt(edx * edx + edz * edz);
  var msp = 0;
  if (c._ex !== undefined && dt > 0.0005) {
    var mdx = m.x - c._ex, mdz = m.z - c._ez;
    msp = Math.sqrt(mdx * mdx + mdz * mdz) / dt;
  }
  c._ex = m.x; c._ez = m.z;
  c.espd = (c.espd || 0) + (Math.min(30, msp) - (c.espd || 0)) * Math.min(1, dt * 3);
  // a stolen car sitting still is PARKED — engine off, not idling forever
  if (c.stolen && c.espd < 0.8) { if (c.eng) c.eng.g.gain.value = 0; return; }
  engineTick(c, dt, c.espd, 0, ed, false);
}
function updateCars(dt) {
  if (isClient()) return;   // world traffic is mirrored from the host snapshot
  for (var i = 0; i < cars.length; i++) {
    var c = cars[i];
    if (!c.parked) ensureEngine(c);   // parked cars never even build audio nodes
    // on fire: about to blow
    if (c.burning && !c.exploded) {
      c.burnT -= dt;
      c.flameT -= dt;
      if (c.flameT <= 0) {
        c.flameT = 0.07;
        var bp = c.car.group.position;
        puff(new THREE.Vector3(bp.x + (Math.random() - 0.5) * 1.6, 0.9 + Math.random() * 1, bp.z + (Math.random() - 0.5) * 1.2), Math.random() < 0.55 ? 0xff8828 : 0x222222);
      }
      if (c.burnT <= 0) { explodeCar(c); }
    }
    // blown up: wait for respawn
    if (c.exploded) {
      if (c.eng) c.eng.g.gain.value = 0;
      c.respawnT -= dt;
      if (c.respawnT <= 0) {
        c.exploded = false; c.car.group.visible = true;
        removeHusk(c);   // the wreck is "towed" when the replacement shows up
        c.dmgT = 0; c.berserk = false;
        c.stolen = false; c.jacked = false; c.jackCD = 0; c.playerDriven = false;
        c.drivenBy = null;   // stale ids here made respawned traffic read as player-driven
        c.burning = false; c.carHP = undefined;
        if (c.slot) {
          // lot cars come back parked in their home slot, never as traffic
          c.parked = true; c.speed = 0; c.shoveT = 0;
          c.car.group.position.set(c.slot.x, 0, c.slot.z);
          c.car.group.rotation.y = c.slot.ry;
        } else if (WC_REMAP) {
          remapSeedCar(c);   // respawn back onto the lane graph
        } else {
          c.pos = c.dir === 1 ? -EDGE + 4 : EDGE - 4;
          c.lane = c.lane0;
          c.speed = 8 + Math.random() * 6;
        }
      }
      continue;
    }
    // parked lot cars: no driver, no traffic AI, engine dead silent —
    // they only move if something rams them (shove physics still applies)
    if (c.parked) {
      if (c.shoveT > 0) {
        c.shoveT -= dt;
        c.svx *= 1 - dt * 1.8; c.svz *= 1 - dt * 1.8;
        c.sx += c.svx * dt; c.sz += c.svz * dt;
        c.sx = Math.max(-HALF + 2, Math.min(HALF - 2, c.sx));
        c.sz = Math.max(-HALF + 2, Math.min(HALF - 2, c.sz));
        c.car.group.position.set(c.sx, 0, c.sz);
        c.car.group.rotation.y += c.sspin * dt;
        c.sspin *= 1 - dt * 1.5;
      }
      if (c.eng) c.eng.g.gain.value = 0;
      continue;
    }
    // stolen cars are player-controlled (or parked) — no traffic AI
    if (c.stolen) {
      // a remote player is driving it: mirror their position for everyone
      if (c.drivenBy && net.remotes[c.drivenBy]) {
        var drv = net.remotes[c.drivenBy];
        c.car.group.position.set(drv.x, 0, drv.z);
        c.car.group.rotation.y = drv.h;
      }
      // a moving remote-driven car still sounds; a parked one is engine-off
      if (c.eng && c !== driving) engineTickMirror(c, dt);
      continue;
    }
    var m = c.car.group;
    if (c.berserk) {
      // out of control: arcing free velocity + wild spinning
      var cv = Math.cos(c.curve * dt), sv = Math.sin(c.curve * dt);
      var nbx = c.bvx * cv - c.bvz * sv, nbz = c.bvx * sv + c.bvz * cv;
      c.bvx = nbx; c.bvz = nbz;
      c.bx += c.bvx * dt; c.bz += c.bvz * dt;
      c.bx = Math.max(-HALF + 2, Math.min(HALF - 2, c.bx));
      c.bz = Math.max(-HALF + 2, Math.min(HALF - 2, c.bz));
      m.position.set(c.bx, 0, c.bz);
      m.rotation.y += c.spin * dt;
    } else if (c.shoveT > 0) {
      // rammed: skids away spinning, then collects itself back into traffic
      c.shoveT -= dt;
      c.svx *= 1 - dt * 1.8; c.svz *= 1 - dt * 1.8;
      c.sx += c.svx * dt; c.sz += c.svz * dt;
      c.sx = Math.max(-HALF + 2, Math.min(HALF - 2, c.sx));
      c.sz = Math.max(-HALF + 2, Math.min(HALF - 2, c.sz));
      m.position.set(c.sx, 0, c.sz);
      m.rotation.y += c.sspin * dt;
      c.sspin *= 1 - dt * 1.5;
      if (c.shoveT <= 0) { if (WC_REMAP) remapRejoinLane(c); else c.pos = c.axis === 'x' ? c.sx : c.sz; }   // rejoin the lane from here
    } else if (WC_REMAP) {
      applyCarGovernor(c, i, dt);   // car-following + red-light + stop-sign speed control
      remapDriveCar(c, dt);   // follow the true-geometry lane graph (RM.edges)
    } else {
      c.pos += c.dir * c.speed * dt;
      if (c.pos > EDGE) c.pos = -EDGE;
      if (c.pos < -EDGE) c.pos = EDGE;
      if (c.axis === 'x') { m.position.set(c.pos, 0, c.lane); m.rotation.y = c.dir === 1 ? 0 : Math.PI; }
      else { m.position.set(c.lane, 0, c.pos); m.rotation.y = c.dir === 1 ? -Math.PI / 2 : Math.PI / 2; }
    }
    var spin = (c.speed * dt) / 0.34;
    for (var wi = 0; wi < 4; wi++) c.car.wheels[wi].rotation.y -= spin;
    updateCarFeel(c, dt, c.berserk ? 14 : c.speed, 0, c.berserk ? Math.sin(T * 5 + i) : 0);

    // engine: rpm-layered synth — pitch by speed+gears+doppler, volume by distance
    var edx = player.x - m.position.x, edz = player.z - m.position.z;
    var ed = Math.sqrt(edx * edx + edz * edz);
    if (c.eng) engineTick(c, dt, c.speed, 0, ed, false);
    // smoke when shot up
    if (c.dmgT > 1.2) {
      c.smokeT -= dt;
      if (c.smokeT <= 0) { c.smokeT = 0.14; puff(new THREE.Vector3(m.position.x, 1.2, m.position.z), c.berserk ? 0x222222 : 0x555555); }
    }

    // run over pedestrians: ragdoll them
    for (var ni2 = 0; ni2 < npcs.length; ni2++) {
      var n2 = npcs[ni2];
      if (n2.state === 'down' || n2.state === 'ragdoll' || n2.state === 'hidden') continue;
      var ndx = n2.x - m.position.x, ndz = n2.z - m.position.z;
      var lon = c.axis === 'x' ? ndx : ndz, lat = c.axis === 'x' ? ndz : ndx;
      if (Math.abs(lon) < 2.8 && Math.abs(lat) < 1.5) {
        var dirX = c.axis === 'x' ? c.dir : 0, dirZ = c.axis === 'z' ? c.dir : 0;
        sfx('crash', { x: n2.x, z: n2.z, range: 90 });
        killNpcRagdoll(n2, dirX + (Math.random() - 0.5) * 0.5, dirZ + (Math.random() - 0.5) * 0.5, 8 + c.speed * 0.55);
      }
    }

    // berserk cars explode on whatever solid thing they hit
    if (c.berserk) {
      var ex = m.position.x, ez = m.position.z;
      for (var b = 0; b < colliders.length; b++) {
        var bb = colliders[b];
        if (bb.active === false) continue;
        var qx = Math.max(bb.x0, Math.min(ex, bb.x1)), qz = Math.max(bb.z0, Math.min(ez, bb.z1));
        var qdx = ex - qx, qdz = ez - qz;
        if (qdx * qdx + qdz * qdz < 4.5) { explodeCar(c); break; }
      }
      if (!c.exploded) {
        for (var j = 0; j < cars.length; j++) {
          if (j === i || cars[j].exploded) continue;
          var om = cars[j].car.group.position;
          if (Math.abs(om.x - ex) < 4 && Math.abs(om.z - ez) < 4) {
            if (!cars[j].stolen && !cars[j].drivenBy) explodeCar(cars[j]);   // a driven car survives; the berserk one still goes
            explodeCar(c); break;
          }
        }
      }
      if (!c.exploded) { c.boomTimer -= dt; if (c.boomTimer <= 0) explodeCar(c); }
      if (c.exploded) continue;
    }

    // shove / hurt player (not while you're inside your own car)
    if (Math.abs(edx) < 2.6 && Math.abs(edz) < 2.6 && !state.dead && !driving) {
      var d = ed || 1;
      player.x += (edx / d) * 2.4; player.z += (edz / d) * 2.4;
      if (T - state.lastCarHit > 0.8) { state.lastCarHit = T; hurtPlayer(12); sfx('thud'); }
    }
  }
}

// ---------------- driving ----------------
var JACK_CD = 15;   // seconds a freshly hijacked car can't be hijacked again
function carDrivenByPlayer(c) {
  // host tracks drivenBy directly; clients mirror it from the snapshot flags
  return !!(c.drivenBy || c.playerDriven);
}
function nearestStealableCar() {
  var best = null, bestD = 30;
  for (var i = 0; i < cars.length; i++) {
    var c = cars[i];
    if (c.exploded) continue;
    if (c === driving) continue;
    if (carDrivenByPlayer(c) && T < (c.jackCD || 0)) continue;   // hijack cooldown
    var m = c.car.group.position;
    var dx = m.x - player.x, dz = m.z - player.z, d2 = dx * dx + dz * dz;
    if (d2 < bestD) { best = c; bestD = d2; }
  }
  return best;
}
function kickDriver(c) {
  // driver bails and runs away scared
  var g = c.car.group;
  if (npcs.length < NPC_COUNT + 12 && !isClient()) {
    var n = spawnNPC();
    n.x = g.position.x + Math.cos(g.rotation.y + Math.PI / 2) * 2.4;
    n.z = g.position.z - Math.sin(g.rotation.y + Math.PI / 2) * 2.4;
    n.mesh.position.set(n.x, 0, n.z);
    rehomeNpc(n);   // wander near where it bailed, not back to its old street
    startFlee(n);
  }
  sfx('grunt', { x: g.position.x, z: g.position.z, range: 40 });
}
function enterCar(c) {
  var victim = carDrivenByPlayer(c);   // hijacking another player, not an NPC
  driving = c;
  if (victim) {
    c.jackCD = T + JACK_CD;
    if (net.mode === 'host' && c.drivenBy) {
      // kick the current driver out and start everyone's cooldown
      for (var vi = 0; vi < net.conns.length; vi++) if (net.conns[vi].peer === c.drivenBy) { try { net.conns[vi].send({ t: 'jacked', i: cars.indexOf(c) }); } catch (e) { } }
      netBroadcast({ t: 'jackCD', i: cars.indexOf(c) });
    }
  }
  c.stolen = true;
  c.drivenBy = null;
  c.playerDriven = false;
  if (c.carHP === undefined) c.carHP = 100;
  c.pspeed = c.jacked ? 0 : c.speed;   // take over at its current speed on a fresh jack
  var g = c.car.group;
  if (c.parked) {
    // break-in complete: nobody to kick out, and no automatic star —
    // cops only care if they can already see chaos
    c.parked = false; c.jacked = true; c.pspeed = 0;
    popup2('STOLEN');
  } else if (!c.jacked || victim) {
    c.jacked = true;
    if (!victim) kickDriver(c);        // NPC driver bails; a player victim is kicked via net
    popup2(victim ? 'HIJACKED!' : 'CARJACKED');
    lastCrimeT = T;
    if (state.wanted < 1) setWanted(1);
  }
  if (isClient()) netToHost({ t: 'steal', i: cars.indexOf(c) });
  setZoom(false);
  vm.visible = false;
  // start the orbit camera behind the car
  var hh = g.rotation.y;
  yaw = Math.atan2(-Math.cos(hh), Math.sin(hh));
  pitch = 0;
  document.getElementById('crosshair').style.display = 'none';
  document.getElementById('weaponBox').innerHTML = 'DRIVING<br><small>[E] get out &middot; WASD drive &middot; mouse looks around</small>';
}
function exitCar(hijacked) {
  if (!driving) return;
  var g = driving.car.group;
  var h = g.rotation.y;
  var px = g.position.x + Math.cos(h + Math.PI / 2) * 2.6;
  var pz = g.position.z - Math.sin(h + Math.PI / 2) * 2.6;
  var p = pushOut(px, pz, 0.55);
  player.x = p.x; player.z = p.z; player.y = EYE; player.vy = 0;
  // when we got hijacked the car belongs to the thief now — don't park it
  if (!hijacked) {
    driving.pspeed = 0;
    if (isClient()) netToHost({ t: 'park', i: cars.indexOf(driving), x: Math.round(g.position.x * 10) / 10, z: Math.round(g.position.z * 10) / 10, ry: Math.round(h * 100) / 100 });
  }
  driving = null;
  vm.visible = true;
  document.getElementById('crosshair').style.display = '';
  setEquipped(state.equipped);   // restores viewmodel + weapon HUD
}
// ---- breaking into parked cars: E starts a 0.9s window-jimmy, then you're in ----
var breakIn = null;   // {c, t}
function startBreakIn(c) {
  if (breakIn || driving || !c.parked || c.exploded) return;
  var g = c.car.group.position;
  breakIn = { c: c, t: 0.9 };
  popup2('BREAKING IN…');
  sfx('glass', { x: g.x, z: g.z, range: 55 });
  // a bystander who can SEE you jimmy the door panics like a gunshot scare
  // (no automatic star — startFlee only, same as any scared pedestrian)
  for (var i = 0; i < npcs.length; i++) {
    var n = npcs[i];
    if (n.state !== 'walk' && n.state !== 'chat' && n.state !== 'stand') continue;
    var dx = n.x - g.x, dz = n.z - g.z;
    if (dx * dx + dz * dz > 100) continue;   // ~10u earshot/eyeshot
    if (copHasLOS({ x: n.x, z: n.z }, { x: g.x, z: g.z, y: 1.2 })) startFlee(n);
  }
}
function updateBreakIn(dt) {
  if (!breakIn) return;
  var c = breakIn.c, g = c.car.group.position;
  var dx = player.x - g.x, dz = player.z - g.z;
  // cancel if the car blew/was taken, we died, or we wandered off
  if (!c.parked || c.exploded || state.dead || driving || dx * dx + dz * dz > 36) { breakIn = null; return; }
  breakIn.t -= dt;
  if (breakIn.t <= 0) {
    breakIn = null;
    sfx('glass', { x: g.x, z: g.z, range: 55 });
    enterCar(c);
  }
}
function updateDriving(dt) {
  var c = driving, g = c.car.group;
  var h = g.rotation.y;
  var accel = 0;
  if (keys['KeyW']) accel = 15;
  else if (keys['KeyS']) accel = -18;
  c.pspeed = c.pspeed || 0;
  c.pspeed += accel * dt;
  if (!accel) c.pspeed *= Math.max(0, 1 - 1.4 * dt);
  c.pspeed = Math.max(-9, Math.min(26, c.pspeed));
  // brake-light input: S/Space against forward motion, or a hard one-frame
  // speed drop (wall/car impact) — consumed by updateCarLights via updateWorldFx
  c.brakeIn = ((keys['KeyS'] || keys['Space']) && c.pspeed > 0.5) || (c._lps !== undefined && c._lps - c.pspeed > 5);
  c._lps = c.pspeed;
  var steer = (keys['KeyA'] ? 1 : 0) - (keys['KeyD'] ? 1 : 0);
  if (steer) h += steer * 2.1 * dt * Math.max(-1, Math.min(1, c.pspeed / 8));
  var fx = Math.cos(h), fz = -Math.sin(h);
  var nx = g.position.x + fx * c.pspeed * dt;
  var nz = g.position.z + fz * c.pspeed * dt;
  nx = Math.max(-HALF + 3, Math.min(HALF - 3, nx));
  nz = Math.max(-HALF + 3, Math.min(HALF - 3, nz));
  var p = pushOut(nx, nz, 1.7);
  if (Math.abs(p.x - nx) > 0.01 || Math.abs(p.z - nz) > 0.01) {
    if (Math.abs(c.pspeed) > 8) sfx('crash');
    c.svy = (c.svy || 0) - Math.min(1.4, Math.abs(c.pspeed) * 0.09);   // suspension slam
    c.pspeed *= -0.15;
  }
  g.position.set(p.x, 0, p.z);
  g.rotation.y = h;
  var spin = (c.pspeed * dt) / 0.34;
  for (var wi = 0; wi < 4; wi++) c.car.wheels[wi].rotation.y -= spin;
  updateCarFeel(c, dt, c.pspeed, accel, steer);
  // the driver's seat gets the full engine: idle rumble when stopped,
  // throttle swell on W, gear steps on the way up, exhaust noise on top
  ensureEngineRich(c);
  if (c.eng) engineTick(c, dt, c.pspeed, keys['KeyW'] ? 1 : 0, 0, true);
  var moving = Math.abs(c.pspeed) > 3;
  if (moving) {
    var sgn = c.pspeed > 0 ? 1 : -1;
    // run over pedestrians — this is on you
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i];
      if (n.state === 'down' || n.state === 'ragdoll' || n.state === 'hidden') continue;
      var dx = n.x - p.x, dz = n.z - p.z;
      var lon = dx * fx + dz * fz, lat = -dx * fz + dz * fx;
      if (Math.abs(lon) < 2.8 && Math.abs(lat) < 1.5) {
        sfx('crash');
        if (isClient()) netToHost({ t: 'ragNpc', i: i, kx: fx * sgn, kz: fz * sgn, pw: 8 + Math.abs(c.pspeed) * 0.55 });
        else killNpcRagdoll(n, fx * sgn + (Math.random() - 0.5) * 0.5, fz * sgn + (Math.random() - 0.5) * 0.5, 8 + Math.abs(c.pspeed) * 0.55);
        n.state = 'ragdoll';   // avoid double-triggering while the host confirms
        creditCivKill();
      }
    }
    // run over cops (local sim or host-mirrored)
    for (i = 0; i < cops.length; i++) {
      var cp = cops[i];
      if (cp.state === 'down') continue;
      var cdx = cp.x - p.x, cdz = cp.z - p.z;
      var clon = cdx * fx + cdz * fz, clat = -cdx * fz + cdz * fx;
      if (Math.abs(clon) < 2.8 && Math.abs(clat) < 1.5) {
        sfx('crash'); sfx('grunt');
        damageCop(cp, 999, fx * sgn, fz * sgn);
      }
    }
    if (isClient()) for (i = 0; i < copsM.length; i++) {
      var cpm = copsM[i];
      if (cpm.hit) continue;
      var mdx = cpm.x - p.x, mdz = cpm.z - p.z;
      var mlon = mdx * fx + mdz * fz, mlat = -mdx * fz + mdz * fx;
      if (Math.abs(mlon) < 2.8 && Math.abs(mlat) < 1.5) {
        cpm.hit = true;   // one message per pass-through
        sfx('crash'); sfx('grunt');
        netToHost({ t: 'dmgCop', id: cpm.nid, dmg: 999, kx: fx * sgn, kz: fz * sgn });
      }
    }
    // ram traffic: they lose control like being shot up
    for (i = 0; i < cars.length; i++) {
      var oc = cars[i];
      if (oc === c || oc.exploded || oc.stolen) continue;
      var om = oc.car.group.position;
      if (Math.abs(om.x - p.x) < 4 && Math.abs(om.z - p.z) < 3.2) {
        if (!oc.berserk && T - (oc.ramT || 0) > 0.4) {
          // a fender-bender dents, it doesn't detonate: the hit car gets
          // punted away spinning, takes speed-scaled damage, and only a
          // beat-up car finally loses control
          oc.ramT = T;
          var imp = 0.25 + Math.abs(c.pspeed) * 0.045;
          var rkx = om.x - p.x, rkz = om.z - p.z;
          var rsp = 4 + Math.abs(c.pspeed) * 0.8;
          if (isClient()) netToHost({ t: 'ramHit', i: i, kx: Math.round(rkx * 10), kz: Math.round(rkz * 10), sp: Math.round(rsp * 10), dmg: imp });
          else {
            shoveCar(oc, rkx, rkz, rsp);
            oc.dmgT += imp;
            if (oc.dmgT >= 1.5 && goBerserk(oc)) { popup('WRECKED!'); creditCivKill(); }
          }
        }
        c.pspeed *= 0.5;
      }
    }
  }
  // client: your burning car ticks down here (traffic sim is host-side)
  if (isClient() && c.burning && !c.exploded) {
    c.burnT -= dt;
    c.flameT = (c.flameT || 0) - dt;
    if (c.flameT <= 0) { c.flameT = 0.07; puff(new THREE.Vector3(p.x + (Math.random() - 0.5) * 1.6, 0.9 + Math.random(), p.z + (Math.random() - 0.5) * 1.2), Math.random() < 0.55 ? 0xff8828 : 0x222222); }
    if (c.burnT <= 0) {
      var ii = cars.indexOf(c);
      explodeCar(c);
      netToHost({ t: 'carBoom', i: ii });
    }
  }
  // player rides along
  player.x = p.x; player.z = p.z; player.y = EYE;
  // third-person orbit camera — mouse controls the view around the car
  var cfx = -Math.sin(yaw), cfz = -Math.cos(yaw);
  var camH = Math.max(2.2, Math.min(9, 4.4 - pitch * 5));
  camera.position.set(p.x - cfx * 8.5, camH, p.z - cfz * 8.5);
  camera.lookAt(p.x + cfx * 2, 1.2, p.z + cfz * 2);
}

// ---------------- cash / puffs (unchanged) ----------------
var cashes = [];
var cashGeo = new THREE.BoxGeometry(0.55, 0.14, 0.34);
var cashTopT = (function () {
  var c = document.createElement('canvas'); c.width = 64; c.height = 32; var g = c.getContext('2d');
  g.fillStyle = '#59a04a'; g.fillRect(0, 0, 64, 32); g.strokeStyle = '#2e5a28'; g.lineWidth = 3; g.strokeRect(3, 3, 58, 26);
  g.fillStyle = '#2e5a28'; g.font = 'bold 20px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 32, 17);
  var t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
})();
var cashSideM = lamb({ color: 0x4a8a3e }), cashTopM = lamb2(cashTopT);
var cashMats = [cashSideM, cashSideM, cashTopM, cashSideM, cashSideM, cashSideM];
function spawnCash(x, z, val, baseY) { var m = new THREE.Mesh(cashGeo, cashMats); m.position.set(x + (Math.random() - 0.5), (baseY || 0) + 0.4, z + (Math.random() - 0.5)); scene.add(m); cashes.push({ mesh: m, val: val, life: 40, baseY: baseY || 0 }); }
// cash from client-triggered events (ATM/meter) must be spawned on the HOST,
// or the authoritative cash-snapshot rebuild wipes it before it can be looted.
function spawnCashNet(x, z, val) { if (isClient()) netToHost({ t: 'atmCash', x: x, z: z, val: val }); else spawnCash(x, z, val); }
function updateCash(dt) {
  for (var i = cashes.length - 1; i >= 0; i--) {
    var c = cashes[i]; c.life -= dt; c.mesh.rotation.y += dt * 3; c.mesh.position.y = c.baseY + 0.38 + Math.sin(T * 3 + i) * 0.12;
    var dx = player.x - c.mesh.position.x, dz = player.z - c.mesh.position.z;
    if (c.netCash) {
      // host owns the cash: ask for it, the money arrives as a 'cash' message
      // (pend un-sticks after 1.5s in case the host awarded it to someone else)
      if (c.pend && T - (c.pendT || 0) > 1.5) c.pend = false;
      if (dx * dx + dz * dz < 2.1 && !c.pend) { c.pend = true; c.pendT = T; netToHost({ t: 'takeCash', x: c.mesh.position.x, z: c.mesh.position.z }); }
      continue;
    }
    if (dx * dx + dz * dz < 2.1 || c.life <= 0) { if (c.life > 0) { state.money += c.val; popup('+$' + c.val); sfx('cash'); } scene.remove(c.mesh); cashes.splice(i, 1); }
  }
}
var puffs = [];
var puffM = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.9 });
var puffGeo = new THREE.PlaneGeometry(0.35, 0.35);
function puff(p, col) { var m = new THREE.Mesh(puffGeo, puffM.clone()); if (col) m.material.color.setHex(col); m.position.copy(p); scene.add(m); puffs.push({ mesh: m, life: 0.22 }); }
function updatePuffs(dt) { for (var i = puffs.length - 1; i >= 0; i--) { var p = puffs[i]; p.life -= dt; p.mesh.lookAt(camera.position); p.mesh.scale.multiplyScalar(1 + dt * 6); p.mesh.material.opacity = Math.max(0, p.life / 0.22); if (p.life <= 0) { scene.remove(p.mesh); puffs.splice(i, 1); } } }

// ---------------- blood decals / scorch marks ----------------
var decals = [];
var decalGeo = new THREE.CircleGeometry(1, 10); decalGeo.rotateX(-Math.PI / 2);
// AI-painted puddle/drip sprites (optional blooddecals.js); alpha planes
var bloodPlaneGeo = new THREE.PlaneGeometry(2, 2); bloodPlaneGeo.rotateX(-Math.PI / 2);
var bloodMats = null, dripMats = null;
function decalMats(urls) {
  return urls.map(function (u) {
    var im = new Image();
    var tx = new THREE.Texture(im);
    tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false;
    im.onload = function () { tx.needsUpdate = true; };
    im.src = u;
    // lambert (NOT basic): blood must sit in the scene lighting like the
    // pavement does, and dried blood runs darker than the source art
    return new THREE.MeshLambertMaterial({ map: tx, color: 0x8a8a8a, transparent: true, opacity: 1, depthWrite: false });
  });
}
function pushDecal(m, life) {
  scene.add(m); decals.push({ mesh: m, life: life });
  if (decals.length > 60) { var o = decals.shift(); scene.remove(o.mesh); }
}
function bloodDecal(x, z) {
  var m;
  if (typeof BLOOD_DECALS !== 'undefined') {
    if (!bloodMats) bloodMats = decalMats(BLOOD_DECALS.puddles);
    m = new THREE.Mesh(bloodPlaneGeo, bloodMats[(Math.random() * bloodMats.length) | 0].clone());
    m.scale.setScalar(0.7 + Math.random() * 0.8);
  } else {
    m = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({ color: 0x7a1410, transparent: true, opacity: 0.75, depthWrite: false }));
    m.scale.setScalar(0.8 + Math.random() * 0.9);
  }
  m.position.set(x, 0.165 + Math.random() * 0.004, z); m.rotation.y = Math.random() * Math.PI * 2;
  pushDecal(m, 30);
}
function dripDecal(x, z) {
  var m;
  if (typeof BLOOD_DECALS !== 'undefined') {
    if (!dripMats) dripMats = decalMats(BLOOD_DECALS.drips);
    m = new THREE.Mesh(bloodPlaneGeo, dripMats[(Math.random() * dripMats.length) | 0].clone());
    m.scale.setScalar(0.16 + Math.random() * 0.14);
  } else {
    m = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({ color: 0x6f1210, transparent: true, opacity: 0.7, depthWrite: false }));
    m.scale.setScalar(0.08 + Math.random() * 0.06);
  }
  m.position.set(x, 0.163 + Math.random() * 0.004, z); m.rotation.y = Math.random() * Math.PI * 2;
  pushDecal(m, 18);
}
function scorch(x, z) {
  var m = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.7, depthWrite: false }));
  m.scale.setScalar(3.5); m.position.set(x, 0.168, z);
  scene.add(m); decals.push({ mesh: m, life: 40 });
}
function updateDecals(dt) {
  for (var i = decals.length - 1; i >= 0; i--) {
    var d = decals[i]; d.life -= dt;
    if (d.life < 5) d.mesh.material.opacity = Math.max(0, d.life / 5 * 0.75);
    if (d.life <= 0) { scene.remove(d.mesh); decals.splice(i, 1); }
  }
}

// ---------------- ragdoll kills + explosions ----------------
function killNpcRagdoll(n, dx, dz, power) {
  if (n.state === 'down' || n.state === 'ragdoll' || n.state === 'hidden') return;
  breakNpcChat(n);   // free the chat partner before this one goes flying
  n.state = 'ragdoll'; n.hp = 0;
  stopNpcVoice(n.vname);
  if (n.mesh.userData.shadow) n.mesh.userData.shadow.visible = false;
  n.vx = dx * power + (Math.random() - 0.5) * 3;
  n.vz = dz * power + (Math.random() - 0.5) * 3;
  n.vy = 6.5 + Math.random() * 4.5;
  n.airY = 0.2;   // launch from near ground level; vy carries the arc (was 0.9 = a visible ~1m pop the instant they died)
  n.spinX = (Math.random() - 0.5) * 14;
  n.spinZ = (Math.random() - 0.5) * 14;
  sfx('grunt', { x: n.x, z: n.z, range: 60 });
  for (var i = 0; i < 5; i++) puff(new THREE.Vector3(n.x + (Math.random() - 0.5), 0.8 + Math.random() * 1.2, n.z + (Math.random() - 0.5)), 0xa01212);
  bloodDecal(n.x, n.z);
  spawnCash(n.x, n.z, 5 + ((Math.random() * 18) | 0));
}

var booms = [];
var boomGeo = new THREE.SphereGeometry(1, 10, 8);
function boomAt(x, z, fromNet, creditConn) {
  // creditConn: when a CLIENT's rocket detonates, the host passes their conn
  // so blast kills answer with 'kill' credit like dmgNpc/dmgCop do
  if (!fromNet && typeof netBroadcast === 'function' && net.conns.length) netBroadcast({ t: 'boom', x: x, z: z });
  var mesh = new THREE.Mesh(boomGeo, new THREE.MeshBasicMaterial({ color: 0xff8828, transparent: true, opacity: 0.95 }));
  mesh.position.set(x, 1.5, z); scene.add(mesh);
  booms.push({ mesh: mesh, life: 0.55, max: 0.55 });
  for (var i = 0; i < 9; i++) puff(new THREE.Vector3(x + (Math.random() - 0.5) * 4, 0.8 + Math.random() * 3, z + (Math.random() - 0.5) * 4), i % 2 ? 0x333333 : 0xd86a20);
  scorch(x, z);
  sfx('boom', { x: x, z: z, range: 260 });
  if (!isClient()) {   // kills are host-authoritative; clients get them via snapshot
    for (i = 0; i < npcs.length; i++) {
      var n = npcs[i]; if (n.state === 'down' || n.state === 'ragdoll' || n.state === 'hidden') continue;
      var dx = n.x - x, dz = n.z - z, d = Math.sqrt(dx * dx + dz * dz);
      if (d < 9) {
        killNpcRagdoll(n, dx / (d || 1), dz / (d || 1), 13);
        if (creditConn) { try { creditConn.send({ t: 'kill', kind: 'npc' }); } catch (e) { } }
      }
    }
    for (i = 0; i < cops.length; i++) {
      var cp = cops[i]; if (cp.state === 'down') continue;
      var cdx = cp.x - x, cdz = cp.z - z, cd = Math.sqrt(cdx * cdx + cdz * cdz);
      if (cd < 9) {
        damageCop(cp, 999, cdx / (cd || 1), cdz / (cd || 1), !!creditConn);   // silent when it's a client's kill — the stars are theirs
        if (creditConn && cp.state === 'down') { try { creditConn.send({ t: 'kill', kind: 'cop' }); } catch (e) { } }
      }
    }
    panicNear(x, z, 900);   // survivors within ~30m scatter (aborts sidewalk chats too)
  }
  var pdx = player.x - x, pdz = player.z - z, pd = Math.sqrt(pdx * pdx + pdz * pdz);
  if (pd < 10 && !state.dead) hurtPlayer(Math.round(80 * (1 - pd / 10) + 15));
  // chain: nearby cars go up too
  if (!isClient()) for (i = 0; i < cars.length; i++) {
    var cx = cars[i];
    if (cx.exploded || cx.stolen || cx.drivenBy) continue;   // player rides never chain silently — their driver can't be told
    var cm = cx.car.group.position;
    if (Math.abs(cm.x - x) < 6 && Math.abs(cm.z - z) < 6) {
      explodeCar(cx);
      if (creditConn) { try { creditConn.send({ t: 'kill', kind: 'car' }); } catch (e) { } }
    }
  }
}
function updateBooms(dt) {
  for (var i = booms.length - 1; i >= 0; i--) {
    var b = booms[i]; b.life -= dt;
    var t = 1 - b.life / b.max;
    b.mesh.scale.setScalar(2 + t * 9);
    b.mesh.material.opacity = Math.max(0, 0.95 * (1 - t));
    if (b.life <= 0) { scene.remove(b.mesh); booms.splice(i, 1); }
  }
}
// returns TRUE only when this call actually starts the wreck (goes berserk or
// first ignites a parked car) — callers gate kill-credit on it so a car already
// berserk/burning/exploded can't be re-credited on every follow-up shot/ram
function goBerserk(c) {
  if (c.berserk || c.burning || c.exploded) return false;
  if (c.parked) {
    // no driver to lose control — a shot-up parked car just catches fire and blows
    c.burning = true; c.burnT = 2.2; c.flameT = 0;
    var pp = c.car.group.position;
    sfx('crash', { x: pp.x, z: pp.z, range: 90 });
    return true;
  }
  c.berserk = true;
  var m = c.car.group;
  var dirx = c.axis === 'x' ? c.dir : 0, dirz = c.axis === 'z' ? c.dir : 0;
  var side = Math.random() < 0.5 ? 1 : -1;                 // veer left or right
  var ang = side * (0.55 + Math.random() * 0.55);          // 30-63 degrees off the road
  var ca = Math.cos(ang), sa = Math.sin(ang);
  var spd = c.speed * 2.2 + 10;
  c.bvx = (dirx * ca - dirz * sa) * spd;
  c.bvz = (dirx * sa + dirz * ca) * spd;
  c.bx = m.position.x; c.bz = m.position.z;
  c.spin = side * (7 + Math.random() * 7);                 // crazy spin
  c.curve = side * (0.08 + Math.random() * 0.18);          // gentle arc — stays headed off the road
  c.boomTimer = 6;
  sfx('crash', { x: m.position.x, z: m.position.z, range: 120 });
  return true;
}
function shoveCar(c, dx, dz, sp) {
  var m2 = c.car.group;
  var d = Math.sqrt(dx * dx + dz * dz) || 1;
  c.shoveT = 1.1;
  c.sx = m2.position.x; c.sz = m2.position.z;
  c.svx = dx / d * sp; c.svz = dz / d * sp;
  c.sspin = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 5);
}
function igniteCar(c) {
  if (c.burning || c.exploded) return;
  c.burning = true; c.burnT = 5; c.flameT = 0;
  popup2('YOUR CAR IS ON FIRE — GET OUT!');
  sfx('alarm');
}
// ---- burned-out husk (GGBot Car 06): every explosion leaves the wreck at
// the spot until the car respawns (traffic 5 s / lot slot 60 s), so the husk
// can never outlive or duplicate a respawn — explodeCar guards on c.exploded,
// so chain explosions get exactly one husk per car. Per-peer visual in MP
// (like breakables): the host spawns it from explodeCar, clients from the
// snapshot exploded flag in applyWorldSnap.
function spawnHusk(c) {
  if (GG_WRECK_I < 0 || c.husk) return;
  var e = GGBOT_VEHS[GG_WRECK_I];
  var hs = VEH_LEN / e.dims[0];
  var m = new THREE.Mesh(getGGGeo(GG_WRECK_I), getGGMat(GG_WRECK_I, 0));
  m.scale.set(hs, hs, hs);
  var g = c.car.group;
  m.position.set(g.position.x, -0.09, g.position.z);   // slightly sunk into the road
  m.rotation.y = g.rotation.y;                         // aligned to the dead car
  scene.add(m);
  c.husk = m;
}
function removeHusk(c) { if (c.husk) { scene.remove(c.husk); c.husk = null; } }
function explodeCar(c) {
  if (c.exploded) return;
  c.exploded = true; c.berserk = false; c.dmgT = 0; c.burning = false;
  var pos = c.car.group.position;
  if (driving === c) {
    // blown out of your own ride
    driving = null;
    document.getElementById('crosshair').style.display = '';
    setEquipped(state.equipped);
  }
  boomAt(pos.x, pos.z);
  c.car.group.visible = false;
  spawnHusk(c);
  c.respawnT = c.slot ? 60 : 5;   // lot cars take a minute to "get replaced"
}

// ---------------- rockets ----------------
var rockets = [];
var rocketBodyM = lamb({ color: 0x4a5a3a });
var rocketTipM = lamb({ color: 0xb03024 });
function fireRocket() {
  var dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  var g = new THREE.Group();
  var body = cyl(0.05, 0.05, 0.45, 8, rocketBodyM, 0, 0, 0); body.rotation.x = Math.PI / 2; g.add(body);
  var tip = cyl(0.001, 0.05, 0.14, 8, rocketTipM, 0, 0, -0.29); tip.rotation.x = -Math.PI / 2; g.add(tip);
  g.add(box(0.02, 0.12, 0.1, rocketBodyM, 0, 0, 0.2));
  g.add(box(0.12, 0.02, 0.1, rocketBodyM, 0, 0, 0.2));
  var start = camera.position.clone().add(dir.clone().multiplyScalar(1.2));
  g.position.copy(start);
  g.lookAt(start.clone().add(dir));
  scene.add(g);
  rockets.push({ mesh: g, x: start.x, y: start.y, z: start.z, dx: dir.x, dy: dir.y, dz: dir.z, life: 6, smokeT: 0 });
  sfx('rocketfire');
}
function detonateRocket(r, i) {
  scene.remove(r.mesh);
  rockets.splice(i, 1);
  boomAt(r.x, r.z);
}
function updateRockets(dt) {
  for (var i = rockets.length - 1; i >= 0; i--) {
    var r = rockets[i];
    var spd = 46;
    r.x += r.dx * spd * dt; r.y += r.dy * spd * dt; r.z += r.dz * spd * dt;
    r.mesh.position.set(r.x, r.y, r.z);
    r.smokeT -= dt;
    if (r.smokeT <= 0) { r.smokeT = 0.035; puff(new THREE.Vector3(r.x - r.dx, r.y - r.dy, r.z - r.dz), 0x999999); }
    r.life -= dt;
    var hit = r.life <= 0 || r.y <= 0.25 || Math.abs(r.x) > HALF || Math.abs(r.z) > HALF;
    if (!hit && r.y < 14) {
      for (var b = 0; b < colliders.length; b++) { var bb = colliders[b]; if (bb.active === false) continue; if (r.x > bb.x0 && r.x < bb.x1 && r.z > bb.z0 && r.z < bb.z1) { hit = true; break; } }
    }
    if (!hit && r.y < 2.4) {
      for (var n = 0; n < npcs.length && !hit; n++) { var nn = npcs[n]; if (nn.state === 'down' || nn.state === 'ragdoll' || nn.state === 'hidden') continue; var dx = nn.x - r.x, dz = nn.z - r.z; if (dx * dx + dz * dz < 1.7) hit = true; }
      for (var cpi = 0; cpi < cops.length && !hit; cpi++) { var cp = cops[cpi]; if (cp.state === 'down') continue; var cdx = cp.x - r.x, cdz = cp.z - r.z; if (cdx * cdx + cdz * cdz < 1.7) hit = true; }
      for (var ci2 = 0; ci2 < cars.length && !hit; ci2++) { var cc = cars[ci2]; if (cc.exploded) continue; var om = cc.car.group.position; if (Math.abs(om.x - r.x) < 2.8 && Math.abs(om.z - r.z) < 2.2) hit = true; }
    }
    if (hit) detonateRocket(r, i);
  }
}

// ---------------- weapon drops ----------------
var drops = [];
function dropMesh(kind) {
  var g = new THREE.Group();
  if (kind === 'pistol') { g.add(box(0.1, 0.12, 0.45, darkMetalM, 0, 0, 0)); g.add(box(0.09, 0.24, 0.13, gripM, 0, -0.14, 0.14)); }
  else if (kind === 'smg') { g.add(box(0.1, 0.13, 0.6, metalM, 0, 0, 0)); g.add(box(0.07, 0.34, 0.1, metalM, 0, -0.2, -0.1)); }
  else if (kind === 'rifle') { g.add(box(0.09, 0.11, 0.95, woodM, 0, 0, 0)); var sc = cyl(0.04, 0.04, 0.3, 8, darkMetalM, 0, 0.1, 0.1); sc.rotation.x = Math.PI / 2; g.add(sc); }
  else if (kind === 'auto') { g.add(box(0.09, 0.12, 0.85, woodM, 0, 0, 0)); var mg = box(0.07, 0.24, 0.11, metalM, 0, -0.15, -0.05); mg.rotation.x = 0.5; g.add(mg); }
  else if (kind === 'raygun') {
    if (hasMeshyProp('raygun')) { var rg = getUfoMesh('raygun', 0.85); rg.position.y = -0.3; g.add(rg); return g; }
    var rb = cyl(0.07, 0.1, 0.5, 8, metalM, 0, 0, 0); rb.rotation.x = Math.PI / 2; g.add(rb);
    g.add(sph(0.09, new THREE.MeshBasicMaterial({ color: 0x66ff88 }), 0, 0, -0.3, 8, 6));
    g.add(box(0.03, 0.2, 0.16, lamb({ color: 0xb02030 }), 0, 0.12, 0.1));
    g.add(box(0.08, 0.2, 0.1, gripM, 0, -0.16, 0.16));
  }
  else { var tb = cyl(0.09, 0.09, 1.0, 10, rocketBodyM, 0, 0, 0); tb.rotation.x = Math.PI / 2; g.add(tb); }
  return g;
}
// put a gun in a skinned character's right hand (cops, armed remote players).
// kind = null/undefined removes it (holstered). NOTE: must only be called at
// runtime, never during script load — dropMesh's gun materials are vars
// defined below and an early call bakes white default materials in.
function attachHeldGun(g, kind) {
  if (g.userData.heldGun) { g.userData.heldGun.parent.remove(g.userData.heldGun); g.userData.heldGun = null; }
  g.userData.heldKind = null;
  if (!kind || !g.userData.handR) return;
  var gun = dropMesh(kind);
  gun.scale.setScalar(0.85);
  gun.position.set(0.02, 0.06, 0.0);
  gun.rotation.set(1.35, 0.3, 0);   // grip in the fist, barrel continuing the aimed forearm (solved w/ copAimArm angles)
  g.userData.handR.add(gun);
  g.userData.heldGun = gun; g.userData.heldKind = kind;
}
function dropWeapon(kind, x, z) {
  var g = dropMesh(kind);
  g.position.set(x, 0.7, z);
  scene.add(g);
  // the one-per-session alien gun never rots on the pavement
  drops.push({ mesh: g, kind: kind, life: kind === 'raygun' ? 9999 : 120 });
}
function applyDropPickup(kind) {
  if (kind === 'soda') {   // streetprops vending soda — stacks like snacks
    state.sodas++;
    popup('+1 SODA (equip it in TAB)');
    sfx('buy');
    if (state.equipped === 'soda') setEquipped('soda');   // refresh held-count HUD
    return;
  }
  if (!WEAPONS[kind]) return;
  if (state.owned[kind]) {
    var refund = Math.floor((WEAPONS[kind].price || 0) / 2);
    state.money += refund;
    popup(refund ? '+$' + refund + ' (sold ' + WEAPONS[kind].name + ')' : 'Already have a ' + WEAPONS[kind].name);
    if (refund) sfx('cash');
  } else {
    state.owned[kind] = true;
    popup('Picked up ' + WEAPONS[kind].name);
    sfx('buy');
  }
}
function updateDrops(dt) {
  for (var i = drops.length - 1; i >= 0; i--) {
    var d = drops[i];
    d.mesh.rotation.y += dt * 1.6;
    d.mesh.position.y = 0.7 + Math.sin(T * 2.2 + i) * 0.12;
    var dx = player.x - d.mesh.position.x, dz = player.z - d.mesh.position.z;
    if (!state.dead && dx * dx + dz * dz < 2.6) {
      if (d.net) {
        // host owns drops in multiplayer — ask, and take it when granted
        if (d.pend && T - (d.pendT || 0) > 1.5) d.pend = false;
        if (!d.pend) { d.pend = true; d.pendT = T; netToHost({ t: 'takeDrop', x: d.mesh.position.x, z: d.mesh.position.z }); }
        continue;
      }
      applyDropPickup(d.kind);
      scene.remove(d.mesh); drops.splice(i, 1);
      continue;
    }
    if (d.net) continue;   // lifetime is the host's call
    d.life -= dt;
    if (d.life <= 0) { scene.remove(d.mesh); drops.splice(i, 1); }
  }
}

// ---------------- UFO easter egg (local-only, like drops/interiors) ----------
// Someone hits $100k -> a saucer drifts low over town. Shoot it down, wait by
// the wreck, survive the survivor, take its gun.
var UFO_MONEY = 100000;
var ufo = null, ufoTriggered = false, alien = null;
var beams = [];
function spawnBeam(x1, y1, z1, x2, y2, z2, color) {
  var dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
  var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
  var m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 5),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.95 }));
  m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  m.quaternion.setFromUnitVectors(Y_UP, new THREE.Vector3(dx / len, dy / len, dz / len));
  scene.add(m);
  beams.push({ mesh: m, life: 0.1 });
}
function netBeam(x1, y1, z1, x2, y2, z2) {
  // host mirrors alien laser fire so every player sees the light show
  if (net.mode === 'host' && net.conns.length) {
    netBroadcast({ t: 'beam', a: [Math.round(x1 * 10) / 10, Math.round(y1 * 10) / 10, Math.round(z1 * 10) / 10, Math.round(x2 * 10) / 10, Math.round(y2 * 10) / 10, Math.round(z2 * 10) / 10] });
  }
}
var ufoMeshCache = {};
function hasMeshyProp(name) {
  if (typeof MESHY_UFO === 'undefined') return false;
  for (var i = 0; i < MESHY_UFO.length; i++) if (MESHY_UFO[i].n === name) return true;
  return false;
}
function getUfoMesh(name, len) {
  // real Meshy model when meshyufo.js is loaded, procedural saucer otherwise
  var ck = name + '_' + (len || 13);
  if (ufoMeshCache[ck]) return ufoMeshCache[ck].clone();
  var g = new THREE.Group();
  var e = null;
  if (typeof MESHY_UFO !== 'undefined') for (var i = 0; i < MESHY_UFO.length; i++) if (MESHY_UFO[i].n === name) e = MESHY_UFO[i];
  if (e) {
    var qp = new Int16Array(b64Bytes(e.p).buffer), qu = new Uint16Array(b64Bytes(e.u).buffer);
    var fp = new Float32Array(qp.length), fu = new Float32Array(qu.length);
    for (i = 0; i < qp.length; i++) fp[i] = qp[i] / e.q;
    for (i = 0; i < qu.length; i += 2) { fu[i] = qu[i] / 8192; fu[i + 1] = 1 - qu[i + 1] / 8192; }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(fu, 2));
    geo.computeVertexNormals();
    var im = new Image();
    var tx = new THREE.Texture(im);
    tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false;
    im.onload = function () { tx.needsUpdate = true; };
    im.src = e.tex;
    var mm = new THREE.Mesh(geo, lamb({ map: tx }));
    var s = (len || 13) / (e.dims && e.dims[0] || 13);
    mm.scale.set(s, s, s);
    g.add(mm);
  } else {
    // placeholder saucer
    var hullM = phong({ color: 0x9aa4b0, shininess: 80, specular: 0xccddee });
    var top = cyl(1.2, 6.4, 1.4, 14, hullM, 0, 0.7, 0);
    var bot = cyl(6.4, 2.2, 1.1, 14, hullM, 0, -0.5, 0);
    g.add(top, bot);
    g.add(sph(1.7, phong({ color: name === 'ufo_dead' ? 0x333a40 : 0x3f82ae, shininess: 100, specular: 0xffffff, transparent: true, opacity: 0.8 }), 0, 1.7, 0, 12, 9));
    for (var li = 0; li < 8; li++) {
      var a2 = li / 8 * Math.PI * 2;
      g.add(sph(0.28, new THREE.MeshBasicMaterial({ color: name === 'ufo_dead' ? 0x442222 : 0xffe08a }), Math.cos(a2) * 5.4, 0.1, Math.sin(a2) * 5.4, 6, 5));
    }
    if (name === 'ufo_dead') { g.rotation.z = 0; g.traverse(function (o) { if (o.material && o.material.color && o.material.shininess) o.material.color.multiplyScalar(0.55); }); }
  }
  ufoMeshCache[ck] = g;
  return g.clone();
}
var ufoHum = null;
function startUfoHum() {
  if (!ac || ufoHum) return;
  var o1 = ac.createOscillator(), o2 = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain();
  var f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
  var g = ac.createGain(); g.gain.value = 0;
  o1.type = 'sawtooth'; o1.frequency.value = 58;
  o2.type = 'sine'; o2.frequency.value = 87;
  lfo.type = 'sine'; lfo.frequency.value = 5.5; lg.gain.value = 22;
  lfo.connect(lg); lg.connect(o1.frequency);
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(ac.destination);
  o1.start(); o2.start(); lfo.start();
  ufoHum = { g: g, nodes: [o1, o2, lfo] };
}
function stopUfoHum() {
  if (!ufoHum) return;
  var h = ufoHum; ufoHum = null;
  h.g.gain.value = 0;
  h.nodes.forEach(function (n) { try { n.stop(); } catch (e) { } });
}
function spawnUfo() {
  if (ufo) return;
  var a = Math.random() * Math.PI * 2;
  var sx = Math.cos(a) * (HALF + 60), sz = Math.sin(a) * (HALF + 60);
  var tx2 = -Math.cos(a) * (HALF + 60) + (Math.random() - 0.5) * 160;
  var tz2 = -Math.sin(a) * (HALF + 60) + (Math.random() - 0.5) * 160;
  var d = Math.sqrt((tx2 - sx) * (tx2 - sx) + (tz2 - sz) * (tz2 - sz));
  var g = getUfoMesh('ufo');
  g.position.set(sx, 30, sz);
  g.userData.ufo = true;
  g.traverse(function (o) { o.userData.ufo = true; });
  scene.add(g);
  ufo = { mode: 'fly', group: g, hp: 1680, vx: (tx2 - sx) / d * 6.5, vz: (tz2 - sz) / d * 6.5, dist: 0, maxDist: d, vy: 0, spin: 1, smokeT: 0, crashT: 0, alienAt: 0 };
  startUfoHum();
}
function damageUfo(dmg, hitPoint) {
  if (!ufo || ufo.mode !== 'fly') return;
  ufo.hp -= dmg;
  if (hitPoint) puff(hitPoint, 0xffe08a);
  if (ufo.hp <= 0) {
    ufo.mode = 'falling'; ufo.spin = 4.5;
    popup2('UFO HIT!');
  }
}
function crashUfo() {
  var p = ufo.group.position;
  var x = Math.max(-HALF + 20, Math.min(HALF - 20, p.x));
  var z = Math.max(-HALF + 20, Math.min(HALF - 20, p.z));
  scene.remove(ufo.group);
  var g = getUfoMesh('ufo_dead');
  g.position.set(x, 0.6, z);
  g.rotation.set(0.16, Math.random() * Math.PI * 2, -0.12);
  scene.add(g);
  ufo.group = g; ufo.mode = 'crashed'; ufo.crashT = T; ufo.alienAt = T + 20;
  boomAt(x, z);
  panicNear(x, z, 2400);
  stopUfoHum();
}
function spawnAlien(x, z, isNet) {
  var mesh = null;
  if (typeof MESHY_ROLE !== 'undefined' && MESHY_ROLE.alien !== undefined) {
    mesh = buildMeshySkinned(randomCharConfig(seededRng(51)), MESHY_ROLE.alien);
  } else {
    mesh = buildPerson('#9aa2ac', '#8a8f94', 0xaeb6be, { hairColor: 0x9aa2ac });   // placeholder
  }
  var p = pushOut(x, z, 0.6);
  mesh.position.set(p.x, 0, p.z);
  mesh.userData.alien = true;
  mesh.traverse(function (o) { o.userData.alien = true; });
  scene.add(mesh);
  alien = { mesh: mesh, x: p.x, z: p.z, hp: 600, state: 'hunt', fireT: 2.5, phase: Math.random() * 9, deadT: 0, hurtFlash: 0, net: !!isNet };
  popup2('SOMETHING CRAWLED OUT OF THE WRECK');
}
function damageAlien(dmg, kx, kz) {
  if (!alien || alien.state === 'dead') return;
  alien.hp -= dmg;
  alien.hurtFlash = 0.12;
  alien.x += (kx || 0) * 0.15; alien.z += (kz || 0) * 0.15;
  if (alien.hp <= 0) {
    alien.state = 'dead'; alien.deadT = T;
    dropWeapon('raygun', alien.x, alien.z);
    popup2('ALIEN DOWN — IT DROPPED SOMETHING');
    spawnCash(alien.x, alien.z, 200 + ((Math.random() * 300) | 0));
  }
}
function updateAlien(dt) {
  if (!alien) return;
  var m = alien.mesh;
  if (alien.hurtFlash > 0) { alien.hurtFlash -= dt; m.position.y = alien.hurtFlash > 0 ? 0.06 : 0; }
  if (alien.state === 'dead') {
    // keel over, then fade out
    var k = Math.min(1, (T - alien.deadT) / 0.7);
    m.rotation.x = -1.5 * k;
    m.position.y = 0.25 * k;
    if (T - alien.deadT > 12) { scene.remove(m); alien = null; }
    return;
  }
  if (alien.net) {
    // client mirror: host drives position + fire, we just animate what we see
    var mdx = alien.x - (alien.lx === undefined ? alien.x : alien.lx);
    var mdz = alien.z - (alien.lz === undefined ? alien.z : alien.lz);
    var mvd = Math.sqrt(mdx * mdx + mdz * mdz);
    alien.lx = alien.x; alien.lz = alien.z;
    alien.phase += mvd * 3.4;
    m.position.set(alien.x, m.position.y, alien.z);
    m.rotation.y = alien.tyaw || 0;
    animPerson(m, mvd / Math.max(dt, 0.001) > 0.5 ? 2.6 : 0, dt, alien.phase);
    m.updateMatrixWorld(true);
    return;
  }
  // host/singleplayer: hunt the nearest living player, local or remote
  var tx = player.x, tz = player.z, ty = player.y, tid = null;
  var tdx0 = player.x - alien.x, tdz0 = player.z - alien.z;
  var td = (state.dead || inside) ? 1e9 : Math.sqrt(tdx0 * tdx0 + tdz0 * tdz0);
  for (var rid in net.remotes) {
    var rr = net.remotes[rid];
    if (rr.dead || rr.y < -30) continue;   // dead or hiding in the interior under the map
    var qx = rr.x - alien.x, qz = rr.z - alien.z, qd = Math.sqrt(qx * qx + qz * qz);
    if (qd < td) { td = qd; tx = rr.x; tz = rr.z; ty = rr.y || EYE; tid = rid; }
  }
  var dx = tx - alien.x, dz = tz - alien.z;
  var d = Math.max(0.001, td);
  var moving = d > 13 && d < 1e8;
  if (moving) {
    var sp = 2.6;
    var np2 = pushOut(alien.x + dx / d * sp * dt, alien.z + dz / d * sp * dt, 0.55);
    alien.x = np2.x; alien.z = np2.z;
    alien.phase += sp * dt * 3.4;
  }
  m.position.set(alien.x, m.position.y, alien.z);
  m.rotation.y = Math.atan2(dx, dz);
  animPerson(m, moving ? 2.6 : 0, dt, alien.phase);
  m.updateMatrixWorld(true);
  // laser fire: hurts more than any bullet in town
  alien.fireT -= dt;
  if (alien.fireT <= 0 && d < 60) {
    alien.fireT = 1.35;
    var hy = 1.5;
    sfx('laser', { x: alien.x, z: alien.z, range: 130 });
    var hitChance = 0.8 * Math.max(0.25, 1 - d / 70);
    if (tid) {
      // remote victim: their client applies the damage (car redirect included)
      var rDrv = net.remotes[tid] && net.remotes[tid].drv;
      var rHit = !rDrv && Math.random() < hitChance;
      var bx = tx + (rHit ? 0 : (Math.random() - 0.5) * 4), bz = tz + (rHit ? 0 : (Math.random() - 0.5) * 4);
      spawnBeam(alien.x, hy, alien.z, bx, ty - 0.1, bz, 0xd050ff);
      netBeam(alien.x, hy, alien.z, bx, ty - 0.1, bz);
      if (rHit) netSendHit(tid, 45);
      else if (rDrv) netSendHit(tid, 12);   // their 'hit' handler doubles it into the car: 24, same as the local miss-branch
    } else if (Math.random() < hitChance && !driving) {
      spawnBeam(alien.x, hy, alien.z, player.x, player.y - 0.1, player.z, 0xd050ff);
      netBeam(alien.x, hy, alien.z, player.x, player.y - 0.1, player.z);
      hurtPlayer(45);
    } else {
      // miss (or slammed into your car) — beam goes wide
      var mx = player.x + (Math.random() - 0.5) * 4, mz = player.z + (Math.random() - 0.5) * 4;
      var my = player.y - 0.4 + Math.random();
      spawnBeam(alien.x, hy, alien.z, mx, my, mz, 0xd050ff);
      netBeam(alien.x, hy, alien.z, mx, my, mz);
      if (driving) {
        driving.carHP = (driving.carHP === undefined ? 100 : driving.carHP) - 24;
        if (driving.carHP <= 0) igniteCar(driving);
      }
    }
  }
}
function updateUfo(dt) {
  for (var bi = beams.length - 1; bi >= 0; bi--) {
    var b = beams[bi];
    b.life -= dt;
    b.mesh.material.opacity = Math.max(0, b.life / 0.1) * 0.95;
    if (b.life <= 0) { scene.remove(b.mesh); beams.splice(bi, 1); }
  }
  if (!ufoTriggered && state.money >= UFO_MONEY && state.running) {
    ufoTriggered = true;   // once per session, server-wide — the latch never resets
    if (isClient()) netToHost({ t: 'ufoTrig' });
    else spawnUfo();
  }
  updateAlien(dt);
  if (!ufo) return;
  var g = ufo.group, p = g.position;
  if (ufo.net) {
    // client mirror: position/mode stream in via world snapshots; run the looks
    if (ufo.mode === 'fly') {
      g.rotation.y += dt * 1;
      if (!ufoHum) startUfoHum();
      if (ufoHum) {
        var hd2 = Math.sqrt((p.x - player.x) * (p.x - player.x) + (p.z - player.z) * (p.z - player.z) + (p.y - player.y) * (p.y - player.y));
        ufoHum.g.gain.value = Math.max(0, 1 - hd2 / 220) * 0.4;
      }
    } else if (ufo.mode === 'falling') {
      g.rotation.y += dt * 4.5;
      g.rotation.z = Math.min(0.5, (g.rotation.z || 0) + dt * 0.35);
      ufo.smokeT -= dt;
      if (ufo.smokeT <= 0) { ufo.smokeT = 0.08; puff(new THREE.Vector3(p.x, p.y + 1, p.z), 0x333333); }
      if (ufoHum) ufoHum.g.gain.value = Math.max(0, 1 - Math.abs(p.y) / 60) * 0.5;
    } else if (ufo.mode === 'crashed') {
      ufo.smokeT -= dt;
      if (ufo.smokeT <= 0 && T - ufo.crashT < 90) {
        ufo.smokeT = 0.35;
        puff(new THREE.Vector3(p.x + (Math.random() - 0.5) * 5, 1.5 + Math.random() * 2, p.z + (Math.random() - 0.5) * 5), 0x2a2a2a);
      }
    }
    return;
  }
  if (ufo.mode === 'fly') {
    p.x += ufo.vx * dt; p.z += ufo.vz * dt;
    ufo.dist += Math.sqrt(ufo.vx * ufo.vx + ufo.vz * ufo.vz) * dt;
    p.y = 30 + Math.sin(T * 0.7) * 1.6;
    g.rotation.y += dt * ufo.spin;
    if (ufoHum) {
      var hd = Math.sqrt((p.x - player.x) * (p.x - player.x) + (p.z - player.z) * (p.z - player.z) + (p.y - player.y) * (p.y - player.y));
      ufoHum.g.gain.value = Math.max(0, 1 - hd / 220) * 0.4;
    }
    if (ufo.dist > ufo.maxDist + 80) { scene.remove(g); stopUfoHum(); ufo = null; }   // got away
  } else if (ufo.mode === 'falling') {
    ufo.vy -= 12 * dt;
    p.x += ufo.vx * 0.6 * dt; p.z += ufo.vz * 0.6 * dt;
    p.y += ufo.vy * dt;
    g.rotation.y += dt * ufo.spin;
    g.rotation.z = Math.min(0.5, (g.rotation.z || 0) + dt * 0.35);
    ufo.smokeT -= dt;
    if (ufo.smokeT <= 0) { ufo.smokeT = 0.08; puff(new THREE.Vector3(p.x, p.y + 1, p.z), 0x333333); }
    if (ufoHum) ufoHum.g.gain.value = Math.max(0, 1 - Math.abs(p.y) / 60) * 0.5;
    if (p.y <= 1.2) crashUfo();
  } else if (ufo.mode === 'crashed') {
    ufo.smokeT -= dt;
    if (ufo.smokeT <= 0 && T - ufo.crashT < 90) {
      ufo.smokeT = 0.35;
      puff(new THREE.Vector3(p.x + (Math.random() - 0.5) * 5, 1.5 + Math.random() * 2, p.z + (Math.random() - 0.5) * 5), 0x2a2a2a);
    }
    if (!alien && ufo.alienAt && T >= ufo.alienAt) { ufo.alienAt = 0; spawnAlien(p.x + 6, p.z + 2); }
    if (T - ufo.crashT > 300) { scene.remove(g); ufo = null; }   // wreck recovered by, uh, nobody
  }
}

// ---------------- NPC logic (wander) ----------------
function damageNPC(n, dmg, kx, kz, silent) {
  if (n.state === 'down' || n.state === 'hidden') return;
  breakNpcChat(n);   // taking damage ends a conversation mid-line
  // hit reaction plays even for client-caused (silent) damage so both peers hear
  // it — silent only suppresses the host's popup/kill-credit, not the world's audio
  if (!playNpcVoice(n.vname, 'hit', 0.65, 4, { x: n.x, z: n.z, yell: true, net: 1, ref: n })) playVoiceAny(n.fem ? ['pedf_hit', 'pedf_hit_2'] : ['pedm_hit_1', 'pedm_hit_2', 'pedo_hit'], 0.6, 'pedHit', 5, { x: n.x, z: n.z, yell: true, net: 1, ref: n });
  n.hp -= dmg; n.hurtFlash = 0.12; n.x += (kx || 0) * 0.5; n.z += (kz || 0) * 0.5;
  lastCrimeT = T;
  if (n.hp <= 0) {
    n.state = 'down'; n.downT = 8; if (n.mesh.userData.shadow) n.mesh.userData.shadow.visible = false;
    stopNpcVoice(n.vname);
    spawnCash(n.x, n.z, 5 + ((Math.random() * 18) | 0)); sfx('ko', { x: n.x, z: n.z, range: 50 }); sfx('grunt', { x: n.x, z: n.z, range: 50 });
    if (!silent) {
      popup('KO!');
      creditCivKill();
    }
  } else {
    sfx('hit', { x: n.x, z: n.z, range: 50 });
    if (!meleeHit) { n.bleedT = 6 + Math.random() * 3; n.dripT = 0; }   // gunshot wound: leaks a trail until it clots
    if (n.state !== 'fight') {
      n.state = 'hitreact'; n.animT = 0; n.stateT = 0.6;
      n.hitClip = meleeHit ? 'hitpunch' : 'hitshot';
      n.afterFight = meleeHit && Math.random() < 0.4;
    }
  }
  for (var i = 0; i < npcs.length; i++) { var o = npcs[i]; if (o === n || (o.state !== 'walk' && o.state !== 'chat')) continue; var dx = o.x - n.x, dz = o.z - n.z; if (dx * dx + dz * dz < 170) startFlee(o); }
}
function startFlee(n) { if (n.state === 'down') return; breakNpcChat(n); n.state = 'flee'; n.dodge = false; n.fleeT = 4 + Math.random() * 3; var dx = n.x - player.x, dz = n.z - player.z; var d = Math.sqrt(dx * dx + dz * dz) || 1; n.fleeDX = dx / d; n.fleeDZ = dz / d; }
function panicNear(x, z, r2) { var fled = null; for (var i = 0; i < npcs.length; i++) { var o = npcs[i]; if (o.state !== 'walk' && o.state !== 'chat') continue; var dx = o.x - x, dz = o.z - z; if (dx * dx + dz * dz < r2) { startFlee(o); if (!fled || o.vname) fled = o; } } if (fled && !playNpcVoice(fled.vname, 'gunscared', 0.65, 10, { x: fled.x, z: fled.z, yell: true, net: 1, ref: fled })) playVoiceAny(fled.fem ? ['pedf_gun'] : ['pedm_gun'], 0.6, 'pedGun', 16, { x: fled.x, z: fled.z, yell: true, net: 1, ref: fled }); }

var npcSocialT = 0, npcBumpT = -99, meleeHit = false, npcAnimF = 0;
// hard-stop a sidewalk conversation (participant hit/killed/fleeing/dodging a
// car): both sides go back to wandering, the turn timer dies with the pair
// owner, and any in-flight chat/story line is cut short.
function breakNpcChat(n) {
  if (!n || n.state !== 'chat') return;
  n.state = 'walk'; n.convT = 0; stopNpcVoice(n.vname);
  var pr = npcs[n.partner];
  if (pr && pr.state === 'chat') { pr.state = 'walk'; pr.convT = 0; stopNpcVoice(pr.vname); }
}
// speak a conversation line, falling back to plain small talk when the
// character's pack lacks the category; true only when `cat` itself played
function npcChatLine(n, cat) {
  if (!n || !n.vname) return false;
  // net:1 — sidewalk conversations are shared-world ambient chatter: the host
  // broadcasts them so joined clients hear the same back-and-forth positionally
  if (playNpcVoice(n.vname, cat, 0.55, 2, { x: n.x, z: n.z, net: 1, ref: n })) return true;
  playNpcVoice(n.vname, 'chat', 0.55, 2, { x: n.x, z: n.z, net: 1, ref: n });
  return false;
}
function updateNPCs(dt) {
  if (isClient()) { updateNPCExtras(); return; }   // npcs mirrored from host snapshot
  // sample car velocities (player/remote-driven cars have no analytic speed —
  // approximate from last frame's position delta, same idea as _bx/_bz in
  // updateWorldFx but sampled here so the delta isn't already consumed)
  if (dt > 0) for (var vci = 0; vci < cars.length; vci++) {
    var vc = cars[vci], vm = vc.car.group.position;
    if (vc._nx !== undefined) { vc._pvx = (vm.x - vc._nx) / dt; vc._pvz = (vm.z - vc._nz) / dt; }
    vc._nx = vm.x; vc._nz = vm.z;
  }
  npcSocialT -= dt;
  if (npcSocialT <= 0) {
    npcSocialT = 1.2;
    // occasionally pair up two nearby walkers for a chat
    if (Math.random() < 0.35) {
      outer:
      for (var ci = 0; ci < npcs.length; ci++) {
        var a = npcs[ci];
        if (a.state !== 'walk') continue;
        for (var cj = ci + 1; cj < npcs.length; cj++) {
          var b2 = npcs[cj];
          if (b2.state !== 'walk') continue;
          var cdx = a.x - b2.x, cdz = a.z - b2.z;
          if (cdx * cdx + cdz * cdz < 12) {
            a.state = 'chat'; b2.state = 'chat';
            a.partner = cj; b2.partner = ci;
            a.chatRole = 0; b2.chatRole = 1;
            a.stateT = b2.stateT = (a.vname || b2.vname) ? 8 + Math.random() * 6 : 5 + Math.random() * 6;
            a.animT = 0; b2.animT = 1.1;
            // alternating conversation: the pair owner (chatRole 0) drives the
            // turn timer. A named opener asks a question (chatQ), then the
            // other side reacts (chatA/story) every few seconds — see the
            // 'chat' state block below.
            var op = a.vname ? a : b2;
            npcChatLine(op, 'chatQ');
            a.convTurn = op === a ? 1 : 0;   // who speaks NEXT (0 = a, 1 = partner)
            a.convT = 3 + Math.random() * 1.5;
            a.convTot = a.stateT;            // planned total, for the ~20s story cap
            break outer;
          }
        }
      }
    }
    // named walkers throw a signature line when the player strolls past
    if (!state.dead && !inside && !driving && Math.random() < 0.22) {
      for (var qi = 0; qi < npcs.length; qi++) {
        var qn = npcs[qi];
        if (!qn.vname || qn.state !== 'walk') continue;
        var qdx = qn.x - player.x, qdz = qn.z - player.z;
        if (qdx * qdx + qdz * qdz < 20) { playNpcVoice(qn.vname, 'quirk', 0.55, 25, { x: qn.x, z: qn.z, ref: qn }); break; }
      }
    }
    // bump reaction: player shoving through someone
    if (!state.dead && !inside && !driving) {
      for (var bi = 0; bi < npcs.length; bi++) {
        var bn = npcs[bi];
        if (bn.state !== 'walk' && bn.state !== 'stand') continue;
        var bdx = bn.x - player.x, bdz = bn.z - player.z;
        if (bdx * bdx + bdz * bdz < 0.9 && T - npcBumpT > 6) {
          npcBumpT = T;
          if (!playNpcVoice(bn.vname, 'bump', 0.55, 4, { x: bn.x, z: bn.z, ref: bn })) playVoiceAny(bn.fem ? ['pedf_hit', 'pedf_hit_2'] : ['pedm_hit_2', 'pedo_hit'], 0.5, 'pedBump', 6, { x: bn.x, z: bn.z, ref: bn });
          bn.state = 'stand'; bn.stateT = 1.4; bn.animT = 0; bn.idleVar = false;
          bn.mesh.rotation.y = Math.atan2(-bdx, -bdz);
        }
      }
    }
  }
  npcAnimF++;   // LOD frame counter: distant NPCs repose every 3rd frame
  for (var i = 0; i < npcs.length; i++) {
    var n = npcs[i], m = n.mesh;
    // anim LOD: skinned repose is the NPC sim's hot path — NPCs >120u from
    // the player hold their last pose 2 of every 3 frames (phase/animT keep
    // accumulating, so the pose stays correct when it does update)
    var adx2 = n.x - player.x, adz2 = n.z - player.z;
    var animSkip = adx2 * adx2 + adz2 * adz2 > 14400 && (npcAnimF + i) % 3 !== 0;
    if (n.hurtFlash > 0) { n.hurtFlash -= dt; m.position.y = n.hurtFlash > 0 ? 0.06 : 0; }
    // street smarts: bail out perpendicular when a car bears down on you
    if ((n.state === 'walk' || n.state === 'stand' || n.state === 'chat') && T > (n.dodgeCD || 0)) {
      var thr = npcCarThreat(n);
      if (thr) {
        breakNpcChat(n);   // a car bearing down trumps the conversation
        n.state = 'flee'; n.dodge = true; n.fleeT = 0.9 + Math.random() * 0.3;
        n.fleeDX = thr.x; n.fleeDZ = thr.z; n.dodgeCD = T + 2;
        if (!playNpcVoice(n.vname, 'bump', 0.6, 3, { x: n.x, z: n.z, yell: true, net: 1, ref: n })) playVoiceAny(n.fem ? ['pedf_hit', 'pedf_hit_2'] : ['pedm_hit_1', 'pedm_hit_2'], 0.55, 'pedDodge', 4, { x: n.x, z: n.z, yell: true, net: 1, ref: n });
      }
    }
    if (n.state === 'ragdoll') {
      n.vy -= 24 * dt;
      n.airY += n.vy * dt;
      n.x += n.vx * dt; n.z += n.vz * dt;
      n.x = Math.max(-HALF + 3, Math.min(HALF - 3, n.x));
      n.z = Math.max(-HALF + 3, Math.min(HALF - 3, n.z));
      m.rotation.x += n.spinX * dt;
      m.rotation.z += n.spinZ * dt;
      if (n.airY <= 0) {
        n.airY = 0; n.state = 'down'; n.downT = 8;
        m.rotation.x = -1.5; m.rotation.z = 0;
        bloodDecal(n.x, n.z);
      }
      m.position.set(n.x, n.airY, n.z);
      continue;
    }
    if (n.state === 'down') {
      n.downT -= dt; m.rotation.x = Math.max(-1.45, m.rotation.x - dt * 7);
      if (n.downT <= 0) {
        if (npcDoors.length) {
          // replacement pedestrian WALKS OUT of a building entrance instead of
          // popping into existence: brief hidden dwell, then the door emit below
          n.doorI = (Math.random() * npcDoors.length) | 0;
          n.state = 'hidden'; n.dwellT = 0.6 + Math.random() * 2.5; n.hp = 100;
          m.visible = false; if (m.userData.shadow) m.userData.shadow.visible = false;
        } else { assignNpcHome(n); setNpcTarget(n); n.hp = 100; n.state = 'walk'; m.rotation.x = 0; if (m.userData.shadow) m.userData.shadow.visible = true; }
      }
      m.position.set(n.x, m.position.y, n.z); continue;
    }
    if (n.state === 'hidden') {
      // inside a building — invisible, unhittable; re-emerge from the door
      n.dwellT -= dt;
      if (n.dwellT <= 0) {
        var hd = npcDoors[n.doorI];
        if (hd) {
          n.x = hd.sx; n.z = hd.sz;
          n.tx = hd.sx + hd.nx * (6 + Math.random() * 7); n.tz = hd.sz + hd.nz * (6 + Math.random() * 7);
          m.rotation.y = hd.yaw;
        } else { assignNpcHome(n); setNpcTarget(n); }
        n.wayX = undefined; n.wayZ = undefined; n.doorSeek = undefined;
        n.state = 'walk'; n.hp = 100; n.stuckT = 0; n.roadT = 0;
        m.rotation.x = 0; m.visible = true;
        if (m.userData.shadow) m.userData.shadow.visible = true;
        m.position.set(n.x, 0, n.z);
      }
      continue;
    }
    if (n.state === 'stand') {
      n.stateT -= dt; n.animT += dt;
      if (!animSkip) animPersonClip(m, n.idleVar ? 'idle2' : 'idle', n.animT);
      if (n.stateT <= 0) { n.state = 'walk'; setNpcTarget(n); }
      m.position.set(n.x, 0, n.z);
      continue;
    }
    if (n.state === 'chat') {
      n.stateT -= dt; n.animT += dt;
      var pr = npcs[n.partner];
      var prx = pr ? pr.x - n.x : 0, prz = pr ? pr.z - n.z : 0;
      if (!pr || pr.state !== 'chat' || prx * prx + prz * prz > 49) {
        // partner got hit/fled/ragdolled/moved away — abort, cut our line short
        n.state = 'walk'; n.convT = 0; stopNpcVoice(n.vname);
        continue;
      }
      m.rotation.y = Math.atan2(prx, prz);
      if (!animSkip) animPersonClip(m, n.chatRole ? 'talk' : 'chat', n.animT);
      // conversation turns (owner side only): every ~3-4.5s the next speaker
      // reacts with a chatA line; ~15% of turns become a story instead, and
      // the reply then waits ~9-12s so the anecdote can finish.
      if (!n.chatRole && n.convT > 0) {
        n.convT -= dt;
        if (n.convT <= 0) {
          var sp = n.convTurn ? pr : n;
          var didStory = false;
          if (Math.random() < 0.15) didStory = npcChatLine(sp, 'story');
          else npcChatLine(sp, 'chatA');
          n.convT = didStory ? 9 + Math.random() * 3 : 3 + Math.random() * 1.5;
          if (didStory) {   // extend the chat so the story isn't cut mid-anecdote
            var ext = Math.min(n.convT + 1.5 - n.stateT, 20 - (n.convTot || 0));
            if (ext > 0) { n.stateT += ext; pr.stateT += ext; n.convTot = (n.convTot || 0) + ext; }
          }
          n.convTurn = n.convTurn ? 0 : 1;
        }
      }
      if (n.stateT <= 0) { n.state = 'walk'; pr.state = 'walk'; n.convT = pr.convT = 0; }
      m.position.set(n.x, 0, n.z);
      continue;
    }
    if (n.state === 'hitreact') {
      n.stateT -= dt; n.animT += dt;
      animPersonClip(m, n.hitClip || 'hitpunch', n.animT, true, 0.6);   // fit the whole flinch into the 0.6s react window
      if (n.stateT <= 0) {
        if (n.afterFight && !state.dead && !inside) { n.state = 'fight'; n.fightT = 4 + Math.random() * 3; n.jabT = 0.7; n.animT = 0; }
        else startFlee(n);
      }
      m.position.set(n.x, 0, n.z);
      continue;
    }
    if (n.state === 'fight') {
      n.fightT -= dt;
      var fdx = player.x - n.x, fdz = player.z - n.z, fd = Math.sqrt(fdx * fdx + fdz * fdz) || 1;
      m.rotation.y = Math.atan2(fdx, fdz);
      if (n.fightT <= 0 || n.hp < 35 || state.dead || fd > 9) { startFlee(n); continue; }
      if (fd > 1.5) {
        n.x += fdx / fd * 3.2 * dt; n.z += fdz / fd * 3.2 * dt;
        var fpos = pushOut(n.x, n.z, 0.45); n.x = fpos.x; n.z = fpos.z;
        n.phase += 3.2 * dt * 3.4;
        animPerson(m, 3.2, dt, n.phase);
      } else {
        n.animT += dt; n.jabT -= dt;
        animPersonClip(m, 'jab', (n.animT % 1.1), true, 1.1);   // full jab per 1.1s cycle so the strike lands with the damage
        if (n.jabT <= 0) { n.jabT = 1.1; n.animT = 0; if (fd < 1.9) { hurtPlayer(4 + ((Math.random() * 4) | 0)); sfx('hit', { x: n.x, z: n.z, range: 40 }); } }
      }
      m.position.set(n.x, 0, n.z);
      continue;
    }
    var vx = 0, vz = 0, spd = n.speed;
    if (n.state === 'flee') {
      n.fleeT -= dt; spd = n.dodge ? 7.4 : 4.6; vx = n.fleeDX; vz = n.fleeDZ; if (n.fleeT <= 0) { n.state = 'walk'; n.dodge = false; }
    } else {
      if (n.pause > 0) { n.pause -= dt; if (!animSkip) animPerson(m, 0, dt); continue; }
      var gx = n.wayX !== undefined ? n.wayX : n.tx, gz = n.wayX !== undefined ? n.wayZ : n.tz;
      var dx = gx - n.x, dz = gz - n.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d < 1) {
        if (n.wayX !== undefined) { n.wayX = undefined; n.wayZ = undefined; continue; }   // crosswalk reached: carry on to the real target
        if (n.doorSeek !== undefined) {
          // reached the doorway: step inside (hidden dwell, re-emerge later)
          breakNpcChat(n); stopNpcVoice(n.vname);
          n.doorI = n.doorSeek; n.doorSeek = undefined;
          n.state = 'hidden'; n.dwellT = 9 + Math.random() * 28;
          m.visible = false; if (m.userData.shadow) m.userData.shadow.visible = false;
          continue;
        }
        // errands: sometimes head into a nearby building instead of wandering on
        if (Math.random() < 0.14 && npcDoors.length) {
          var bestDoor = -1, bestDD = 32 * 32;
          for (var dsi = 0; dsi < npcDoors.length; dsi++) {
            var dsd = npcDoors[dsi];
            var ddx2 = dsd.sx - n.x, ddz2 = dsd.sz - n.z, dd2 = ddx2 * ddx2 + ddz2 * ddz2;
            if (dd2 < bestDD && dd2 > 9) { bestDD = dd2; bestDoor = dsi; }
          }
          if (bestDoor >= 0) {
            var dgo = npcDoors[bestDoor];
            n.doorSeek = bestDoor;
            n.wayX = dgo.sx; n.wayZ = dgo.sz;   // approach the stoop first...
            n.tx = dgo.x; n.tz = dgo.z;         // ...then the door itself
            continue;
          }
        }
        setNpcTarget(n);
        if (Math.random() < 0.3) { n.state = 'stand'; n.stateT = 2.5 + Math.random() * 6; n.animT = Math.random() * 3; n.idleVar = Math.random() < 0.4; }
        continue;
      }
      vx = dx / d; vz = dz / d;
      // steer around obstacles BEFORE contact: probe ~1.5u ahead every 3rd
      // frame; if blocked, hold the first clear side bearing for a beat instead
      // of grinding into the wall until pushOut + stuck-detection bail us out
      if (n.avoidT > 0) { n.avoidT -= dt; vx = n.avoidVX; vz = n.avoidVZ; }
      else if ((npcAnimF + i) % 3 === 0 && d > 2.2 && n.doorSeek === undefined) {   // doorway targets sit ON a wall face — don't steer away from them
        var lookA = 1.5 + spd * 0.22;
        if (!pointFree(n.x + vx * lookA, n.z + vz * lookA, 0.45)) {
          for (var aw = 0; aw < 4; aw++) {
            var ang = (aw < 2 ? 0.66 : 1.25) * (aw % 2 === 0 ? 1 : -1);   // ±38°, then ±72°
            var ca2 = Math.cos(ang), sa2 = Math.sin(ang);
            var wx = vx * ca2 - vz * sa2, wz = vx * sa2 + vz * ca2;
            if (pointFree(n.x + wx * lookA, n.z + wz * lookA, 0.45)) { n.avoidVX = wx; n.avoidVZ = wz; n.avoidT = 0.35; vx = wx; vz = wz; break; }
          }
        }
      }
    }
    var preX = n.x, preZ = n.z;
    n.x += vx * spd * dt; n.z += vz * spd * dt;
    n.x = Math.max(-HALF + 3, Math.min(HALF - 3, n.x)); n.z = Math.max(-HALF + 3, Math.min(HALF - 3, n.z));
    var pos = pushOut(n.x, n.z, 0.45); n.x = pos.x; n.z = pos.z;
    // face-planting into a wall: if pushOut ate the whole step for ~1s,
    // give up on that target, turn around, go somewhere reachable
    var stepGot = Math.sqrt((n.x - preX) * (n.x - preX) + (n.z - preZ) * (n.z - preZ));
    if (spd > 0.2 && stepGot < spd * dt * 0.3) {
      n.stuckT = (n.stuckT || 0) + dt;
      if (n.stuckT > 1) {
        n.stuckT = 0;
        var back = npcTargetFor(n);
        n.tx = back[0]; n.tz = back[1];
        n.wayX = undefined; n.wayZ = undefined; n.doorSeek = undefined;   // give up on an unreachable doorway too
        n.fleeDX = -vx; n.fleeDZ = -vz;   // fleeing NPCs bounce back the way they came
      }
    } else n.stuckT = 0;
    // sidewalk discipline: loitering on road asphalt (off the intersection /
    // crosswalk area) for 2s steers the target to the nearest sidewalk band
    if (n.state === 'walk' && WC_REMAP && n.doorSeek === undefined) {
      // remap version: loitering on any true-road ribbon steers to the
      // nearest curb (perpendicular escape off the polyline). skipped while
      // door-seeking (an errand may legitimately cross a driveway apron)
      var esc = remapRoadEscape(n.x, n.z);
      if (esc) {
        n.roadT = (n.roadT || 0) + dt;
        if (n.roadT > 2) { n.roadT = 0; n.wayX = undefined; n.wayZ = undefined; n.tx = esc[0]; n.tz = esc[1]; }
      } else n.roadT = 0;
    } else if (n.state === 'walk') {
      var onMainRd = Math.abs(n.z) < MAIN_HW && Math.abs(n.x) > CROSS_HW;
      var onCrossRd = Math.abs(n.x) < CROSS_HW && Math.abs(n.z) > MAIN_HW;
      if (onMainRd || onCrossRd) {
        n.roadT = (n.roadT || 0) + dt;
        if (n.roadT > 2) {
          n.roadT = 0; n.wayX = undefined; n.wayZ = undefined;
          if (onMainRd) { n.tx = n.x; n.tz = (n.z >= 0 ? 1 : -1) * (MAIN_HW + 2 + Math.random() * 2); }
          else { n.tx = (n.x >= 0 ? 1 : -1) * (CROSS_HW + 2 + Math.random() * 2); n.tz = n.z; }
        }
      } else n.roadT = 0;
    }
    if (n.bleedT > 0) {
      // wounded and on the move: a drip trail that slows and finally clots
      n.bleedT -= dt;
      n.dripT = (n.dripT || 0) - dt;
      if (n.dripT <= 0) {
        n.dripT = 0.28 + Math.max(0, 9 - n.bleedT) * 0.06;
        dripDecal(n.x + (Math.random() - 0.5) * 0.3, n.z + (Math.random() - 0.5) * 0.3);
      }
    }
    m.position.set(n.x, m.position.y === 0.06 ? 0.06 : 0, n.z);
    m.rotation.y = Math.atan2(vx, vz); n.phase += spd * dt * 3.4;
    if (!animSkip) animPerson(m, spd, dt, n.phase);
  }
  updateNPCExtras();
}
var handsUpQ = new THREE.Quaternion();
var X_AXIS = new THREE.Vector3(1, 0, 0);
function updateNPCExtras() {
  var ddx = player.x - dealerPos.x, ddz = player.z - dealerPos.z;
  if (dealer.userData.skin) animPersonClip(dealer, 'idle', T);
  if (clerk.userData.skin && !(robbedVisit || copsCalledVisit)) animPersonClip(clerk, 'idle2', T);
  if (ddx * ddx + ddz * ddz < 120) dealer.rotation.y = Math.atan2(ddx, ddz);
  dollarSprite.position.y = 3.0 + Math.sin(T * 2.2) * 0.18;
  if (inside) {
    var kdx = player.x - clerkPos.x, kdz = player.z - clerkPos.z;
    clerk.rotation.y = Math.atan2(kdx, kdz);
    if (robbedVisit || copsCalledVisit) { // hands up
      if (clerk.userData.skin) {
        // skinned rig: pose the frozen idle first, then raise both arm bones
        // on top of it (writing .rotation directly wipes the clip quaternion
        // and leaves the whole rig in bind T-pose). The arms tremble — he is
        // not having a good shift.
        animPersonClip(clerk, 'idle2', 0);
        handsUpQ.setFromAxisAngle(X_AXIS, -2.2 + Math.sin(T * 21) * 0.07 + Math.sin(T * 33.7) * 0.04);
        clerk.userData.limbs.armL.quaternion.multiply(handsUpQ);
        handsUpQ.setFromAxisAngle(X_AXIS, -2.2 + Math.sin(T * 24 + 1.7) * 0.07 + Math.sin(T * 29.3) * 0.04);
        clerk.userData.limbs.armR.quaternion.multiply(handsUpQ);
        clerk.rotation.y += Math.sin(T * 27) * 0.012;   // whole-body shiver
      } else {
        clerk.userData.limbs.armL.rotation.x = Math.PI * 0.9;
        clerk.userData.limbs.armR.rotation.x = Math.PI * 0.9;
      }
    } else if (!clerk.userData.skin) {
      clerk.userData.limbs.armL.rotation.x = 0;
      clerk.userData.limbs.armR.rotation.x = 0;
    }
  }
}
// warpDur (optional): real seconds to fit the WHOLE clip into, so short-lived
// states (a 0.6s flinch, a 1.1s jab) play the full authored motion instead of
// only its first ~20% at natural speed. defaults to the clip's own duration.
function animPersonClip(m, clip, tSec, oneshot, warpDur) {
  var sk = m.userData.skin;
  if (sk && sk.d.clips[clip]) { meshyPose(sk, clip, tSec / (warpDur || sk.d.clips[clip].d), oneshot); return true; }
  var L = m.userData.limbs;
  if (L) { L.legL.rotation.x = 0; L.legR.rotation.x = 0; L.armL.rotation.x = clip === 'jab' ? -1.2 : 0; L.armR.rotation.x = 0; }
  return false;
}
function animPerson(m, spd, dt, phase) {
  var sk = m.userData.skin;
  if (sk) {
    if (spd > 0.1) {
      // callers integrate phase at spd*3.4 rad/s, so phase/3.4 = distance
      // walked. Advance the clip by distance/stride cycles so the authored
      // stride matches the ground covered — feet plant instead of skating.
      // st (game units per gait cycle) is FK-measured offline per clip by
      // tools/chargen/stridecalc.js; fallbacks match the clip-set averages.
      var key = spd > 2.9 && sk.d.clips.run ? 'run' : 'walk';
      var c = sk.d.clips[key] || sk.d.clips.walk;
      meshyPose(sk, key, (phase || 0) / (3.4 * (c.st || (key === 'run' ? 2.8 : 1.5))));
    } else meshyPose(sk, 'idle', (T + (m.id % 10)) / (sk.d.clips.idle ? sk.d.clips.idle.d : 4));
    return;
  }
  var L = m.userData.limbs; if (!L) return;
  var a = spd > 0.1 ? Math.sin(phase || 0) * 0.65 : 0;
  L.legL.rotation.x = a; L.legR.rotation.x = -a; L.armL.rotation.x = -a * 0.8; L.armR.rotation.x = a * 0.8;
}

// ---------------- collision ----------------
// cheap boolean "is this point clear of colliders" — used by the NPC steer-ahead
// probe. Same slab math as pushOut but returns on FIRST overlap (no push vector).
function pointFree(px, pz, r) {
  var L = colliders;
  for (var i = 0; i < L.length; i++) {
    var b = L[i];
    if (px < b.x0 - r || px > b.x1 + r || pz < b.z0 - r || pz > b.z1 + r) continue;
    if (b.obb) {
      var odx = px - b.x, odz = pz - b.z;
      var u = odx * b.c - odz * b.s, v = odx * b.s + odz * b.c;
      if (u < -b.hx - r || u > b.hx + r || v < -b.hz - r || v > b.hz + r) continue;
      return false;
    }
    return false;
  }
  return true;
}
function pushOut(px, pz, r, list) {
  var L = list || colliders;
  for (var i = 0; i < L.length; i++) {
    var b = L[i];
    if (b.active === false) continue;   // toppled prop's trunk collider — sits out until it respawns
    if (px < b.x0 - r || px > b.x1 + r || pz < b.z0 - r || pz > b.z1 + r) continue;
    if (b.obb) {
      // oriented box: solve in the box's local frame (u along its width axis),
      // same slab logic as the AABB branch below, then rotate back out
      var odx = px - b.x, odz = pz - b.z;
      var u = odx * b.c - odz * b.s, v = odx * b.s + odz * b.c;
      if (u < -b.hx - r || u > b.hx + r || v < -b.hz - r || v > b.hz + r) continue;
      var cu = Math.max(-b.hx, Math.min(u, b.hx)), cv = Math.max(-b.hz, Math.min(v, b.hz));
      var du = u - cu, dv = v - cv, dq = du * du + dv * dv;
      if (dq > 0.0001) { if (dq < r * r) { var dd = Math.sqrt(dq); u = cu + (du / dd) * r; v = cv + (dv / dd) * r; } else continue; }
      else { var el = u + b.hx, er = b.hx - u, et = v + b.hz, eb = b.hz - v; var em = Math.min(el, er, et, eb); if (em === el) u = -b.hx - r; else if (em === er) u = b.hx + r; else if (em === et) v = -b.hz - r; else v = b.hz + r; }
      px = u * b.c + v * b.s + b.x; pz = -u * b.s + v * b.c + b.z;
      continue;
    }
    var cx = Math.max(b.x0, Math.min(px, b.x1)), cz = Math.max(b.z0, Math.min(pz, b.z1));
    var dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
    if (d2 > 0.0001) { if (d2 < r * r) { var d = Math.sqrt(d2); px = cx + (dx / d) * r; pz = cz + (dz / d) * r; } }
    else { var pl = px - b.x0, pr = b.x1 - px, pt = pz - b.z0, pb = b.z1 - pz; var mn = Math.min(pl, pr, pt, pb); if (mn === pl) px = b.x0 - r; else if (mn === pr) px = b.x1 + r; else if (mn === pt) pz = b.z0 - r; else pz = b.z1 + r; }
  }
  return { x: px, z: pz };
}

// ---------------- viewmodels (unchanged from v2) ----------------
var vm = new THREE.Group(); camera.add(vm); scene.add(camera);
var skinM = lamb({ color: 0xe8b88a });
var sleeveM = lamb({ map: clothTex('#3d6fb8') });
var metalM = phong({ map: gunmetalT, shininess: 30, specular: 0x666666 });
var darkMetalM = phong({ color: 0x1e2024, shininess: 40, specular: 0x555555 });
var woodM = lamb2(woodT), gripM = lamb2(gripT);
// ---- Meshy AI gun models (optional meshyguns.js): muzzle authored along -x,
// +y up, centered at origin, real-meter scale, dims[0] = length ----
var gunMeshCache = {};
function hasMeshyGun(name) {
  if (typeof MESHY_GUNS === 'undefined') return false;
  for (var i = 0; i < MESHY_GUNS.length; i++) if (MESHY_GUNS[i].n === name) return true;
  return false;
}
function getGunMesh(name, len) {
  var ck = name + '_' + len;
  if (gunMeshCache[ck]) return gunMeshCache[ck].clone();
  var e = null;
  if (typeof MESHY_GUNS !== 'undefined') for (var i = 0; i < MESHY_GUNS.length; i++) if (MESHY_GUNS[i].n === name) e = MESHY_GUNS[i];
  if (!e) return null;
  var g = new THREE.Group();
  var qp = new Int16Array(b64Bytes(e.p).buffer), qu = new Uint16Array(b64Bytes(e.u).buffer);
  var fp = new Float32Array(qp.length), fu = new Float32Array(qu.length);
  for (i = 0; i < qp.length; i++) fp[i] = qp[i] / e.q;
  for (i = 0; i < qu.length; i += 2) { fu[i] = qu[i] / 8192; fu[i + 1] = 1 - qu[i + 1] / 8192; }
  var im = new Image();
  var tx = new THREE.Texture(im);
  tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false;
  im.onload = function () { tx.needsUpdate = true; };
  im.src = e.tex;
  var gunM = lamb({ map: tx });
  var s = len / (e.dims && e.dims[0] || 1);
  if (name === 'rpg7' && !e.i) {
    // split the baked launcher into tube + warhead. The PG-7 warhead is the
    // whole front assembly: pointed nose cone + the wider BULBOUS charge body
    // behind it, necking down to the tube around authored x=-0.30. Cutting
    // there (was -0.38, which sliced through the bulb) loads the full warhead,
    // so firing empties the tube and reload flies the complete round back in.
    var WH_CUT = -0.30;
    var tp = [], tu = [], wp = [], wu = [];
    for (i = 0; i < fp.length; i += 9) {
      var cx = (fp[i] + fp[i + 3] + fp[i + 6]) / 3;
      var dp = cx < WH_CUT ? wp : tp, du = cx < WH_CUT ? wu : tu;
      for (var j = 0; j < 9; j++) dp.push(fp[i + j]);
      var ub = (i / 9) * 6;
      for (j = 0; j < 6; j++) du.push(fu[ub + j]);
    }
    var tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tp), 3));
    tg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(tu), 2));
    tg.computeVertexNormals();
    var wg2 = new THREE.BufferGeometry();
    wg2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wp), 3));
    wg2.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(wu), 2));
    wg2.computeVertexNormals();
    var tubeM = lamb({ map: tx }); tubeM.side = THREE.DoubleSide;   // open muzzle reads hollow
    var tube = new THREE.Mesh(tg, tubeM); tube.scale.set(s, s, s);
    var wh = new THREE.Mesh(wg2, gunM); wh.scale.set(s, s, s);
    wh.userData.warhead = true;
    g.add(tube, wh);
  } else {
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(fu, 2));
    if (e.i) geo.setIndex(new THREE.BufferAttribute(new Uint16Array(b64Bytes(e.i).buffer), 1));
    geo.computeVertexNormals();
    var mm = new THREE.Mesh(geo, gunM);
    mm.scale.set(s, s, s);
    g.add(mm);
  }
  gunMeshCache[ck] = g;
  return g.clone();
}
// muzzle position for a Meshy gun viewmodel: model center at (px,py,pz),
// yaw -PI/2+0.22 (nose forward with the classic inward cant), muzzle len/2
// along the local -x axis; dy nudges for barrels that sit off model center
function gunFlashAt(px, py, pz, len, dy) {
  var th = -Math.PI / 2 + 0.22;
  return [px - Math.cos(th) * len / 2, py + (dy || 0), pz + Math.sin(th) * len / 2];
}
// exact barrel-tip of a positioned Meshy gun group: the models author the
// muzzle along local -x, so the forward-most vertex is min authored-x. We map
// it through the (already-placed, un-parented) group so the flash lands ON the
// tip instead of an approximated center+len/2 (which ignored barrel y/z offset
// and the model's x-tilt). Returns [x,y,z] in the group's parent (= vm) space.
var _mzV = new THREE.Vector3();
function meshyMuzzleAt(mg) {
  mg.updateMatrixWorld(true);
  // pass 1: forward-most authored-x. pass 2: average the ring of vertices at
  // the tip (within 2cm) so the flash centers on the BORE, not a rim vertex.
  var minlx = 1e9, meshes = [];
  mg.traverse(function (o) {
    if (o.isMesh && !o.isSkinnedMesh && o.geometry && o.geometry.attributes.position) {
      o.updateMatrixWorld(true); meshes.push(o);
      var pos = o.geometry.attributes.position;
      for (var i = 0; i < pos.count; i++) if (pos.getX(i) < minlx) minlx = pos.getX(i);
    }
  });
  var bx = 0, by = 0, bz = 0, n = 0;
  for (var m = 0; m < meshes.length; m++) {
    var o = meshes[m], pos = o.geometry.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      if (pos.getX(i) <= minlx + 0.02) {
        _mzV.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(o.matrixWorld);
        bx += _mzV.x; by += _mzV.y; bz += _mzV.z; n++;
      }
    }
  }
  return n ? [bx / n, by / n, bz / n] : [0, 0, 0];
}
function vmArm(x, y, z, yawR) {
  var g = new THREE.Group();
  var foreGeo = new THREE.CylinderGeometry(0.032, 0.04, 0.22, 8); foreGeo.rotateX(Math.PI / 2);
  var fore = new THREE.Mesh(foreGeo, skinM); fore.position.set(0, 0, -0.07);
  var sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.042, 0.07, 8).rotateX(Math.PI / 2), sleeveM); sleeve.position.set(0, 0, 0.05);
  var hand = sph(0.052, skinM, 0, 0, -0.2, 8, 7); hand.scale.set(0.85, 0.75, 1.1);
  var thumb = sph(0.02, skinM, -0.035, 0.02, -0.21, 6, 5);
  g.add(fore, sleeve, hand, thumb); g.position.set(x, y, z); g.rotation.y = yawR || 0; return g;
}
var vmFists = new THREE.Group();
var armLf = vmArm(-0.24, -0.44, -0.5, -0.18);
var punchArm = vmArm(0.24, -0.44, -0.5, 0.18);
var punchArmBase = punchArm.position.clone();
vmFists.add(armLf, punchArm);
// PSX skinned first-person arms (optional meshyarms.js) — replaces the
// capsule fists; texture is re-tinted to the player's skin tone.
var psxArms = null;
// arms also hold the Meshy gun viewmodels: the root reparents into the
// equipped gun group (so draw/reload anims carry the hands along) and is
// posed each frame on a static frame of the 'grab' clip
var GUNHOLD_GROUPS = { pistol: 1, smg: 1, rifle: 1, auto: 1, rocket: 1 };
var gunHold = { clip: 'relax', t: 0.75 };   // relax mid-frame: right palm sits on the grips
// The shared relax/grab clip leaves the LEFT (support) arm hanging at the side,
// which reads as a detached floating hand for every gun. After posing, we swing
// the left arm forward onto each weapon's foregrip/handguard with fixed local
// eulers per bone [shoulder.L, upper_arm.L, forearm.L, hand.L] (rig bone indices
// 24..27). Values authored on-screen (screenshot rounds) now that the forward
// ANCHOR_OFF un-clips the arms: support hand on the AK/SMG handguard, under the
// Kar98k forestock, on the RPG tube, and meeting the firing hand for the pistol.
// upper_arm.L z = right-swing, forearm.L x = forward reach (smaller = further).
var SUPPORT_POSE = {
  pistol: [[-1.59, 0.5, -1.5], [1.2, 0.4, -3.2], [2.5, -0.82, 0.3], [0.2, 0.3, -0.4]],
  smg:    [[-1.59, -0.01, -1.16], [1.2, 0.4, -2.9], [2.1, -0.82, 0.3], [0.15, 0.3, -0.4]],
  rifle:  [[-1.59, -0.01, -1.16], [0.98, 0.4, -2.6], [1.7, -0.82, 0.3], [0.1, 0.3, -0.4]],
  auto:   [[-1.59, -0.01, -1.16], [0.98, 0.4, -2.7], [1.85, -0.82, 0.3], [0.1, 0.3, -0.4]],
  rocket: [[-1.59, -0.01, -1.16], [1.1, 0.4, -2.6], [1.7, -0.82, 0.3], [0.1, 0.3, -0.4]]
};
// per-weapon forward anchor offset in the gun-group (camera) frame:
// x=right, y=up, z toward-camera(+)/forward(-). The shared idle/relax/grab
// clips park both hands at rig-z~0, so with a zero anchor the whole arm rig
// collapses onto the camera and the forward-most vertex sits ~0.02m ahead —
// INSIDE the 0.1m near plane → invisible. Pushing the rig forward per weapon
// un-clips the hands and lands the trigger hand near the grip.
// z pulled toward the camera (v1.43) so the weapon reads at arm's length, not
// shoved at the screen; each weapon's gun mesh is retracted by the SAME delta
// below so the trigger hand stays on the grip.
var ANCHOR_OFF = {
  fists:  [0.00, -0.04, -0.30],
  pistol: [0.06, -0.06, -0.32],
  smg:    [0.09, -0.05, -0.36],
  rifle:  [0.10, -0.05, -0.39],
  auto:   [0.11, -0.05, -0.39],
  rocket: [0.10, -0.05, -0.36]
};
var dbgArmOv = null;                 // debug override for SUPPORT_POSE (via __wc.dbgArm)
var _supEuler = new THREE.Euler();
var _supIdx = [24, 25, 26, 27];
function applySupportPose(w) {
  if (!psxArms) return;
  var p = dbgArmOv || SUPPORT_POSE[w];
  if (!p) return;
  for (var i = 0; i < 4; i++) {
    if (!p[i]) continue;
    _supEuler.set(p[i][0], p[i][1], p[i][2]);
    psxArms.bones[_supIdx[i]].quaternion.setFromEuler(_supEuler);
  }
}
// v1.44: support-arm 2-bone IK. The blind-euler SUPPORT_POSE left the left hand
// floating off the gun; instead we now seed from it (elbow pole hint + hand
// wrap) then run a few CCD passes on upper_arm.L(25) + forearm.L(26) so hand.L
// (27, the wrist) lands on the weapon's grip target. GRIP_TGT is in the gun
// group's local (camera) frame — measured on the foregrip/handguard (rifle/
// auto), the tube foregrip (rocket), the barrel shroud (smg) and just below the
// firing hand (two-hand pistol). ccdJoint reuses copAimArm's trick: build the
// world-space swing with setFromUnitVectors, conjugate by the parent's world
// quaternion into bone-local space, premultiply.
var GRIP_TGT = {
  pistol: [0.21, -0.40, -0.52],
  smg:    [0.28, -0.30, -0.56],
  rifle:  [0.18, -0.42, -0.84],
  auto:   [0.19, -0.42, -0.76],
  rocket: [0.22, -0.44, -0.68]
};
var _ikEnd = new THREE.Vector3(), _ikJ = new THREE.Vector3(), _ikTV = new THREE.Vector3(),
    _ikA = new THREE.Vector3(), _ikB = new THREE.Vector3(),
    _ikDQ = new THREE.Quaternion(), _ikPQ = new THREE.Quaternion(), _ikQL = new THREE.Quaternion();
function ccdJoint(j, end, tgtW) {
  j.updateMatrixWorld(true);
  end.getWorldPosition(_ikEnd); j.getWorldPosition(_ikJ);
  _ikA.copy(_ikEnd).sub(_ikJ); _ikB.copy(tgtW).sub(_ikJ);
  if (_ikA.lengthSq() < 1e-9 || _ikB.lengthSq() < 1e-9) return;
  _ikA.normalize(); _ikB.normalize();
  _ikDQ.setFromUnitVectors(_ikA, _ikB);
  j.parent.getWorldQuaternion(_ikPQ);
  _ikQL.copy(_ikPQ).invert().multiply(_ikDQ).multiply(_ikPQ);   // world swing → bone-local
  j.quaternion.premultiply(_ikQL);
  j.updateMatrixWorld(true);
}
function solveSupportIK(w) {
  if (!psxArms) return;
  applySupportPose(w);                       // seed the arm (pole hint) + hand wrap
  var tgt = GRIP_TGT[w];
  if (!tgt || dbgArmOv) return;              // fists/no target, or manual euler override → keep seed
  var g = vmMap[w]; if (!g) return;
  var upper = psxArms.bones[25], fore = psxArms.bones[26], hand = psxArms.bones[27];
  psxArms.root.updateMatrixWorld(true);
  _ikTV.set(tgt[0], tgt[1], tgt[2]); g.localToWorld(_ikTV);
  for (var it = 0; it < 6; it++) { ccdJoint(fore, hand, _ikTV); ccdJoint(upper, hand, _ikTV); }
}
function armsTintTex(skinHex) {
  var cv = document.createElement('canvas');
  cv.width = 1; cv.height = 1;   // valid upload before the image decodes
  var g0 = cv.getContext('2d'); g0.fillStyle = skinHex || '#e8b88a'; g0.fillRect(0, 0, 1, 1);
  var tx = new THREE.CanvasTexture(cv);
  tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false;
  var im = new Image();
  im.onload = function () {
    cv.width = im.width; cv.height = im.height;
    var g = cv.getContext('2d'); g.drawImage(im, 0, 0);
    var d = g.getImageData(0, 0, cv.width, cv.height), px = d.data;
    // reference = average of the texture itself (it's all skin); scale to target
    var ar = 0, ag = 0, ab = 0, n = 0;
    for (var i = 0; i < px.length; i += 16) { if (px[i + 3] > 200) { ar += px[i]; ag += px[i + 1]; ab += px[i + 2]; n++; } }
    ar /= n; ag /= n; ab /= n;
    var t = parseInt(skinHex.slice(1), 16);
    var sr = ((t >> 16) & 255) / ar, sg = ((t >> 8) & 255) / ag, sb = (t & 255) / ab;
    for (i = 0; i < px.length; i += 4) {
      px[i] = Math.min(255, px[i] * sr);
      px[i + 1] = Math.min(255, px[i + 1] * sg);
      px[i + 2] = Math.min(255, px[i + 2] * sb);
    }
    // the source texture is nearly flat — layer low-frequency mottle plus
    // fine grain over the tint so the arms don't read as one solid color
    for (i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 8) continue;
      var pxi = i >> 2, xx = pxi % cv.width, yy = (pxi / cv.width) | 0;
      var mot = Math.sin(xx * 0.055) * Math.sin(yy * 0.043 + 1.7) * 0.06 +
                Math.sin(xx * 0.021 + 3.1) * Math.sin(yy * 0.017) * 0.08;
      var h = Math.sin(xx * 12.9898 + yy * 78.233) * 43758.5453;
      var f = 1 + mot + ((h - Math.floor(h)) - 0.5) * 0.1;
      px[i] = Math.max(0, Math.min(255, px[i] * f));
      px[i + 1] = Math.max(0, Math.min(255, px[i + 1] * f * 0.98));
      px[i + 2] = Math.max(0, Math.min(255, px[i + 2] * f * 0.95));
    }
    g.putImageData(d, 0, 0); tx.needsUpdate = true;
  };
  im.src = MESHY_ARMS.tex;
  return tx;
}
function buildPSXArms(skinHex) {
  if (typeof MESHY_ARMS === 'undefined') return null;
  var A = MESHY_ARMS;
  function f32(b64) { var u = b64Bytes(b64); return new Float32Array(u.buffer, u.byteOffset, u.length / 4); }
  function i16(b64) { var u = b64Bytes(b64); return new Int16Array(u.buffer, u.byteOffset, u.length / 2); }
  function u16(b64) { var u = b64Bytes(b64); return new Uint16Array(u.buffer, u.byteOffset, u.length / 2); }
  var names = A.skel.names, np = names.length;
  var bt = f32(A.skel.t), br = f32(A.skel.r), bsc = f32(A.skel.s);
  var bones = [], root = new THREE.Group();
  for (var i = 0; i < np; i++) {
    var b = new THREE.Bone();
    b.name = names[i];
    b.position.set(bt[i * 3], bt[i * 3 + 1], bt[i * 3 + 2]);
    b.quaternion.set(br[i * 4], br[i * 4 + 1], br[i * 4 + 2], br[i * 4 + 3]);
    b.scale.set(bsc[i * 3], bsc[i * 3 + 1], bsc[i * 3 + 2]);
    bones.push(b);
  }
  for (i = 0; i < np; i++) {
    var pi = A.skel.parents[i];
    if (pi >= 0) bones[pi].add(bones[i]); else root.add(bones[i]);
  }
  var qp = i16(A.geo.p), qu = u16(A.geo.u);
  var fp = new Float32Array(qp.length), fu = new Float32Array(qu.length);
  for (i = 0; i < qp.length; i++) fp[i] = qp[i] / A.geo.q;
  for (i = 0; i < qu.length; i += 2) { fu[i] = qu[i] / 8192; fu[i + 1] = qu[i + 1] / 8192; }
  var si = b64Bytes(A.geo.si), sw8 = b64Bytes(A.geo.sw);
  var sw = new Float32Array(sw8.length);
  for (i = 0; i < sw8.length; i++) sw[i] = sw8[i] / 255;
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(fu, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.prototype.slice.call(si), 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.setIndex(new THREE.BufferAttribute(A.geo.i32 ? new Uint32Array(b64Bytes(A.geo.i).buffer.slice(0)) : u16(A.geo.i), 1));
  geo.computeVertexNormals();
  var mesh = new THREE.SkinnedMesh(geo, lamb({ map: armsTintTex(skinHex || CSKIN[1]) }));
  mesh.frustumCulled = false;
  root.add(mesh);
  mesh.updateMatrixWorld(true); root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  // clips: frame-major Int16 quats (/16384) + translations (/1024 or clip.ts)
  var clips = {};
  for (var k in A.clips) {
    var c = A.clips[k];
    clips[k] = { d: c.d, f: c.f, q: i16(c.q), t: i16(c.t), ts: c.ts || 1024 };
  }
  var ci = names.indexOf('camera');
  return {
    root: root, bones: bones, mesh: mesh, clips: clips, np: np,
    camBone: ci >= 0 ? bones[ci] : null, rootBone: bones[0]
  };
}
var armsQA = new THREE.Quaternion(), armsQB = new THREE.Quaternion(), armsTmpV = new THREE.Vector3();
// keep the rig's authored camera bone glued to the view origin every frame
// (the clips animate the root bone with full character-height translation).
// The rig is authored facing +z, so the group is yawed 180 to face -z.
function anchorArms(pa) {
  if (!pa.camBone) return;
  armsTmpV.copy(pa.camBone.position).applyQuaternion(pa.rootBone.quaternion).add(pa.rootBone.position);
  pa.root.quaternion.set(0, 1, 0, 0);
  pa.root.position.set(armsTmpV.x, -armsTmpV.y, armsTmpV.z);
  var off = ANCHOR_OFF[state.equipped];
  if (off) { pa.root.position.x += off[0]; pa.root.position.y += off[1]; pa.root.position.z += off[2]; }
}
function armsPose(pa, key, t, oneshot) {
  var c = pa.clips[key];
  if (!c) return;
  var ft = (t / c.d) * (c.f - 1);
  if (oneshot) ft = Math.min(c.f - 1.001, Math.max(0, ft));
  else { ft = ft % (c.f - 1); if (ft < 0) ft += c.f - 1; }
  var f0 = ft | 0, f1 = Math.min(c.f - 1, f0 + 1), k2 = ft - f0;
  var np = pa.np;
  for (var j = 0; j < np; j++) {
    var a = (f0 * np + j) * 4, b = (f1 * np + j) * 4;
    armsQA.set(c.q[a] / 16384, c.q[a + 1] / 16384, c.q[a + 2] / 16384, c.q[a + 3] / 16384);
    armsQB.set(c.q[b] / 16384, c.q[b + 1] / 16384, c.q[b + 2] / 16384, c.q[b + 3] / 16384);
    armsQA.slerp(armsQB, k2);
    pa.bones[j].quaternion.copy(armsQA);
    var ta = (f0 * np + j) * 3, tb = (f1 * np + j) * 3;
    pa.bones[j].position.set(
      (c.t[ta] + (c.t[tb] - c.t[ta]) * k2) / c.ts,
      (c.t[ta + 1] + (c.t[tb + 1] - c.t[ta + 1]) * k2) / c.ts,
      (c.t[ta + 2] + (c.t[tb + 2] - c.t[ta + 2]) * k2) / c.ts);
  }
  anchorArms(pa);
}
function initPSXArms() {
  if (psxArms || typeof MESHY_ARMS === 'undefined') return;
  try {
    psxArms = buildPSXArms(CSKIN[playerChar ? playerChar.skin : 1]);
    if (psxArms) {
      armLf.visible = false; punchArm.visible = false;
      vmFists.add(psxArms.root);
      armsPose(psxArms, 'idle', 0);
      // the skinned hands take over from the capsule arms on the gun viewmodels
      [vmPistol, vmSmg, vmRifle, vmAuto, vmRocket].forEach(function (g) {
        g.children.forEach(function (c) { if (c.userData.gunArm) c.visible = false; });
      });
      if (GUNHOLD_GROUPS[state.equipped]) { vmMap[state.equipped].add(psxArms.root); armsPose(psxArms, gunHold.clip, gunHold.t, true); solveSupportIK(state.equipped); }
    }
  } catch (e) { psxArms = null; }
}
function retintPSXArms() {
  if (psxArms && playerChar) psxArms.mesh.material.map = armsTintTex(CSKIN[playerChar.skin]);
}
var vmPistol = new THREE.Group();
(function () {
  if (hasMeshyGun('glock19')) {
    // Meshy Glock 19 (real length 0.19m, drawn a touch big to read on 480p)
    var mg = getGunMesh('glock19', 0.30);
    mg.position.set(0.27, -0.33, -0.40);   // v1.43: retracted 0.10 toward camera (matches ANCHOR_OFF)
    mg.rotation.order = 'YXZ';
    mg.rotation.y = -Math.PI / 2 + 0.22;   // nose forward (-z), classic inward cant
    mg.rotation.x = 0.05;
    vmPistol.add(mg);
    var pAr = vmArm(0.29, -0.47, -0.34, 0.18); pAr.userData.gunArm = 1; vmPistol.add(pAr);
    WEAPONS.pistol.flashAt = meshyMuzzleAt(mg);
    WEAPONS.pistol.flashScale = 0.55;   // muzzle sits closer to camera than the old model
    return;
  }
  vmPistol.add(box(0.075, 0.085, 0.36, metalM, 0.26, -0.262, -0.63));
  vmPistol.add(box(0.07, 0.05, 0.3, darkMetalM, 0.26, -0.318, -0.61));
  var brl = cyl(0.018, 0.018, 0.07, 8, darkMetalM, 0.26, -0.262, -0.825); brl.rotation.x = Math.PI / 2; vmPistol.add(brl);
  vmPistol.add(box(0.012, 0.028, 0.02, metalM, 0.26, -0.208, -0.79));
  vmPistol.add(box(0.05, 0.024, 0.03, metalM, 0.26, -0.208, -0.47));
  var grip = box(0.062, 0.18, 0.1, gripM, 0.26, -0.4, -0.47); grip.rotation.x = 0.3; vmPistol.add(grip);
  var guard = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.009, 6, 10, Math.PI * 1.15), darkMetalM); guard.position.set(0.26, -0.35, -0.55); guard.rotation.y = Math.PI / 2; vmPistol.add(guard);
  vmPistol.add(vmArm(0.29, -0.47, -0.34, 0.18));
})();
var vmSmg = new THREE.Group();
(function () {
  if (hasMeshyGun('tec9')) {
    var mg = getGunMesh('tec9', 0.5);
    mg.position.set(0.27, -0.29, -0.41);   // v1.43: retracted 0.14 toward camera
    mg.rotation.order = 'YXZ';
    mg.rotation.y = -Math.PI / 2 + 0.22;
    mg.rotation.x = 0.05;
    vmSmg.add(mg);
    var sAr = vmArm(0.29, -0.47, -0.24, 0.18); sAr.userData.gunArm = 1; vmSmg.add(sAr);
    WEAPONS.smg.flashAt = meshyMuzzleAt(mg);
    WEAPONS.smg.flashScale = 0.65;
    return;
  }
  // TEC-9: boxy receiver, long perforated barrel shroud, straight mag ahead of the trigger, no stock
  var shroudT = tex(64, function (g, s) {
    g.fillStyle = '#26282d'; g.fillRect(0, 0, s, s);
    for (var i = 0; i < 30; i++) { g.strokeStyle = 'rgba(255,255,255,' + Math.random() * 0.06 + ')'; var y = Math.random() * s; g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
    for (var x = 8; x < s; x += 16) for (var y2 = 10; y2 < s; y2 += 21) {
      g.fillStyle = '#0a0a0c'; g.beginPath(); g.arc(x, y2, 4.5, 0, 7); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y2, 4.5, Math.PI * 0.9, Math.PI * 1.7); g.stroke();
    }
  }, 3, 1);
  var shroudM = phong({ map: shroudT, shininess: 25, specular: 0x555555 });
  // receiver
  vmSmg.add(box(0.075, 0.095, 0.36, metalM, 0.26, -0.27, -0.5));
  vmSmg.add(box(0.05, 0.02, 0.3, darkMetalM, 0.26, -0.213, -0.5));       // top rib
  // perforated barrel shroud + muzzle
  var shroud = cyl(0.034, 0.034, 0.44, 10, shroudM, 0.26, -0.262, -0.88); shroud.rotation.x = Math.PI / 2; vmSmg.add(shroud);
  var muzzle = cyl(0.017, 0.017, 0.07, 8, darkMetalM, 0.26, -0.262, -1.13); muzzle.rotation.x = Math.PI / 2; vmSmg.add(muzzle);
  vmSmg.add(box(0.012, 0.03, 0.02, metalM, 0.26, -0.225, -1.06));        // front sight
  vmSmg.add(box(0.036, 0.026, 0.03, metalM, 0.26, -0.21, -0.36));        // rear sight
  // charging handle on the left of the receiver
  var chg = cyl(0.012, 0.012, 0.05, 6, darkMetalM, 0.215, -0.245, -0.44); chg.rotation.z = Math.PI / 2; vmSmg.add(chg);
  // mag well + long straight magazine ahead of the trigger
  vmSmg.add(box(0.062, 0.07, 0.1, darkMetalM, 0.26, -0.34, -0.6));
  var mag = box(0.046, 0.34, 0.075, metalM, 0.26, -0.53, -0.615); mag.rotation.x = -0.05; vmSmg.add(mag);
  vmSmg.add(box(0.052, 0.02, 0.085, darkMetalM, 0.26, -0.705, -0.625));  // mag baseplate
  // rear angled grip + trigger guard
  var grip = box(0.055, 0.16, 0.09, gripM, 0.26, -0.395, -0.4); grip.rotation.x = 0.35; vmSmg.add(grip);
  var guard = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.008, 6, 10, Math.PI * 1.15), darkMetalM); guard.position.set(0.26, -0.35, -0.5); guard.rotation.y = Math.PI / 2; vmSmg.add(guard);
  // held one-handed, gripping the rear pistol grip
  vmSmg.add(vmArm(0.29, -0.47, -0.24, 0.18));
})();
var vmRifle = new THREE.Group();
(function () {
  if (hasMeshyGun('kar98k')) {
    var mg = getGunMesh('kar98k', 0.95);
    mg.position.set(0.25, -0.29, -0.56);   // v1.43: retracted 0.16 toward camera
    mg.rotation.order = 'YXZ';
    mg.rotation.y = -Math.PI / 2 + 0.22;
    mg.rotation.x = 0.05;
    vmRifle.add(mg);
    var rAr1 = vmArm(0.27, -0.47, -0.34, 0.18); rAr1.userData.gunArm = 1; vmRifle.add(rAr1);
    var rAr2 = vmArm(0.11, -0.44, -0.82, -0.32); rAr2.userData.gunArm = 1; vmRifle.add(rAr2);
    WEAPONS.rifle.flashAt = meshyMuzzleAt(mg);
    WEAPONS.rifle.flashScale = 0.8;
    return;
  }
  var brl = cyl(0.016, 0.02, 0.6, 8, darkMetalM, 0.24, -0.235, -1.05); brl.rotation.x = Math.PI / 2; vmRifle.add(brl);
  vmRifle.add(box(0.065, 0.085, 0.32, metalM, 0.24, -0.25, -0.58));
  vmRifle.add(box(0.06, 0.075, 0.5, woodM, 0.24, -0.275, -0.85));
  var stock = box(0.07, 0.13, 0.3, woodM, 0.24, -0.33, -0.33); stock.rotation.x = 0.22; vmRifle.add(stock);
  var scopeB = cyl(0.032, 0.032, 0.26, 10, darkMetalM, 0.24, -0.172, -0.58); scopeB.rotation.x = Math.PI / 2; vmRifle.add(scopeB);
  vmRifle.add(box(0.014, 0.045, 0.02, metalM, 0.24, -0.2, -0.52)); vmRifle.add(box(0.014, 0.045, 0.02, metalM, 0.24, -0.2, -0.66));
  var bolt = cyl(0.014, 0.014, 0.07, 6, metalM, 0.295, -0.245, -0.5); bolt.rotation.z = Math.PI / 2; vmRifle.add(bolt);
  var guard = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.008, 6, 10, Math.PI * 1.1), darkMetalM); guard.position.set(0.24, -0.33, -0.5); guard.rotation.y = Math.PI / 2; vmRifle.add(guard);
  vmRifle.add(vmArm(0.27, -0.47, -0.34, 0.18)); vmRifle.add(vmArm(0.11, -0.44, -0.82, -0.32));
})();
// AK-47: stamped receiver, wood furniture, curved mag, tall front sight
var vmAuto = new THREE.Group();
(function () {
  if (hasMeshyGun('ak47')) {
    var mg = getGunMesh('ak47', 0.8);
    mg.position.set(0.26, -0.30, -0.46);   // v1.43: retracted 0.16 toward camera
    mg.rotation.order = 'YXZ';
    mg.rotation.y = -Math.PI / 2 + 0.22;
    mg.rotation.x = 0.05;
    vmAuto.add(mg);
    var aAr1 = vmArm(0.29, -0.47, -0.3, 0.18); aAr1.userData.gunArm = 1; vmAuto.add(aAr1);
    var aAr2 = vmArm(0.13, -0.44, -0.72, -0.3); aAr2.userData.gunArm = 1; vmAuto.add(aAr2);
    WEAPONS.auto.flashAt = meshyMuzzleAt(mg);
    WEAPONS.auto.flashScale = 0.75;
    return;
  }
  vmAuto.add(box(0.07, 0.09, 0.34, metalM, 0.26, -0.265, -0.5));            // receiver
  vmAuto.add(box(0.068, 0.075, 0.22, woodM, 0.26, -0.265, -0.76));          // wood handguard
  var gas = cyl(0.016, 0.016, 0.2, 6, darkMetalM, 0.26, -0.222, -0.78); gas.rotation.x = Math.PI / 2; vmAuto.add(gas); // gas tube
  var brl = cyl(0.014, 0.016, 0.3, 8, darkMetalM, 0.26, -0.26, -1.0); brl.rotation.x = Math.PI / 2; vmAuto.add(brl);
  vmAuto.add(box(0.012, 0.05, 0.02, metalM, 0.26, -0.215, -1.1));           // front sight post
  vmAuto.add(box(0.03, 0.028, 0.05, metalM, 0.26, -0.222, -0.38));          // rear sight
  var mg1 = box(0.05, 0.13, 0.08, metalM, 0.26, -0.38, -0.58); mg1.rotation.x = 0.35;
  var mg2 = box(0.05, 0.12, 0.075, metalM, 0.26, -0.485, -0.63); mg2.rotation.x = 0.7; vmAuto.add(mg1, mg2); // curved mag
  var stock = box(0.06, 0.11, 0.28, woodM, 0.26, -0.31, -0.3); stock.rotation.x = 0.18; vmAuto.add(stock);
  var grip = box(0.05, 0.13, 0.08, gripM, 0.26, -0.38, -0.42); grip.rotation.x = 0.3; vmAuto.add(grip);
  var guard = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 10, Math.PI * 1.1), darkMetalM); guard.position.set(0.26, -0.34, -0.5); guard.rotation.y = Math.PI / 2; vmAuto.add(guard);
  vmAuto.add(vmArm(0.29, -0.47, -0.3, 0.18));
  vmAuto.add(vmArm(0.13, -0.44, -0.72, -0.3));
})();
// rocket launcher: shoulder tube
var vmRocket = new THREE.Group();
// spare rocket head: visible when loaded; slides back into the muzzle
// during the 5s reload (see the vm block in updatePlayer)
var rocketHead = null, rocketSeat = new THREE.Vector3(0.3, -0.24, -1.06), rocketFwd = new THREE.Vector3(0, 0, -1);
var rpgWarhead = null;   // the Meshy launcher's own warhead mesh (hidden while the tube is empty)
(function () {
  var headCant = 0;
  if (hasMeshyGun('rpg7')) {
    var mg = getGunMesh('rpg7', 0.95);
    mg.traverse(function (o) { if (o.userData && o.userData.warhead) rpgWarhead = o; });
    mg.position.set(0.3, -0.26, -0.46);   // v1.43: retracted 0.14 toward camera
    mg.rotation.order = 'YXZ';
    mg.rotation.y = -Math.PI / 2 + 0.22;
    vmRocket.add(mg);
    var kAr1 = vmArm(0.32, -0.48, -0.32, 0.18); kAr1.userData.gunArm = 1; vmRocket.add(kAr1);
    var kAr2 = vmArm(0.16, -0.46, -0.6, -0.3); kAr2.userData.gunArm = 1; vmRocket.add(kAr2);
    var fa = gunFlashAt(0.3, -0.26, -0.46, 0.95, 0.02);   // muzzle literal tracks the retracted mesh
    WEAPONS.rocket.flashAt = fa;
    headCant = 0.22;
    rocketFwd.set(-Math.cos(-Math.PI / 2 + 0.22), 0, Math.sin(-Math.PI / 2 + 0.22));
    rocketSeat.set(fa[0], fa[1], fa[2]).addScaledVector(rocketFwd, -0.05);
  } else {
    var oliveM = lamb({ color: 0x4a5a3a });
    var tube = cyl(0.062, 0.062, 0.85, 12, oliveM, 0.3, -0.24, -0.55); tube.rotation.x = Math.PI / 2; vmRocket.add(tube);
    var mouth = cyl(0.075, 0.062, 0.1, 12, darkMetalM, 0.3, -0.24, -0.99); mouth.rotation.x = Math.PI / 2; vmRocket.add(mouth);
    var rear = cyl(0.062, 0.078, 0.12, 12, darkMetalM, 0.3, -0.24, -0.12); rear.rotation.x = Math.PI / 2; vmRocket.add(rear);
    vmRocket.add(box(0.05, 0.13, 0.08, gripM, 0.3, -0.38, -0.5));
    vmRocket.add(box(0.05, 0.1, 0.06, oliveM, 0.3, -0.35, -0.72));           // front grip
    vmRocket.add(box(0.02, 0.07, 0.1, metalM, 0.3, -0.15, -0.62));           // sight
    vmRocket.add(vmArm(0.32, -0.48, -0.32, 0.18));
    vmRocket.add(vmArm(0.16, -0.46, -0.6, -0.3));
    rocketSeat.set(0.3, -0.24, -1.06);
  }
  rocketHead = new THREE.Group();
  var cone = cyl(0.001, 0.05, 0.13, 10, lamb({ color: 0xb03024 }), 0, 0, 0); cone.rotation.x = -Math.PI / 2;
  rocketHead.add(cone);
  rocketHead.rotation.y = headCant;
  rocketHead.position.copy(rocketSeat);
  // the Meshy RPG-7 already models its warhead, so the spare head only shows
  // while it flies in during the reload; the procedural tube keeps it seated
  rocketHead.userData.seatVisible = !hasMeshyGun('rpg7');
  rocketHead.visible = rocketHead.userData.seatVisible;
  vmRocket.add(rocketHead);
})();

// ray gun: Meshy model (user-designed) when meshyufo.js carries it,
// procedural chrome pistol otherwise
var vmRaygun = new THREE.Group();
(function () {
  if (hasMeshyProp('raygun')) {
    var mg = getUfoMesh('raygun', 0.5);
    mg.position.set(0.27, -0.36, -0.5);
    mg.rotation.order = 'YXZ';
    mg.rotation.y = -Math.PI / 2 + 0.22;  // nose forward (-z) with a classic inward cant
    mg.rotation.x = 0.1;                  // level the slight baked-in tilt
    vmRaygun.add(mg);
    vmRaygun.add(vmArm(0.29, -0.47, -0.3, 0.18));
    return;
  }
  var chromeM = phong({ color: 0xc8ccd4, shininess: 110, specular: 0xffffff });
  var bodyR = cyl(0.05, 0.075, 0.42, 10, chromeM, 0.26, -0.27, -0.62); bodyR.rotation.x = Math.PI / 2; vmRaygun.add(bodyR);
  var ringR = cyl(0.085, 0.085, 0.03, 10, darkMetalM, 0.26, -0.27, -0.72); ringR.rotation.x = Math.PI / 2; vmRaygun.add(ringR);
  vmRaygun.add(sph(0.055, new THREE.MeshBasicMaterial({ color: 0x66ff88 }), 0.26, -0.27, -0.86, 10, 8));
  var finR = box(0.016, 0.14, 0.22, lamb({ color: 0xb02030 }), 0.26, -0.175, -0.56); vmRaygun.add(finR);
  var grip = box(0.055, 0.17, 0.09, gripM, 0.26, -0.4, -0.44); grip.rotation.x = 0.32; vmRaygun.add(grip);
  var guard = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 10, Math.PI * 1.1), darkMetalM); guard.position.set(0.26, -0.35, -0.52); guard.rotation.y = Math.PI / 2; vmRaygun.add(guard);
  vmRaygun.add(vmArm(0.29, -0.47, -0.32, 0.18));
})();

// snack: chip bag in hand
var vmSnack = new THREE.Group();
(function () {
  var bagT = tex(32, function (g, s) {
    g.fillStyle = '#e8c020'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#c0392b'; g.beginPath(); g.arc(s / 2, s / 2, 9, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 9px Arial'; g.textAlign = 'center'; g.fillText('CHIPS', s / 2, s / 2 + 3);
  });
  var bag = box(0.16, 0.22, 0.05, lamb2(bagT), 0.26, -0.36, -0.5);
  bag.rotation.z = -0.15; bag.rotation.x = -0.2;
  vmSnack.add(bag);
  vmSnack.add(vmArm(0.27, -0.45, -0.32, 0.15));
})();

var flash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95, depthTest: false }));
// AI sprite flash (optional muzzleflash.js): 4 starburst frames on black,
// additive-blended so the black vanishes; cycled while the flash lives
var flashTexs = [];
if (typeof MUZZLE_FLASH !== 'undefined') {
  MUZZLE_FLASH.forEach(function (u) {
    var fim = new Image();
    var ftx = new THREE.Texture(fim);
    ftx.magFilter = THREE.NearestFilter; ftx.minFilter = THREE.NearestFilter; ftx.generateMipmaps = false;
    fim.onload = function () { ftx.needsUpdate = true; };
    fim.src = u;
    flashTexs.push(ftx);
  });
  flash.geometry = new THREE.PlaneGeometry(0.44, 0.44);   // sprites carry black margins
  flash.material = new THREE.MeshBasicMaterial({ map: flashTexs[0], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
}
flash.visible = false; vm.add(flash); var flashT = 0;
var rocketCdEl = document.getElementById('rocketCd'), rocketCdBar = document.getElementById('rocketCdBar');
var vmMap = { fists: vmFists, pistol: vmPistol, smg: vmSmg, rifle: vmRifle, auto: vmAuto, rocket: vmRocket, raygun: vmRaygun, snack: vmSnack };
// streetprops soda: red can in hand (registered before the add/hide pass below)
var vmSoda = new THREE.Group();
(function () {
  vmSoda.add(cyl(0.045, 0.045, 0.17, 10, lamb({ color: 0xc0392b }), 0.26, -0.37, -0.5));
  vmSoda.add(cyl(0.047, 0.047, 0.012, 10, phong({ color: 0xd8dce0, shininess: 90 }), 0.26, -0.283, -0.5));
  vmSoda.add(vmArm(0.27, -0.45, -0.32, 0.15));
})();
vmMap.soda = vmSoda;
Object.keys(vmMap).forEach(function (k) { vm.add(vmMap[k]); vmMap[k].visible = false; });
vmFists.visible = true;
var zoomed = false;
function setZoom(on) {
  if (on === zoomed) return;
  zoomed = on;
  camera.fov = on ? 20 : 72;
  camera.updateProjectionMatrix();
  vm.visible = !on && !driving;
  document.getElementById('scope').classList.toggle('hidden', !on);
  document.getElementById('crosshair').style.display = on ? 'none' : '';
}
function setEquipped(w) {
  if (inside && w && w !== 'fists' && w !== 'snack' && w !== 'soda') playVoice('clerk_scared', 0.55, 45, { ref: clerk });
  setZoom(false);
  gunBloom = 0;
  if (w !== state.equipped && w !== 'fists' && w !== 'snack' && w !== 'soda') equipT = T;   // draw animation
  state.equipped = w;
  // the skinned arms ride inside the equipped viewmodel group so the
  // draw/reload animations move the hands with the gun
  if (psxArms) {
    if (w === 'fists') { vmFists.add(psxArms.root); vmFists.rotation.set(0, 0, 0); armsPose(psxArms, 'idle', T); }
    else if (GUNHOLD_GROUPS[w]) { vmMap[w].add(psxArms.root); armsPose(psxArms, gunHold.clip, gunHold.t, true); solveSupportIK(w); }
  }
  vm.visible = !zoomed && !driving;
  Object.keys(vmMap).forEach(function (k) { vmMap[k].visible = (k === w); });
  var sub = w === 'fists' ? 'punch for cash' : (w === 'rifle' ? 'right-click: scope' : (w === 'rocket' ? '5s reload' : (w === 'snack' ? 'left-click: eat (+50 hp) — x' + state.snacks : (w === 'soda' ? 'left-click: drink (+25 hp) — x' + state.sodas : 'ammo: &#8734;'))));
  document.getElementById('weaponBox').innerHTML = WEAPONS[w].name + '<br><small>' + sub + '</small>';
}

// ---------------- combat ----------------
var raycaster = new THREE.Raycaster();
var npcRootsAlive = [];
function tryAttack() {
  if (!state.running || state.menu || state.dead || driving) return;
  var w = WEAPONS[state.equipped];
  if (w.snack) {
    if (T - punchT < w.rate) return;
    punchT = T;
    if (state.equipped === 'soda') { consumeSoda(); return; }   // vending soda (streetprops)
    if (state.snacks > 0) {
      state.snacks--;
      state.hp = Math.min(100, state.hp + 50);
      sfx('eat');
      popup('+50 HP');
      if (state.snacks <= 0) setEquipped('fists');
      else setEquipped('snack'); // refresh the counter in the HUD
    }
    return;
  }
  if (w.melee) {
    if (T - punchT < w.rate) return;
    punchT = T; punchSide = !punchSide; punchSlap = Math.random() < 0.2; sfx('whoosh');
    meleeHit = true;   // fists: damageNPC rolls fight-back + punch reacts (ranged resets this in the raycast path)
    var fx = -Math.sin(yaw), fz = -Math.cos(yaw), best = null, bestD = 99, bestCop = null;
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i]; if (n.state === 'down' || n.state === 'hidden') continue;
      var dx = n.x - player.x, dz = n.z - player.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d < w.range && (dx * fx + dz * fz) / (d || 1) > 0.55 && d < bestD) { best = n; bestCop = null; bestD = d; }
    }
    for (i = 0; i < cops.length; i++) {
      var cp = cops[i]; if (cp.state === 'down') continue;
      var cdx = cp.x - player.x, cdz = cp.z - player.z, cd = Math.sqrt(cdx * cdx + cdz * cdz);
      if (cd < w.range && (cdx * fx + cdz * fz) / (cd || 1) > 0.55 && cd < bestD) { bestCop = cp; best = null; bestD = cd; }
    }
    var bestCopM = -1;
    if (isClient()) for (i = 0; i < copsM.length; i++) {
      var cpm = copsM[i];
      var mdx = cpm.x - player.x, mdz = cpm.z - player.z, md = Math.sqrt(mdx * mdx + mdz * mdz);
      if (md < w.range && (mdx * fx + mdz * fz) / (md || 1) > 0.55 && md < bestD) { bestCopM = i; best = null; bestCop = null; bestD = md; }
    }
    var bestRemote = null;
    for (var rid2 in net.remotes) {
      var rm = net.remotes[rid2]; if (rm.dead) continue;
      var rdx = rm.x - player.x, rdz = rm.z - player.z, rd = Math.sqrt(rdx * rdx + rdz * rdz);
      if (rd < w.range && (rdx * fx + rdz * fz) / (rd || 1) > 0.55 && rd < bestD) { bestRemote = rm; best = null; bestCop = null; bestCopM = -1; bestD = rd; }
    }
    if (best) {
      puff(new THREE.Vector3(best.x, 1.3, best.z), 0xd96a4f);
      if (isClient()) netToHost({ t: 'dmgNpc', i: npcs.indexOf(best), dmg: w.dmg, kx: fx, kz: fz });
      else damageNPC(best, w.dmg, fx, fz);
    }
    else if (bestCop) { damageCop(bestCop, w.dmg, fx, fz); puff(new THREE.Vector3(bestCop.x, 1.3, bestCop.z), 0xd96a4f); }
    else if (bestCopM >= 0) {
      puff(new THREE.Vector3(copsM[bestCopM].x, 1.3, copsM[bestCopM].z), 0xd96a4f);
      netToHost({ t: 'dmgCop', id: copsM[bestCopM].nid, dmg: w.dmg, kx: fx, kz: fz });
      if (!copsM[bestCopM].down) {
        if (state.wanted < 1) setWanted(1);   // hurting a cop is star #1 — fists included
        lastCrimeT = T;
      }
    }
    else if (bestRemote) { netSendHit(bestRemote.id, w.dmg, true); puff(new THREE.Vector3(bestRemote.x, 1.3, bestRemote.z), 0xd96a4f); }
    // connecting sounds different from swinging — and a slap CRACKS
    var meleeAt = best ? best : (bestCop ? bestCop : (bestCopM >= 0 ? copsM[bestCopM] : bestRemote));
    if (meleeAt) sfx(punchSlap ? 'slap' : 'punchhit', { x: meleeAt.x, z: meleeAt.z, range: 45 });
    return;
  }
  if (T - (lastShotBy[state.equipped] || -99) < w.rate) return;
  lastShotBy[state.equipped] = T; lastShot = T; recoil = 1;
  if (w.rocket) {
    // RPG: no front muzzle flash — the launch kicks smoke out the REAR tube
    recoil = 2.2;
    if (rpgWarhead) rpgWarhead.visible = false;   // tube empties instantly
    var bbDir = new THREE.Vector3(); camera.getWorldDirection(bbDir);
    var bbP = camera.position.clone().addScaledVector(bbDir, -0.9);
    puff(new THREE.Vector3(bbP.x, bbP.y - 0.3, bbP.z), 0x9a9a94);
    puff(new THREE.Vector3(bbP.x - bbDir.x * 0.5, bbP.y - 0.35, bbP.z - bbDir.z * 0.5), 0x767670);
    fireRocket();
    recoilPitch += 0.04;
    return;
  }
  flash.visible = true; flash.position.set(w.flashAt[0], w.flashAt[1], w.flashAt[2]); flash.rotation.z = Math.random() * Math.PI; flash.scale.setScalar((w.flashScale || 1) * (0.85 + Math.random() * 0.35)); flashT = 0.045;
  if (flashTexs.length) flash.material.map = flashTexs[(Math.random() * flashTexs.length) | 0];
  sfx(state.equipped);
  var dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  // bloom weapons (SMG): tight while tapping, blossoms under sustained fire
  var sp = w.spread;
  if (w.spreadMax) { sp = Math.min(w.spreadMax, w.spread + gunBloom); gunBloom += w.bloomPerShot; }
  dir.x += (Math.random() - 0.5) * sp * 2; dir.y += (Math.random() - 0.5) * sp * 2; dir.z += (Math.random() - 0.5) * sp * 2; dir.normalize();
  raycaster.set(camera.position.clone(), dir); raycaster.far = 300;
  npcRootsAlive.length = 0;
  for (var k = 0; k < npcs.length; k++) if (npcs[k].state !== 'down' && npcs[k].state !== 'hidden') npcRootsAlive.push(npcs[k].mesh);
  for (k = 0; k < cops.length; k++) if (cops[k].state !== 'down') npcRootsAlive.push(cops[k].mesh);
  if (isClient()) for (k = 0; k < copsM.length; k++) npcRootsAlive.push(copsM[k].mesh);
  for (k = 0; k < cars.length; k++) if (!cars[k].exploded) npcRootsAlive.push(cars[k].car.group);
  for (var rid in net.remotes) { var rr = net.remotes[rid]; if (rr.dead) continue; npcRootsAlive.push(rr.drv && rr.car ? rr.car.group : rr.mesh); }
  if (ufo && ufo.mode === 'fly') npcRootsAlive.push(ufo.group);
  if (alien && alien.state !== 'dead') npcRootsAlive.push(alien.mesh);
  var hits = raycaster.intersectObjects(npcRootsAlive.concat(solidMeshes), true);
  // laser weapons draw the whole beam to wherever it lands
  if (w.laser) {
    var bp = hits.length ? hits[0].point : camera.position.clone().add(dir.clone().multiplyScalar(160));
    // start at the muzzle corner so the beam is visible in first person
    // (a dead-on-axis cylinder renders as a dot)
    var rgt = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    var mo = camera.position.clone().add(dir.clone().multiplyScalar(1.3)).add(rgt.multiplyScalar(0.24));
    spawnBeam(mo.x, mo.y - 0.3, mo.z, bp.x, bp.y, bp.z, 0x66ff88);
  }
  if (hits.length) {
    var h = hits[0], o = h.object, npcHit = null, copHit = null, carHit = null, remoteHit = null, copMHit = -1, ufoHit = false, alienHit = false, atmHit = null;
    while (o) {
      if (o.userData && o.userData.npc) { npcHit = o.userData.npc; break; }
      if (o.userData && o.userData.cop) { copHit = o.userData.cop; break; }
      if (o.userData && o.userData.copM !== undefined) { copMHit = o.userData.copM; break; }
      if (o.userData && o.userData.remoteId) { remoteHit = o.userData.remoteId; break; }
      if (o.userData && o.userData.trafficCar) { carHit = o.userData.trafficCar; break; }
      if (o.userData && o.userData.ufo) { ufoHit = true; break; }
      if (o.userData && o.userData.alien) { alienHit = true; break; }
      if (o.userData && o.userData.atm) { atmHit = o.userData.atm; break; }
      o = o.parent;
    }
    if (ufoHit) {
      if (isClient()) { puff(h.point, 0xffe08a); netToHost({ t: 'dmgUfo', dmg: w.dmg }); }
      else damageUfo(w.dmg, h.point);
    }
    else if (alienHit) {
      puff(h.point, 0x66ff88);
      if (isClient()) netToHost({ t: 'dmgAlien', dmg: w.dmg, kx: dir.x, kz: dir.z });
      else damageAlien(w.dmg, dir.x, dir.z);
    }
    else if (npcHit) {
      puff(h.point, 0xd93a2a);
      meleeHit = state.equipped === 'fists';
      if (isClient()) netToHost({ t: 'dmgNpc', i: npcs.indexOf(npcHit), dmg: w.dmg, kx: dir.x, kz: dir.z });
      else damageNPC(npcHit, w.dmg, dir.x, dir.z);
    }
    else if (remoteHit) { netSendHit(remoteHit, w.dmg, true); puff(h.point, 0xd93a2a); }
    else if (copMHit >= 0) {
      puff(h.point, 0xd93a2a);
      netToHost({ t: 'dmgCop', id: copsM[copMHit] ? copsM[copMHit].nid : undefined, dmg: w.dmg, kx: dir.x, kz: dir.z });
      if (copsM[copMHit] && !copsM[copMHit].down) {
        if (state.wanted < 1) setWanted(1);   // hurting a cop is star #1, even a host-simmed one
        lastCrimeT = T;
      }
    }
    else if (copHit) { damageCop(copHit, w.dmg, dir.x, dir.z); puff(h.point, 0xd93a2a); }
    else if (carHit) {
      puff(h.point, 0xd8c860);
      if (carHit.playerDriven && carHit !== driving) {
        // ANOTHER player is driving this car — route the shot so the host
        // forwards the damage to the real driver (their client applies carHP,
        // same path cop fire uses). without this, PvP car combat did nothing.
        if (isClient()) netToHost({ t: 'shootCar', i: cars.indexOf(carHit), rate: w.rate, dmg: w.dmg });
        else if (carHit.drivenBy) netSendHit(carHit.drivenBy, w.dmg);
      } else if (carHit.stolen) {
        // your (or a parked stolen) ride takes real damage
        carHit.carHP = (carHit.carHP === undefined ? 100 : carHit.carHP) - w.dmg;
        if (carHit.carHP <= 0) igniteCar(carHit);
      } else if (isClient()) {
        netToHost({ t: 'shootCar', i: cars.indexOf(carHit), rate: w.rate });
      } else {
        carHit.dmgT += w.rate;
        if (carHit.dmgT >= 1.5 && goBerserk(carHit)) { popup('WRECKED!'); creditCivKill(); }   // trashing a ride weighs like a body (credit once, on the wreck)
      }
    }
    else if (atmHit) shootAtm(atmHit, h.point);   // streetprops: burst the ATM open
    else puff(h.point, 0xbbbbbb);
  }
  recoilPitch += 0.012 + Math.random() * 0.008;
}

function hurtPlayer(d) {
  if (state.dead) return;
  state.hp -= d; state.lastHurt = T;
  var f = document.getElementById('dmgFlash'); f.style.transition = 'none'; f.style.opacity = 0.45;
  requestAnimationFrame(function () { f.style.transition = 'opacity .45s'; f.style.opacity = 0; });
  if (state.hp <= 0) {
    state.hp = 0; state.dead = true;
    if (state.wanted >= 2) playVoice('cop_down', 0.45, 10);
    if (driving) {
      // tell the host the car is free, or it keeps chasing our respawned ghost
      if (isClient()) { var dcp = driving.car.group; netToHost({ t: 'park', i: cars.indexOf(driving), x: dcp.position.x, z: dcp.position.z, ry: dcp.rotation.y }); }
      driving.pspeed = 0; driving = null; document.getElementById('crosshair').style.display = ''; vm.visible = true;
    }
    if (inside) exitStore(true);   // clean up interior cops + lockout, respawn is outside anyway
    closeMenus(false); closeChat(false); closeBug();   // dying with a panel open left it stuck (frozen after respawn) + a buy-guns-back-while-dead exploit
    var lost = Math.floor(state.money * 0.25); state.money -= lost;
    document.getElementById('deadInfo').textContent = lost > 0 ? 'You dropped $' + lost + ' on the pavement.' : 'At least you were already broke.';
    document.getElementById('deadScreen').classList.remove('hidden');
    state.wanted = 0; state.civKills = 0; state.copKills = 0; updateStarsHUD();
    // drop everything you were carrying
    var dropped = 0;
    GUN_LIST.forEach(function (k) {
      if (!state.owned[k]) return;
      var a = (dropped * 1.3) + Math.random();
      var ddx = player.x + Math.cos(a) * (1.5 + dropped * 0.8), ddz = player.z + Math.sin(a) * (1.5 + dropped * 0.8);
      if (isClient()) netToHost({ t: 'dropGun', k: k, x: ddx, z: ddz });   // host owns the shared drop list
      else dropWeapon(k, ddx, ddz);
      state.owned[k] = false;
      dropped++;
    });
    setEquipped('fists');
    setTimeout(function () { player.x = spawnX; player.z = spawnZ; player.y = EYE; yaw = 0; pitch = 0; recoilPitch = 0; state.hp = 100; state.dead = false; document.getElementById('deadScreen').classList.add('hidden'); }, 2600);
  }
}

// ---------------- audio ----------------
// ---------------- character creator (main menu) ----------------
var creatorOpen = false, cprev = null;
var CREATOR_ROWS = [
  { k: 'skin', n: 'SKIN', pal: CSKIN },
  { k: 'build', n: 'BUILD', names: ['TINY', 'SHORT', 'MID', 'TALL', 'BIG'] },
  { k: 'hair', n: 'HAIR', names: HAIRN },
  { k: 'hairC', n: 'HAIR COLOR', pal: CHAIRC },
  { k: 'eyes', n: 'EYES', names: EYESN },
  { k: 'mouth', n: 'MOUTH', names: MOUTHN },
  { k: 'faceX', n: 'FACE', names: FACEXN },
  { k: 'preset', n: 'PRESET', names: ['CUSTOM', 'JESS', 'MARCUS', 'SPIKE'].concat((typeof MESHY_CHARS !== 'undefined') ? MESHY_CHARS.filter(function (m) { return !m.role || m.role === 'civ'; }).map(function (m) { return m.n; }) : []) },
  { k: 'glasses', n: 'GLASSES', names: GLASSN },
  { k: 'shirt', n: 'SHIRT', names: SHIRTN },
  { k: 'shirtC', n: 'SHIRT COLOR', pal: CSHIRT },
  { k: 'shirtC2', n: 'ACCENT', pal: CSHIRT },
  { k: 'pants', n: 'LEGS', names: LEGSN },
  { k: 'pantsC', n: 'LEGS COLOR', pal: CPANTS },
  { k: 'shoeC', n: 'SHOES', pal: CSHOE },
  { k: 'hat', n: 'HAT', names: HATN, max: 4 },       // POLICE hat stays cop-only
  { k: 'hatC', n: 'HAT COLOR', pal: CHAT },
  { k: 'extra', n: 'GEAR', names: GEARN }
];
function initCreatorPreview() {
  if (cprev) return;
  var cv = document.getElementById('charCanvas');
  var r = new THREE.WebGLRenderer({ canvas: cv, antialias: false });
  r.setSize(96, 126, false);            // tiny internal res, upscaled = PSX chunk
  r.setClearColor(0x10141c, 1);
  var sc = new THREE.Scene();
  sc.add(new THREE.AmbientLight(0xffffff, 0.78));
  var dl = new THREE.DirectionalLight(0xfff2dd, 0.75); dl.position.set(1.4, 2.2, 2); sc.add(dl);
  var cam = new THREE.PerspectiveCamera(38, 96 / 126, 0.1, 20);
  cam.position.set(0, 1.16, 2.7); cam.lookAt(0, 0.95, 0);
  var floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 18), lamb({ color: 0x2b3242 }));
  floor.rotation.x = -Math.PI / 2; sc.add(floor);
  cprev = { r: r, scene: sc, cam: cam, char: null, spin: 0.55, phase: 0 };
}
function refreshCreatorChar() {
  if (!cprev) return;
  if (cprev.char) {
    cprev.scene.remove(cprev.char);
    cprev.char.traverse(function (o) { if (o.material && o.material.map && o.material.map.dispose && presetTexCache.indexOf(o.material.map) < 0) o.material.map.dispose(); });
  }
  cprev.char = buildCharacter(playerChar);
  cprev.char.rotation.y = cprev.spin;
  cprev.scene.add(cprev.char);
}
function renderCreatorRows() {
  var rows = document.getElementById('charRows'); rows.innerHTML = '';
  CREATOR_ROWS.forEach(function (row) {
    var max = row.max || CC_MAX[row.k];
    var div = document.createElement('div'); div.className = 'crow';
    var lab = document.createElement('span'); lab.className = 'clab'; lab.textContent = row.n;
    var left = document.createElement('button'); left.innerHTML = '&#9664;';
    var val = document.createElement('span'); val.className = 'cval';
    var right = document.createElement('button'); right.innerHTML = '&#9654;';
    function show() {
      if (row.pal) { val.innerHTML = ''; var sw = document.createElement('span'); sw.className = 'swatch'; sw.style.background = row.pal[playerChar[row.k]]; val.appendChild(sw); }
      else val.textContent = row.names[playerChar[row.k]];
    }
    function bump(d) { playerChar[row.k] = (playerChar[row.k] + d + max) % max; show(); savePlayerChar(); refreshCreatorChar(); }
    left.onclick = function () { bump(-1); };
    right.onclick = function () { bump(1); };
    show();
    div.appendChild(lab); div.appendChild(left); div.appendChild(val); div.appendChild(right);
    rows.appendChild(div);
  });
}
function openCreator() {
  initCreatorPreview();
  if (playerChar.hat === 4) playerChar.hat = 0;
  renderCreatorRows();
  refreshCreatorChar();
  document.getElementById('charPanel').classList.remove('hidden');
  creatorOpen = true;
}
function closeCreator() {
  document.getElementById('charPanel').classList.add('hidden');
  creatorOpen = false;
  savePlayerChar();
  retintPSXArms();
}
function renderCreatorFrame(dt) {
  if (!creatorOpen || !cprev || !cprev.char) return;
  cprev.spin += dt * 0.85;
  cprev.phase += dt * 5;
  cprev.char.rotation.y = cprev.spin;
  animPerson(cprev.char, 2, dt, cprev.phase);
  cprev.r.render(cprev.scene, cprev.cam);
}

// ---------------- world fx: destructible props, fountain, underwater ----------------
var underwater = false;
function setUnderwater(on) {
  if (on === underwater) return;
  underwater = on;
  var el = document.getElementById('waterFx');
  if (el) el.classList.toggle('hidden', !on);
  if (ac && uwGain) uwGain.gain.setTargetAtTime(on ? 0.65 : 0, ac.currentTime, 0.12);
}
function breakProp(b, dirX, dirZ) {
  if (b.broken) return;
  b.broken = true; b.thudded = false; b.fallT = 0; b.respawnT = 60;
  var d = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
  b.fx = dirX / d; b.fz = dirZ / d;
  if (b.col) b.col.active = false;   // toppled trunk stops blocking until respawn
  if (b.light) { b.light.broken = true; b.light.glow.visible = false; b.light.pool.visible = false; }
  var cols = b.type === 'tree' ? [0x4c8038, 0x3f6f2e, 0x7a5a3a] : [0xffe9a8, 0x8a8f94, 0xd8d8d4];
  var n = b.type === 'tree' ? 14 : 9;
  for (var i = 0; i < n; i++) {
    puff(new THREE.Vector3(
      b.x + (Math.random() - 0.5) * 2.4,
      0.6 + Math.random() * (b.type === 'tree' ? 4.5 : 6.5),
      b.z + (Math.random() - 0.5) * 2.4), cols[i % 3]);
  }
  sfx('crash', { x: b.x, z: b.z, range: 90 });
  if (b.kind) onStreetPropBreak(b);   // parking meters spill change, hydrants gush
}
// OBB push keeping the on-foot player out of a still car shell (parked cars,
// burned-out husks). Moving traffic keeps its own shove/hurt path.
function carShellPush(cx2, cz2, ry2) {
  var pkx = player.x - cx2, pkz = player.z - cz2;
  var pfx = Math.cos(ry2), pfz = -Math.sin(ry2);
  var plon = pkx * pfx + pkz * pfz, plat = -pkx * pfz + pkz * pfx;
  if (Math.abs(plon) < 2.75 && Math.abs(plat) < 1.5) {
    var pushLon = (plon >= 0 ? 2.75 : -2.75) - plon;
    var pushLat = (plat >= 0 ? 1.5 : -1.5) - plat;
    if (Math.abs(pushLat) < Math.abs(pushLon)) { player.x += -pfz * pushLat; player.z += pfx * pushLat; }
    else { player.x += pfx * pushLon; player.z += pfz * pushLon; }
  }
}
var fallAxis = new THREE.Vector3(), fallQ = new THREE.Quaternion();
function updateWorldFx(dt) {
  updateSignals(dt);   // traffic-signal cycle (corridor details section)
  // cars snap trees & street lights (works on host and on mirrored client cars)
  for (var i = 0; i < cars.length; i++) {
    var c = cars[i];
    if (c.car.beam) {   // headlights follow the street lights (any peer; parked = off)
      var bv = lampsOn && !c.exploded && !c.parked;
      if (c.car.beam.visible !== bv) c.car.beam.visible = bv;
    }
    var m = c.car.group.position;
    var hx = c._bx === undefined ? m.x : c._bx, hz = c._bz === undefined ? m.z : c._bz;
    var mvx = m.x - hx, mvz = m.z - hz;
    c._bx = m.x; c._bz = m.z;
    // brake detection: player car by input flag (updateDriving), everything else
    // (traffic/berserk/shoved + mirrored client cars) by smoothed position-delta decel
    var spdNow = Math.sqrt(mvx * mvx + mvz * mvz) / Math.max(dt, 1e-4);
    if (spdNow > 60) spdNow = c._sspd || 0;   // lane wrap / respawn teleport: ignore
    c._sspd = c._sspd === undefined ? spdNow : c._sspd + (spdNow - c._sspd) * Math.min(1, dt * 8);
    var dec = ((c._pss === undefined ? c._sspd : c._pss) - c._sspd) / Math.max(dt, 1e-4);
    c._pss = c._sspd;
    var braking = c === driving ? !!c.brakeIn : (c.shoveT > 0 || (dec > 4 && c._sspd > 0.6));
    updateCarLights(c, dt, braking);
    if (c.exploded) {
      // the leftover wreck husk is solid-ish on foot, same as a parked car
      if (c.husk && !driving && !state.dead) carShellPush(c.husk.position.x, c.husk.position.z, c.husk.rotation.y);
      continue;
    }
    // parked cars are solid-ish to the on-foot player (traffic only shoves/hurts;
    // a still car you can lean on while breaking in must not be a ghost)
    if (c.parked && !driving && !state.dead) carShellPush(m.x, m.z, c.car.group.rotation.y);
    var v2 = (mvx * mvx + mvz * mvz) / Math.max(dt * dt, 1e-6);
    if (v2 < 9) continue;                       // too slow to snap anything
    for (var j = 0; j < breakables.length; j++) {
      var b = breakables[j];
      if (b.broken) continue;
      var dx = b.x - m.x, dz = b.z - m.z;
      var rr = 2 + b.r;
      if (dx * dx + dz * dz < rr * rr) breakProp(b, mvx, mvz);
    }
  }
  // falling animation + respawn
  for (var k = 0; k < breakables.length; k++) {
    var bb = breakables[k];
    if (!bb.broken) continue;
    if (bb.fallT < 1) {
      bb.fallT = Math.min(1, bb.fallT + dt * 1.7);
      var e = 1 - (1 - bb.fallT) * (1 - bb.fallT);   // ease-out slam
      fallAxis.set(bb.fz, 0, -bb.fx).normalize();
      fallQ.setFromAxisAngle(fallAxis, e * 1.52);
      bb.g.quaternion.copy(fallQ).multiply(bb.yq);
      if (bb.fallT >= 1 && !bb.thudded) {
        bb.thudded = true;
        sfx('thud', { x: bb.x, z: bb.z, range: 70 });
        for (var pi = 0; pi < 5; pi++) puff(new THREE.Vector3(bb.x + bb.fx * (2 + Math.random() * 3), 0.5, bb.z + bb.fz * (2 + Math.random() * 3)), 0x8a8478);
      }
    }
    bb.respawnT -= dt;
    if (bb.respawnT <= 0) {
      bb.broken = false; bb.fallT = 0;
      bb.g.quaternion.copy(bb.yq);
      if (bb.col) bb.col.active = true;
      if (bb.light) { bb.light.broken = false; bb.light.glow.visible = lampsOn; bb.light.pool.visible = lampsOn; }
    }
  }
  // fountain spray
  for (var fi = 0; fi < fountainDrops.length; fi++) {
    var fd = fountainDrops[fi];
    if (fd.delay > 0) { fd.delay -= dt; fd.mesh.visible = false; continue; }
    var fp = fd.mesh.position;
    if (!fd.mesh.visible || fp.y < WATER_Y) {
      fd.mesh.visible = true;
      fp.set(LAKE.x, 2.5, LAKE.z);
      var a = Math.random() * Math.PI * 2, sp = 0.7 + Math.random() * 1.7;
      fd.vx = Math.cos(a) * sp; fd.vz = Math.sin(a) * sp;
      fd.vy = 5.2 + Math.random() * 2.6;
    }
    fd.vy -= 9.5 * dt;
    fp.x += fd.vx * dt; fp.y += fd.vy * dt; fp.z += fd.vz * dt;
  }
  // head under the surface → blue filter + underwater loop
  setUnderwater(state.running && !inside && !driving && !state.dead && player.y < WATER_Y - 0.05);
}

// ---------------- audio ----------------
var ac = null, ambientStarted = false, rainGain = null, uwGain = null;
function initAudio() { if (ac) return; try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } startAmbient(); }
function startAmbient() {
  if (!ac || ambientStarted) return;
  ambientStarted = true;
  // quiet looping brown noise bed
  var len = ac.sampleRate * 4, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0), last = 0;
  for (var i = 0; i < len; i++) { var w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  var src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
  var g = ac.createGain(); g.gain.value = 0.016;
  src.connect(g); g.connect(ac.destination); src.start();
  // rain loop (white noise through lowpass), silent until it rains
  var rl = ac.sampleRate * 2, rb = ac.createBuffer(1, rl, ac.sampleRate), rd = rb.getChannelData(0);
  for (i = 0; i < rl; i++) rd[i] = Math.random() * 2 - 1;
  var rs = ac.createBufferSource(); rs.buffer = rb; rs.loop = true;
  var rf = ac.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 950;
  rainGain = ac.createGain(); rainGain.gain.value = 0;
  rs.connect(rf); rf.connect(rainGain); rainGain.connect(ac.destination); rs.start();
  // underwater loop: muffled brown noise with a slow wobble, silent until you dive
  var ul = ac.sampleRate * 3, ub = ac.createBuffer(1, ul, ac.sampleRate), ud = ub.getChannelData(0), ulast = 0;
  for (i = 0; i < ul; i++) { var uw = Math.random() * 2 - 1; ulast = (ulast + 0.03 * uw) / 1.03; ud[i] = ulast * 3.2; }
  var us = ac.createBufferSource(); us.buffer = ub; us.loop = true;
  var uf = ac.createBiquadFilter(); uf.type = 'lowpass'; uf.frequency.value = 330; uf.Q.value = 5;
  var ulfo = ac.createOscillator(); ulfo.frequency.value = 0.45;
  var ulg = ac.createGain(); ulg.gain.value = 150;
  ulfo.connect(ulg); ulg.connect(uf.frequency); ulfo.start();
  uwGain = ac.createGain(); uwGain.gain.value = 0;
  us.connect(uf); uf.connect(uwGain); uwGain.connect(ac.destination); us.start();
  if (underwater) uwGain.gain.value = 0.65;
}
// ---- PS1-crunched TTS dialogue (optional voicelines.js) ----
var voiceBufs = {}, voiceLastT = {}, dealerMet = false, shopBought = false, clerkScaredT = -99;
// per-peer voice-play instrumentation (dbg): local = voices this peer played
// itself, net = voices replayed from a host broadcast, bcast = world voices
// this (host) peer broadcast to clients.
var dbgVoiceLocal = 0, dbgVoiceNet = 0, dbgVoiceBcast = 0;
function playVoice(id, gain, cd, at) {
  if (typeof VOICE_LINES === 'undefined' || !VOICE_LINES[id]) return;
  if (at) voicePos(at);
  // host broadcasts world voices (at.net) so joined clients hear the shared
  // world's chatter/reactions positionally — regardless of the HOST's own
  // earshot, since each client re-tests earshot at its own position
  var host = isHost() && at && at.net;
  var heard = voiceEarshot(at);
  if (!host && !heard) return;
  if (voiceLastT[id] !== undefined && T - voiceLastT[id] < (cd || 5)) return;
  voiceLastT[id] = T;
  if (host) { netBroadcast({ t: 'voice', id: id, g: gain || 0.5, x: Math.round(at.x * 10), z: Math.round(at.z * 10), yl: at.yell ? 1 : 0, py: at.y === undefined ? undefined : Math.round(at.y * 10) }); dbgVoiceBcast++; }
  if (!ac || !heard) return;
  function playBuf(buf) {
    var src = ac.createBufferSource(); src.buffer = buf;
    src.connect(voiceOut(gain || 0.5, at)); src.start();
    trackVoice(src, at); dbgVoiceLocal++;
  }
  if (voiceBufs[id]) { playBuf(voiceBufs[id]); return; }
  var bytes = b64Bytes(VOICE_LINES[id].split(',')[1]);
  ac.decodeAudioData(bytes.buffer, function (buf) { voiceBufs[id] = buf; playBuf(buf); }, function () { });
}
var voiceGroupT = {};
function playVoiceAny(ids, gain, cdKey, cd, at) {
  if (at) voicePos(at);
  var host = isHost() && at && at.net;   // host must not gate on its own earshot — it still broadcasts
  if (!host && !voiceEarshot(at)) return;
  if (voiceGroupT[cdKey] !== undefined && T - voiceGroupT[cdKey] < cd) return;
  voiceGroupT[cdKey] = T;
  playVoice(ids[(Math.random() * ids.length) | 0], gain, 0, at);
}
// per-NPC voice lines (optional npcvoices1..N.js chunks) — returns false when
// the character has no pack entry (or its chunk hasn't late-loaded yet) so
// callers can fall back to the generic barks
var npcVoiceBufs = {}, npcVoiceLive = {}, npcVoiceSrc = {}, npcVoiceCycle = {};
function stopNpcVoice(name) {   // cut a character's line short (death)
  if (!name) return;
  npcVoiceLive[name] = null;    // cancels a play still waiting on decode
  var s = npcVoiceSrc[name];
  if (s) { try { s.stop(); } catch (e) { } npcVoiceSrc[name] = null; }
}
function playNpcVoice(name, cat, gain, cd, at) {
  if (!name || typeof NPC_VOICES === 'undefined' || !NPC_VOICES[name] || !NPC_VOICES[name][cat]) return false;
  if (at) voicePos(at);
  var host = isHost() && at && at.net;
  var heard = voiceEarshot(at);
  if (!host && !heard) return true;   // too far to hear ANY voice — suppress fallback too
  var key = 'npcv_' + name;
  if (voiceGroupT[key] !== undefined && T - voiceGroupT[key] < (cd || 4)) return true;
  voiceGroupT[key] = T;
  var arr = NPC_VOICES[name][cat];
  // cycle through the lines so you don't hear the same one twice in a row
  var ck = name + '_' + cat;
  if (npcVoiceCycle[ck] === undefined) npcVoiceCycle[ck] = (Math.random() * arr.length) | 0;
  else npcVoiceCycle[ck] = (npcVoiceCycle[ck] + 1) % arr.length;
  var idx = npcVoiceCycle[ck];
  // broadcast the exact character+line so a joined client plays the same one
  if (host) { netBroadcast({ t: 'voice', nm: name, ct: cat, ix: idx, g: gain || 0.45, x: Math.round(at.x * 10), z: Math.round(at.z * 10), yl: at.yell ? 1 : 0, py: at.y === undefined ? undefined : Math.round(at.y * 10) }); dbgVoiceBcast++; }
  if (!ac || !heard) return true;
  var id = name + '_' + cat + '_' + idx;
  var token = {};
  npcVoiceLive[name] = token;
  function playBuf(buf) {
    if (npcVoiceLive[name] !== token) return;   // died / superseded while decoding
    var prev = npcVoiceSrc[name];
    if (prev) { try { prev.stop(); } catch (e) { } }
    var src = ac.createBufferSource(); src.buffer = buf;
    src.connect(voiceOut(gain || 0.45, at)); src.start();
    trackVoice(src, at); dbgVoiceLocal++;
    npcVoiceSrc[name] = src;
    src.onended = function () { if (npcVoiceSrc[name] === src) npcVoiceSrc[name] = null; };
  }
  if (npcVoiceBufs[id]) { playBuf(npcVoiceBufs[id]); return true; }
  var bytes = b64Bytes(arr[idx].split(',')[1]);
  ac.decodeAudioData(bytes.buffer, function (buf) { npcVoiceBufs[id] = buf; playBuf(buf); }, function () { });
  return true;
}
// client-side replay of a host-broadcast world voice ({t:'voice'}). Purely
// render/audio: plays the exact line at the mirror's world position, re-testing
// earshot locally. Never re-broadcasts (client), never touches simulation.
function playNetVoice(m) {
  if (!ac) return;
  var at = { x: m.x / 10, z: m.z / 10, yell: m.yl ? 1 : 0 };
  if (m.py !== undefined) at.y = m.py / 10;
  if (!voiceEarshot(at)) return;
  var url, cache, cacheId;
  if (m.nm) {
    if (typeof NPC_VOICES === 'undefined' || !NPC_VOICES[m.nm] || !NPC_VOICES[m.nm][m.ct] || !NPC_VOICES[m.nm][m.ct][m.ix]) return;
    url = NPC_VOICES[m.nm][m.ct][m.ix]; cacheId = m.nm + '_' + m.ct + '_' + m.ix; cache = npcVoiceBufs;
  } else {
    if (typeof VOICE_LINES === 'undefined' || !VOICE_LINES[m.id]) return;
    url = VOICE_LINES[m.id]; cacheId = m.id; cache = voiceBufs;
  }
  var gain = m.g || 0.5;
  function playBuf(buf) {
    var src = ac.createBufferSource(); src.buffer = buf;
    src.connect(voiceOut(gain, at)); src.start();
    trackVoice(src, at); dbgVoiceNet++;
  }
  if (cache[cacheId]) { playBuf(cache[cacheId]); return; }
  var bytes = b64Bytes(url.split(',')[1]);
  ac.decodeAudioData(bytes.buffer, function (buf) { cache[cacheId] = buf; playBuf(buf); }, function () { });
}
function meshyNameFromCfg(cfg) {
  if (!cfg || !cfg.preset || cfg.preset <= PSX_SKINS.length) return null;
  var mi = MESHY_CIVS[cfg.preset - 1 - PSX_SKINS.length];
  return mi !== undefined ? MESHY_LIST[mi].n : null;
}
// ---- positional voice audio ----
// Lines emanate from the speaker (stereo pan + linear falloff), yells carry
// twice as far, and everything doppler-shifts as the range opens or closes.
// `at` may carry a LIVE source in at.ref — an npc/cop/remote object (x/z
// fields) or a mesh — and the panner then follows the mover every frame.
// Plain {x,z} anchors still work for static/world-event sounds.
var VOICE_RANGE = 26;    // how far normal speech carries; yells reach double
var DOPPLER_C = 343;     // real speed of sound (m/s) — world units are meters
var activeVoices = [];
var audioFwd = new THREE.Vector3();
var voicePosTmp = new THREE.Vector3();
function voicePos(at) {
  // refresh at.x/z/y from the live ref; keeps the LAST KNOWN spot when the
  // source dies/despawns mid-line (a removed mesh must never crash a voice)
  var r = at && at.ref;
  if (!r) return at;
  try {
    if (r.isObject3D) {
      r.getWorldPosition(voicePosTmp);
      at.x = voicePosTmp.x; at.z = voicePosTmp.z; at.y = voicePosTmp.y + 1.6;
    } else if (typeof r.x === 'number' && typeof r.z === 'number') {
      at.x = r.x; at.z = r.z;
      at.y = r.baseY !== undefined ? r.baseY + 1.6 : (typeof r.y === 'number' ? r.y : 1.6);
    }
  } catch (e) { at.ref = null; }   // ref went away — freeze at last position
  return at;
}
function voiceEarshot(at) {
  if (!at) return true;
  voicePos(at);
  var range = at.range || (at.yell ? VOICE_RANGE * 2 : VOICE_RANGE);
  var dx = at.x - player.x, dz = at.z - player.z, dy = (at.y === undefined ? 1.6 : at.y) - player.y;
  return dx * dx + dz * dz + dy * dy <= range * range;
}
var voiceOutPan = null;   // panner of the most recent voiceOut() — trackVoice claims it
function voiceOut(gain, at) {
  // entry node for a voice chain: plain gain, or gain -> panner when placed
  var g = ac.createGain(); g.gain.value = gain;
  voiceOutPan = null;
  if (!at) { g.connect(ac.destination); return g; }
  voicePos(at);
  var range = at.range || (at.yell ? VOICE_RANGE * 2 : VOICE_RANGE);
  var y = at.y === undefined ? 1.6 : at.y;
  var p = ac.createPanner();
  p.panningModel = 'equalpower';
  p.distanceModel = 'linear';
  p.refDistance = 3; p.maxDistance = range; p.rolloffFactor = 1;
  if (p.positionX) { p.positionX.value = at.x; p.positionY.value = y; p.positionZ.value = at.z; }
  else p.setPosition(at.x, y, at.z);
  g.connect(p); p.connect(ac.destination);
  voiceOutPan = p;
  return g;
}
function trackVoice(src, at) {
  if (!at) return;
  var dx = at.x - player.x, dz = at.z - player.z;
  var v = { src: src, at: at, pan: voiceOutPan, x: at.x, z: at.z, lsx: at.x, lsz: at.z, lastD: Math.sqrt(dx * dx + dz * dz), done: false };
  voiceOutPan = null;
  src.addEventListener('ended', function () { v.done = true; });
  activeVoices.push(v);
}
function dopplerShift(o, d, dt) {
  // o carries its own dopD/dopF state; returns a smoothed pitch multiplier
  var rv = o.dopD === undefined ? 0 : (d - o.dopD) / Math.max(dt, 0.001);
  o.dopD = d;
  var f = DOPPLER_C / (DOPPLER_C + Math.max(-28, Math.min(28, rv)));
  o.dopF = (o.dopF || 1) + (f - (o.dopF || 1)) * Math.min(1, dt * 8);
  return o.dopF;
}
function updateVoiceAudio(dt) {
  if (!ac) return;
  var l = ac.listener;
  if (l) {
    audioFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    if (l.positionX) {
      l.positionX.value = camera.position.x; l.positionY.value = camera.position.y; l.positionZ.value = camera.position.z;
      l.forwardX.value = audioFwd.x; l.forwardY.value = audioFwd.y; l.forwardZ.value = audioFwd.z;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(camera.position.x, camera.position.y, camera.position.z);
      l.setOrientation(audioFwd.x, audioFwd.y, audioFwd.z, 0, 1, 0);
    }
  }
  var idt = 1 / Math.max(dt, 0.001);
  for (var i = activeVoices.length - 1; i >= 0; i--) {
    var v = activeVoices[i];
    if (v.done) { activeVoices.splice(i, 1); continue; }
    // follow the live source (or hold its last known spot once it's gone)
    if (v.at) { voicePos(v.at); v.x = v.at.x; v.z = v.at.z; }
    if (v.pan) {
      var py = v.at && v.at.y !== undefined ? v.at.y : 1.6;
      try {
        if (v.pan.positionX) { v.pan.positionX.value = v.x; v.pan.positionY.value = py; v.pan.positionZ.value = v.z; }
        else v.pan.setPosition(v.x, py, v.z);
      } catch (e) { }
    }
    var dx = v.x - player.x, dz = v.z - player.z, d = Math.sqrt(dx * dx + dz * dz);
    var rv = (d - v.lastD) * idt;   // + = opening range (source AND listener)
    v.lastD = d;
    // the source's own radial velocity comes from its frame-to-frame motion;
    // the remainder of the range rate is listener motion (formula unchanged)
    var ux = d > 0.001 ? dx / d : 0, uz = d > 0.001 ? dz / d : 0;
    var rvS = Math.max(-28, Math.min(28, ((v.x - v.lsx) * ux + (v.z - v.lsz) * uz) * idt));
    v.lsx = v.x; v.lsz = v.z;
    var rvL = Math.max(-28, Math.min(28, rv - rvS));
    var f = (DOPPLER_C / (DOPPLER_C + rvL)) * (DOPPLER_C / (DOPPLER_C + rvS));
    try { v.src.playbackRate.value += (f - v.src.playbackRate.value) * Math.min(1, dt * 10); } catch (e) { }
  }
}
function noiseBurst(dur, freq, gain, out) { if (!ac) return; var n = ac.sampleRate * dur, buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0); for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); var src = ac.createBufferSource(); src.buffer = buf; var f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; var g = ac.createGain(); g.gain.value = gain; src.connect(f); f.connect(g); g.connect(out || ac.destination); src.start(); }
function beep(freq, dur, gain, type, slide, out) { if (!ac) return; var o = ac.createOscillator(), g = ac.createGain(); o.type = type || 'square'; o.frequency.setValueAtTime(freq, ac.currentTime); if (slide) o.frequency.exponentialRampToValueAtTime(slide, ac.currentTime + dur); g.gain.setValueAtTime(gain, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur); o.connect(g); g.connect(out || ac.destination); o.start(); o.stop(ac.currentTime + dur); }
// sfx(kind) is 2D (player-sourced / UI); sfx(kind, at) places the sound in
// the world — everything that has a source in the world should pass one.
function sfx(kind, at) {
  if (!ac) return;
  if (at && !voiceEarshot(at)) return;
  function nb(dur, freq, gain) { noiseBurst(dur, freq, gain, at ? voiceOut(1, at) : null); }
  function bp(freq, dur, gain, type, slide) { beep(freq, dur, gain, type, slide, at ? voiceOut(1, at) : null); }
  switch (kind) {
    case 'pistol': nb(0.14, 1700, 0.5); bp(220, 0.08, 0.12, 'square', 90); break;
    case 'smg': nb(0.09, 2100, 0.35); break;
    case 'raygun': bp(1750, 0.14, 0.22, 'square', 420); bp(880, 0.1, 0.1, 'sawtooth', 220); break;
    case 'laser': bp(1350, 0.2, 0.22, 'sawtooth', 240); nb(0.06, 3000, 0.12); break;
    case 'rifle': nb(0.3, 900, 0.8); bp(120, 0.18, 0.2, 'sawtooth', 45); break;
    case 'whoosh': bp(280, 0.1, 0.1, 'sine', 90); break;
    case 'hit': bp(125 + Math.random() * 45, 0.09, 0.3, 'square', 60 + Math.random() * 25); nb(0.05, 700 + Math.random() * 450, 0.2); break;
    case 'punchhit': nb(0.07, 650 + Math.random() * 500, 0.4); bp(105 + Math.random() * 55, 0.11, 0.32, 'square', 55); break;
    case 'slap': nb(0.045, 3800, 0.55); bp(850 + Math.random() * 200, 0.05, 0.2, 'square', 320); break;
    case 'ko': bp(90, 0.3, 0.35, 'sawtooth', 40); break;
    case 'thud': bp(70, 0.2, 0.4, 'sine', 35); break;
    case 'cash': bp(880, 0.08, 0.15, 'square'); setTimeout(function () { bp(1320, 0.1, 0.15, 'square'); }, 70); break;
    case 'buy': bp(660, 0.09, 0.15, 'square'); setTimeout(function () { bp(990, 0.12, 0.15, 'square'); }, 80); break;
    case 'deny': bp(150, 0.2, 0.25, 'sawtooth', 110); break;
    case 'alarm': bp(760, 0.18, 0.2, 'square'); setTimeout(function () { bp(560, 0.18, 0.2, 'square'); }, 180); setTimeout(function () { bp(760, 0.18, 0.2, 'square'); }, 360); break;
    case 'copshot': nb(0.12, 1500, 0.3); break;
    case 'copsmg': nb(0.08, 1900, 0.22); break;
    case 'grunt': bp(150, 0.28, 0.4, 'sawtooth', 55); nb(0.1, 600, 0.18); break;
    case 'auto': nb(0.11, 1300, 0.5); break;
    case 'eat': nb(0.09, 2500, 0.2); setTimeout(function () { nb(0.09, 2200, 0.18); }, 140); setTimeout(function () { nb(0.09, 2400, 0.15); }, 280); break;
    case 'rocketfire': nb(0.5, 800, 0.7); bp(220, 0.4, 0.3, 'sawtooth', 50); break;
    case 'crash': nb(0.3, 900, 0.8); bp(85, 0.18, 0.35, 'square', 45); break;
    case 'glass': nb(0.07, 3400, 0.5); bp(190, 0.09, 0.14, 'square', 70); setTimeout(function () { nb(0.1, 2700, 0.38); }, 70); setTimeout(function () { nb(0.14, 2100, 0.28); }, 160); break;
    case 'boom': nb(0.8, 320, 1.3); bp(60, 0.6, 0.6, 'sine', 24); setTimeout(function () { nb(0.4, 700, 0.4); }, 120); break;
  }
}

// ---------------- UI ----------------
function popup(txt) { var el = document.createElement('div'); el.className = 'pop'; el.textContent = txt; document.getElementById('popups').appendChild(el); setTimeout(function () { el.remove(); }, 900); }
function popup2(txt) { var el = document.createElement('div'); el.className = 'pop bad'; el.textContent = txt; document.getElementById('popups').appendChild(el); setTimeout(function () { el.remove(); }, 900); }
function toast(html, ms) { var el = document.getElementById('toast'); el.innerHTML = html; el.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.add('hidden'); }, ms || 6000); }

function refreshShop() {
  var rows = document.getElementById('shopRows'); rows.innerHTML = '';
  GUN_LIST.forEach(function (k) {
    var w = WEAPONS[k], row = document.createElement('div'); row.className = 'row';
    if (!w.price) return;   // not for sale (ray gun drops from... something)
    var left = document.createElement('div'); left.innerHTML = '<b>' + w.name + '</b> — <span class="cash">$' + w.price + '</span><small>' + w.desc + '</small>'; row.appendChild(left);
    if (state.owned[k]) { var sp = document.createElement('span'); sp.className = 'owned'; sp.textContent = 'OWNED'; row.appendChild(sp); }
    else { var btn = document.createElement('button'); btn.textContent = 'BUY'; btn.disabled = state.money < w.price; btn.onclick = function () { if (state.dead) return; if (state.money < w.price) { playVoiceAny(['dealer_nocash_1', 'dealer_nocash_2'], 0.5, 'dealerNo', 5, { ref: dealer }); sfx('deny'); return; } state.money -= w.price; state.owned[k] = true; shopBought = true; playVoiceAny(['dealer_buy_1', 'dealer_buy_2'], 0.5, 'dealerBuy', 4, { ref: dealer }); sfx('buy'); popup(w.name + ' purchased!'); refreshShop(); }; row.appendChild(btn); }
    rows.appendChild(row);
  });
  document.getElementById('shopCash').textContent = '$' + state.money;
}
function refreshInv() {
  var rows = document.getElementById('invRows'); rows.innerHTML = '';
  ['fists'].concat(GUN_LIST).forEach(function (k) {
    if (k !== 'fists' && !state.owned[k]) return;
    var w = WEAPONS[k], row = document.createElement('div'); row.className = 'row';
    var left = document.createElement('div'); left.innerHTML = '<b class="' + (state.equipped === k ? 'equipped' : '') + '">' + w.name + (state.equipped === k ? ' &#9668; equipped' : '') + '</b>'; row.appendChild(left);
    var btn = document.createElement('button');
    if (state.equipped === k && k !== 'fists') { btn.textContent = 'UNEQUIP'; btn.onclick = function () { setEquipped('fists'); refreshInv(); }; }
    else if (state.equipped !== k) { btn.textContent = 'EQUIP'; btn.onclick = function () { setEquipped(k); refreshInv(); }; }
    else { btn.textContent = 'EQUIPPED'; btn.disabled = true; }
    row.appendChild(btn); rows.appendChild(row);
  });
  if (state.snacks > 0) {
    var srow = document.createElement('div'); srow.className = 'row';
    var sleft = document.createElement('div');
    sleft.innerHTML = '<b class="' + (state.equipped === 'snack' ? 'equipped' : '') + '">SNACK &times;' + state.snacks + (state.equipped === 'snack' ? ' &#9668; equipped' : '') + '</b><small>eat to restore 50 hp</small>';
    srow.appendChild(sleft);
    var sbtn = document.createElement('button');
    if (state.equipped === 'snack') { sbtn.textContent = 'UNEQUIP'; sbtn.onclick = function () { setEquipped('fists'); refreshInv(); }; }
    else { sbtn.textContent = 'EQUIP'; sbtn.onclick = function () { setEquipped('snack'); refreshInv(); }; }
    srow.appendChild(sbtn); rows.appendChild(srow);
  }
  sodaInvRow(rows);   // streetprops vending sodas
  var any = GUN_LIST.some(function (k) { return state.owned[k]; });
  if (!any) { var hint = document.createElement('div'); hint.className = 'row'; hint.innerHTML = '<small>No guns yet — earn cash and visit the dealer ($ on the minimap).</small>'; rows.appendChild(hint); }
}
function openMenu(which) { setZoom(false); state.menu = which; document.exitPointerLock && document.exitPointerLock(); if (which === 'shop') { shopBought = false; if (!dealerMet) { dealerMet = true; playVoice('dealer_hello_first', 0.5, 1, { ref: dealer }); } else playVoiceAny(['dealer_hello_1', 'dealer_hello_2'], 0.5, 'dealerHi', 18, { ref: dealer }); refreshShop(); document.getElementById('shopPanel').classList.remove('hidden'); } if (which === 'inv') { refreshInv(); document.getElementById('invPanel').classList.remove('hidden'); } if (which === 'clerk') { refreshClerk(); document.getElementById('clerkPanel').classList.remove('hidden'); } }
function closeMenus(relock) { if (state.menu === 'shop' && !shopBought) playVoice('dealer_bye', 0.45, 40, { ref: dealer }); state.menu = null; document.getElementById('shopPanel').classList.add('hidden'); document.getElementById('invPanel').classList.add('hidden'); document.getElementById('clerkPanel').classList.add('hidden'); if (relock !== false && state.running) lockPointer(); }

// ---------------- minimap ----------------
var mm = document.getElementById('mm');
var mg = mm.getContext('2d');
var MMS = mm.width / TOTAL;
function w2m(v) { return (v + HALF) * MMS; }
function drawMinimap() {
  mg.fillStyle = '#5f8a45'; mg.fillRect(0, 0, mm.width, mm.height);
  // forest
  mg.fillStyle = '#33562c';
  for (var f = 0; f < mapForest.length; f++) { var z = mapForest[f]; mg.fillRect(w2m(z.x0), w2m(z.z0), (z.x1 - z.x0) * MMS, (z.z1 - z.z0) * MMS); }
  // lake + expansion ponds
  mg.fillStyle = '#3f82ae'; mg.save(); mg.translate(w2m(LAKE.x), w2m(LAKE.z)); mg.scale(1.25, 0.85); mg.beginPath(); mg.arc(0, 0, LAKE.r * MMS, 0, 7); mg.fill(); mg.restore();
  for (var pq = 0; pq < mapPonds.length; pq++) { var pk = mapPonds[pq]; mg.save(); mg.translate(w2m(pk.x), w2m(pk.z)); mg.scale(1, pk.rz / pk.rx); mg.beginPath(); mg.arc(0, 0, Math.max(1.2, pk.rx * MMS), 0, 7); mg.fill(); mg.restore(); }
  // concrete pads under buildings
  mg.fillStyle = '#b8b3a6'; for (var pv = 0; pv < mapPave.length; pv++) { var pp = mapPave[pv]; mg.fillRect(w2m(pp.x - pp.w / 2), w2m(pp.z - pp.d / 2), pp.w * MMS, pp.d * MMS); }
  // parking + access roads
  mg.fillStyle = '#4a4a50'; for (var p = 0; p < mapParking.length; p++) { var q = mapParking[p]; mg.fillRect(w2m(q.x - q.w / 2), w2m(q.z - q.d / 2), q.w * MMS, q.d * MMS); }
  mg.fillStyle = '#3a3a40'; for (var dr = 0; dr < mapDrives.length; dr++) { var dd = mapDrives[dr]; mg.fillRect(w2m(dd.x - dd.w / 2), w2m(dd.z - dd.d / 2), dd.w * MMS, dd.d * MMS); }
  // expansion roads (polyline segments)
  mg.lineCap = 'round';
  for (var er = 0; er < mapRoads.length; er++) {
    var rr = mapRoads[er];
    mg.strokeStyle = rr.cls === 0 ? '#33333a' : '#3f3f46';
    mg.lineWidth = Math.max(1.4, rr.hw * 2 * MMS);
    mg.beginPath(); mg.moveTo(w2m(rr.x1), w2m(rr.z1)); mg.lineTo(w2m(rr.x2), w2m(rr.z2)); mg.stroke();
  }
  // core roads (the straight asphalt ends at x/z=CORE where the bends begin)
  mg.fillStyle = '#33333a';
  mg.fillRect(0, w2m(-MAIN_HW), (HALF + CORE) * MMS, MAIN_HW * 2 * MMS);
  mg.fillRect(w2m(-CROSS_HW), 0, CROSS_HW * 2 * MMS, (HALF + CORE) * MMS);
  // buildings (survey houses come from a pre-rendered layer — ~600 rects)
  if (typeof HOUSE_CLUSTERS !== 'undefined') mg.drawImage(houseMMLayer(w2m, mm.width, MMS), 0, 0);
  for (var b = 0; b < mapBuildings.length; b++) { var m = mapBuildings[b]; if (m.hs) continue; mg.fillStyle = m.c; mg.fillRect(w2m(m.x - m.w / 2), w2m(m.z - m.d / 2), Math.max(2, m.w * MMS), Math.max(2, m.d * MMS)); }
  // cars
  mg.fillStyle = '#e8a13a'; for (var c = 0; c < cars.length; c++) { var cm = cars[c].car.group.position; mg.fillRect(w2m(cm.x) - 1, w2m(cm.z) - 1, 2, 2); }
  // npcs
  mg.fillStyle = '#eeeeee'; for (var n = 0; n < npcs.length; n++) { if (npcs[n].state === 'down' || npcs[n].state === 'hidden') continue; mg.fillRect(w2m(npcs[n].x) - 1, w2m(npcs[n].z) - 1, 2, 2); }
  // cops (blue, slightly bigger)
  mg.fillStyle = '#3f8fe8'; for (var cop = 0; cop < cops.length; cop++) { if (cops[cop].state === 'down') continue; mg.fillRect(w2m(cops[cop].x) - 1.5, w2m(cops[cop].z) - 1.5, 3, 3); }
  for (var cop2 = 0; cop2 < copsM.length; cop2++) { mg.fillRect(w2m(copsM[cop2].x) - 1.5, w2m(copsM[cop2].z) - 1.5, 3, 3); }
  // other players (cyan)
  // real players as bright-green blips (match their name-tag color); dim the
  // dead, draw drivers as a slightly bigger square
  for (var rp in net.remotes) { var rpp = net.remotes[rp]; mg.fillStyle = rpp.dead ? '#2f7a3a' : '#6dff8b'; var sz = rpp.drv ? 6 : 4; mg.fillRect(w2m(rpp.x) - sz / 2, w2m(rpp.z) - sz / 2, sz, sz); }
  // cash
  mg.fillStyle = '#59e04a'; for (var k = 0; k < cashes.length; k++) { var cp = cashes[k].mesh.position; mg.fillRect(w2m(cp.x) - 1, w2m(cp.z) - 1, 2, 2); }
  // dropped weapons
  mg.fillStyle = '#d060e8'; for (var dw = 0; dw < drops.length; dw++) { var dp = drops[dw].mesh.position; mg.fillRect(w2m(dp.x) - 1.5, w2m(dp.z) - 1.5, 3, 3); }
  // gas station marker
  mg.fillStyle = '#e05a3a'; mg.font = 'bold 11px Courier New'; mg.textAlign = 'center'; mg.textBaseline = 'middle'; mg.fillText('G', w2m(gasRob.x), w2m(gasRob.z));
  // dealer marker
  mg.fillStyle = '#ffd94a'; mg.font = 'bold 12px Courier New'; mg.fillText('$', w2m(dealerPos.x), w2m(dealerPos.z));
  // player arrow
  mg.save(); mg.translate(w2m(player.x), w2m(player.z)); mg.rotate(-yaw); mg.fillStyle = '#ffffff'; mg.strokeStyle = '#000'; mg.beginPath(); mg.moveTo(0, -5); mg.lineTo(3.6, 4); mg.lineTo(-3.6, 4); mg.closePath(); mg.fill(); mg.stroke(); mg.restore();
  mg.strokeStyle = '#222'; mg.strokeRect(0.5, 0.5, mm.width - 1, mm.height - 1);
}

// ---------------- input ----------------
var canvas = renderer.domElement;
function lockPointer() { if (WC_BOT) return; if (canvas.requestPointerLock) canvas.requestPointerLock(); }   // headless bot has no user gesture
var startScreen = document.getElementById('startScreen');
var pauseScreen = document.getElementById('pauseScreen');
function startGame() {
  initAudio();
  initPSXArms();
  retintPSXArms();
  startScreen.classList.add('hidden');
  state.running = true;
  lockPointer();
  toast('Welcome to <b>Westchase</b>. Punch people for cash, rob the gas station (the <b style="color:#e05a3a">G</b> on your minimap), and buy guns from the dealer (the gold <b style="color:#ffd94a">$</b>). <b>TAB</b> = inventory.', 11000);
}

// ---------------- multiplayer (PeerJS data channels, host = hub) ----------------
var net = { mode: 'sp', peer: null, conns: [], remotes: {}, id: null, sendT: 0, envSyncT: 0, worldT: 0, worldSnap: null, copList: [], sQ: 0, worldQ: 0, lastWorldQ: 0, sN: 0, copFxBuf: [], cfxQ: -1 };
// STUN finds a direct route; TURN relays when peers can't reach each other
// directly (e.g. two players behind the same home router whose NAT doesn't
// hairpin and whose wifi blocks mDNS). Without a WORKING TURN server,
// same-network joins often fail. Open Relay's static login was retired, so
// we mint short-lived credentials ourselves via the documented TURN REST
// scheme: username = expiry unix time, password = HMAC-SHA1(secret, username).
function sha1Bytes(msg) {
  function rotl(n, s) { return ((n << s) | (n >>> (32 - s))) >>> 0; }
  var m = msg.slice(), ml = msg.length;
  m.push(0x80);
  while (m.length % 64 !== 56) m.push(0);
  var hi = Math.floor(ml / 536870912), lo = (ml * 8) >>> 0;
  m.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255);
  m.push((lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
  var h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
  var w = new Array(80);
  for (var off = 0; off < m.length; off += 64) {
    for (var i = 0; i < 16; i++) w[i] = ((m[off + i * 4] << 24) | (m[off + i * 4 + 1] << 16) | (m[off + i * 4 + 2] << 8) | m[off + i * 4 + 3]) >>> 0;
    for (i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    var a = h0, b = h1, c = h2, d = h3, e = h4, f, k;
    for (i = 0; i < 80; i++) {
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6; }
      var t = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  var out = [];
  [h0, h1, h2, h3, h4].forEach(function (h) { out.push((h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255); });
  return out;
}
function strBytes(s) { var b = []; for (var i = 0; i < s.length; i++) b.push(s.charCodeAt(i) & 255); return b; }
function hmacSha1B64(key, msg) {
  var k = strBytes(key);
  if (k.length > 64) k = sha1Bytes(k);
  var ipad = [], opad = [];
  for (var i = 0; i < 64; i++) { var kb = k[i] || 0; ipad.push(kb ^ 0x36); opad.push(kb ^ 0x5C); }
  var digest = sha1Bytes(opad.concat(sha1Bytes(ipad.concat(strBytes(msg)))));
  var s = '';
  for (i = 0; i < digest.length; i++) s += String.fromCharCode(digest[i]);
  return btoa(s);
}
function buildIceConfig() {
  var user = String(Math.floor(Date.now() / 1000) + 24 * 3600);   // valid 24h
  var pass = hmacSha1B64('openrelayprojectsecret', user);
  var T = 'staticauth.openrelay.metered.ca';
  return { iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'turn:' + T + ':80', username: user, credential: pass },
    { urls: 'turn:' + T + ':443', username: user, credential: pass },
    // TCP relay head-of-line-blocks every message on one stream — keep only
    // the TLS:443 variant as the very last resort (strict corporate NAT)
    { urls: 'turns:' + T + ':443?transport=tcp', username: user, credential: pass }
  ] };
}
// window.WC_NET_OVERRIDE lets tests point the game at a local signaling +
// TURN server (and force relay-only to emulate same-router NAT failure).
function peerOptions() {
  var opts = { config: buildIceConfig() };
  if (window.WC_NET_OVERRIDE) { var o = window.WC_NET_OVERRIDE; for (var k in o) opts[k] = o[k]; }
  return opts;
}
function getPlayerName() {
  var el = document.getElementById('playerName');
  var n = (el && el.value ? el.value : '').replace(/[^\x20-\x7E]/g, '').trim().slice(0, 12);
  return n || (net.id ? net.id.slice(0, 6) : 'PLAYER');
}
function saveName() {
  var el = document.getElementById('playerName');
  try { if (el && el.value.trim()) localStorage.setItem('wc_name', el.value.trim().slice(0, 12)); } catch (e) { }
}
var playerChar = null;
(function () {
  try { playerChar = decodeCC(localStorage.getItem('wc_char')); } catch (e) { }
  if (!playerChar) playerChar = randomCharConfig();
  if (playerChar.hat === 4) playerChar.hat = 0;   // POLICE hat is cops-only
})();
function savePlayerChar() { try { localStorage.setItem('wc_char', encodeCC(playerChar)); } catch (e) { } }
(function () {
  var el = document.getElementById('playerName');
  try { var sv = localStorage.getItem('wc_name'); if (el && sv) el.value = sv; } catch (e) { }
})();
// world-bot mode: the dedicated server loads the game headless with ?bot=1 and
// hosts room MAIN forever. The bot sims the world but is NOT a player: it never
// broadcasts 's' state, so nobody sees an avatar for it.
var WC_BOT = /[?&]bot=1/.test(location.search);
function netActive() { return net.conns.length > 0; }
function isClient() { return net.mode === 'client' && net.conns.length > 0; }
function isHost() { return net.mode === 'host' && net.conns.length > 0; }
function netToHost(m) { if (isClient()) { try { net.conns[0].send(m); } catch (e) { } } }
function netError(msg) {
  var el = document.getElementById('netErr');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function netBroadcast(m) {
  for (var i = 0; i < net.conns.length; i++) { try { net.conns[i].send(m); } catch (e) { } }
}
function netRelay(m, fromConn) {
  if (net.mode !== 'host') return;
  for (var i = 0; i < net.conns.length; i++) { if (net.conns[i] !== fromConn) { try { net.conns[i].send(m); } catch (e) { } } }
}
// NaN-safe clamp for values a client puts on the wire — the host must never
// trust a peer's damage/rate/cash numbers verbatim (grief/exploit guard)
function clampf(v, lo, hi) { v = +v; if (v !== v) return lo; return v < lo ? lo : (v > hi ? hi : v); }
function updateLobbyStatus() {
  var el = document.getElementById('lobbyStatus');
  if (el) el.textContent = net.conns.length + (net.conns.length === 1 ? ' friend connected' : ' friends connected');
}
// name-tag colors distinguish real humans (bright green) from AI: NPCs (grey),
// cops (steel blue). Passed to draw() so a pooled tag can be reassigned freely.
function tagNameColor(kind) { return kind === 'npc' ? '#cfcfcf' : (kind === 'cop' ? '#9fb8ee' : '#6dff8b'); }
function makeTag(text, kind) {
  // name on top, health bar underneath; redraw via sp.userData.draw(name, hp, kind)
  var c = document.createElement('canvas'); c.width = 160; c.height = 44;
  var g = c.getContext('2d');
  var t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter;
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  sp.scale.set(2.9, 0.8, 1);
  sp.userData.kind = kind || 'player';
  sp.userData.draw = function (name, hp, k) {
    k = k || sp.userData.kind;
    g.clearRect(0, 0, 160, 44);
    g.font = 'bold 19px Courier New'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = '#000'; g.lineWidth = 5; g.strokeText(name, 80, 12);
    g.fillStyle = tagNameColor(k); g.fillText(name, 80, 12);
    var w = 100, h = 8, x = (160 - w) / 2, y = 28;
    g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(x - 2, y - 2, w + 4, h + 4);
    var f = Math.max(0, Math.min(1, hp / 100));
    g.fillStyle = f > 0.5 ? '#6fdc5a' : (f > 0.25 ? '#ffd94a' : '#e5533d');
    g.fillRect(x, y, w * f, h);
    t.needsUpdate = true;
  };
  sp.userData.draw(text, 100, kind);
  return sp;
}
// pooled floating tags for the nearest AI (NPCs/cops) around the player, only
// in multiplayer (so real players read as distinct green tags among grey/blue AI)
var npcTagPool = [];
var NPC_TAG_MAX = 10, NPC_TAG_RANGE = 26;
function updateNpcTags() {
  var pool = npcTagPool, i;
  if (!netActive() || !state.running || inside || state.dead) { for (i = 0; i < pool.length; i++) pool[i].visible = false; return; }
  var px = player.x, pz = player.z, R2 = NPC_TAG_RANGE * NPC_TAG_RANGE, cands = [];
  for (i = 0; i < npcs.length; i++) { var n = npcs[i]; if (n.state === 'down' || n.state === 'ragdoll' || n.state === 'hidden') continue; var d2 = (n.x - px) * (n.x - px) + (n.z - pz) * (n.z - pz); if (d2 < R2) cands.push({ e: n, d2: d2, kind: 'npc', by: 0 }); }
  for (i = 0; i < cops.length; i++) { var cp = cops[i]; if (cp.state === 'down' || cp.interior) continue; var cd2 = (cp.x - px) * (cp.x - px) + (cp.z - pz) * (cp.z - pz); if (cd2 < R2) cands.push({ e: cp, d2: cd2, kind: 'cop', by: cp.baseY || 0 }); }
  // clients mirror street cops in copsM (their `cops` array is empty) — no hp on
  // the wire, so their bar reads full until they go down
  for (i = 0; i < copsM.length; i++) { var cm = copsM[i]; if (cm.down) continue; var md2 = (cm.x - px) * (cm.x - px) + (cm.z - pz) * (cm.z - pz); if (md2 < R2) cands.push({ e: { x: cm.x, z: cm.z, hp: 100, vname: 'POLICE' }, d2: md2, kind: 'cop', by: 0 }); }
  cands.sort(function (a, b) { return a.d2 - b.d2; });
  var nShow = Math.min(cands.length, NPC_TAG_MAX);
  for (i = 0; i < NPC_TAG_MAX; i++) {
    var tag = pool[i];
    if (!tag) { tag = pool[i] = makeTag('', 'npc'); tag.scale.set(2.2, 0.6, 1); scene.add(tag); }
    if (i < nShow) {
      var cc = cands[i], e = cc.e;
      var label = cc.kind === 'cop' ? 'POLICE' : (e.vname || 'CIVILIAN');
      var hp = Math.max(0, Math.round(e.hp || 0));
      if (tag.userData._lbl !== label || tag.userData._hp !== hp || tag.userData._k !== cc.kind) {
        tag.userData._lbl = label; tag.userData._hp = hp; tag.userData._k = cc.kind;
        tag.userData.draw(label, hp, cc.kind);
      }
      var d = Math.sqrt(cc.d2);
      tag.material.opacity = d > NPC_TAG_RANGE - 5 ? Math.max(0, (NPC_TAG_RANGE - d) / 5) : 1;
      tag.position.set(e.x, cc.by + 2.35, e.z);
      tag.visible = true;
    } else tag.visible = false;
  }
}
function hashStr(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function ensureRemote(id) {
  if (net.remotes[id]) return net.remotes[id];
  var hsh = hashStr(id);
  var mesh = buildCharacter(randomCharConfig(seededRng(hsh)));   // placeholder until their cc arrives
  mesh.userData.remoteId = id;
  scene.add(mesh);
  var tag = makeTag(id.slice(0, 6));
  scene.add(tag);
  var r = { id: id, mesh: mesh, tag: tag, x: -72, z: -97, y: 0, tx: -72, tz: -97, ty: 0, yaw: 0, tyaw: 0, h: 0, drv: 0, dead: 0, w: 0, phase: 0, lx: -72, lz: -97, name: id.slice(0, 6), hp: 100, tagName: id.slice(0, 6), tagHp: 100, cc: null };
  net.remotes[id] = r;
  return r;
}
function removeRemote(id) {
  var r = net.remotes[id];
  if (!r) return;
  scene.remove(r.mesh); scene.remove(r.tag);
  delete net.remotes[id];
  if (voicePlay[id]) delete voicePlay[id];   // free the per-speaker voice cursor
  if (r.namedOnce && r.name) chatNotice(r.name + ' left');
  // free any car they were driving
  for (var i = 0; i < cars.length; i++) if (cars[i].drivenBy === id) cars[i].drivenBy = null;
}
function handleNet(m, conn) {
  if (!m || !m.t) return;
  if (m.t === 's') {
    var r = ensureRemote(m.id);
    // the data channel is unordered: drop anything older than what we have
    if (m.q) { if (r.lastQ && m.q <= r.lastQ) return; r.lastQ = m.q; }
    r.lastSeen = T;
    r.tx = m.x / 10; r.tz = m.z / 10; r.ty = (m.y || 0) / 10; r.tyaw = (m.yaw || 0) / 100;
    r.drv = m.drv || 0; r.h = (m.h || 0) / 100; r.dead = m.dead || 0; r.w = m.w || 0;
    if (m.n) { r.name = m.n; if (!r.namedOnce) { r.namedOnce = true; chatNotice(r.name + ' joined'); } }
    if (m.hp !== undefined) r.hp = m.hp;
    var req = m.e || 0;
    if (r.eq !== req) { r.eq = req; attachHeldGun(r.mesh, req ? GUN_LIST[req - 1] : null); }
    if (m.cc && r.cc !== m.cc) {
      // they picked a custom character — swap the placeholder avatar
      var ncfg = decodeCC(m.cc);
      if (ncfg) {
        r.cc = m.cc;
        scene.remove(r.mesh);
        r.mesh = buildCharacter(ncfg);
        r.mesh.userData.remoteId = m.id;
        r.mesh.position.set(r.x, Math.max(-59.9, r.y - EYE), r.z);
        // apply current pose immediately so the fresh avatar doesn't pop up
        // standing/visible for one frame while driving or dead
        r.mesh.visible = !r.drv;
        r.mesh.rotation.y = r.yaw + Math.PI;
        r.mesh.rotation.x = r.dead ? -1.5 : 0;
        scene.add(r.mesh);
        if (r.eq) attachHeldGun(r.mesh, GUN_LIST[r.eq - 1]);   // keep the gun through the avatar swap
      }
    }
    if (r.name !== r.tagName || Math.abs(r.hp - r.tagHp) >= 1) {
      r.tagName = r.name; r.tagHp = r.hp;
      r.tag.userData.draw(r.name, r.hp);
    }
    netRelay(m, conn);
  } else if (m.t === 'hit') {
    if (m.to === net.id) {
      var hdmg = clampf(m.dmg, 0, 100);   // never trust a peer's damage number
      var wasDead = state.dead;
      if (driving) {
        driving.carHP = (driving.carHP === undefined ? 100 : driving.carHP) - hdmg * 2;
        var cp3 = driving.car.group.position;
        puff(new THREE.Vector3(cp3.x + (Math.random() - 0.5) * 2, 1 + Math.random(), cp3.z + (Math.random() - 0.5) * 2), 0xd8c860);
        if (driving.carHP <= 0) igniteCar(driving);
      } else hurtPlayer(hdmg);
      // this shot from another PLAYER just downed us → credit them the kill
      if (!wasDead && state.dead && m.by) netSendTo(m.by, { t: 'pkill', to: m.by });
    }
    else if (net.mode === 'host') { for (var i = 0; i < net.conns.length; i++) if (net.conns[i].peer === m.to) { try { net.conns[i].send(m); } catch (e) { } } }
  } else if (m.t === 'pkill') {
    if (m.to === net.id) creditPvpKill();
    else if (net.mode === 'host') netSendTo(m.to, m);   // forward the credit to the shooter
  } else if (m.t === 'boom') {
    boomAt(m.x, m.z, true, net.mode === 'host' ? conn : null);   // host credits the shooter's blast kills
    netRelay(m, conn);
  } else if (m.t === 'world') {
    // unordered channel: never apply a snapshot older than the current one
    if (net.mode === 'client' && !(m.q && net.lastWorldQ && m.q <= net.lastWorldQ)) { net.lastWorldQ = m.q || 0; net.worldSnap = m; }
  } else if (m.t === 'env') {
    if (net.mode === 'client') {
      envT = m.envT; raining = m.raining; rainLeft = m.rainLeft;
      if (m.gasCD) gasClosedUntil = Math.max(gasClosedUntil, T + m.gasCD);   // late joiners inherit the lockout
    }
  } else if (m.t === 'voice') {
    // TWO kinds of {t:'voice'} share this branch (they MUST be discriminated
    // here — a second `else if (m.t==='voice')` later in this chain would be
    // unreachable): push-to-talk mic frames carry m.d (base64 PCM) and are
    // relayed by the host; host-broadcast world/NPC voices carry m.g/x/z (no
    // m.d) and are replayed positionally via playNetVoice on clients.
    if (m.d) {
      var vid = m.id || (conn && conn.peer) || 'x';
      if (!WC_BOT) playVoiceFrame(vid, m.r || 16000, m.d);   // the headless world bot just relays voice, never plays it
      var vr = net.remotes[vid]; if (vr) vr.talkT = T;   // drive the "talking" tag pop
      if (net.mode === 'host') netRelay(m, conn);
    } else if (net.mode === 'client') {
      playNetVoice(m);   // host-broadcast world/NPC voice (positional replay)
    }
  } else if (m.t === 'chat') {
    var cn = ('' + (m.name || 'PLAYER')).replace(/[^\x20-\x7E]/g, '').slice(0, 12) || 'PLAYER';
    var ct = ('' + (m.text || '')).replace(/[\x00-\x1F]/g, '').slice(0, 140);
    if (ct) { addChatMsg(cn, ct, m.sys ? 'sys' : null); if (net.mode === 'host') netRelay(m, conn); }
  } else if (m.t === 'bye') {
    removeRemote(m.id);
    netRelay(m, conn);
  } else if (m.t === 'jacked') {
    // someone stole the car out from under us (or our hijack got denied)
    var jc = cars[m.i];
    if (jc) {
      jc.jackCD = T + JACK_CD;
      if (driving === jc) { exitCar(true); popup2('YOU GOT HIJACKED!'); sfx('grunt'); }
    }
  } else if (m.t === 'jackCD') {
    if (cars[m.i]) cars[m.i].jackCD = T + JACK_CD;
  } else if (m.t === 'robCD') {
    // one robbery locks the store for the whole server
    applyRobCD(m.store, m.left);
    netRelay(m, conn);
  } else if (m.t === 'beam') {
    spawnBeam(m.a[0], m.a[1], m.a[2], m.a[3], m.a[4], m.a[5], 0xd050ff);
    sfx('laser', { x: m.a[0], z: m.a[2], range: 130 });
  } else if (m.t === 'gotDrop') {
    applyDropPickup(m.k);
  } else if (net.mode === 'host') {
    // ---- client → host world actions (host is authoritative) ----
    if (m.t === 'dmgNpc') {
      var n = npcs[m.i];
      if (n && n.state !== 'down' && n.state !== 'ragdoll' && n.state !== 'hidden') {
        damageNPC(n, clampf(m.dmg, 0, 250), clampf(m.kx, -2, 2), clampf(m.kz, -2, 2), true);
        if (n.state === 'down') { try { conn.send({ t: 'kill', kind: 'npc' }); } catch (e) { } }
      }
    } else if (m.t === 'dmgCop') {
      // resolve by stable id (falls back to index for older clients); the cops
      // array is spliced on despawn so a bare index can mistarget mid-firefight
      var cpx = null;
      if (m.id !== undefined) { for (var qc = 0; qc < cops.length; qc++) if (cops[qc].nid === m.id && !cops[qc].interior) { cpx = cops[qc]; break; } }
      else cpx = net.copList[m.i];
      if (cpx && cpx.state !== 'down') {
        damageCop(cpx, clampf(m.dmg, 0, 250), clampf(m.kx, -2, 2), clampf(m.kz, -2, 2), true);
        if (cpx.state === 'down') { try { conn.send({ t: 'kill', kind: 'cop' }); } catch (e) { } }
      }
    } else if (m.t === 'shootCar') {
      var scc = cars[m.i];
      if (scc && scc.drivenBy && !scc.exploded) {
        netSendHit(scc.drivenBy, clampf(m.dmg, 0, 100));   // occupied car: damage the driver (they apply it to their carHP)
      } else if (scc && !scc.stolen && !scc.exploded) {
        scc.dmgT += clampf(m.rate, 0, 1);   // covers the rifle's 0.8 rate; still bounds garbage
        if (scc.dmgT >= 1.5 && goBerserk(scc)) { try { conn.send({ t: 'kill', kind: 'car' }); } catch (e) { } }
      }
    } else if (m.t === 'ragNpc') {
      var rn = npcs[m.i];
      if (rn && rn.state !== 'down' && rn.state !== 'ragdoll' && rn.state !== 'hidden') killNpcRagdoll(rn, m.kx, m.kz, m.pw || 9);
    } else if (m.t === 'steal') {
      var sc = cars[m.i];
      if (sc && !sc.exploded) {
        var victimId = sc === driving ? net.id : sc.drivenBy;
        if (victimId && victimId !== conn.peer && T < (sc.jackCD || 0)) {
          // hijack cooldown still running — bounce the thief back out
          try { conn.send({ t: 'jacked', i: m.i }); } catch (e) { }
        } else {
          if (victimId && victimId !== conn.peer) {
            sc.jackCD = T + JACK_CD;
            if (sc === driving) { exitCar(true); popup2('YOU GOT HIJACKED!'); sfx('grunt'); }
            else for (var ji = 0; ji < net.conns.length; ji++) if (net.conns[ji].peer === victimId) { try { net.conns[ji].send({ t: 'jacked', i: m.i }); } catch (e) { } }
            netBroadcast({ t: 'jackCD', i: m.i });
          } else if (!sc.jacked && !sc.parked) kickDriver(sc);   // a parked car has no driver to bail
          sc.parked = false; sc.jacked = true; sc.stolen = true; sc.drivenBy = conn.peer;
        }
      }
    } else if (m.t === 'park') {
      var pk = cars[m.i];
      // only the car's actual driver may park it — else a client can null
      // another driver's ownership and teleport a car it isn't in
      if (pk && pk.drivenBy === conn.peer) { pk.drivenBy = null; pk.stolen = true; pk.car.group.position.set(clampf(m.x, -HALF, HALF), 0, clampf(m.z, -HALF, HALF)); pk.car.group.rotation.y = clampf(m.ry, -1e4, 1e4); }   // heading accumulates unwrapped; only reject NaN/garbage
    } else if (m.t === 'ram') {
      var rc = cars[m.i];
      if (rc && !rc.stolen && !rc.exploded && goBerserk(rc)) { try { conn.send({ t: 'kill', kind: 'car' }); } catch (e) { } }
    } else if (m.t === 'ramHit') {
      var rhc = cars[m.i];
      if (rhc && !rhc.stolen && !rhc.exploded && !rhc.berserk) {
        shoveCar(rhc, clampf(m.kx / 10, -3, 3), clampf(m.kz / 10, -3, 3), clampf(m.sp / 10, 0, 30));
        rhc.dmgT += clampf(m.dmg, 0, 2);   // real ram impulse peaks ~1.42; bound garbage, don't nerf
        if (rhc.dmgT >= 1.5 && goBerserk(rhc)) { try { conn.send({ t: 'kill', kind: 'car' }); } catch (e) { } }
      }
    } else if (m.t === 'carBoom') {
      // only the car's driver can self-detonate it (was: any client, any car)
      var bc = cars[m.i];
      if (bc && bc.drivenBy === conn.peer) { bc.drivenBy = null; if (!bc.exploded) explodeCar(bc); }
    } else if (m.t === 'atmCash') {
      // a client cracked an ATM/meter — spawn the cash into the authoritative
      // world so it snapshots to everyone (and the cracker can loot it).
      // clamp val + position: never trust a peer's cash amount/coords.
      // dedup: prop breaks are per-peer (not net-synced), so when two peers both
      // witness the same meter get rammed they BOTH send atmCash — drop repeats
      // near the same spot within 2s so one meter pays once
      var acx = clampf(m.x, -HALF, HALF), acz = clampf(m.z, -HALF, HALF);
      var dup = false;
      for (var aci = 0; aci < recentAtmCash.length; aci++) { var rc2 = recentAtmCash[aci]; if (T - rc2.t < 2 && (rc2.x - acx) * (rc2.x - acx) + (rc2.z - acz) * (rc2.z - acz) < 4) { dup = true; break; } }
      if (!dup) {
        recentAtmCash.push({ x: acx, z: acz, t: T });
        if (recentAtmCash.length > 24) recentAtmCash.shift();
        spawnCash(acx, acz, clampf(m.val, 1, 200) | 0);
      }
    } else if (m.t === 'takeCash') {
      var bi = -1, bd2 = 6;
      for (var ci = 0; ci < cashes.length; ci++) {
        var ccp = cashes[ci].mesh.position;
        var ddx2 = ccp.x - m.x, ddz2 = ccp.z - m.z;
        if (ddx2 * ddx2 + ddz2 * ddz2 < bd2) { bd2 = ddx2 * ddx2 + ddz2 * ddz2; bi = ci; }
      }
      if (bi >= 0) {
        var val = cashes[bi].val || 10;
        scene.remove(cashes[bi].mesh); cashes.splice(bi, 1);
        try { conn.send({ t: 'cash', val: val }); } catch (e) { }
      }
    } else if (m.t === 'dropGun') {
      // a client died — their guns hit the shared pavement
      if (GUN_LIST.indexOf(m.k) >= 0) dropWeapon(m.k, m.x, m.z);
    } else if (m.t === 'takeDrop') {
      // first request wins; the loser's drop vanishes from the next snapshot
      var dbi = -1, dbd = 6.5;
      for (var di2 = 0; di2 < drops.length; di2++) {
        var dpp = drops[di2].mesh.position;
        var ddx3 = dpp.x - m.x, ddz3 = dpp.z - m.z;
        if (ddx3 * ddx3 + ddz3 * ddz3 < dbd) { dbd = ddx3 * ddx3 + ddz3 * ddz3; dbi = di2; }
      }
      if (dbi >= 0) {
        var dk2 = drops[dbi].kind;
        scene.remove(drops[dbi].mesh); drops.splice(dbi, 1);
        try { conn.send({ t: 'gotDrop', k: dk2 }); } catch (e) { }
      }
    } else if (m.t === 'dmgUfo') {
      damageUfo(clampf(m.dmg, 0, 250), null);   // clamp: a negative dmg would HEAL the shared boss
    } else if (m.t === 'dmgAlien') {
      damageAlien(clampf(m.dmg, 0, 250), clampf(m.kx, -2, 2), clampf(m.kz, -2, 2));   // + bound knockback so it can't be flung off-map
    } else if (m.t === 'ufoTrig') {
      if (!ufoTriggered) { ufoTriggered = true; spawnUfo(); }
    }
  } else if (m.t === 'cash') {
    state.money += m.val; popup('+$' + m.val); sfx('cash');
  } else if (m.t === 'kill') {
    if (m.kind === 'npc') { creditCivKill(); popup('KO!'); }
    else if (m.kind === 'cop') { creditCopKill(); popup('COP DOWN!'); }
    else if (m.kind === 'car') { creditCivKill(); popup('WRECKED!'); }
  }
}
function onConn(c) {
  net.conns.push(c);
  updateLobbyStatus();
  if (net.mode === 'host') {
    var sendEnv = function () { try { c.send({ t: 'env', envT: envT, raining: raining, rainLeft: rainLeft, gasCD: Math.max(0, Math.round(gasClosedUntil - T)) }); } catch (e) { } };
    if (c.open) sendEnv(); else c.on('open', sendEnv);
  }
  c.on('data', function (m) { handleNet(m, c); });
  c.on('close', function () {
    var idx = net.conns.indexOf(c);
    if (idx >= 0) net.conns.splice(idx, 1);
    removeRemote(c.peer);
    if (net.mode === 'host') netBroadcast({ t: 'bye', id: c.peer });
    updateLobbyStatus();
  });
}
// ---- dedicated relay-server transport (replaces PeerJS P2P) ----
// One WebSocket to the Railway relay server; per-remote "virtual connections"
// keep the old DataConnection interface (.send/.on('data'|'open'|'close')/.peer)
// so the entire host-authoritative protocol (handleNet/netBroadcast/netToHost/
// netRelay) is unchanged — the wire underneath is now server-relayed, not P2P.
var WC_SERVER_URL = (function () {
  try { if (window.WC_SERVER_URL) return window.WC_SERVER_URL; } catch (e) { }   // test/dev override
  try { var ls = localStorage.getItem('wc_server'); if (ls) return ls; } catch (e) { }
  return 'wss://relay-production-bd75.up.railway.app';   // Railway relay server
})();
function makeVConn(peerId) {
  var h = { data: [], open: [], close: [] };
  return {
    peer: peerId, open: true,
    send: function (m) { if (net.sock && net.sock.readyState === 1) { try { net.sock.send(JSON.stringify({ t: 'msg', to: peerId, data: m })); } catch (e) { } } },
    on: function (ev, fn) { if (h[ev]) h[ev].push(fn); },
    _emit: function (ev, a) { var l = h[ev] || []; for (var i = 0; i < l.length; i++) l[i](a); }
  };
}
function vconnFor(id) { for (var i = 0; i < net.conns.length; i++) if (net.conns[i].peer === id) return net.conns[i]; return null; }
// wipe all per-session net state so a host/join in the SAME page load starts
// clean — otherwise stale sequence counters reject the new host's snapshots
// (world freezes) and old avatars leak into the new session
function resetNetSession() {
  // close any leftover socket (e.g. a prior attempt that only soft-errored) so
  // its onmessage/onclose closures can't keep mutating net after a retry
  if (net.sock) { try { net.sock.onclose = null; net.sock.onmessage = null; net.sock.close(); } catch (e) { } net.sock = null; }
  for (var id in net.remotes) { var r = net.remotes[id]; if (r) { scene.remove(r.mesh); scene.remove(r.tag); } }
  net.remotes = {}; net.conns = []; net.worldSnap = null; net.copList = []; net.copFxBuf = [];
  net.sQ = 0; net.worldQ = 0; net.lastWorldQ = 0; net.sN = 0; net.cfxQ = -1;
  net.sendT = 0; net.envSyncT = 0; net.worldT = 0;
}
function connectServer(onReady) {
  var url = WC_SERVER_URL;
  if (!url || url.indexOf('REPLACE_AFTER_DEPLOY') >= 0) { netError('Multiplayer server not configured yet.'); return; }
  var sock;
  try { sock = new WebSocket(url); } catch (e) { netError('Could not reach the multiplayer server.'); return; }
  net.sock = sock;
  var watchdog = setTimeout(function () { if (sock.readyState !== 1) netError('Still connecting to the server…'); }, 12000);
  sock.onopen = function () { clearTimeout(watchdog); onReady(); };
  sock.onerror = function () { netError('Multiplayer server error (is it online?).'); };
  sock.onclose = function () {
    for (var i = net.conns.length - 1; i >= 0; i--) { if (net.conns[i]._emit) net.conns[i]._emit('close'); }
    net.conns = [];
    for (var rid in net.remotes) { var rr = net.remotes[rid]; if (rr) { scene.remove(rr.mesh); scene.remove(rr.tag); } }
    net.remotes = {};   // host-leave / disconnect: clear EVERY avatar, not just the host's
    net.sock = null;
  };
  sock.onmessage = function (ev) {
    var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.t === 'hosted') {
      net.id = m.id; net.room = m.room;
      document.getElementById('netErr').classList.add('hidden');
      if (m.main) { net.mode = 'host'; startGame(); }   // shared world: first one in hosts INVISIBLY — no lobby, no codes
      else {
        document.getElementById('inviteLink').value = location.href.split('#')[0] + '#join=' + m.room;
        document.getElementById('menuMain').classList.add('hidden');
        document.getElementById('lobby').classList.remove('hidden');
      }
    } else if (m.t === 'joined') {
      net.id = m.id; net.room = m.room;
      document.getElementById('netErr').classList.add('hidden');
      onConn(makeVConn(m.host));
      startGame();
    } else if (m.t === 'peer-join') {
      onConn(makeVConn(m.id));
    } else if (m.t === 'peer-leave') {
      var vc = vconnFor(m.id); if (vc) vc._emit('close');
    } else if (m.t === 'host-promote') {
      becomeHost(m.oldHost);   // the previous host left; WE now run the shared world
    } else if (m.t === 'host-changed') {
      // rewire our single host conn to the promoted peer; sequence counters
      // restart on their side, so drop the dedup floors or we'd reject
      // everything the new host sends
      removeRemote(m.oldHost);
      for (var hci = net.conns.length - 1; hci >= 0; hci--) { var oc2 = net.conns[hci]; if (oc2.peer === m.oldHost) net.conns.splice(hci, 1); }
      if (!vconnFor(m.host)) onConn(makeVConn(m.host));
      var nr = net.remotes[m.host]; if (nr) { nr.lastQ = 0; }
      net.lastWorldQ = 0; net.cfxQ = -1; net.worldSnap = null;
      chatNotice('connection migrated to a new host');
    } else if (m.t === 'host-left') {
      netError('The host left — the game has ended.'); sock.close();
    } else if (m.t === 'msg') {
      var c = vconnFor(m.from);
      // a freshly-promoted host has no vconns for its peers (peer-join was
      // only ever sent to the ORIGINAL host) — adopt them on first message
      if (!c && net.mode === 'host') { c = makeVConn(m.from); onConn(c); }
      if (c) c._emit('data', m.data);
    } else if (m.t === 'error') {
      netError(m.msg || 'Server error');
    }
  };
}
function hostGame() {
  resetNetSession();
  net.mode = 'host';
  netError('Creating lobby…');
  saveName();
  connectServer(function () { net.sock.send(JSON.stringify({ t: 'host', name: getPlayerName() })); });
}
function joinGame(code) {
  var room = code.indexOf('#join=') >= 0 ? code.split('#join=').pop() : code;
  room = (room || '').trim().toUpperCase();
  if (!room) { netError('Paste an invite link or room code first'); return; }
  resetNetSession();
  net.mode = 'client';
  netError('Joining…');
  saveName();
  connectServer(function () { net.sock.send(JSON.stringify({ t: 'join', room: room, name: getPlayerName() })); });
}
// THE shared world: everyone connects to room MAIN on the dedicated relay —
// no host codes. The server elects the first player as the (invisible) host
// and promotes a survivor when they leave, so the town persists.
function playOnline() {
  resetNetSession();
  net.mode = 'client';   // provisional; flips to host if the server says we're first in
  netError('Connecting…');
  saveName();
  connectServer(function () { net.sock.send(JSON.stringify({ t: 'joinMain', name: WC_BOT ? 'SERVER' : getPlayerName(), bot: WC_BOT ? 1 : 0 })); });
}
// host migration: the old host vanished and the server picked US. Convert the
// mirrored world into the authoritative one and start simming.
function becomeHost(oldHostId) {
  removeRemote(oldHostId);
  for (var i = net.conns.length - 1; i >= 0; i--) if (net.conns[i].peer === oldHostId) net.conns.splice(i, 1);
  net.mode = 'host';
  net.worldQ = 0; net.copFxBuf = []; net.worldSnap = null; net.copList = []; net.cfxQ = -1;
  // street-cop mirrors are lightweight husks — drop them; desiredCops respawns
  // real ones from building doors within a few seconds
  for (i = 0; i < copsM.length; i++) scene.remove(copsM[i].mesh);
  copsM.length = 0;
  // mirrored cash carries no values (the old host owned them) — clear it
  for (i = 0; i < cashes.length; i++) scene.remove(cashes[i].mesh);
  cashes.length = 0;
  // net drops become locally-owned with a fresh rot timer
  for (i = 0; i < drops.length; i++) { drops[i].net = false; drops[i].pend = false; if (drops[i].life > 900) drops[i].life = 120; }
  // NPC mirrors are full NPC objects, but mirror-only states need their sim
  // fields rebuilt before the host branches run them
  for (i = 0; i < npcs.length; i++) {
    var n = npcs[i];
    n.hiddenM = false;
    if (n.state === 'hidden') { if (!(n.dwellT > 0)) n.dwellT = 4 + Math.random() * 10; if (npcDoors.length && !(npcDoors[n.doorI])) n.doorI = (Math.random() * npcDoors.length) | 0; }
    else if (n.state === 'ragdoll') { n.state = 'down'; n.downT = 3; n.mesh.rotation.x = -1.5; n.mesh.rotation.z = 0; n.airY = 0; }
    else if (n.state === 'down') { if (!(n.downT > 0)) n.downT = 3; }
    else { n.state = 'walk'; n.wayX = undefined; n.wayZ = undefined; n.doorSeek = undefined; n.pause = 0; setNpcTarget(n); }
  }
  // traffic resumes from each car's internal lane state (a one-time reshuffle;
  // parked/exploded cars keep their mirrored flags)
  chatNotice('the previous host left — you now run the town');
}
// a backgrounded host tab has requestAnimationFrame throttled to zero, which
// froze the whole shared world for every client — pump the net loop on a
// plain timer whenever the tab is hidden so state keeps flowing
setInterval(function () {
  // a backgrounded tab's requestAnimationFrame is throttled to ~0; pump the net
  // loop on a timer for BOTH host (keeps the shared world flowing) and clients
  // (keeps their 's' heartbeat alive so the host doesn't false-reap them)
  if (document.hidden && net.sock && state.running) updateNet(0.125);
}, 125);
function updateNet(dt) {
  if (!net.sock) return;
  // broadcast our state ~14x/s
  net.sendT -= dt;
  if (net.sendT <= 0 && netActive() && !WC_BOT) {   // the world bot is not a player — no avatar/state for it
    net.sendT = 0.07;
    // integers on the wire (binarypack floats are 9 bytes each) + a sequence
    // number so unordered delivery can't rewind us; name/cc only every 10th
    var eqw = WEAPONS[state.equipped];
    var msg = { t: 's', id: net.id, q: ++net.sQ, x: Math.round(player.x * 10), y: Math.round(player.y * 10), z: Math.round(player.z * 10), yaw: Math.round(yaw * 100), drv: driving ? 1 : 0, h: driving ? Math.round(driving.car.group.rotation.y * 100) : 0, dead: state.dead ? 1 : 0, w: state.wanted, hp: Math.round(Math.max(0, state.hp)), e: (eqw && !eqw.melee && !eqw.snack) ? GUN_LIST.indexOf(state.equipped) + 1 : 0 };
    if (net.sN % 10 === 0) { msg.n = getPlayerName(); msg.cc = encodeCC(playerChar); }
    net.sN++;
    if (net.mode === 'host') netBroadcast(msg);
    else net.conns[0] && net.conns[0].send(msg);
  }
  if (net.mode === 'host' && netActive()) {
    // weather/time sync
    net.envSyncT -= dt;
    if (net.envSyncT <= 0) { net.envSyncT = 3; netBroadcast({ t: 'env', envT: envT, raining: raining, rainLeft: rainLeft, gasCD: Math.max(0, Math.round(gasClosedUntil - T)) }); }
    // authoritative world snapshot ~8x/s: traffic, npcs, street cops, cash
    net.worldT -= dt;
    if (net.worldT <= 0) {
      net.worldT = 0.12;
      // wire format: positions ×10, angles ×100, ALL INTEGERS (see 's' note)
      var carsArr = [];
      for (var i = 0; i < cars.length; i++) {
        var cc = cars[i], mm = cc.car.group;
        carsArr.push([Math.round(mm.position.x * 10), Math.round(mm.position.z * 10), Math.round(mm.rotation.y * 100),
          (cc.exploded ? 1 : 0) | (cc.berserk ? 2 : 0) | (cc.burning ? 4 : 0) | (cc.stolen ? 8 : 0) | ((cc.drivenBy || cc === driving) ? 16 : 0) | (cc.parked ? 32 : 0)]);
      }
      var npcArr = [];
      for (i = 0; i < npcs.length; i++) {
        var nn = npcs[i];
        npcArr.push([Math.round(nn.x * 10), Math.round(nn.z * 10), Math.round(nn.mesh.rotation.y * 100),
          nn.state === 'down' ? 2 : (nn.state === 'ragdoll' ? 3 : (nn.state === 'hidden' ? 4 : 0)), Math.round(nn.mesh.position.y * 10)]);
      }
      net.copList = [];
      var copArr = [];
      for (i = 0; i < cops.length; i++) {
        var cq = cops[i];
        if (cq.interior) continue;
        net.copList.push(cq);
        copArr.push([Math.round(cq.x * 10), Math.round(cq.z * 10), Math.round(cq.mesh.rotation.y * 100), cq.state === 'down' ? 2 : 0, cq.nid]);
      }
      var cashArr = [];
      for (i = 0; i < cashes.length; i++) { var kp = cashes[i].mesh.position; cashArr.push([Math.round(kp.x * 10), Math.round(kp.z * 10)]); }
      var dropArr = [];
      for (i = 0; i < drops.length; i++) { var dq = drops[i].mesh.position; dropArr.push([Math.round(dq.x * 10), Math.round(dq.z * 10), GUN_LIST.indexOf(drops[i].kind)]); }
      var ufoArr = null;
      if (ufo) ufoArr = [Math.round(ufo.group.position.x * 10), Math.round(ufo.group.position.y * 10), Math.round(ufo.group.position.z * 10),
        ufo.mode === 'fly' ? 1 : (ufo.mode === 'falling' ? 2 : 3), Math.round(ufo.group.rotation.y * 100)];
      var alienArr = null;
      if (alien) alienArr = [Math.round(alien.x * 10), Math.round(alien.z * 10), Math.round(alien.mesh.rotation.y * 100), alien.state === 'dead' ? 1 : 0];
      var cfxArr = net.copFxBuf.length ? net.copFxBuf : null; net.copFxBuf = [];
      netBroadcast({ t: 'world', q: ++net.worldQ, cars: carsArr, npcs: npcArr, cops: copArr, cash: cashArr, drps: dropArr, ufo: ufoArr, al: alienArr, ufoT: ufoTriggered ? 1 : 0, cfx: cfxArr });
    }
  }
  if (isClient()) applyWorldSnap(dt);
  // interpolate remote players
  for (var id in net.remotes) {
    var r = net.remotes[id];
    // closed tabs don't always fire a clean disconnect — reap silent ghosts.
    // but NEVER reap a peer whose socket the host still holds (a backgrounded
    // tab stops sending 's' yet is still connected) — let WS close / 'bye' end it
    if (r.lastSeen !== undefined && T - r.lastSeen > 6 && !(net.mode === 'host' && vconnFor(id))) { removeRemote(id); if (net.mode === 'host') netBroadcast({ t: 'bye', id: id }); continue; }
    var k = Math.min(1, dt * 12);
    r.x += (r.tx - r.x) * k; r.z += (r.tz - r.z) * k; r.y += (r.ty - r.y) * k;
    var dy = r.tyaw - r.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    r.yaw += dy * k;
    var moved = Math.sqrt((r.x - r.lx) * (r.x - r.lx) + (r.z - r.lz) * (r.z - r.lz));
    r.phase += moved * 3.4;
    // smoothed world velocity of this remote — the host's only handle on a
    // remote-driven car's speed/heading (npcCarThreat reads it so pedestrians
    // dodge cars piloted by other players, not just host-simmed traffic)
    if (dt > 0) { r.vx = (r.vx || 0) * 0.6 + ((r.x - r.lx) / dt) * 0.4; r.vz = (r.vz || 0) * 0.6 + ((r.z - r.lz) / dt) * 0.4; }
    r.lx = r.x; r.lz = r.z;
    if (r.drv) {
      // their car is a synced world car — just hide the walking avatar
      r.mesh.visible = false;
      r.tag.position.set(r.x, 3.2, r.z);
    } else {
      r.mesh.visible = true;
      r.mesh.position.set(r.x, Math.max(-59.9, r.y - EYE), r.z);
      r.mesh.rotation.y = r.yaw + Math.PI;
      r.mesh.rotation.x = r.dead ? -1.5 : 0;
      var rspd = moved / Math.max(dt, 0.001);   // real speed so sprinters pick the run clip
      // dead players lie flat (rotation.x=-1.5) — DON'T drive the idle clip or
      // their limbs "swim" horizontally; just freeze the current pose
      if (!r.dead) animPerson(r.mesh, rspd <= 0.5 ? 0 : rspd, dt, r.phase);
      r.tag.position.set(r.x, r.y - EYE + 2.5, r.z);
    }
    // fade the (through-wall, co-op friendly) player tag out at distance so far
    // teammates don't clutter the screen
    var tdx = r.tag.position.x - camera.position.x, tdz = r.tag.position.z - camera.position.z;
    var td = Math.sqrt(tdx * tdx + tdz * tdz);
    r.tag.visible = td < 145;
    r.tag.material.opacity = td > 110 ? Math.max(0, (145 - td) / 35) : 1;
    // voice: pop + green-tint the tag while this peer is transmitting
    var talking = r.talkT !== undefined && T - r.talkT < 0.35;
    r.tag.scale.set(talking ? 3.35 : 2.9, talking ? 0.92 : 0.8, 1);
    r.tag.material.color.setHex(talking ? 0x8effa0 : 0xffffff);
  }
}

// client: mirror the host's world snapshot
var copsM = [];
function applyWorldSnap(dt) {
  var s = net.worldSnap;
  if (!s) return;
  var k = Math.min(1, dt * 10);
  // the wire carries INTEGERS (positions x10, angles x100) — decode here
  for (var i = 0; i < cars.length && i < s.cars.length; i++) {
    var c = cars[i], a = s.cars[i], m = c.car.group;
    if (c === driving) continue;               // we own this one locally
    var fl = a[3];
    c.exploded = !!(fl & 1); c.berserk = !!(fl & 2); c.burning = !!(fl & 4); c.stolen = !!(fl & 8); c.playerDriven = !!(fl & 16); c.parked = !!(fl & 32);
    m.visible = !c.exploded;
    if (c.exploded) {
      // per-peer wreck husk (see spawnHusk): snap to the host's position first
      // so a husk for a car we never saw explode still lands where it burned
      m.position.set(a[0] / 10, 0, a[1] / 10); m.rotation.y = a[2] / 100;
      spawnHusk(c);
      if (c.eng) c.eng.g.gain.value = 0; continue;
    }
    removeHusk(c);
    m.position.x += (a[0] / 10 - m.position.x) * k;
    m.position.z += (a[1] / 10 - m.position.z) * k;
    m.rotation.y = a[2] / 100;
    if (c.berserk || c.burning) {
      c.smokeT = (c.smokeT || 0) - dt;
      if (c.smokeT <= 0) { c.smokeT = 0.1; puff(new THREE.Vector3(m.position.x, 1.1, m.position.z), c.burning ? 0xff8828 : 0x555555); }
    }
    var edx = player.x - m.position.x, edz = player.z - m.position.z;
    var ed = Math.sqrt(edx * edx + edz * edz);
    if (!c.parked) {   // parked mirrors are engine-off: never build audio nodes
      ensureEngine(c);
      if (c.eng) engineTickMirror(c, dt);   // speed estimated from mirrored motion
    } else if (c.eng) c.eng.g.gain.value = 0;
    if (!driving && !c.stolen && !c.parked && Math.abs(edx) < 2.6 && Math.abs(edz) < 2.6 && !state.dead) {
      var dd = ed || 1;
      player.x += (edx / dd) * 2.4; player.z += (edz / dd) * 2.4;
      if (T - state.lastCarHit > 0.8) { state.lastCarHit = T; hurtPlayer(12); sfx('thud'); }
    }
  }
  while (npcs.length < s.npcs.length) spawnNPC();
  // shrink guard: the host never removes NPCs today, but if it ever does, drop
  // the extras here so clients don't keep frozen, index-misaligned ghosts
  while (npcs.length > s.npcs.length) { var exn = npcs.pop(); if (exn) { scene.remove(exn.mesh); if (exn.mesh.userData.shadow) exn.mesh.userData.shadow.visible = false; } }
  for (i = 0; i < s.npcs.length && i < npcs.length; i++) {
    var n = npcs[i], b = s.npcs[i], nm = n.mesh;
    var nox = n.x, noz = n.z;
    var st = b[3];
    // hidden (st 4) = inside a building: mesh invisible, and position SNAPS on
    // the way in/out — teleports through doors must not glide across the map
    var isHid = st === 4;
    if (isHid !== !!n.hiddenM) { n.x = b[0] / 10; n.z = b[1] / 10; nox = n.x; noz = n.z; }
    else { n.x += (b[0] / 10 - n.x) * k; n.z += (b[1] / 10 - n.z) * k; }
    n.hiddenM = isHid;
    nm.visible = !isHid;
    n.state = st === 2 ? 'down' : (st === 3 ? 'ragdoll' : (isHid ? 'hidden' : 'walk'));
    nm.position.set(n.x, st === 3 ? (b[4] / 10 || 0) : 0, n.z);
    nm.rotation.y = b[2] / 100;
    if (st === 3) {
      // the host only snapshots the ragdoll's body x/z/y, not its spin — so
      // tumble the mesh locally (like killNpcRagdoll does host-side) instead of
      // snapping it flat, restoring the death-tumble bystanders used to miss
      if (!n.cRag) { n.cRag = 1; n.cSpinX = (Math.random() - 0.5) * 14; n.cSpinZ = (Math.random() - 0.5) * 14; nm.rotation.x = 0; nm.rotation.z = 0; }
      nm.rotation.x += n.cSpinX * dt; nm.rotation.z += n.cSpinZ * dt;
    } else {
      n.cRag = 0; nm.rotation.x = st === 2 ? -1.5 : 0; nm.rotation.z = 0;
    }
    if (nm.userData.shadow) nm.userData.shadow.visible = st < 2;   // hidden st=4 also hides (>= 2)
    // animate from the mirrored movement so idle/standing NPCs don't "march in
    // place" — speed derived from the position delta, stride-matched phase
    if (st === 0) { var nmv = Math.hypot(n.x - nox, n.z - noz); n.phase += nmv * 3.4; animPerson(nm, (dt > 0 && nmv / dt > 0.5) ? nmv / dt : 0, dt, n.phase); }
  }
  // snapshot cop entries are just [x,z,ry,down] — no engage state — so mirror
  // cops approximate "gun out" with the LOCAL player's wanted level instead
  var wantGunM = state.wanted >= 1 ? (state.wanted >= 4 ? 'smg' : 'pistol') : null;
  while (copsM.length < s.cops.length) { var cm2 = buildCop(); cm2.userData.copM = copsM.length; attachHeldGun(cm2, wantGunM); scene.add(cm2); copsM.push({ mesh: cm2, x: 0, z: 0, phase: Math.random() * 9, hit: false }); }
  while (copsM.length > s.cops.length) { var oldc = copsM.pop(); scene.remove(oldc.mesh); }
  for (i = 0; i < copsM.length; i++) {
    var cp = copsM[i], cs = s.cops[i];
    if (!cp.down && cp.mesh.userData.handR && (cp.mesh.userData.heldKind || null) !== wantGunM) attachHeldGun(cp.mesh, wantGunM);
    var cox = cp.x, coz = cp.z;
    cp.x += (cs[0] / 10 - cp.x) * k; cp.z += (cs[1] / 10 - cp.z) * k;
    cp.nid = cs[4];   // stable host-side id, so dmgCop can't mistarget after a despawn
    if (cs[3] === 2) cp.hit = false;   // kill confirmed: free the run-over latch (slots get reused)
    cp.down = cs[3] === 2;
    cp.mesh.position.set(cp.x, 0, cp.z);
    cp.mesh.rotation.y = cs[2] / 100;
    cp.mesh.rotation.x = cs[3] === 2 ? -1.5 : 0;
    cp.mesh.userData.copM = i;
    // speed-driven anim: a cop standing/shooting on the host stays put here
    // (idle) instead of marching in place; walks only when actually moving
    var cmv = Math.hypot(cp.x - cox, cp.z - coz); cp.phase += cmv * 3.4;
    // a downed cop (cs[3]===2) lies flat — freeze rather than play idle (swim)
    if (cs[3] !== 2) animPerson(cp.mesh, (dt > 0 && cmv / dt > 0.5) ? cmv / dt : 0, dt, cp.phase);
  }
  // cop gunfire FX: the host runs copShoot and buffers each shot; render the
  // muzzle flash + gunshot (+ blood at whoever got hit) so bystanders and the
  // victim SEE where fire is coming from, not just take silent invisible damage.
  // guard on the snapshot's q — worldSnap persists across frames, so without
  // this each shot would re-fire (and re-sound) every frame until the next snap
  if (s.cfx && s.q !== net.cfxQ) {
    net.cfxQ = s.q;
    for (i = 0; i < s.cfx.length; i++) {
      var fe = s.cfx[i];
      var mzv = new THREE.Vector3(fe[0] / 10, fe[1] / 10, fe[2] / 10);
      puff(mzv, 0xffe08a);
      sfx((fe[3] & 1) ? 'copsmg' : 'copshot', { x: mzv.x, z: mzv.z, y: mzv.y, range: 150 });
      if ((fe[3] & 2) && fe.length >= 7) puff(new THREE.Vector3(fe[4] / 10, fe[5] / 10, fe[6] / 10), 0xd93a2a);
    }
  }
  // cash mirror
  if (cashes.length !== s.cash.length) {
    for (i = 0; i < cashes.length; i++) scene.remove(cashes[i].mesh);
    cashes.length = 0;
    for (i = 0; i < s.cash.length; i++) {
      var cmesh = new THREE.Mesh(cashGeo, cashMats);
      cmesh.position.set(s.cash[i][0] / 10, 0.4, s.cash[i][1] / 10);
      scene.add(cmesh);
      cashes.push({ mesh: cmesh, val: 0, life: 9999, baseY: 0, netCash: true, pend: false });
    }
  } else {
    for (i = 0; i < cashes.length; i++) { cashes[i].mesh.position.x = s.cash[i][0] / 10; cashes[i].mesh.position.z = s.cash[i][1] / 10; }
  }
  // shared weapon drops (host-owned; pickup goes through takeDrop/gotDrop)
  var sd = s.drps || [];
  var dRebuild = drops.length !== sd.length;
  if (!dRebuild) for (i = 0; i < sd.length; i++) if (GUN_LIST.indexOf(drops[i].kind) !== sd[i][2]) { dRebuild = true; break; }   // same count, different guns
  if (dRebuild) {
    for (i = 0; i < drops.length; i++) scene.remove(drops[i].mesh);
    drops.length = 0;
    for (i = 0; i < sd.length; i++) {
      var dknd = GUN_LIST[sd[i][2]] || 'pistol';
      var dg = dropMesh(dknd);
      dg.position.set(sd[i][0] / 10, 0.7, sd[i][1] / 10);
      scene.add(dg);
      drops.push({ mesh: dg, kind: dknd, life: 9999, net: true, pend: false });
    }
  } else {
    for (i = 0; i < drops.length; i++) { drops[i].mesh.position.x = sd[i][0] / 10; drops[i].mesh.position.z = sd[i][1] / 10; }
  }
  // the one shared saucer
  if (s.ufoT) ufoTriggered = true;   // somebody already summoned it — latch forever
  var su = s.ufo ? [s.ufo[0] / 10, s.ufo[1] / 10, s.ufo[2] / 10, s.ufo[3], (s.ufo[4] || 0) / 100] : null;
  if (su) {
    var smode = su[3] === 1 ? 'fly' : (su[3] === 2 ? 'falling' : 'crashed');
    if (!ufo) {
      var ug = getUfoMesh(smode === 'crashed' ? 'ufo_dead' : 'ufo');
      ug.userData.ufo = true; ug.traverse(function (o) { o.userData.ufo = true; });
      ug.position.set(su[0], su[1], su[2]);
      if (smode === 'crashed') ug.rotation.set(0.16, su[4] || 0, -0.12);
      scene.add(ug);
      ufo = { mode: smode, group: ug, hp: 1, net: true, vx: 0, vz: 0, dist: 0, maxDist: 0, vy: 0, spin: 1, smokeT: 0, crashT: T, alienAt: 0 };
    } else {
      if (ufo.mode === 'fly' && smode !== 'fly') popup2('UFO HIT!');
      if (ufo.mode !== 'crashed' && smode === 'crashed') {
        // swap in the wreck (the host's boomAt broadcast covers the explosion)
        scene.remove(ufo.group);
        var wg = getUfoMesh('ufo_dead');
        wg.userData.ufo = true; wg.traverse(function (o) { o.userData.ufo = true; });
        wg.position.set(su[0], su[1], su[2]);
        wg.rotation.set(0.16, su[4] || 0, -0.12);
        scene.add(wg);
        ufo.group = wg; ufo.crashT = T;
        stopUfoHum();
      }
      ufo.mode = smode;
    }
    var up = ufo.group.position;
    if (ufo.mode === 'crashed') up.set(su[0], su[1], su[2]);
    else { up.x += (su[0] - up.x) * k; up.y += (su[1] - up.y) * k; up.z += (su[2] - up.z) * k; }
  } else if (ufo && ufo.net) {
    scene.remove(ufo.group); stopUfoHum(); ufo = null;
  }
  // and its pilot
  var sa = s.al ? [s.al[0] / 10, s.al[1] / 10, s.al[2] / 100, s.al[3]] : null;
  if (sa) {
    // never mirror a corpse into existence: it double-pops the spawn/death
    // messages (12s corpse-timer race) and greets late joiners with a ghost
    if (!alien && sa[3] !== 1) spawnAlien(sa[0], sa[1], true);
    if (alien && alien.net) {
      if (sa[3] === 1 && alien.state !== 'dead') { alien.state = 'dead'; alien.deadT = T; popup2('ALIEN DOWN — IT DROPPED SOMETHING'); }
      if (alien.state !== 'dead') {
        alien.x += (sa[0] - alien.x) * k; alien.z += (sa[1] - alien.z) * k;
        alien.tyaw = sa[2];
      }
    }
  } else if (alien && alien.net) {
    scene.remove(alien.mesh); alien = null;
  }
}
function netSendHit(toId, dmg, byPlayer) {
  var m = { t: 'hit', to: toId, dmg: dmg };
  if (byPlayer) m.by = net.id;   // a player shot them (not a cop/alien) → PvP kill credit
  if (net.mode === 'host') { for (var i = 0; i < net.conns.length; i++) if (net.conns[i].peer === toId) { try { net.conns[i].send(m); } catch (e) { } } }
  else net.conns[0] && net.conns[0].send(m);
}
// route a message with an explicit `to` peer id (host->peer directly, or
// client->host->peer). used for PvP kill credit back to the shooter.
function netSendTo(toId, m) {
  if (net.mode === 'host') { for (var i = 0; i < net.conns.length; i++) if (net.conns[i].peer === toId) { try { net.conns[i].send(m); } catch (e) { } } }
  else net.conns[0] && net.conns[0].send(m);
}
function creditPvpKill() {
  state.money += 100; popup('PLAYER DOWN! +$100'); sfx('cash');
  if (state.wanted < 3) setWanted(3); else lastCrimeT = T;
  // kill feed: everyone sees who got the takedown (reuses the chat channel)
  var km = { t: 'chat', text: getPlayerName() + ' got a takedown', sys: 1 };
  addChatMsg(null, km.text, 'sys');
  if (isHost()) netBroadcast(km); else if (isClient()) netToHost(km);
}

// menu wiring
document.getElementById('btnChar').addEventListener('click', openCreator);
document.getElementById('btnCharDone').addEventListener('click', closeCreator);
document.getElementById('btnCharRandom').addEventListener('click', function () {
  playerChar = randomCharConfig();
  if (playerChar.hat === 4) playerChar.hat = 0;
  savePlayerChar(); renderCreatorRows(); refreshCreatorChar();
});
document.getElementById('btnSP').addEventListener('click', startGame);
document.getElementById('btnPlay').addEventListener('click', playOnline);
// players-online ticker on the home screen: poll the relay's /health while at
// the menu (silently blank when offline / file:// with no reachable server)
(function () {
  var el = document.getElementById('onlineCount');
  if (!el) return;
  function poll() {
    if (state.running) return;   // stop caring once in-game
    var base = bugServerUrl();
    if (!base) { el.innerHTML = '&nbsp;'; return; }
    fetch(base + '/health').then(function (r) { return r.json(); }).then(function (j) {
      if (state.running || !j || !j.ok) return;
      var np = j.players | 0;
      el.textContent = np === 0 ? 'server online — nobody in town yet' : (np === 1 ? '1 player in town' : np + ' players in town');
    }).catch(function () { el.innerHTML = '&nbsp;'; });
  }
  poll();
  setInterval(poll, 10000);
})();
document.getElementById('btnHost').addEventListener('click', hostGame);
document.getElementById('btnEnter').addEventListener('click', startGame);
document.getElementById('btnJoin').addEventListener('click', function () { joinGame(document.getElementById('joinCode').value); });
document.getElementById('btnCopy').addEventListener('click', function () {
  var inp = document.getElementById('inviteLink');
  inp.select();
  try { navigator.clipboard.writeText(inp.value); } catch (e) { document.execCommand('copy'); }
});
if (location.hash.indexOf('#join=') === 0) {
  document.getElementById('joinCode').value = location.hash.split('#join=').pop();
}
pauseScreen.addEventListener('click', function () { pauseScreen.classList.add('hidden'); lockPointer(); });
document.addEventListener('pointerlockchange', function () { var locked = document.pointerLockElement === canvas; if (!locked && state.running && !state.menu && !chatOpen && !bugOpen) pauseScreen.classList.remove('hidden'); else if (locked) pauseScreen.classList.add('hidden'); });
document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
document.addEventListener('mousemove', function (e) { if (document.pointerLockElement !== canvas || state.menu) return; var sens = 0.0022 * (zoomed ? 0.35 : 1); yaw -= e.movementX * sens; pitch -= e.movementY * sens; pitch = Math.max(-1.45, Math.min(1.45, pitch)); });
document.addEventListener('mousedown', function (e) {
  if (document.pointerLockElement !== canvas || state.menu) return;
  if (e.button === 0) { mouseDown = true; tryAttack(); }
  else if (e.button === 2 && state.equipped === 'rifle' && !state.dead && !driving) setZoom(true);
});
document.addEventListener('mouseup', function (e) {
  if (e.button === 0) mouseDown = false;
  else if (e.button === 2) setZoom(false);
});
function cycleEquip(dir) {
  // quick-swap through everything you own; TAB inventory still works too
  if (!state.running || state.menu || state.dead || driving) return;
  var list = ['fists'];
  for (var i = 0; i < GUN_LIST.length; i++) if (state.owned[GUN_LIST[i]]) list.push(GUN_LIST[i]);
  if (state.snacks > 0) list.push('snack');
  if (state.sodas > 0) list.push('soda');
  if (list.length < 2) return;
  var idx = list.indexOf(state.equipped);
  if (idx < 0) idx = 0;
  setEquipped(list[(idx + dir + list.length) % list.length]);
}
document.addEventListener('wheel', function (e) {
  if (document.pointerLockElement !== canvas) return;
  cycleEquip(e.deltaY > 0 ? 1 : -1);
}, { passive: true });
// ---------------- multiplayer text chat ----------------
var chatOpen = false;
var chatMsgs = [];   // { el, tw } — tw = wall-clock ms, for auto-fade when closed
function addChatMsg(name, text, kind) {
  var log = document.getElementById('chatLog');
  if (!log) return;
  var el = document.createElement('div');
  el.className = 'chatMsg' + (kind === 'sys' ? ' sys' : '');
  if (kind === 'sys') { el.textContent = text; }
  else {
    var who = document.createElement('span'); who.className = 'who'; who.textContent = name + ': ';
    el.appendChild(who); el.appendChild(document.createTextNode(text));   // textContent path = no HTML injection
  }
  log.appendChild(el);
  chatMsgs.push({ el: el, tw: performance.now() });
  while (chatMsgs.length > 8) { var old = chatMsgs.shift(); if (old.el.parentNode) old.el.remove(); }
}
setInterval(function () {
  var now = performance.now();
  for (var i = 0; i < chatMsgs.length; i++) {
    var m = chatMsgs[i];
    if (chatOpen) m.el.classList.remove('fade');
    else if (now - m.tw > 9000) m.el.classList.add('fade');
  }
}, 500);
function openChat() {
  if (chatOpen || !state.running || state.menu || state.dead) return;
  chatOpen = true;
  var inp = document.getElementById('chatInput');
  inp.classList.remove('hidden'); inp.value = '';
  for (var k in keys) keys[k] = false;   // stop walking while typing
  document.exitPointerLock && document.exitPointerLock();
  setTimeout(function () { inp.focus(); }, 0);
}
function closeChat(send) {
  if (!chatOpen) return;
  chatOpen = false;
  var inp = document.getElementById('chatInput');
  var text = inp.value.replace(/[\x00-\x1F]/g, '').trim().slice(0, 140);
  inp.value = ''; inp.classList.add('hidden'); inp.blur();
  if (send && text) sendChat(text);
  if (state.running && !state.menu) lockPointer();
}
function sendChat(text) {
  var name = getPlayerName();
  addChatMsg(name, text, null);   // echo my own line immediately
  if (isHost()) netBroadcast({ t: 'chat', name: name, text: text });
  else if (isClient()) netToHost({ t: 'chat', name: name, text: text });
}
function chatNotice(text) { addChatMsg(null, text, 'sys'); }
(function () {
  var inp = document.getElementById('chatInput');
  if (!inp) return;
  inp.addEventListener('keydown', function (e) {
    e.stopPropagation();   // never leak typing to the game key handler
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); closeChat(true); }
    else if (e.code === 'Escape') { e.preventDefault(); closeChat(false); }
  });
  inp.addEventListener('blur', function () { if (chatOpen) closeChat(false); });
})();
// ---------------- multiplayer push-to-talk voice chat ----------------
// mic PCM is downsampled to 16 kHz Int16, base64'd, and sent as a normal relay
// message (client->host->fanout, same path as chat) — no server changes. Each
// speaker's frames are scheduled back-to-back per-peer for gap-free playback.
var voice = { on: false, stream: null, src: null, proc: null, sink: null, rate: 16000, warned: false };
var voicePlay = {};   // speakerId -> { cursor }
function int16ToB64(i16) {
  var u8 = new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength), s = '', CH = 0x8000;
  for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}
function voiceStart() {
  if (voice.on || !netActive()) return;
  if (!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
    if (!voice.warned) { voice.warned = true; popup2('Voice needs the game served over https (not file://)'); }
    return;
  }
  initAudio(); if (ac && ac.state === 'suspended') ac.resume();
  voice.on = true;   // set immediately so a fast tap doesn't double-start
  navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(function (stream) {
    if (!voice.on) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }   // released before grant
    voice.stream = stream;
    voice.src = ac.createMediaStreamSource(stream);
    voice.proc = ac.createScriptProcessor(2048, 1, 1);
    voice.sink = ac.createGain(); voice.sink.gain.value = 0;   // silent sink keeps onaudioprocess firing without echoing your own mic
    voice.src.connect(voice.proc); voice.proc.connect(voice.sink); voice.sink.connect(ac.destination);
    voice.proc.onaudioprocess = function (e) {
      if (!voice.on) return;
      var input = e.inputBuffer.getChannelData(0), ratio = ac.sampleRate / voice.rate;
      var outLen = Math.floor(input.length / ratio), pcm = new Int16Array(outLen);
      for (var i = 0; i < outLen; i++) { var s = input[(i * ratio) | 0]; pcm[i] = s < -1 ? -32768 : (s > 1 ? 32767 : (s * 32767) | 0); }
      var msg = { t: 'voice', id: net.id, r: voice.rate, d: int16ToB64(pcm) };
      if (isHost()) netBroadcast(msg); else netToHost(msg);
    };
    document.getElementById('voiceInd').classList.remove('hidden');
  }).catch(function () { voice.on = false; if (!voice.warned) { voice.warned = true; popup2('Mic permission denied'); } });
}
function voiceStop() {
  if (!voice.on) return;
  voice.on = false;
  if (voice.proc) { try { voice.proc.disconnect(); } catch (e) { } voice.proc.onaudioprocess = null; }
  if (voice.src) { try { voice.src.disconnect(); } catch (e) { } }
  if (voice.sink) { try { voice.sink.disconnect(); } catch (e) { } }
  if (voice.stream) { voice.stream.getTracks().forEach(function (t) { t.stop(); }); }
  voice.stream = voice.src = voice.proc = voice.sink = null;
  document.getElementById('voiceInd').classList.add('hidden');
}
function playVoiceFrame(id, rate, b64) {
  if (!ac) return;
  var raw = atob(b64), u8 = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  var i16 = new Int16Array(u8.buffer, 0, u8.length >> 1), f = new Float32Array(i16.length);
  for (i = 0; i < i16.length; i++) f[i] = i16[i] / 32768;
  if (!f.length) return;
  var buf = ac.createBuffer(1, f.length, rate || 16000);
  if (buf.copyToChannel) buf.copyToChannel(f, 0); else buf.getChannelData(0).set(f);
  var srcN = ac.createBufferSource(); srcN.buffer = buf; srcN.connect(ac.destination);
  var st = voicePlay[id] || (voicePlay[id] = { cursor: 0 });
  var now = ac.currentTime, start = Math.max(now + 0.03, st.cursor);
  if (start - now > 0.6) start = now + 0.03;   // fell way behind (tab stutter) — resync
  srcN.start(start); st.cursor = start + buf.duration;
}
// ---------------- in-game bug reporter (F8) ----------------
// captures the current frame + a typed description + meta and POSTs it to the
// relay server (/bug) for Claude to triage later. works in SP and MP.
var bugOpen = false;
function bugServerUrl() { return (WC_SERVER_URL || '').replace(/^ws/, 'http').replace(/\/$/, ''); }
function openBug() {
  if (bugOpen) return;
  bugOpen = true;
  var shot = '';
  try { renderer.render(scene, camera); shot = renderer.domElement.toDataURL('image/jpeg', 0.55); } catch (e) { }
  var img = document.getElementById('bugShot'); img.src = shot || ''; img.dataset.shot = shot || '';
  document.getElementById('bugText').value = '';
  var st = document.getElementById('bugStatus'); st.textContent = ''; st.className = '';
  document.getElementById('bugSend').disabled = false;
  for (var k in keys) keys[k] = false;
  document.exitPointerLock && document.exitPointerLock();
  document.getElementById('bugPanel').classList.remove('hidden');
  setTimeout(function () { document.getElementById('bugText').focus(); }, 0);
}
function closeBug() {
  if (!bugOpen) return;
  bugOpen = false;
  document.getElementById('bugPanel').classList.add('hidden');
  if (state.running && !state.menu) lockPointer();
}
function submitBug() {
  var st = document.getElementById('bugStatus');
  var text = document.getElementById('bugText').value.trim();
  var shot = document.getElementById('bugShot').dataset.shot || '';
  var base = bugServerUrl();
  if (!base) { st.className = 'err'; st.textContent = 'No server configured.'; return; }
  document.getElementById('bugSend').disabled = true;
  st.className = ''; st.textContent = 'Sending…';
  var meta = { ver: GAME_VERSION, name: getPlayerName(), mode: net.mode, room: net.room || null, pos: [Math.round(player.x), Math.round(player.z)], inside: !!inside, driving: !!driving, wanted: state.wanted, ua: navigator.userAgent.slice(0, 140) };
  fetch(base + '/bug', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text, img: shot, meta: meta }) })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (j && j.ok) { st.className = ''; st.textContent = 'Thanks! Report ' + j.id + ' sent.'; setTimeout(closeBug, 1100); }
      else { st.className = 'err'; st.textContent = 'Failed: ' + ((j && j.error) || 'unknown'); document.getElementById('bugSend').disabled = false; }
    })
    .catch(function () { st.className = 'err'; st.textContent = 'Could not reach the server.'; document.getElementById('bugSend').disabled = false; });
}
(function () {
  var s = document.getElementById('bugSend'), c = document.getElementById('bugCancel'), t = document.getElementById('bugText');
  if (s) s.addEventListener('click', submitBug);
  if (c) c.addEventListener('click', closeBug);
  if (t) t.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.code === 'Escape') closeBug(); });
})();
document.addEventListener('keydown', function (e) {
  if (bugOpen) { if (e.code === 'F8' || e.code === 'Escape') { e.preventDefault(); closeBug(); } return; }
  if (chatOpen) return;   // the chat input owns the keyboard while open
  if (e.code === 'F8' && state.running) { e.preventDefault(); openBug(); return; }
  if (e.code === 'KeyV' && !e.repeat && state.running && !state.menu && netActive()) { voiceStart(); return; }
  keys[e.code] = true;
  if ((e.code === 'Enter' || e.code === 'NumpadEnter') && state.running && !state.menu && netActive()) { e.preventDefault(); openChat(); return; }
  if (e.code === 'Tab') { e.preventDefault(); if (!state.running || state.dead) return; if (state.menu === 'inv') closeMenus(); else { closeMenus(false); openMenu('inv'); } }
  if (e.code === 'KeyE') {
    // dead-guard matters: E during the 2.6s death window could enterStore
    // (respawn then never cleared `inside` → wrong floor/colliders forever),
    // enter a car, or open the shop
    if (!state.running || state.dead) return;
    if (state.menu === 'shop' || state.menu === 'clerk') { closeMenus(); return; }
    if (state.menu) return;
    if (driving) { exitCar(); return; }
    if (inside) {
      var cdx = player.x - clerkPos.x, cdz = player.z - clerkPos.z;
      var xdx = player.x - doorIn.x, xdz = player.z - doorIn.z;
      if (cdx * cdx + cdz * cdz < 12) openMenu('clerk');
      else if (xdx * xdx + xdz * xdz < 7) exitStore();
      return;
    }
    var ddx = player.x - dealerPos.x, ddz = player.z - dealerPos.z;
    if (ddx * ddx + ddz * ddz < 36) { openMenu('shop'); return; }
    var gdx = player.x - gasRob.x, gdz = player.z - gasRob.z;
    if (gdx * gdx + gdz * gdz < 40) { enterStore(); return; }
    if (streetPropInteract()) return;   // vending / payphone / ATM / newsbox
    if (envPropInteract()) return;      // env props: sit / drink / buy / play / vend / read
    var sc = nearestStealableCar();
    if (sc) {
      if (sc.parked) startBreakIn(sc);   // empty lot car: 0.9s break-in first
      else enterCar(sc);
    }
  }
  if (e.code === 'Escape' && state.menu) closeMenus(false);
  if (e.code === 'Escape' && !state.running && creatorOpen) closeCreator();
});
document.addEventListener('keyup', function (e) { keys[e.code] = false; if (e.code === 'KeyV') voiceStop(); });
// safety: never leave the mic hot if focus/lock is lost mid-transmit
window.addEventListener('blur', function () { voiceStop(); });
document.addEventListener('pointerlockchange', function () { if (document.pointerLockElement !== canvas) voiceStop(); });

// ---------------- player update ----------------
function updatePlayer(dt) {
  if (state.menu || state.dead) return;
  if (driving) {
    updateDriving(dt);
    if (state.hp < 100 && T - state.lastHurt > 5) state.hp = Math.min(100, state.hp + 5 * dt);
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) flash.visible = false; }
    document.getElementById('prompt').textContent = '[E] EXIT CAR';
    rocketCdEl.classList.add('hidden');   // the vm/reload block below is skipped while driving — don't leave the bar stuck
    return;
  }
  updateBreakIn(dt);
  var f = 0, s = 0;
  if (keys['KeyW']) f += 1; if (keys['KeyS']) f -= 1; if (keys['KeyD']) s += 1; if (keys['KeyA']) s -= 1;
  var spd = keys['ShiftLeft'] || keys['ShiftRight'] ? 8.4 : 5.2;
  if (f || s) { var inv = spd / Math.sqrt(f * f + s * s); var fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw); player.x += (fx * f + rx * s) * inv * dt; player.z += (fz * f + rz * s) * inv * dt; }
  if (keys['Space'] && player.grounded) { player.vy = 5.6; player.grounded = false; }
  player.vy -= GRAV * dt; player.y += player.vy * dt;
  var eyeFloor = (inside ? INT.y : lakeBedY(player.x, player.z)) + EYE;
  if (player.y <= eyeFloor) { player.y = eyeFloor; player.vy = 0; player.grounded = true; }
  player.x = Math.max(-HALF + 1.2, Math.min(HALF - 1.2, player.x)); player.z = Math.max(-HALF + 1.2, Math.min(HALF - 1.2, player.z));
  if (!landColliders) landColliders = colliders.filter(function (cc) { return !cc.lake; });
  var p = pushOut(player.x, player.z, 0.55, inside ? intColliders : landColliders); player.x = p.x; player.z = p.z;
  // pedestrians are solid-ish: you shoulder past them, not through them
  if (!inside && !state.dead) for (var pci = 0; pci < npcs.length; pci++) {
    var pcn = npcs[pci];
    if (pcn.state === 'down' || pcn.state === 'ragdoll' || pcn.state === 'hidden') continue;
    var pcx = player.x - pcn.x, pcz = player.z - pcn.z, pc2 = pcx * pcx + pcz * pcz;
    if (pc2 < 0.6 && pc2 > 0.0001) {
      var pcd = Math.sqrt(pc2), pcp = 0.78 - pcd;
      player.x += pcx / pcd * pcp * 0.8; player.z += pcz / pcd * pcp * 0.8;
      pcn.x -= pcx / pcd * pcp * 0.35; pcn.z -= pcz / pcd * pcp * 0.35;   // they give a little too
    }
  }
  // cops are solid too — but they hold the line (player gives most of the ground)
  if (!state.dead) for (var cci = 0; cci < cops.length; cci++) {
    var ccc = cops[cci];
    if (ccc.state === 'down') continue;
    if (inside ? !ccc.interior : ccc.interior) continue;   // interior cops share x/z space at another floor
    var ccx = player.x - ccc.x, ccz = player.z - ccc.z, cc2 = ccx * ccx + ccz * ccz;
    if (cc2 < 0.6 && cc2 > 0.0001) {
      var ccd = Math.sqrt(cc2), ccp = 0.78 - ccd;
      player.x += ccx / ccd * ccp * 0.85; player.z += ccz / ccd * ccp * 0.85;
      ccc.x -= ccx / ccd * ccp * 0.2; ccc.z -= ccz / ccd * ccp * 0.2;   // cops barely budge
    }
  }
  if (!inside && !state.dead && isClient()) for (var cmi = 0; cmi < copsM.length; cmi++) {
    var cmc = copsM[cmi];
    if (cmc.down) continue;
    var cmx = player.x - cmc.x, cmz = player.z - cmc.z, cm2 = cmx * cmx + cmz * cmz;
    if (cm2 < 0.6 && cm2 > 0.0001) {
      var cmd = Math.sqrt(cm2), cmp = 0.78 - cmd;
      player.x += cmx / cmd * cmp; player.z += cmz / cmd * cmp;   // mirror positions are host-authoritative
    }
  }
  if (mouseDown && !WEAPONS[state.equipped].melee && WEAPONS[state.equipped].auto) tryAttack();
  if (state.hp < 100 && T - state.lastHurt > 5) state.hp = Math.min(100, state.hp + 5 * dt);
  recoilPitch += -recoilPitch * Math.min(1, dt * 5);   // recoil recovers back to the aim over ~0.4s (was: pitch climbed and stuck)
  camera.position.set(player.x, player.y, player.z); camera.rotation.y = yaw; camera.rotation.x = Math.max(-1.45, Math.min(1.45, pitch + recoilPitch));
  var moving = (f || s) && player.grounded; var bob = moving ? Math.sin(T * (spd > 6 ? 13 : 9)) * 0.035 : 0; camera.position.y += bob;
  recoil = Math.max(0, recoil - dt * 8); vm.position.z = recoil * 0.07; vm.position.y = bob * 0.5; vm.rotation.x = recoil * 0.06;
  gunBloom = Math.max(0, gunBloom - dt * 0.06);   // spread recovers ~0.7s after easing off
  // weapon draw + rocket reload animations (procedural, PS1-cheap)
  var wg = vmMap[state.equipped];
  if (wg && state.equipped !== 'fists' && state.equipped !== 'snack' && state.equipped !== 'soda') {
    wg.position.set(0, 0, 0); wg.rotation.set(0, 0, 0);
    var det = T - equipT;
    if (det >= 0 && det < 0.45) {   // draw: rise from below with a rolling rack
      var ek = 1 - det / 0.45; ek *= ek;
      wg.position.y = -0.32 * ek;
      wg.rotation.z = -0.6 * ek;
      wg.rotation.x = 0.35 * ek;
    }
  }
  if (state.equipped === 'rocket' && wg) {
    var rcd = T - (lastShotBy.rocket || -99);
    if (rcd >= 0 && rcd < WEAPONS.rocket.rate) {
      // reload: launcher dips down-right, a fresh rocket slides into the muzzle
      var dip = Math.min(1, rcd / 0.55, (WEAPONS.rocket.rate - rcd) / 0.7);
      dip = dip * dip * (3 - 2 * dip);
      wg.position.x += 0.11 * dip; wg.position.y += -0.19 * dip;
      wg.rotation.z += -0.45 * dip; wg.rotation.x += 0.18 * dip;
      var rf = rcd / WEAPONS.rocket.rate;
      if (rocketHead.userData.seatVisible) {
        // procedural launcher (no Meshy rpg7): a fresh cone rocket slides in from
        // out-front into the empty tube
        var sl = Math.max(0, 1 - (rf - 0.45) / 0.3);   // 1 = held out front, 0 = seated
        rocketHead.visible = rf >= 0.45;
        rocketHead.position.copy(rocketSeat).addScaledVector(rocketFwd, sl * 0.42);
        rocketHead.position.y += sl * 0.05;
      } else {
        // Meshy launcher has its OWN warhead mesh — DON'T animate the mismatched
        // procedural cone (it floated detached in front of the gun). Keep the tube
        // empty, then the real warhead reappears seated as the reload completes.
        rocketHead.visible = false;
        if (rpgWarhead) rpgWarhead.visible = rf >= 0.7;
      }
      rocketCdEl.classList.remove('hidden');
      rocketCdBar.style.width = (rf * 100).toFixed(1) + '%';
    } else {
      rocketHead.visible = rocketHead.userData.seatVisible;
      rocketHead.position.copy(rocketSeat);
      if (rpgWarhead) rpgWarhead.visible = true;
      rocketCdEl.classList.add('hidden');
    }
  } else rocketCdEl.classList.add('hidden');
  var pt = T - punchT;
  if (WEAPONS[state.equipped].melee) {
    if (psxArms) {
      // 1 in 5 swings is an open-hand BITCH SLAP: jabR silhouette swept
      // horizontally across the screen by rolling the whole fists group
      var jabWant = punchSlap && psxArms.clips.jabR ? 'jabR' : (punchSide ? 'jabR' : 'jabL');
      var jabKey = psxArms.clips[jabWant] ? jabWant : 'idle';
      var jd = psxArms.clips[jabKey] ? psxArms.clips[jabKey].d : 0.3;
      if (pt >= 0 && pt < jd) {
        armsPose(psxArms, jabKey, pt, true);
        if (punchSlap) {
          var sk = Math.min(1, pt / (jd * 0.55));         // sweep leads the clip
          var se = sk * sk * (3 - 2 * sk);
          vmFists.rotation.y = -0.7 + 1.6 * se;           // right-to-left arc across the view
          vmFists.rotation.z = -0.3 + 0.6 * se;           // wrist roll
        } else { vmFists.rotation.y = 0; vmFists.rotation.z = 0; }
      }
      else { armsPose(psxArms, 'idle', T); vmFists.rotation.y = 0; vmFists.rotation.z = 0; }
    } else if (pt < 0.28) { var kk = Math.sin((pt / 0.28) * Math.PI); punchArm.position.z = punchArmBase.z - kk * 0.5; punchArm.position.x = punchArmBase.x - kk * 0.14; punchArm.rotation.x = -kk * 0.4; }
    else { punchArm.position.copy(punchArmBase); punchArm.rotation.x = 0; }
  } else if (psxArms && GUNHOLD_GROUPS[state.equipped]) { armsPose(psxArms, gunHold.clip, gunHold.t, true); solveSupportIK(state.equipped); }
  if (flashT > 0) {
    flashT -= dt;
    if (flashT <= 0) flash.visible = false;
    // frame-cycle the sprite while it lives (2-3 frames over ~45ms)
    else if (flashTexs.length) flash.material.map = flashTexs[(Math.random() * flashTexs.length) | 0];
  }
  // context prompt
  var prompt = document.getElementById('prompt');
  if (state.menu) { prompt.textContent = ''; }
  else if (inside) {
    var cdx = player.x - clerkPos.x, cdz = player.z - clerkPos.z;
    var xdx = player.x - doorIn.x, xdz = player.z - doorIn.z;
    if (cdx * cdx + cdz * cdz < 12) prompt.textContent = '[E] TALK TO CLERK';
    else if (xdx * xdx + xdz * xdz < 7) prompt.textContent = '[E] LEAVE';
    else prompt.textContent = '';
  } else {
    var ddx = player.x - dealerPos.x, ddz = player.z - dealerPos.z;
    var gdx = player.x - gasRob.x, gdz = player.z - gasRob.z;
    if (ddx * ddx + ddz * ddz < 36) prompt.textContent = '[E] BUY GUNS';
    else if (gdx * gdx + gdz * gdz < 40) prompt.textContent = (T < gasClosedUntil) ? 'STORE CLOSED' : '[E] ENTER GAS STATION';
    else {
      var spp = breakIn ? null : (streetPropPrompt() || envPropPrompt());   // street + env prop E-prompts
      var nsc = spp || breakIn ? null : nearestStealableCar();
      if (breakIn) prompt.textContent = 'BREAKING IN…';
      else if (spp) prompt.textContent = spp;
      else if (nsc) prompt.textContent = carDrivenByPlayer(nsc) ? '[E] HIJACK CAR' : (nsc.parked ? '[E] BREAK IN' : '[E] STEAL CAR');
      else prompt.textContent = '';
    }
  }
}
function updateHUD() { document.getElementById('money').textContent = '$' + state.money; document.getElementById('hpBar').style.width = Math.max(0, state.hp) + '%'; }

// ---------------- main loop ----------------
var last = performance.now();
var lastRafMs = performance.now();   // bot mode watches this to detect RAF starvation
function loop(now) {
  if (WC_BOT) return;   // bot sims on its own real-time interval, never renders
  requestAnimationFrame(loop);
  lastRafMs = performance.now();
  var dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!state.running) { renderer.render(scene, camera); renderCreatorFrame(dt); return; }
  T += dt;
  updatePlayer(dt); updateNPCs(dt); updateCops(dt); updateCars(dt); updateRockets(dt); updateDrops(dt); updateUfo(dt); updateCash(dt); updatePuffs(dt); updateBooms(dt); updateDecals(dt); updateWorldFx(dt); updateStreetProps(dt); updateEnvProps(dt); updateEnv(dt); updateVoiceAudio(dt); updateNet(dt); updateNpcTags(); updateHUD(); drawMinimap();
  renderer.render(scene, camera);
}
setEquipped('fists');
updateStarsHUD();
camera.position.set(player.x, player.y, player.z);
requestAnimationFrame(loop);

// ---- late-loaded NPC voice chunks ----
// npcvoices1.js ships as a blocking <script> tag and declares
// NPC_VOICE_CHUNKS; the remaining npcvoicesN.js chunks arrive here as dynamic
// script tags shortly after the menu is up, so first paint stays fast. Plain
// <script src> injection keeps file:// working (fetch/XHR would not).
// playNpcVoice treats a character whose chunk hasn't landed yet exactly like
// one with no pack entry, so callers fall back to the generic barks silently.
var npcVoiceChunksKicked = false;
function loadNpcVoiceChunks() {
  if (npcVoiceChunksKicked) return;
  npcVoiceChunksKicked = true;
  var total = typeof NPC_VOICE_CHUNKS !== 'undefined' ? NPC_VOICE_CHUNKS : 0;
  for (var i = 2; i <= total; i++) {
    var s = document.createElement('script');
    s.src = 'npcvoices' + i + '.js';
    s.async = true;
    document.head.appendChild(s);
  }
}
setTimeout(loadNpcVoiceChunks, 800);

// debug hook
window.__wc = {
  state: state, player: player, npcs: npcs, cashes: cashes, cops: cops,
  setWanted: setWanted, damageCop: damageCop,
  start: function () { startScreen.classList.add('hidden'); state.running = true; },
  setYaw: function (y) { yaw = y; camera.position.set(player.x, player.y, player.z); camera.rotation.y = yaw; camera.rotation.x = pitch; },
  setPitch: function (p2) { pitch = p2; camera.rotation.x = pitch; },
  teleport: function (x, z) { player.x = x; player.z = z; },
  tryAttack: tryAttack, setEquipped: setEquipped, cycleEquip: cycleEquip,
  enterStore: enterStore, exitStore: exitStore, refreshClerk: refreshClerk, animPerson: animPerson, animPersonClip: animPersonClip, playVoice: playVoice, oak: oak, bush: bush, getPackProp: getPackProp,
  initAudio: initAudio, playNpcVoice: playNpcVoice, playVoiceAny: playVoiceAny,
  audioVoices: function () { return activeVoices; }, getAC: function () { return ac; },
  voiceDbg: function () { return { local: dbgVoiceLocal, net: dbgVoiceNet, bcast: dbgVoiceBcast }; },
  playNetVoice: playNetVoice, panicNear: panicNear, npcChatLine: npcChatLine,
  engineRPM: engineRPM, ensureEngineRich: ensureEngineRich,
  armsInfo: function () { return psxArms ? { clips: Object.keys(psxArms.clips), np: psxArms.np, anchor: psxArms.root.position.toArray().map(function (v) { return Math.round(v * 100) / 100; }) } : null; },
  isInside: function () { return inside; },
  storeState: function () { return { robbed: robbedVisit, copsCalled: copsCalledVisit, closedUntil: gasClosedUntil, now: T }; },
  resetCooldowns: function () { punchT = -99; lastShot = -99; lastShotBy = {}; },
  gunBloom: function () { return gunBloom; },
  setGunHold: function (c, t) { gunHold.clip = c; gunHold.t = t; },   // debug: tune the arms hold pose
  dbgArm: function (ov) { dbgArmOv = ov; },   // debug: override support-arm eulers [[x,y,z]x bones 24-27]
  setAnchor: function (w, arr) { ANCHOR_OFF[w] = arr; },   // debug: tune per-weapon forward anchor offset
  getAnchor: function (w) { return ANCHOR_OFF[w]; },
  setGrip: function (w, arr) { GRIP_TGT[w] = arr; },   // debug: tune per-weapon support-hand IK grip target
  getGrip: function (w) { return GRIP_TGT[w]; },
  getBoneQ: function (i) { return psxArms ? psxArms.bones[i].quaternion.toArray().map(function (v) { return Math.round(v * 1000) / 1000; }) : null; },
  poseArmsNow: function () { if (psxArms && GUNHOLD_GROUPS[state.equipped]) { armsPose(psxArms, gunHold.clip, gunHold.t, true); solveSupportIK(state.equipped); } },
  handPos: function () { if (!psxArms) return null; psxArms.mesh.updateMatrixWorld(true); var pl = new THREE.Vector3(), pr = new THREE.Vector3(); psxArms.bones[27].getWorldPosition(pl); psxArms.bones[4].getWorldPosition(pr); return { L: pl.toArray().map(function (v) { return Math.round(v * 100) / 100; }), R: pr.toArray().map(function (v) { return Math.round(v * 100) / 100; }) }; },

  spawnUfo: spawnUfo, damageUfo: damageUfo, damageAlien: damageAlien,
  ufoRef: function () { return ufo; }, alienRef: function () { return alien; },
  ufoState: function () { return ufo ? { mode: ufo.mode, hp: ufo.hp, net: !!ufo.net, pos: ufo.group.position.toArray().map(function (v) { return Math.round(v * 10) / 10; }), crashT: ufo.crashT, alienAt: ufo.alienAt } : null; },
  alienState: function () { return alien ? { hp: alien.hp, state: alien.state, net: !!alien.net, x: Math.round(alien.x), z: Math.round(alien.z) } : null; },
  ufoTriggered: function () { return ufoTriggered; },
  dropsState: function () { return drops.map(function (d) { return { kind: d.kind, net: !!d.net, life: Math.round(d.life), x: Math.round(d.mesh.position.x * 10) / 10, z: Math.round(d.mesh.position.z * 10) / 10 }; }); },
  creditCivKill: creditCivKill, creditCopKill: creditCopKill, dropWeapon: dropWeapon,
  copWeapon: copWeapon,
  openMenu: openMenu, closeMenus: closeMenus, spawnCashAt: spawnCash,
  renderer: renderer, scene: scene, camera: camera,
  cars: cars, boomAt: boomAt, killNpcRagdoll: killNpcRagdoll,
  drops: drops, rockets: rockets, setZoom: setZoom, hurtPlayer: hurtPlayer,
  enterCar: enterCar, exitCar: exitCar, nearestStealableCar: nearestStealableCar,
  isDriving: function () { return !!driving; }, drivingCar: function () { return driving; },
  pressKey: function (code, down) { keys[code] = down; },
  setRain: function (on) { raining = on; rainLeft = on ? 9999 : 0; },
  setClock: function (t2) { envT = t2; },
  envState: function () { return { envT: envT, raining: raining, dayFactor: dayFactor(), lampsOn: lampsOn, sun: sun.intensity, fogFar: scene.fog.far }; },
  sigState: function () { return { t: sigClock, main: sigMain, cross: sigCross }; },
  setSigClock: function (t2) { sigClock = t2; updateSignals(0); },   // force a phase for tests
  carSignalsRef: function () { return carSignals; },
  carGovState: function () { return cars.map(function (c, i) { return c.parked || c.stolen || c.exploded ? null : { i: i, spd: Math.round(c.speed * 100) / 100, cruise: Math.round((c.cruise || 0) * 100) / 100, x: Math.round(c.car.group.position.x * 10) / 10, z: Math.round(c.car.group.position.z * 10) / 10, ry: Math.round(c.car.group.rotation.y * 100) / 100 }; }).filter(function (e) { return e; }); },
  placeCarOnLane: function (i, x, z, hx, hz) {   // test hook: seat car i on the nearest lane point facing (hx,hz)
    var c = cars[i]; if (!c || !RM) return false;
    var best = -1, bestD = 1e9, bs = 0;
    for (var e = 0; e < RM.edges.length; e++) { var ed = RM.edges[e]; var pr = rmProject(ed.pts, ed.cum, x, z); if (pr.d * pr.d < bestD) { bestD = pr.d * pr.d; best = e; bs = pr.s; } }
    if (best < 0) return false;
    var ed = RM.edges[best]; c.rEdge = best; c.rS = Math.max(ed.m0, Math.min(ed.len - ed.m1, bs));
    var p = rmAt(ed.pts, ed.cum, c.rS); c.rDir = (p.ux * hx + p.uz * hz) >= 0 ? 1 : -1;
    c.rLane = 0; c.rOff = ed.lanes[0];
    c.parked = false; c.stolen = false; c.exploded = false; c.berserk = false; c.shoveT = 0; c.dmgT = 0;
    c.cruise = ed.spdA; c.speed = ed.spdA;
    var lp = rmLanePos(c, c.rS); c.car.group.position.set(lp.x, 0, lp.z); c.rTx = lp.tx; c.rTz = lp.tz; c.car.group.rotation.y = Math.atan2(-lp.tz, lp.tx);
    return { x: Math.round(lp.x * 10) / 10, z: Math.round(lp.z * 10) / 10 };
  },
  goBerserk: goBerserk, igniteCar: igniteCar, explodeCar: explodeCar,
  makeCar: makeCar,   // roster/model-mix testing (remember to scene.remove(.group))
  startBreakIn: startBreakIn,
  breakInState: function () { return breakIn ? { t: Math.round(breakIn.t * 100) / 100, i: cars.indexOf(breakIn.c) } : null; },
  parkedInfo: function () {
    return cars.map(function (c, i) { return c.slot ? { i: i, parked: !!c.parked, stolen: !!c.stolen, exploded: !!c.exploded, eng: !!c.eng, respawnT: Math.round(c.respawnT * 10) / 10, x: Math.round(c.car.group.position.x * 10) / 10, z: Math.round(c.car.group.position.z * 10) / 10, ry: Math.round(c.car.group.rotation.y * 100) / 100, slot: c.slot } : null; }).filter(function (e) { return e; });
  },
  breakables: breakables, breakProp: breakProp, lakeBedY: lakeBedY,
  colliders: colliders, mapForestReg: mapForest, mapBuildingsReg: mapBuildings,
  spawnNPC: spawnNPC, assignNpcHome: assignNpcHome, npcTargetFor: npcTargetFor, spotClear: spotClear, mapRoadsReg: mapRoads,
  npcDoors: npcDoors, pointFree: pointFree, spawnCop: spawnCop,
  expWalkInfo: function () { return { res: expWalkRes.length, col: expWalkCol.length, resLen: Math.round(expWalkRes.total || 0), colLen: Math.round(expWalkCol.total || 0) }; },
  landCollidersRef: function () { return landColliders; }, pushOut: pushOut,
  solidMeshesReg: solidMeshes,
  buildFenceRun: function (pts, type, opts) { return buildFenceRun(pts, type, opts); }, fenceRuns: FENCE_RUNS,
  remapPointClear: function (x, z, pad) { return remapPointClear(x, z, pad); },
  oakInfo: function () { return { count: oakCount, cap: OAK_CAP }; },
  densityInfo: function () { return densityStats; },
  forestFillPts: expFillPts,
  streetProps: streetPropInteractables, streetPropInteract: streetPropInteract, getStreetProp: getStreetProp, hydrantJets: hydrantJets,
  envProps: envProps, envPropInteractables: envPropInteractables, envStats: envStats, getEnvProp: getEnvProp, envPropInteract: envPropInteract,
  houses: houseStats, houseBlocksSpot: houseBlocksSpot, houseMeshesRef: houseMeshesRef,
  isUnderwater: function () { return underwater; },
  net: net, startGame: startGame, hostGame: hostGame, joinGame: joinGame, handleNet: handleNet,
  playOnline: playOnline, becomeHost: becomeHost,
  buildIceConfig: buildIceConfig, hmacSha1B64: hmacSha1B64,
  buildCharacter: buildCharacter, randomCharConfig: randomCharConfig, buildMeshySkinned: buildMeshySkinned,
  sendChat: sendChat, attachHeldGun: attachHeldGun, addChatMsg: addChatMsg, updateNpcTags: updateNpcTags, npcTagPool: function () { return npcTagPool; },
  voiceStart: voiceStart, voiceStop: voiceStop, voiceState: function () { return { on: voice.on, play: voicePlay }; },
  openBug: openBug, closeBug: closeBug, submitBug: submitBug, bugServerUrl: bugServerUrl,
  encodeCC: encodeCC, decodeCC: decodeCC, seededRng: seededRng,
  openCreator: openCreator, closeCreator: closeCreator,
  creatorSpin: function (v) { if (cprev) cprev.spin = v; },
  getPlayerChar: function () { return playerChar; },
  setPlayerChar: function (c) { playerChar = c; },
  tick: function (dt) { T += dt; updatePlayer(dt); updateNPCs(dt); updateCops(dt); updateCars(dt); updateRockets(dt); updateDrops(dt); updateUfo(dt); updateCash(dt); updatePuffs(dt); updateBooms(dt); updateDecals(dt); updateWorldFx(dt); updateStreetProps(dt); updateEnvProps(dt); updateEnv(dt); updateVoiceAudio(dt); updateNet(dt); renderer.render(scene, camera); }
};

// ---------------- boot screen handoff + menu cover art ----------------
(function () {
  var bs = document.getElementById('bootScreen');
  if (bs) { var bb = document.getElementById('bootBar'); if (bb) bb.style.width = '100%'; setTimeout(function () { bs.classList.add('hidden'); }, 250); }
  // AI cover art behind the menu (menubg.js data-URL, vendored — no external URLs)
  if (typeof MENU_BG !== 'undefined' && MENU_BG) {
    var ss = document.getElementById('startScreen');
    ss.style.backgroundImage = 'linear-gradient(rgba(6,9,15,0.55), rgba(6,9,15,0.78)), url(' + MENU_BG + ')';
    ss.style.backgroundSize = 'cover';
    ss.style.backgroundPosition = 'center';
  }
})();

// ---------------- world-bot boot (?bot=1: the dedicated server's headless host)
if (WC_BOT) {
  // park the bot's never-seen player at the map edge and connect as the
  // (invisible) MAIN host
  try { renderer.setSize(64, 48); } catch (e) { }
  player.x = 320; player.z = 320;
  spawnX = 320; spawnZ = 320;   // if the world ever kills the parked bot it stays parked
  setTimeout(function () { playOnline(); }, 400);
  // the bot NEVER renders (software GL at server CPU = ~1fps = 20x slow-motion
  // world for everyone, dt clamps at 0.05). Instead: real-time sim on a 50ms
  // interval with <=50ms sub-steps and a capped catch-up backlog. The RAF loop
  // is disabled in bot mode (see loop()).
  var botLast = performance.now();
  setInterval(function () {
    if (!state.running) { botLast = performance.now(); return; }
    var nowMs = performance.now();
    var e = Math.min(0.25, (nowMs - botLast) / 1000); botLast = nowMs;
    while (e > 0.001) {
      var st2 = Math.min(e, 0.05); e -= st2; T += st2;
      try {
        updatePlayer(st2); updateNPCs(st2); updateCops(st2); updateCars(st2); updateRockets(st2); updateDrops(st2); updateUfo(st2);
        updateCash(st2); updatePuffs(st2); updateBooms(st2); updateDecals(st2); updateWorldFx(st2); updateStreetProps(st2); updateEnv(st2); updateNet(st2);
      } catch (err) { }
    }
  }, 50);
  // if the socket ever drops (server restart won't matter — we die with it —
  // but a transient close might), retry joining
  setInterval(function () {
    if (!net.sock && !state.dead) { try { playOnline(); } catch (e) { } }
  }, 5000);
}

})();
