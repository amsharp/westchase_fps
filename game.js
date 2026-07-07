/* ============================================================
   WESTCHASE — retro FPS
   v3: hand-authored map matching the Linebaugh Ave intersection
   ============================================================ */
(function () {
'use strict';

// Bump with EVERY change to the game (shown on the main menu).
var GAME_VERSION = 'v1.5';
document.getElementById('gameVer').textContent = GAME_VERSION;

// ---------------- world constants ----------------
var HALF = 340, TOTAL = HALF * 2;
var EYE = 1.7, GRAV = 16;
var MAIN_HW = 14;   // main road (E-W, z=0) half width
var CROSS_HW = 11;  // cross road (N-S, x=0) half width

var WEAPONS = {
  fists:  { name: 'FISTS',  melee: true, dmg: 34, rate: 0.42, range: 2.4 },
  pistol: { name: 'PISTOL', price: 150, dmg: 40, rate: 0.34, auto: false, spread: 0.014, desc: '9mm sidearm. Reliable.', flashAt: [0.26, -0.265, -0.9] },
  smg:    { name: 'SMG',    price: 400, dmg: 15, rate: 0.09, auto: true,  spread: 0.05,  desc: 'Hold the trigger. Sprays.', flashAt: [0.26, -0.262, -1.2] },
  rifle:  { name: 'RIFLE',  price: 600, dmg: 95, rate: 0.8,  auto: false, spread: 0.004, desc: 'One shot, one nap. Right-click to scope.', flashAt: [0.24, -0.235, -1.38] },
  auto:   { name: 'AK-47',  price: 1000, dmg: 34, rate: 0.11, auto: true, spread: 0.012, desc: 'Full auto, long range.', flashAt: [0.26, -0.255, -1.2] },
  rocket: { name: 'ROCKET LAUNCHER', price: 2000, rate: 5, rocket: true, desc: 'Danger close. 5s reload.', flashAt: [0.3, -0.28, -1.0] },
  snack:  { name: 'SNACK', snack: true, rate: 0.8 }
};
var GUN_LIST = ['pistol', 'smg', 'rifle', 'auto', 'rocket'];

// ---------------- state ----------------
var state = {
  running: false, menu: null,
  money: 400, hp: 100, dead: false,
  owned: { pistol: false, smg: false, rifle: false, auto: false, rocket: false },
  equipped: 'fists',
  lastHurt: -99, lastCarHit: -99, lastRob: -99,
  wanted: 0, civKills: 0, snacks: 0
};

var keys = {}, mouseDown = false;
var yaw = 0, pitch = 0;
var player = { x: -72, z: -97, y: EYE, vy: 0, grounded: true };   // Publix lot, next to the dealer
var lastShot = -99, punchT = -99, recoil = 0;
var T = 0;
var driving = null;   // traffic-car entry the player is driving

var dealerPos = { x: -72, z: -106 };   // in the Publix parking lot, facing the store
var gasRob = { x: 60, z: 42 };   // entrance zone in front of the RaceTrac door
var LAKE = { x: -255, z: -150, r: 62 };
var LAKE_DEPTH = 4;            // bowl depth at the center
var WATER_Y = 0.2;             // water surface height
function lakeBedY(x, z) {
  // paraboloid bowl matching the bed mesh; 0 outside the shoreline
  var dx = (x - LAKE.x) / (LAKE.r * 1.25), dz = (z - LAKE.z) / (LAKE.r * 0.85);
  var q = dx * dx + dz * dz;
  return q >= 1 ? 0 : -LAKE_DEPTH * (1 - q);
}

// minimap feature registers
var mapBuildings = [];   // {x,z,w,d,c,pad}
var mapParking = [];     // {x,z,w,d}
var mapForest = [];      // {x0,x1,z0,z1}
var mapPave = [];        // {x,z,w,d} concrete pads
var mapDrives = [];      // {x,z,w,d} access roads / driveways

// ---------------- renderer / scene ----------------
var renderer = new THREE.WebGLRenderer({ antialias: true });
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

var grassT = tex(128, function (g, s) {
  g.fillStyle = '#5f9440'; g.fillRect(0, 0, s, s);
  for (var i = 0; i < 5; i++) {
    var gx = Math.random() * s, gy = Math.random() * s;
    var gr = g.createRadialGradient(gx, gy, 2, gx, gy, 18 + Math.random() * 14);
    gr.addColorStop(0, 'rgba(120,96,52,0.35)'); gr.addColorStop(1, 'rgba(120,96,52,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }
  var greens = ['#527f35', '#6ba14a', '#7cb058', '#48732e', '#86b465'];
  for (i = 0; i < 900; i++) {
    g.strokeStyle = greens[(Math.random() * greens.length) | 0];
    g.lineWidth = 1;
    var x = Math.random() * s, y = Math.random() * s;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 2, y - 2 - Math.random() * 3); g.stroke();
  }
}, TOTAL / 10, TOTAL / 10);

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
  var cw = 256 / cols, rh = 256 / rows;
  g.fillStyle = 'rgba(0,0,0,0.07)';
  for (var r = 1; r < rows; r++) g.fillRect(0, r * rh - 1, 256, 2);
  for (r = 0; r < rows; r++) for (var cc = 0; cc < cols; cc++) {
    var x = cc * cw + cw * 0.22, y = r * rh + rh * 0.18, ww = cw * 0.56, hh = rh * 0.6;
    if (withDoor && r === rows - 1 && cc === (cols >> 1)) {
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x - 3, y - 3, ww + 6, rh * 0.82);
      g.fillStyle = '#4a3220'; g.fillRect(x, y, ww, rh * 0.82 - 4);
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
  }
  var t = finishTex(new THREE.CanvasTexture(c));
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
function lamb2(map) { return new THREE.MeshLambertMaterial({ map: map }); }
function phong(opt) { return new THREE.MeshPhongMaterial(opt); }
function box(w, h, d, mat, x, y, z) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x || 0, y || 0, z || 0); return m; }
function cyl(r1, r2, h, seg, mat, x, y, z) { var m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat); m.position.set(x || 0, y || 0, z || 0); return m; }
function sph(r, mat, x, y, z, ws, hs) { var m = new THREE.Mesh(new THREE.SphereGeometry(r, ws || 10, hs || 8), mat); m.position.set(x || 0, y || 0, z || 0); return m; }

var shadowGeo = new THREE.CircleGeometry(1, 14); shadowGeo.rotateX(-Math.PI / 2);
var shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false });
function blobShadow(sx, sz, y) { var m = new THREE.Mesh(shadowGeo, shadowMat); m.scale.set(sx, 1, sz); m.position.y = y || 0.03; return m; }

var colliders = [], solidMeshes = [];
var landColliders = null;   // colliders minus the lake block — the player may wade in
function addCollider(cx, cz, w, d) { colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 }); }

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
    var x = Math.random() * 256, y = 60 + Math.random() * 90, r = 14 + Math.random() * 26;
    var cg = g.createRadialGradient(x, y, 2, x, y, r);
    cg.addColorStop(0, 'rgba(255,255,255,0.85)'); cg.addColorStop(0.6, 'rgba(255,255,255,0.4)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cg; g.save(); g.translate(x, y); g.scale(2.2, 1); g.translate(-x, -y);
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.restore();
  }
  var t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  skyDome = new THREE.Mesh(new THREE.SphereGeometry(520, 20, 12), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false }));
  scene.add(skyDome);
})();

// ---------------- ground / roads / parking ----------------
(function ground() {
  var g = new THREE.Mesh(new THREE.PlaneGeometry(TOTAL + 60, TOTAL + 60), lamb2(grassT));
  g.rotation.x = -Math.PI / 2;
  scene.add(g);
})();

function roadStrip(cx, cz, w, d, vertical) {
  var geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2);
  var m = lamb({ map: roadT.clone() });
  if (vertical) { m.map.rotation = Math.PI / 2; m.map.center.set(0.5, 0.5); m.map.repeat.set(1, Math.max(w, d) / 16); }
  else m.map.repeat.set(Math.max(w, d) / 16, 1);
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
// not under it — the old full-width slab hid the road texture entirely)
roadStrip(0, 0, TOTAL, MAIN_HW * 2, false);
roadStrip(0, 0, CROSS_HW * 2, TOTAL, true);
sidewalk(0, -(MAIN_HW + 2.5), TOTAL, 5);
sidewalk(0, MAIN_HW + 2.5, TOTAL, 5);
sidewalk(-(CROSS_HW + 2.5), 0, 5, TOTAL, true);
sidewalk(CROSS_HW + 2.5, 0, 5, TOTAL, true);

// crosswalks at the intersection
var zebraT = (function () {
  var c = document.createElement('canvas'); c.width = c.height = 64;
  var g = c.getContext('2d'); g.clearRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(225,225,220,0.92)';
  for (var x = 2; x < 64; x += 16) g.fillRect(x, 2, 9, 60);
  var t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
})();
(function crosswalks() {
  var za = new THREE.PlaneGeometry(MAIN_HW * 2 - 4, 3); za.rotateX(-Math.PI / 2);
  var zb = new THREE.PlaneGeometry(3, CROSS_HW * 2 - 4); zb.rotateX(-Math.PI / 2);
  var ma = new THREE.MeshBasicMaterial({ map: zebraT, transparent: true, depthWrite: false });
  var za1 = new THREE.Mesh(za, ma); za1.position.set(0, 0.13, -MAIN_HW - 1.5); scene.add(za1);
  var za2 = new THREE.Mesh(za, ma); za2.position.set(0, 0.13, MAIN_HW + 1.5); scene.add(za2);
  var zb1 = new THREE.Mesh(zb, ma); zb1.position.set(-CROSS_HW - 1.5, 0.13, 0); scene.add(zb1);
  var zb2 = new THREE.Mesh(zb, ma); zb2.position.set(CROSS_HW + 1.5, 0.13, 0); scene.add(zb2);
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
  var fac = lamb({ map: facadeTex(color, Math.max(w, d), h, o.door !== false) });
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
  var fac = lamb({ map: facadeTex(color, Math.max(w, d), h, false) });
  var front = lamb({ map: storefrontTex(color) });
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
function stripMall(x, z, w, names) {
  bldg(x, z, w, 20, 5, '#d8d2c4', { flat: true, door: false, ac: false, mmColor: '#c9c3b4' });
  // blue gable
  var peak = 2.2, slantLen = Math.sqrt(10 * 10 + peak * peak), ang = Math.atan2(peak, 10);
  var p1 = box(w, 0.25, slantLen, blueRoofM, x, 5.1 + peak / 2, z - 5); p1.rotation.x = ang; scene.add(p1);
  var p2 = box(w, 0.25, slantLen, blueRoofM, x, 5.1 + peak / 2, z + 5); p2.rotation.x = -ang; scene.add(p2);
  // ridge cap + gable ends
  scene.add(box(w, 0.3, 0.4, blueRoofM, x, 5.1 + peak, z));
  // storefront awnings + signs facing north (-z), toward the road
  var n = names.length, seg = w / n;
  for (var i = 0; i < n; i++) {
    var sx = x - w / 2 + seg * (i + 0.5);
    var awn = new THREE.Mesh(new THREE.PlaneGeometry(seg - 1.5, 1.4), lamb({ map: awningTex('#2f6f9e', '#e8e2d0'), side: THREE.DoubleSide }));
    awn.rotation.x = 0.6; awn.position.set(sx, 3.1, z - 10.7); scene.add(awn);
    signPlane(sx, 4.3, z - 10.15, Math.PI, seg - 2, 1.1, [names[i]], '#22303a', '#ffe9a0');
    scene.add(box(seg - 1.6, 2.4, 0.15, phong({ color: 0x35485a, shininess: 90, specular: 0xaaccdd }), sx, 1.4, z - 10.02));
  }
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

function supermarket(x, z) {
  bldg(x, z, 74, 44, 9, '#e9e2d2', { flat: true, door: false, mmColor: '#3f8a4a' });
  signPlane(x, 7.5, z + 22.1, 0, 30, 3, ['PUBLIX'], '#1c7e3a', '#ffffff');
  // entrance canopy
  scene.add(box(20, 0.5, 5, lamb({ color: 0xc0392b }), x, 4.4, z + 24.5));
  parkingLot(x, z + 44, 78, 40);
  // light poles + carts
  for (var i = -1; i <= 1; i++) {
    scene.add(cyl(0.2, 0.2, 7, 6, lamb({ color: 0x555 }), x + i * 26, 3.5, z + 44));
  }
  staticCar(x - 20, z + 40, 0); staticCar(x - 12, z + 40, 0); staticCar(x + 14, z + 48, Math.PI);
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
    var fac = lamb({ map: facadeTex(col, uw, 7, false) });
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
function registerBreakable(g, x, z, r, type, light) {
  breakables.push({
    g: g, x: x, z: z, r: r, type: type, light: light || null,
    broken: false, fallT: 0, respawnT: 0, fx: 1, fz: 0, thudded: false,
    yq: new THREE.Quaternion().setFromAxisAngle(Y_UP, g.rotation.y)
  });
}

// ---------------- oak trees + forest ----------------
var oakTrunkM = lamb2(oakBarkT);
var leafMats = [lamb({ color: 0x3f6f2e }), lamb({ color: 0x4c8038 }), lamb({ color: 0x355f28 }), lamb({ color: 0x568a3e })];
var canopyGeo = new THREE.SphereGeometry(1, 8, 6);
var oakCount = 0, OAK_CAP = 240;
function oak(x, z, scale) {
  if (oakCount >= OAK_CAP) return;
  oakCount++;
  scale = scale || (0.85 + Math.random() * 0.5);
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
  registerBreakable(g, x, z, 1.0, 'tree');
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
  registerBreakable(g, x, z, 0.8, 'tree');
}

function forestPatch(x0, x1, z0, z1) {
  mapForest.push({ x0: x0, x1: x1, z0: z0, z1: z1 });
  addCollider((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0);
  var area = (x1 - x0) * (z1 - z0);
  var count = Math.min(60, Math.round(area / 260));
  for (var i = 0; i < count; i++) oak(x0 + Math.random() * (x1 - x0), z0 + Math.random() * (z1 - z0));
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
  var t = 3;
  // north (z=-HALF) & south (z=HALF), gap for cross road |x|<CROSS_HW
  forestWall(-(HALF + CROSS_HW) / 2 - 2, -HALF, HALF - CROSS_HW, t);
  forestWall((HALF + CROSS_HW) / 2 + 2, -HALF, HALF - CROSS_HW, t);
  forestWall(-(HALF + CROSS_HW) / 2 - 2, HALF, HALF - CROSS_HW, t);
  forestWall((HALF + CROSS_HW) / 2 + 2, HALF, HALF - CROSS_HW, t);
  // east (x=HALF) & west (x=-HALF), gap for main road |z|<MAIN_HW
  forestWall(HALF, -(HALF + MAIN_HW) / 2 - 2, t, HALF - MAIN_HW);
  forestWall(HALF, (HALF + MAIN_HW) / 2 + 2, t, HALF - MAIN_HW);
  forestWall(-HALF, -(HALF + MAIN_HW) / 2 - 2, t, HALF - MAIN_HW);
  forestWall(-HALF, (HALF + MAIN_HW) / 2 + 2, t, HALF - MAIN_HW);
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
  roadblock(0, -HALF + 8, CROSS_HW * 2, 1.4);   // north cross-road exit
  roadblock(0, HALF - 8, CROSS_HW * 2, 1.4);    // south
  roadblock(HALF - 8, 0, 1.4, MAIN_HW * 2);     // east main-road exit
  roadblock(-HALF + 8, 0, 1.4, MAIN_HW * 2);    // west
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
var lightF = new THREE.MeshBasicMaterial({ color: 0xfff2cc });
var lightR = new THREE.MeshBasicMaterial({ color: 0xc03028 });
var bumperM = lamb({ color: 0x2c2e32 });
function makeCar() {
  var g = new THREE.Group(); var col = CARCOLS[(Math.random() * CARCOLS.length) | 0];
  g.add(new THREE.Mesh(carBodyGeo, phong({ color: col, shininess: 55, specular: 0x999999 })));
  g.add(new THREE.Mesh(carCabinGeo, glassMat));
  g.add(box(0.2, 0.24, 1.8, bumperM, 2.3, 0.34, 0)); g.add(box(0.2, 0.24, 1.8, bumperM, -2.3, 0.34, 0));
  g.add(box(0.06, 0.12, 0.32, lightF, 2.34, 0.68, 0.55)); g.add(box(0.06, 0.12, 0.32, lightF, 2.34, 0.68, -0.55));
  g.add(box(0.06, 0.12, 0.32, lightR, -2.36, 0.68, 0.55)); g.add(box(0.06, 0.12, 0.32, lightR, -2.36, 0.68, -0.55));
  var wheels = [];
  [[1.42, 0.86], [1.42, -0.86], [-1.42, 0.86], [-1.42, -0.86]].forEach(function (wp) {
    var w = new THREE.Mesh(wheelGeo, [tireMat, hubMat, hubMat]); w.rotation.x = Math.PI / 2; w.position.set(wp[0], 0.34, wp[1]); g.add(w); wheels.push(w);
  });
  g.add(blobShadow(2.4, 1.15, 0.1)); scene.add(g);
  return { group: g, wheels: wheels };
}
function staticCar(x, z, ry) { var c = makeCar(); c.group.position.set(x, 0, z); c.group.rotation.y = ry || 0; }

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
  var w = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r, 30),
    phong({ color: 0x3f82ae, shininess: 90, specular: 0xbbddee, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  w.rotation.x = -Math.PI / 2; w.scale.set(1.25, 1, 0.85); w.position.set(LAKE.x, WATER_Y, LAKE.z); scene.add(w);
  var rim = new THREE.Mesh(new THREE.RingGeometry(LAKE.r, LAKE.r + 3, 30), lamb({ color: 0xb9a778 }));
  rim.rotation.x = -Math.PI / 2; rim.scale.set(1.25, 1, 0.85); rim.position.set(LAKE.x, 0.19, LAKE.z); scene.add(rim);
  // NPCs/cops/cars still treat the water as a wall; the player wades in
  // (updatePlayer filters .lake colliders out of its pushOut list)
  colliders.push({ x0: LAKE.x - LAKE.r * 1.15, x1: LAKE.x + LAKE.r * 1.15, z0: LAKE.z - LAKE.r * 0.75, z1: LAKE.z + LAKE.r * 0.75, lake: true });
  for (var i = 0; i < 10; i++) { var a = i / 10 * Math.PI * 2; oak(LAKE.x + Math.cos(a) * (LAKE.r * 1.3), LAKE.z + Math.sin(a) * (LAKE.r * 0.95)); }
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
// SE gas station (robbable)
gasStation(55, 50);
// SW dollar store + storage + strip malls
shop(-52, 48, 30, 20, 6, '#3f7f4a', ['DOLLAR TREE'], '#1c5e2a', '#ffe9a0', { face: -1, mmColor: '#2fae4a' });
storage(-52, 116);
stripMall(-120, 52, 50, ['NAILS', 'SUBS', 'LAUNDRY']);
stripMall(-188, 54, 52, ['PIZZA', 'VAPE', 'TAX']);
stripMall(-256, 56, 48, ['AUTO', 'GYM']);
// Dunkin fronts the blue-roof plaza, across the main road from Starbucks
// (the gas station stands alone on its corner of the intersection)
shop(-116, 31, 12, 11, 5, '#e8862e', ['DUNKIN'], '#e01a7a', '#ff8c42', { face: -1, mmColor: '#e8862e' });
// NE bank / pharmacy / sushi
bankBldg(52, -48, 'REGIONS BANK');
shop(52, -112, 24, 20, 6, '#e8dcc6', ['WESTCHASE PHARMACY'], '#1c4d8f', '#ffe9a0', { face: 1, mmColor: '#3f8fd0' });
shop(108, -112, 28, 22, 7, '#c0392b', ['SAKURA SUSHI'], '#111111', '#ffcf3a', { face: 1, mmColor: '#d94f3d' });
// NW bank / supermarket / school / townhouses
bankBldg(-48, -48, 'BANK OF AMERICA');
supermarket(-72, -140);
school(-72, -238);
townhouseRow(-150, -120, 6, 0);
townhouseRow(-150, -150, 6, 0);
// these two rows used to sit in the lake — moved to dry land north of it
townhouseRow(-210, -215, 6, 0);
townhouseRow(-210, -245, 6, 0);
// west along the main road
coffeeShop(-116, -30);
shop(-135, -82, 20, 16, 6, '#e5d7bc', ['WEST PARK OFFICES'], '#3a3a3a', '#ffe9a0', { face: 1, mmColor: '#c9b98a' });
shop(-108, -82, 16, 14, 5, '#e0d2b8', ['YOGA'], '#5a2e6a', '#ffe9a0', { face: 1, mmColor: '#b07acd' });
redHouse(-278, -78);

// neighborhoods (moderate)
subdivision(70, -292, 5, 2, 20, 16);
subdivision(255, -30, 3, 2, 22, 18);
subdivision(-250, 130, 4, 2, 20, 16);

// interior forest patches (undeveloped green)
forestPatch(96, 200, -232, -120);
forestPatch(120, 210, 74, 158);
forestPatch(150, 300, -300, -230);
forestPatch(-330, -300, -120, 120);

// scattered street palms + oaks in the commercial core
[[20, 20], [-20, 20], [20, -20], [-20, -20], [-90, 22], [90, 22], [-90, -22], [30, -60], [-30, 70]].forEach(function (p) { palm(p[0], p[1]); });
for (var oi = 0; oi < 40; oi++) {
  var ox = -HALF + 40 + Math.random() * (TOTAL - 80), oz = -HALF + 40 + Math.random() * (TOTAL - 80);
  // keep oaks off the roads/core
  if (Math.abs(oz) > MAIN_HW + 6 && Math.abs(ox) > CROSS_HW + 6 && (Math.abs(ox) > 180 || Math.abs(oz) > 170)) oak(ox, oz);
}

// ---------------- pavement: pads under buildings + access roads ----------------
// concrete apron under every commercial building
mapBuildings.forEach(function (b) { if (b.pad) pavePad(b.x, b.z, b.w + 7, b.d + 7); });
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

// ---------------- street furniture & landscaping ----------------
var bushMats = [lamb({ color: 0x3f6f2e }), lamb({ color: 0x4a7d34 }), lamb({ color: 0x355f28 })];
var bushGeo = new THREE.SphereGeometry(1, 7, 5);
function bush(x, z, scale) {
  scale = scale || (0.8 + Math.random() * 0.6);
  var m = bushMats[(Math.random() * 3) | 0], g = new THREE.Group();
  var n = 2 + (Math.random() * 2 | 0);
  for (var i = 0; i < n; i++) { var b = new THREE.Mesh(bushGeo, m); var r = (0.5 + Math.random() * 0.4) * scale; b.scale.set(r, r * 0.8, r); b.position.set((Math.random() - 0.5) * scale, r * 0.7, (Math.random() - 0.5) * scale); g.add(b); }
  g.position.set(x, 0, z); scene.add(g);
}
var thinTrunkM = lamb({ color: 0x7a5a3a });
function crepeMyrtle(x, z) {
  var g = new THREE.Group(); var h = 3 + Math.random() * 1.6;
  g.add(cyl(0.11, 0.16, h, 6, thinTrunkM, 0, h / 2, 0));
  var lm = Math.random() < 0.4 ? lamb({ color: 0xd98fb0 }) : bushMats[(Math.random() * 3) | 0];
  for (var i = 0; i < 4; i++) { var c = new THREE.Mesh(bushGeo, lm); var r = 0.8 + Math.random() * 0.5; c.scale.set(r, r * 0.9, r); c.position.set((Math.random() - 0.5) * 1.2, h + (Math.random() - 0.3), (Math.random() - 0.5) * 1.2); g.add(c); }
  g.add(blobShadow(1, 1, 0.05)); g.position.set(x, 0, z); scene.add(g);
}

// mast-arm traffic signals
var poleMetal = lamb({ color: 0x8a8f94 });
var signalBox = lamb({ color: 0x1c1c20 });
var redM = new THREE.MeshBasicMaterial({ color: 0xd83a2a }), yelM = new THREE.MeshBasicMaterial({ color: 0xe8c020 }), grnM = new THREE.MeshBasicMaterial({ color: 0x30c040 });
var dotGeo = new THREE.SphereGeometry(0.12, 8, 6);
function signalHead(parent, x, y, z, fx, fz) {
  parent.add(box(0.34, 1.0, 0.34, signalBox, x, y, z));
  var off = 0.2;
  [[0.32, redM], [0, yelM], [-0.32, grnM]].forEach(function (d) { var s = new THREE.Mesh(dotGeo, d[1]); s.position.set(x + fx * off, y + d[0], z + fz * off); parent.add(s); });
}
function greenSign(parent, x, y, z, ry, text) {
  var m = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 1.1), new THREE.MeshBasicMaterial({ map: signTex([text], '#1c6b3a', '#ffffff', 256, 52), side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.rotation.y = ry; parent.add(m);
}
function mastArm(px, pz, ax, az, len, nHeads, fx, fz, sign, signRy) {
  var g = new THREE.Group(); g.position.set(px, 0, pz);
  var poleH = 7.8, armY = poleH - 0.5;
  g.add(cyl(0.28, 0.34, poleH, 10, poleMetal, 0, poleH / 2, 0));
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
mastArm(CROSS_HW + 9, -MAIN_HW - 7, 0, 1, 2 * MAIN_HW + 13, 4, -1, 0, 'RACE TRACK RD', -Math.PI / 2);
mastArm(-(CROSS_HW + 9), MAIN_HW + 7, 0, -1, 2 * MAIN_HW + 13, 4, 1, 0, 'RACE TRACK RD', Math.PI / 2);
mastArm(CROSS_HW + 7, MAIN_HW + 9, -1, 0, 2 * CROSS_HW + 13, 3, 0, -1, 'COUNTRYWAY BLVD', Math.PI);
mastArm(-(CROSS_HW + 7), -(MAIN_HW + 9), 1, 0, 2 * CROSS_HW + 13, 3, 0, 1, 'COUNTRYWAY BLVD', 0);

// utility poles + power lines along the main road
var woodPoleM = lamb({ color: 0x6a5236 }), wireM = lamb({ color: 0x1a1a1a }), xfmrM = lamb({ color: 0x555b60 });
function utilityPole(x, z) {
  var h = 8.6;
  scene.add(cyl(0.22, 0.3, h, 6, woodPoleM, x, h / 2, z));
  scene.add(box(2.6, 0.16, 0.16, woodPoleM, x, h - 0.6, z));
  scene.add(box(0.5, 0.7, 0.4, xfmrM, x + 0.3, h - 1.8, z));
  return { x: x, y: h - 0.55, z: z };
}
function wire(a, b) {
  var mid = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2 - 1.3, (a.z + b.z) / 2);
  var curve = new THREE.CatmullRomCurve3([new THREE.Vector3(a.x, a.y, a.z), mid, new THREE.Vector3(b.x, b.y, b.z)]);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.03, 4, false), wireM));
}
(function powerline() {
  var prev = null;
  for (var x = -300; x <= 300; x += 46) {
    if (Math.abs(x) < CROSS_HW + 16) { prev = null; continue; }
    var p = utilityPole(x, MAIN_HW + 9);
    if (prev) { wire({ x: prev.x - 1, y: prev.y, z: prev.z }, { x: p.x - 1, y: p.y, z: p.z }); wire({ x: prev.x + 1, y: prev.y, z: prev.z }, { x: p.x + 1, y: p.y, z: p.z }); }
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
medianSeg(CROSS_HW + 11, 300);
medianSeg(-300, -(CROSS_HW + 11));

// corner landscaping
[[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s) {
  var cx = s[0] * (CROSS_HW + 8), cz = s[1] * (MAIN_HW + 8);
  bush(cx, cz); bush(cx + s[0] * 2.2, cz + s[1] * 1.6); crepeMyrtle(cx + s[0] * 4, cz + s[1] * 3.2);
});
// bushes fronting a few landmarks
[[52, -37], [-48, -37], [-72, -116], [-52, 37], [55, 41], [-116, -22]].forEach(function (p) { bush(p[0], p[1]); bush(p[0] + 3, p[1]); bush(p[0] - 3, p[1]); });

// ---------------- street lights ----------------
var streetLights = [];
var lampOnM = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
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
  // ax,az = unit direction the arm/lamp extends (toward the road)
  var g = new THREE.Group();
  g.add(cyl(0.14, 0.2, 7, 7, poleMetal, 0, 3.5, 0));
  g.add(box(Math.abs(ax) * 2.4 + 0.16, 0.14, Math.abs(az) * 2.4 + 0.16, poleMetal, ax * 1.2, 6.9, az * 1.2));
  var head = box(0.7, 0.22, 0.4, lampOffM, ax * 2.3, 6.78, az * 2.3);
  g.add(head);
  var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: lampGlowT, transparent: true, depthWrite: false }));
  glow.scale.set(5, 5, 1); glow.position.set(ax * 2.3, 6.6, az * 2.3); glow.visible = false;
  g.add(glow);
  var pool = new THREE.Mesh(poolGeo, poolM);
  pool.position.set(ax * 2.6, 0.17, az * 2.6); pool.visible = false;
  g.add(pool);
  g.position.set(x, 0, z);
  scene.add(g);
  var entry = { head: head, glow: glow, pool: pool, broken: false };
  streetLights.push(entry);
  registerBreakable(g, x, z, 0.6, 'light', entry);
}
(function placeStreetlights() {
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
  // parking lots
  streetlight(-92, -96, 1, 0); streetlight(-52, -96, -1, 0);        // Publix lot
  streetlight(-18, -238, -1, 0);                                    // school lot
  streetlight(-160, 34, 0, 1); streetlight(-250, 36, 0, 1);         // strip mall frontage
  streetlight(40, 33, 0, 1);                                        // RaceTrac frontage
  streetlight(-116, 22, 0, 1);                                      // Dunkin
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
var C_DAY_SKY = new THREE.Color(0xffffff), C_NIGHT_SKY = new THREE.Color(0x141c2c);
var C_RAIN_SKY = new THREE.Color(0x6a7078), C_RAINNIGHT_SKY = new THREE.Color(0x030407);
function dayFactor() {
  var a = (envT / DAY_LEN) * Math.PI * 2;
  return Math.max(0, Math.min(1, Math.sin(a) * 1.6 + 0.25));
}
function groundHeightAt(x, z) {
  for (var i = 0; i < mapBuildings.length; i++) {
    var b = mapBuildings[i];
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
  // targets
  var sunT = raining ? (0.05 + 0.3 * f) : (0.06 + 0.68 * f);
  var hemiT = raining ? (0.12 + 0.34 * f) : (0.14 + 0.56 * f);
  var k = Math.min(1, dt * 1.2);
  sun.intensity += (sunT - sun.intensity) * k;
  hemi.intensity += (hemiT - hemi.intensity) * k;
  if (raining) fogTmp.copy(C_RAINNIGHT_FOG).lerp(C_RAIN_FOG, f);
  else fogTmp.copy(C_NIGHT_FOG).lerp(C_DAY_FOG, f);
  scene.fog.color.lerp(fogTmp, k);
  var farT = raining ? 240 : (120 + 400 * f);
  scene.fog.far += (farT - scene.fog.far) * k;
  scene.fog.near += ((raining ? 40 : 60 + 60 * f) - scene.fog.near) * k;
  if (raining) skyTmp.copy(C_RAINNIGHT_SKY).lerp(C_RAIN_SKY, f);
  else skyTmp.copy(C_NIGHT_SKY).lerp(C_DAY_SKY, f);
  if (skyDome) skyDome.material.color.lerp(skyTmp, k);
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
var CC_FIELDS = ['skin', 'hair', 'hairC', 'eyes', 'mouth', 'faceX', 'shirt', 'shirtC', 'shirtC2', 'pants', 'pantsC', 'shoeC', 'hat', 'hatC', 'glasses', 'extra', 'build', 'photo'];
var CC_MAX = { skin: CSKIN.length, hair: HAIRN.length, hairC: CHAIRC.length, eyes: EYESN.length, mouth: MOUTHN.length, faceX: FACEXN.length, shirt: SHIRTN.length, shirtC: CSHIRT.length, shirtC2: CSHIRT.length, pants: LEGSN.length, pantsC: CPANTS.length, shoeC: CSHOE.length, hat: HATN.length, hatC: CHAT.length, glasses: GLASSN.length, extra: GEARN.length, build: 5, photo: 7 };
function seededRng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function randomCharConfig(rng) {
  rng = rng || Math.random;
  var cfg = {};
  for (var i = 0; i < CC_FIELDS.length; i++) { var k = CC_FIELDS[i]; cfg[k] = (rng() * CC_MAX[k]) | 0; }
  cfg.hat = rng() < 0.3 ? 1 + ((rng() * 3) | 0) : 0;        // street hats only (POLICE reserved)
  cfg.glasses = rng() < 0.3 ? 1 + ((rng() * 2) | 0) : 0;
  cfg.extra = rng() < 0.4 ? 1 + ((rng() * 3) | 0) : 0;
  cfg.faceX = rng() < 0.35 ? 1 + ((rng() * 3) | 0) : 0;
  cfg.photo = rng() < 0.45 ? 1 + ((rng() * 6) | 0) : 0;
  return cfg;
}
function encodeCC(cfg) {
  var s = 'a';
  for (var i = 0; i < CC_FIELDS.length; i++) s += (cfg[CC_FIELDS[i]] | 0).toString(36);
  return s;
}
function decodeCC(s) {
  if (!s || s.charAt(0) !== 'a' || s.length < CC_FIELDS.length + 1) return null;
  var cfg = {};
  for (var i = 0; i < CC_FIELDS.length; i++) {
    var v = parseInt(s.charAt(i + 1), 36); if (isNaN(v)) v = 0;
    var k = CC_FIELDS[i];
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
var PSX_FACES = [{"d":"data:image/png;base64,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","s":"#b68c55"},{"d":"data:image/png;base64,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","s":"#6f4416"},{"d":"data:image/png;base64,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","s":"#ac6d2b"},{"d":"data:image/png;base64,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","s":"#cc9b55"},{"d":"data:image/png;base64,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","s":"#b87e3e"},{"d":"data:image/png;base64,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","s":"#985f25"}];/* PSX_FACES: six painterly PSX-style face patches generated with gpt-image-1
   (offline, build-time) and composited into the asset's face UV island; each
   carries a sampled skin tone so the body matches the face. */
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
var faceImgCache = [];
function getFaceImg(i) {
  if (!faceImgCache[i]) { var im = new Image(); im.src = PSX_FACES[i].d; faceImgCache[i] = im; }
  return faceImgCache[i];
}
function charAtlas(cfg) {
  var preset = cfg.photo > 0 ? PSX_FACES[cfg.photo - 1] : null;
  var skin = cfg.skinHex || (preset ? preset.s : CSKIN[cfg.skin]), hair = cfg.hairHex || CHAIRC[cfg.hairC];
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
  var skipPainted = !!preset;
  function eye(sgn) {
    if (skipPainted) return;
    var fx = sgn * eyeFx;
    if (cfg.eyes === 1) { F(fx, eyeFy, 7, 6, '#f4f2ea'); F(fx, eyeFy, 3, 4, '#1a1a1a'); F(fx, eyeFy - 5.5, 7, 2, hair); }
    else if (cfg.eyes === 2) { F(fx, eyeFy + 1, 6.5, 3, '#f4f2ea'); F(fx, eyeFy + 1, 3, 2, '#1a1a1a'); F(fx, eyeFy - 4, 6.5, 2, hair); }
    else if (cfg.eyes === 3) { F(fx, eyeFy, 6.5, 4.5, '#f4f2ea'); F(fx, eyeFy, 3, 3, '#1a1a1a'); F(fx + sgn, eyeFy - 5, 7, 2, hair); F(fx - sgn * 1.5, eyeFy - 3.8, 4, 1.5, hair); }
    else if (cfg.eyes === 4) { F(fx, eyeFy, 3, 4, '#1a1a1a'); F(fx, eyeFy - 5, 6, 1.5, hair); }
    else { F(fx, eyeFy, 6.5, 5, '#f4f2ea'); F(fx, eyeFy, 3, 3.5, '#1a1a1a'); F(fx, eyeFy - 5.5, 6.5, 2, hair); }
  }
  eye(1); eye(-1);
  if (!skipPainted) {
    F(0, 1.5, 3.5, 6, shade(skin, 0.84));                      // nose
    var mc = cfg.faceX === 3 ? '#c22a4a' : '#7a3a2a';
    if (cfg.mouth === 0) { F(0, 8.5, 9, 2.2, mc); F(-5, 7.4, 2, 2, mc); F(5, 7.4, 2, 2, mc); }
    else if (cfg.mouth === 1) F(0, 8.5, 8, 2.2, mc);
    else if (cfg.mouth === 2) { F(0, 8.5, 7, 5, '#5a1e14'); F(0, 8.5, 4, 2.5, '#2a0c08'); }
    else if (cfg.mouth === 3) { F(0, 8.5, 9, 2.2, mc); F(-5, 9.6, 2, 2, mc); F(5, 9.6, 2, 2, mc); }
    else { F(1.5, 8.5, 6, 2.2, mc); F(5, 7.4, 2, 2, mc); }
    if (cfg.faceX === 1) { g.globalAlpha = 0.28; F(0, 10, 20, 9, '#2a1c10'); g.globalAlpha = 1; }
    if (cfg.faceX === 2) { var fc = shade(skin, 0.72); F(-7, 3, 1.5, 1.5, fc); F(-9, 4.5, 1.5, 1.5, fc); F(7, 3.5, 1.5, 1.5, fc); F(9, 4.8, 1.5, 1.5, fc); }
  }
  function drawPhotoFace() {
    var img = getFaceImg(cfg.photo - 1);
    var topX = nx + dwn[0] * -44, topY = ny + dwn[1] * -44;
    g.save();
    g.setTransform(rgt[0] * 0.8, rgt[1] * 0.8, dwn[0] * 0.98, dwn[1] * 0.98, topX, topY);
    g.drawImage(img, -20, 0);
    g.restore();
  }
  if (preset && getFaceImg(cfg.photo - 1).complete) drawPhotoFace();
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
  if (preset) {
    var pimg = getFaceImg(cfg.photo - 1);
    if (!pimg.complete) pimg.addEventListener('load', function () {
      drawPhotoFace();
      if (fr) F(0, eyeFy - 9 - fr / 2, 30, fr, hair);
      if (cfg.hair === 3) { F(-12, eyeFy + 6, 5, 34, hair); F(12, eyeFy + 6, 5, 34, hair); }
      if (cfg.glasses === 1) F(0, eyeFy, 22, 7, '#16181c');
      else if (cfg.glasses === 2) {
        F(-eyeFx, eyeFy, 9, 7.5, '#16181c'); F(eyeFx, eyeFy, 9, 7.5, '#16181c');
        F(-eyeFx, eyeFy, 6.5, 5, '#bcd2e0'); F(eyeFx, eyeFy, 6.5, 5, '#bcd2e0'); F(0, eyeFy, 3, 1.5, '#16181c');
      }
      t2.needsUpdate = true;
    });
  }
  return t2;
}
var eyeM = lamb({ color: 0x1a1a1a });
var goldM = lamb({ color: 0xd8ac30 });
function buildCharacter(cfg) {
  var g = new THREE.Group();
  var atlas = charAtlas(cfg);
  var M = lamb({ map: atlas });
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
  // the asset's actual glasses lens mesh doubles as shades / eyeglasses
  if (cfg.glasses === 1) {
    g.add(new THREE.Mesh(PP.glasses.geo, phong({ color: 0x14181e, shininess: 70, specular: 0x556677 })));
  } else if (cfg.glasses === 2) {
    var lensM = phong({ color: 0x9fc0d4, shininess: 90, specular: 0xffffff });
    lensM.transparent = true; lensM.opacity = 0.55;
    g.add(new THREE.Mesh(PP.glasses.geo, lensM));
  }
  // hair meshes for styles paint can't do (fitted to the asset's head)
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
  cfg.pants = 0; cfg.shoeC = 0; cfg.photo = 0;   // uniforms/fixed NPCs: long pants, dark shoes, painted face
  cfg.shirtHex = shirtC; cfg.pantsHex = pantsC;
  cfg.skinHex = typeof skinC === 'number' ? '#' + ('000000' + skinC.toString(16)).slice(-6) : skinC;
  if (opts.hairColor !== undefined) cfg.hairHex = '#' + ('000000' + opts.hairColor.toString(16)).slice(-6);
  if (opts.shades) cfg.glasses = 1;
  if (opts.cap) cfg.hat = 4;
  if (opts.chain) cfg.extra = 3;
  return buildCharacter(cfg);
}

var npcs = [];
var NPC_COUNT = 28;
var WALK = { x0: -270, x1: 150, z0: -160, z1: 150 };
function randTarget() { return [WALK.x0 + Math.random() * (WALK.x1 - WALK.x0), WALK.z0 + Math.random() * (WALK.z1 - WALK.z0)]; }
function sidewalkSpot() {
  // random point on the sidewalk strips flanking the two roads
  var side = Math.random() < 0.5 ? 1 : -1;
  if (Math.random() < 0.55) {
    var x = WALK.x0 + Math.random() * (WALK.x1 - WALK.x0);
    return [x, side * (MAIN_HW + 1.5 + Math.random() * 3)];
  }
  var z = WALK.z0 + Math.random() * (WALK.z1 - WALK.z0);
  return [side * (CROSS_HW + 1.5 + Math.random() * 3), z];
}
function npcTarget() { return Math.random() < 0.6 ? sidewalkSpot() : randTarget(); }
function spawnNPC() {
  var mesh = buildCharacter(randomCharConfig());
  var start = sidewalkSpot(), tgt = npcTarget();
  var n = { mesh: mesh, x: start[0], z: start[1], tx: tgt[0], tz: tgt[1], hp: 100, state: 'walk', speed: 1.5 + Math.random() * 1.1, phase: Math.random() * 9, pause: 0, fleeT: 0, fleeDX: 0, fleeDZ: 0, downT: 0, hurtFlash: 0 };
  mesh.position.set(n.x, 0, n.z); mesh.userData.npc = n;
  scene.add(mesh); npcs.push(n); return n;
}
for (var ni = 0; ni < NPC_COUNT; ni++) spawnNPC();

// dealer
var dealer = buildPerson('#1b1b1f', '#141418', 0xc98d5e, { shades: true, hairColor: 0x111111, chain: true });
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
var clerk = buildPerson('#c0392b', '#31435c', CSKIN[2], { hairColor: 0x2a1c10 });
clerk.position.set(clerkPos.x, INT.y, clerkPos.z);
clerk.rotation.y = -Math.PI / 2; // faces the store (west)
scene.add(clerk);

function enterStore() {
  if (T < gasClosedUntil) { popup2('STORE CLOSED — come back later'); sfx('deny'); return; }
  inside = true; robbedVisit = false; copsCalledVisit = false;
  setZoom(false);
  player.x = doorIn.x; player.z = doorIn.z; player.y = INT.y + EYE;
  yaw = 0; pitch = 0;   // facing into the store
}
function exitStore(diedInside) {
  inside = false;
  for (var i = cops.length - 1; i >= 0; i--) if (cops[i].interior) { scene.remove(cops[i].mesh); cops.splice(i, 1); }
  if (robbedVisit || copsCalledVisit) gasClosedUntil = T + 180;
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
    state.money -= 20; state.snacks++;
    sfx('buy'); popup('+1 SNACK (equip it in TAB)');
    refreshClerk();
  });
  if (!robbedVisit && !copsCalledVisit) addBtn('Rob the register', function () {
    var armed = GUN_LIST.indexOf(state.equipped) >= 0;
    if (armed) {
      var take = 100 + ((Math.random() * 201) | 0);
      state.money += take; robbedVisit = true;
      popup('ROBBED  +$' + take);
      sfx('alarm');
      if (state.wanted < 2) setWanted(2); else lastCrimeT = T;
      closeMenus();
    } else {
      copsCalledVisit = true; robbedVisit = true;
      popup2('You threaten him with... fists? He hits the panic button!');
      sfx('alarm');
      if (state.wanted < 2) setWanted(2); else lastCrimeT = T;
      spawnInteriorCops(2);
      closeMenus();
    }
  });
  addBtn('Never mind', function () { closeMenus(); });
}

// ---------------- police / wanted system ----------------
var cops = [];
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

function buildCop() {
  var g = buildPerson('#1e3a6e', '#16233f', CSKIN[(Math.random() * CSKIN.length) | 0],
    { cap: true, shades: true, hairColor: 0x111111 });
  g.add(box(0.05, 0.06, 0.02, badgeM, -0.09, 1.28, 0.125));   // badge
  g.add(box(0.06, 0.1, 0.16, holsterM, 0.24, 0.82, 0.06));    // holster
  return g;
}
function spawnCop(nearPlayer) {
  var mesh = buildCop(), x, z;
  if (nearPlayer) {
    var a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 30;
    x = Math.max(-HALF + 6, Math.min(HALF - 6, player.x + Math.cos(a) * r));
    z = Math.max(-HALF + 6, Math.min(HALF - 6, player.z + Math.sin(a) * r));
  } else { var t = randTarget(); x = t[0]; z = t[1]; }
  var p = pushOut(x, z, 0.6); x = p.x; z = p.z;
  var t2 = randTarget();
  var c = { mesh: mesh, x: x, z: z, hp: 100, state: 'patrol', tx: t2[0], tz: t2[1], phase: Math.random() * 9, fireT: 0.5 + Math.random(), downT: 0, hurtFlash: 0 };
  mesh.position.set(x, 0, z); mesh.userData.cop = c;
  scene.add(mesh); cops.push(c); return c;
}
function spawnInteriorCops(n) {
  for (var i = 0; i < n; i++) {
    var mesh = buildCop();
    var c = { mesh: mesh, x: doorIn.x - 2 + i * 4, z: doorIn.z - 1, hp: 100, state: 'engage', tx: 0, tz: 0, phase: Math.random() * 9, fireT: 0.7 + i * 0.5, downT: 0, hurtFlash: 0, interior: true, baseY: INT.y };
    mesh.position.set(c.x, INT.y, c.z);
    mesh.userData.cop = c;
    scene.add(mesh); cops.push(c);
  }
}
function desiredCops() { return state.wanted === 0 ? 2 : 2 + state.wanted * 2; }
function copWeapon() {
  return state.wanted >= 4
    ? { range: 46, dmg: 4, rate: 0.14, acc: 0.5, sfx: 'copsmg' }   // full-auto SMGs
    : { range: 21, dmg: 9, rate: 1.05, acc: 0.55, sfx: 'copshot' }; // sidearms, short range
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
  for (var id in net.remotes) { var r = net.remotes[id]; if (!r.dead) cand(r.x, r.z, r.y || EYE, r.w || 0, id); }
  return best;
}
function copShoot(c, wpn, dt, tgt) {
  c.fireT -= dt;
  if (c.fireT > 0) return;
  c.fireT = wpn.rate;
  if (!c.interior && !copHasLOS(c, tgt)) return;   // interior is one small room — they can always see you
  sfx(wpn.sfx);
  var dx = tgt.x - c.x, dz = tgt.z - c.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
  puff(new THREE.Vector3(c.x + dx / d * 0.5, (c.baseY || 0) + 1.45, c.z + dz / d * 0.5), 0xffe08a);
  var hitChance = wpn.acc * Math.max(0.15, 1 - d / wpn.range);
  if (Math.random() < hitChance) {
    if (tgt.id) { netSendHit(tgt.id, wpn.dmg); return; }   // remote player: their client applies (car redirect included)
    if (state.dead) return;
    if (driving) {
      // rounds slam into your car instead
      var cp2 = driving.car.group.position;
      puff(new THREE.Vector3(cp2.x + (Math.random() - 0.5) * 2, 1 + Math.random(), cp2.z + (Math.random() - 0.5) * 2), 0xd8c860);
      driving.carHP = (driving.carHP === undefined ? 100 : driving.carHP) - wpn.dmg * 2;
      if (driving.carHP <= 0) igniteCar(driving);
    } else hurtPlayer(wpn.dmg);
  }
}
function damageCop(c, dmg, kx, kz, silent) {
  if (c.state === 'down') return;
  c.hp -= dmg; c.hurtFlash = 0.12;
  c.x += (kx || 0) * 0.4; c.z += (kz || 0) * 0.4;
  lastCrimeT = T;
  if (c.hp <= 0) {
    c.state = 'down'; c.downT = 10;
    if (c.mesh.userData.shadow) c.mesh.userData.shadow.visible = false;
    spawnCash(c.x, c.z, 10 + ((Math.random() * 30) | 0), c.baseY || 0);
    sfx('ko');
    if (!silent) { popup('COP DOWN!'); addStar(1); }
  } else {
    c.state = 'engage';
    if (!silent && state.wanted < 1) setWanted(1);
    sfx('hit');
  }
}
function updateCops(dt) {
  var wpn = copWeapon();
  if (!isClient()) {
    copSpawnT -= dt;
    var alive = 0;
    for (var i0 = 0; i0 < cops.length; i0++) if (cops[i0].state !== 'down' && !cops[i0].interior) alive++;
    if (alive < desiredCops() && copSpawnT <= 0) { spawnCop(state.wanted >= 2); copSpawnT = 2.6; }
  }
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
    var vx = 0, vz = 0, spd = 0, moving = false;
    if (tgt) {
      var dx = tgt.x - c.x, dz = tgt.z - c.z, d = tgt.d;
      if (d > wpn.range * 0.65 || (c.interior && d > 5)) { vx = dx / d; vz = dz / d; spd = 4.4; moving = true; }
      m.rotation.y = Math.atan2(dx, dz);
      if (d < wpn.range) copShoot(c, wpn, dt, tgt);
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
    if (!nearCop) {
      state.wanted--; lastCrimeT = T; updateStarsHUD();
      if (state.wanted === 0) popup('You lost the heat');
    }
  }
}
for (var ci = 0; ci < 3; ci++) spawnCop(false);

// ---------------- cars: traffic ----------------
var cars = [];
var EDGE = HALF - 14;
function addCar(axis, lane, dir) {
  var c = { car: makeCar(), axis: axis, lane: lane, lane0: lane, dir: dir, pos: -EDGE + Math.random() * (EDGE * 2), speed: 8 + Math.random() * 6, dmgT: 0, berserk: false, exploded: false, respawnT: 0, smokeT: 0, eng: null };
  c.car.group.userData.trafficCar = c;
  cars.push(c);
}
[5, 10].forEach(function (l) { addCar('x', l, 1); addCar('x', l, 1); });
[-5, -10].forEach(function (l) { addCar('x', l, -1); addCar('x', l, -1); });
[4, 8].forEach(function (l) { addCar('z', l, 1); addCar('z', l, 1); });
[-4, -8].forEach(function (l) { addCar('z', l, -1); addCar('z', l, -1); });

function ensureEngine(c) {
  if (c.eng || !ac) return;
  var o = ac.createOscillator(); o.type = 'sawtooth';
  var f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
  var g = ac.createGain(); g.gain.value = 0;
  o.connect(f); f.connect(g); g.connect(ac.destination);
  o.start();
  c.eng = { o: o, g: g };
}
function updateCars(dt) {
  if (isClient()) return;   // world traffic is mirrored from the host snapshot
  for (var i = 0; i < cars.length; i++) {
    var c = cars[i];
    ensureEngine(c);
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
        c.pos = c.dir === 1 ? -EDGE + 4 : EDGE - 4;
        c.lane = c.lane0; c.dmgT = 0; c.berserk = false;
        c.stolen = false; c.jacked = false; c.jackCD = 0; c.playerDriven = false;
        c.burning = false; c.carHP = undefined;
        c.speed = 8 + Math.random() * 6;
      }
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
      if (c.eng && c !== driving) c.eng.g.gain.value = 0;
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
    } else {
      c.pos += c.dir * c.speed * dt;
      if (c.pos > EDGE) c.pos = -EDGE;
      if (c.pos < -EDGE) c.pos = EDGE;
      if (c.axis === 'x') { m.position.set(c.pos, 0, c.lane); m.rotation.y = c.dir === 1 ? 0 : Math.PI; }
      else { m.position.set(c.lane, 0, c.pos); m.rotation.y = c.dir === 1 ? -Math.PI / 2 : Math.PI / 2; }
    }
    var spin = (c.speed * dt) / 0.34;
    for (var wi = 0; wi < 4; wi++) c.car.wheels[wi].rotation.y -= spin;

    // engine noise: pitch by speed, volume by distance
    var edx = player.x - m.position.x, edz = player.z - m.position.z;
    var ed = Math.sqrt(edx * edx + edz * edz);
    if (c.eng) {
      var vol = Math.max(0, 1 - ed / 80);
      c.eng.g.gain.value = vol * vol * (c.berserk ? 0.12 : 0.055);
      c.eng.o.frequency.value = 42 + c.speed * 3.4 + Math.sin(T * 9 + i) * 3;
    }
    // smoke when shot up
    if (c.dmgT > 1.2) {
      c.smokeT -= dt;
      if (c.smokeT <= 0) { c.smokeT = 0.14; puff(new THREE.Vector3(m.position.x, 1.2, m.position.z), c.berserk ? 0x222222 : 0x555555); }
    }

    // run over pedestrians: ragdoll them
    for (var ni2 = 0; ni2 < npcs.length; ni2++) {
      var n2 = npcs[ni2];
      if (n2.state === 'down' || n2.state === 'ragdoll') continue;
      var ndx = n2.x - m.position.x, ndz = n2.z - m.position.z;
      var lon = c.axis === 'x' ? ndx : ndz, lat = c.axis === 'x' ? ndz : ndx;
      if (Math.abs(lon) < 2.8 && Math.abs(lat) < 1.5) {
        var dirX = c.axis === 'x' ? c.dir : 0, dirZ = c.axis === 'z' ? c.dir : 0;
        sfx('crash');
        killNpcRagdoll(n2, dirX + (Math.random() - 0.5) * 0.5, dirZ + (Math.random() - 0.5) * 0.5, 8 + c.speed * 0.55);
      }
    }

    // berserk cars explode on whatever solid thing they hit
    if (c.berserk) {
      var ex = m.position.x, ez = m.position.z;
      for (var b = 0; b < colliders.length; b++) {
        var bb = colliders[b];
        var qx = Math.max(bb.x0, Math.min(ex, bb.x1)), qz = Math.max(bb.z0, Math.min(ez, bb.z1));
        var qdx = ex - qx, qdz = ez - qz;
        if (qdx * qdx + qdz * qdz < 4.5) { explodeCar(c); break; }
      }
      if (!c.exploded) {
        for (var j = 0; j < cars.length; j++) {
          if (j === i || cars[j].exploded) continue;
          var om = cars[j].car.group.position;
          if (Math.abs(om.x - ex) < 4 && Math.abs(om.z - ez) < 4) { explodeCar(cars[j]); explodeCar(c); break; }
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
  if (npcs.length < 40 && !isClient()) {
    var n = spawnNPC();
    n.x = g.position.x + Math.cos(g.rotation.y + Math.PI / 2) * 2.4;
    n.z = g.position.z - Math.sin(g.rotation.y + Math.PI / 2) * 2.4;
    n.mesh.position.set(n.x, 0, n.z);
    startFlee(n);
  }
  sfx('grunt');
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
  if (!c.jacked || victim) {
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
    c.pspeed *= -0.15;
  }
  g.position.set(p.x, 0, p.z);
  g.rotation.y = h;
  var spin = (c.pspeed * dt) / 0.34;
  for (var wi = 0; wi < 4; wi++) c.car.wheels[wi].rotation.y -= spin;
  ensureEngine(c);
  if (c.eng) {
    var sp = Math.abs(c.pspeed);
    c.eng.g.gain.value = 0.02 + Math.min(1, sp / 26) * 0.09;
    c.eng.o.frequency.value = 45 + sp * 4.5;
  }
  var moving = Math.abs(c.pspeed) > 3;
  if (moving) {
    var sgn = c.pspeed > 0 ? 1 : -1;
    // run over pedestrians — this is on you
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i];
      if (n.state === 'down' || n.state === 'ragdoll') continue;
      var dx = n.x - p.x, dz = n.z - p.z;
      var lon = dx * fx + dz * fz, lat = -dx * fz + dz * fx;
      if (Math.abs(lon) < 2.8 && Math.abs(lat) < 1.5) {
        sfx('crash');
        if (isClient()) netToHost({ t: 'ragNpc', i: i, kx: fx * sgn, kz: fz * sgn, pw: 8 + Math.abs(c.pspeed) * 0.55 });
        else killNpcRagdoll(n, fx * sgn + (Math.random() - 0.5) * 0.5, fz * sgn + (Math.random() - 0.5) * 0.5, 8 + Math.abs(c.pspeed) * 0.55);
        n.state = 'ragdoll';   // avoid double-triggering while the host confirms
        state.civKills++;
        if (state.civKills % 5 === 0) { addStar(1); popup2('WANTED LEVEL UP'); }
        lastCrimeT = T;
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
        netToHost({ t: 'dmgCop', i: i, dmg: 999, kx: fx * sgn, kz: fz * sgn });
      }
    }
    // ram traffic: they lose control like being shot up
    for (i = 0; i < cars.length; i++) {
      var oc = cars[i];
      if (oc === c || oc.exploded || oc.stolen) continue;
      var om = oc.car.group.position;
      if (Math.abs(om.x - p.x) < 4 && Math.abs(om.z - p.z) < 3.2) {
        if (!oc.berserk) {
          if (isClient()) { netToHost({ t: 'ram', i: i }); oc.berserk = true; }
          else goBerserk(oc);
          lastCrimeT = T;
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
function updateCash(dt) {
  for (var i = cashes.length - 1; i >= 0; i--) {
    var c = cashes[i]; c.life -= dt; c.mesh.rotation.y += dt * 3; c.mesh.position.y = c.baseY + 0.38 + Math.sin(T * 3 + i) * 0.12;
    var dx = player.x - c.mesh.position.x, dz = player.z - c.mesh.position.z;
    if (c.netCash) {
      // host owns the cash: ask for it, the money arrives as a 'cash' message
      if (dx * dx + dz * dz < 2.1 && !c.pend) { c.pend = true; netToHost({ t: 'takeCash', x: c.mesh.position.x, z: c.mesh.position.z }); }
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
function bloodDecal(x, z) {
  var m = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({ color: 0x7a1410, transparent: true, opacity: 0.75, depthWrite: false }));
  m.scale.setScalar(0.8 + Math.random() * 0.9);
  m.position.set(x, 0.165, z); m.rotation.y = Math.random() * Math.PI;
  scene.add(m); decals.push({ mesh: m, life: 30 });
  if (decals.length > 40) { var o = decals.shift(); scene.remove(o.mesh); }
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
  if (n.state === 'down' || n.state === 'ragdoll') return;
  n.state = 'ragdoll'; n.hp = 0;
  if (n.mesh.userData.shadow) n.mesh.userData.shadow.visible = false;
  n.vx = dx * power + (Math.random() - 0.5) * 3;
  n.vz = dz * power + (Math.random() - 0.5) * 3;
  n.vy = 6.5 + Math.random() * 4.5;
  n.airY = 0.9;
  n.spinX = (Math.random() - 0.5) * 14;
  n.spinZ = (Math.random() - 0.5) * 14;
  sfx('grunt');
  for (var i = 0; i < 5; i++) puff(new THREE.Vector3(n.x + (Math.random() - 0.5), 0.8 + Math.random() * 1.2, n.z + (Math.random() - 0.5)), 0xa01212);
  bloodDecal(n.x, n.z);
  spawnCash(n.x, n.z, 5 + ((Math.random() * 18) | 0));
}

var booms = [];
var boomGeo = new THREE.SphereGeometry(1, 10, 8);
function boomAt(x, z, fromNet) {
  if (!fromNet && typeof netBroadcast === 'function' && net.conns.length) netBroadcast({ t: 'boom', x: x, z: z });
  var mesh = new THREE.Mesh(boomGeo, new THREE.MeshBasicMaterial({ color: 0xff8828, transparent: true, opacity: 0.95 }));
  mesh.position.set(x, 1.5, z); scene.add(mesh);
  booms.push({ mesh: mesh, life: 0.55, max: 0.55 });
  for (var i = 0; i < 9; i++) puff(new THREE.Vector3(x + (Math.random() - 0.5) * 4, 0.8 + Math.random() * 3, z + (Math.random() - 0.5) * 4), i % 2 ? 0x333333 : 0xd86a20);
  scorch(x, z);
  sfx('boom');
  if (!isClient()) {   // kills are host-authoritative; clients get them via snapshot
    for (i = 0; i < npcs.length; i++) {
      var n = npcs[i]; if (n.state === 'down' || n.state === 'ragdoll') continue;
      var dx = n.x - x, dz = n.z - z, d = Math.sqrt(dx * dx + dz * dz);
      if (d < 9) killNpcRagdoll(n, dx / (d || 1), dz / (d || 1), 13);
    }
    for (i = 0; i < cops.length; i++) {
      var cp = cops[i]; if (cp.state === 'down') continue;
      var cdx = cp.x - x, cdz = cp.z - z, cd = Math.sqrt(cdx * cdx + cdz * cdz);
      if (cd < 9) damageCop(cp, 999, cdx / (cd || 1), cdz / (cd || 1));
    }
  }
  var pdx = player.x - x, pdz = player.z - z, pd = Math.sqrt(pdx * pdx + pdz * pdz);
  if (pd < 10 && !state.dead) hurtPlayer(Math.round(80 * (1 - pd / 10) + 15));
  // chain: nearby cars go up too
  if (!isClient()) for (i = 0; i < cars.length; i++) {
    var cx = cars[i];
    if (cx.exploded) continue;
    var cm = cx.car.group.position;
    if (Math.abs(cm.x - x) < 6 && Math.abs(cm.z - z) < 6) explodeCar(cx);
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
function goBerserk(c) {
  if (c.berserk || c.exploded) return;
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
  sfx('crash');
}
function igniteCar(c) {
  if (c.burning || c.exploded) return;
  c.burning = true; c.burnT = 5; c.flameT = 0;
  popup2('YOUR CAR IS ON FIRE — GET OUT!');
  sfx('alarm');
}
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
  c.respawnT = 5;
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
      for (var b = 0; b < colliders.length; b++) { var bb = colliders[b]; if (r.x > bb.x0 && r.x < bb.x1 && r.z > bb.z0 && r.z < bb.z1) { hit = true; break; } }
    }
    if (!hit && r.y < 2.4) {
      for (var n = 0; n < npcs.length && !hit; n++) { var nn = npcs[n]; if (nn.state === 'down' || nn.state === 'ragdoll') continue; var dx = nn.x - r.x, dz = nn.z - r.z; if (dx * dx + dz * dz < 1.7) hit = true; }
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
  else { var tb = cyl(0.09, 0.09, 1.0, 10, rocketBodyM, 0, 0, 0); tb.rotation.x = Math.PI / 2; g.add(tb); }
  return g;
}
function dropWeapon(kind, x, z) {
  var g = dropMesh(kind);
  g.position.set(x, 0.7, z);
  scene.add(g);
  drops.push({ mesh: g, kind: kind, life: 120 });
}
function updateDrops(dt) {
  for (var i = drops.length - 1; i >= 0; i--) {
    var d = drops[i];
    d.life -= dt;
    d.mesh.rotation.y += dt * 1.6;
    d.mesh.position.y = 0.7 + Math.sin(T * 2.2 + i) * 0.12;
    var dx = player.x - d.mesh.position.x, dz = player.z - d.mesh.position.z;
    if (!state.dead && dx * dx + dz * dz < 2.6) {
      if (state.owned[d.kind]) {
        var refund = Math.floor(WEAPONS[d.kind].price / 2);
        state.money += refund;
        popup('+$' + refund + ' (sold ' + WEAPONS[d.kind].name + ')');
        sfx('cash');
      } else {
        state.owned[d.kind] = true;
        popup('Picked up ' + WEAPONS[d.kind].name);
        sfx('buy');
      }
      scene.remove(d.mesh); drops.splice(i, 1);
      continue;
    }
    if (d.life <= 0) { scene.remove(d.mesh); drops.splice(i, 1); }
  }
}

// ---------------- NPC logic (wander) ----------------
function damageNPC(n, dmg, kx, kz, silent) {
  if (n.state === 'down') return;
  n.hp -= dmg; n.hurtFlash = 0.12; n.x += (kx || 0) * 0.5; n.z += (kz || 0) * 0.5;
  lastCrimeT = T;
  if (n.hp <= 0) {
    n.state = 'down'; n.downT = 8; if (n.mesh.userData.shadow) n.mesh.userData.shadow.visible = false;
    spawnCash(n.x, n.z, 5 + ((Math.random() * 18) | 0)); sfx('ko'); sfx('grunt');
    if (!silent) {
      popup('KO!');
      state.civKills++;
      if (state.civKills % 5 === 0) { addStar(1); popup2('WANTED LEVEL UP'); }
    }
  } else { startFlee(n); sfx('hit'); }
  for (var i = 0; i < npcs.length; i++) { var o = npcs[i]; if (o === n || o.state !== 'walk') continue; var dx = o.x - n.x, dz = o.z - n.z; if (dx * dx + dz * dz < 170) startFlee(o); }
}
function startFlee(n) { if (n.state === 'down') return; n.state = 'flee'; n.fleeT = 4 + Math.random() * 3; var dx = n.x - player.x, dz = n.z - player.z; var d = Math.sqrt(dx * dx + dz * dz) || 1; n.fleeDX = dx / d; n.fleeDZ = dz / d; }
function panicNear(x, z, r2) { for (var i = 0; i < npcs.length; i++) { var o = npcs[i]; if (o.state !== 'walk') continue; var dx = o.x - x, dz = o.z - z; if (dx * dx + dz * dz < r2) startFlee(o); } }

function updateNPCs(dt) {
  if (isClient()) { updateNPCExtras(); return; }   // npcs mirrored from host snapshot
  for (var i = 0; i < npcs.length; i++) {
    var n = npcs[i], m = n.mesh;
    if (n.hurtFlash > 0) { n.hurtFlash -= dt; m.position.y = n.hurtFlash > 0 ? 0.06 : 0; }
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
      if (n.downT <= 0) { var s = sidewalkSpot(); n.x = s[0]; n.z = s[1]; var t = npcTarget(); n.tx = t[0]; n.tz = t[1]; n.hp = 100; n.state = 'walk'; m.rotation.x = 0; if (m.userData.shadow) m.userData.shadow.visible = true; }
      m.position.set(n.x, m.position.y, n.z); continue;
    }
    var vx = 0, vz = 0, spd = n.speed;
    if (n.state === 'flee') {
      n.fleeT -= dt; spd = 4.6; vx = n.fleeDX; vz = n.fleeDZ; if (n.fleeT <= 0) n.state = 'walk';
    } else {
      if (n.pause > 0) { n.pause -= dt; animPerson(m, 0, dt); continue; }
      var dx = n.tx - n.x, dz = n.tz - n.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d < 1) { var tt = npcTarget(); n.tx = tt[0]; n.tz = tt[1]; if (Math.random() < 0.25) n.pause = 1 + Math.random() * 3; continue; }
      vx = dx / d; vz = dz / d;
    }
    n.x += vx * spd * dt; n.z += vz * spd * dt;
    n.x = Math.max(-HALF + 3, Math.min(HALF - 3, n.x)); n.z = Math.max(-HALF + 3, Math.min(HALF - 3, n.z));
    var pos = pushOut(n.x, n.z, 0.45); n.x = pos.x; n.z = pos.z;
    m.position.set(n.x, m.position.y === 0.06 ? 0.06 : 0, n.z);
    m.rotation.y = Math.atan2(vx, vz); n.phase += spd * dt * 3.4; animPerson(m, spd, dt, n.phase);
  }
  updateNPCExtras();
}
function updateNPCExtras() {
  var ddx = player.x - dealerPos.x, ddz = player.z - dealerPos.z;
  if (ddx * ddx + ddz * ddz < 120) dealer.rotation.y = Math.atan2(ddx, ddz);
  dollarSprite.position.y = 3.0 + Math.sin(T * 2.2) * 0.18;
  if (inside) {
    var kdx = player.x - clerkPos.x, kdz = player.z - clerkPos.z;
    clerk.rotation.y = Math.atan2(kdx, kdz);
    if (robbedVisit || copsCalledVisit) { // hands up
      clerk.userData.limbs.armL.rotation.x = Math.PI * 0.9;
      clerk.userData.limbs.armR.rotation.x = Math.PI * 0.9;
    } else {
      clerk.userData.limbs.armL.rotation.x = 0;
      clerk.userData.limbs.armR.rotation.x = 0;
    }
  }
}
function animPerson(m, spd, dt, phase) {
  var L = m.userData.limbs; if (!L) return;
  var a = spd > 0.1 ? Math.sin(phase || 0) * 0.65 : 0;
  L.legL.rotation.x = a; L.legR.rotation.x = -a; L.armL.rotation.x = -a * 0.8; L.armR.rotation.x = a * 0.8;
}

// ---------------- collision ----------------
function pushOut(px, pz, r, list) {
  var L = list || colliders;
  for (var i = 0; i < L.length; i++) {
    var b = L[i];
    if (px < b.x0 - r || px > b.x1 + r || pz < b.z0 - r || pz > b.z1 + r) continue;
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
var vmPistol = new THREE.Group();
(function () {
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
(function () {
  var oliveM = lamb({ color: 0x4a5a3a });
  var tube = cyl(0.062, 0.062, 0.85, 12, oliveM, 0.3, -0.24, -0.55); tube.rotation.x = Math.PI / 2; vmRocket.add(tube);
  var mouth = cyl(0.075, 0.062, 0.1, 12, darkMetalM, 0.3, -0.24, -0.99); mouth.rotation.x = Math.PI / 2; vmRocket.add(mouth);
  var rear = cyl(0.062, 0.078, 0.12, 12, darkMetalM, 0.3, -0.24, -0.12); rear.rotation.x = Math.PI / 2; vmRocket.add(rear);
  var tip = cyl(0.001, 0.05, 0.12, 10, lamb({ color: 0xb03024 }), 0.3, -0.24, -1.06); tip.rotation.x = -Math.PI / 2; vmRocket.add(tip); // loaded rocket nose
  vmRocket.add(box(0.05, 0.13, 0.08, gripM, 0.3, -0.38, -0.5));
  vmRocket.add(box(0.05, 0.1, 0.06, oliveM, 0.3, -0.35, -0.72));           // front grip
  vmRocket.add(box(0.02, 0.07, 0.1, metalM, 0.3, -0.15, -0.62));           // sight
  vmRocket.add(vmArm(0.32, -0.48, -0.32, 0.18));
  vmRocket.add(vmArm(0.16, -0.46, -0.6, -0.3));
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
flash.visible = false; vm.add(flash); var flashT = 0;
var vmMap = { fists: vmFists, pistol: vmPistol, smg: vmSmg, rifle: vmRifle, auto: vmAuto, rocket: vmRocket, snack: vmSnack };
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
  setZoom(false);
  state.equipped = w;
  vm.visible = !zoomed && !driving;
  Object.keys(vmMap).forEach(function (k) { vmMap[k].visible = (k === w); });
  var sub = w === 'fists' ? 'punch for cash' : (w === 'rifle' ? 'right-click: scope' : (w === 'rocket' ? '5s reload' : (w === 'snack' ? 'left-click: eat (+50 hp) — x' + state.snacks : 'ammo: &#8734;')));
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
    punchT = T; sfx('whoosh');
    var fx = -Math.sin(yaw), fz = -Math.cos(yaw), best = null, bestD = 99, bestCop = null;
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i]; if (n.state === 'down') continue;
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
    else if (bestCopM >= 0) { puff(new THREE.Vector3(copsM[bestCopM].x, 1.3, copsM[bestCopM].z), 0xd96a4f); netToHost({ t: 'dmgCop', i: bestCopM, dmg: w.dmg, kx: fx, kz: fz }); }
    else if (bestRemote) { netSendHit(bestRemote.id, w.dmg); puff(new THREE.Vector3(bestRemote.x, 1.3, bestRemote.z), 0xd96a4f); }
    return;
  }
  if (T - lastShot < w.rate) return;
  lastShot = T; recoil = 1; flash.visible = true; flash.position.set(w.flashAt[0], w.flashAt[1], w.flashAt[2]); flash.rotation.z = Math.random() * Math.PI; flashT = 0.045;
  if (w.rocket) {
    recoil = 2.2;
    fireRocket();
    pitch = Math.min(1.45, pitch + 0.04);
    return;
  }
  sfx(state.equipped);
  var dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  dir.x += (Math.random() - 0.5) * w.spread * 2; dir.y += (Math.random() - 0.5) * w.spread * 2; dir.z += (Math.random() - 0.5) * w.spread * 2; dir.normalize();
  raycaster.set(camera.position.clone(), dir); raycaster.far = 300;
  npcRootsAlive.length = 0;
  for (var k = 0; k < npcs.length; k++) if (npcs[k].state !== 'down') npcRootsAlive.push(npcs[k].mesh);
  for (k = 0; k < cops.length; k++) if (cops[k].state !== 'down') npcRootsAlive.push(cops[k].mesh);
  if (isClient()) for (k = 0; k < copsM.length; k++) npcRootsAlive.push(copsM[k].mesh);
  for (k = 0; k < cars.length; k++) if (!cars[k].exploded) npcRootsAlive.push(cars[k].car.group);
  for (var rid in net.remotes) { var rr = net.remotes[rid]; if (rr.dead) continue; npcRootsAlive.push(rr.drv && rr.car ? rr.car.group : rr.mesh); }
  var hits = raycaster.intersectObjects(npcRootsAlive.concat(solidMeshes), true);
  if (hits.length) {
    var h = hits[0], o = h.object, npcHit = null, copHit = null, carHit = null, remoteHit = null, copMHit = -1;
    while (o) {
      if (o.userData && o.userData.npc) { npcHit = o.userData.npc; break; }
      if (o.userData && o.userData.cop) { copHit = o.userData.cop; break; }
      if (o.userData && o.userData.copM !== undefined) { copMHit = o.userData.copM; break; }
      if (o.userData && o.userData.remoteId) { remoteHit = o.userData.remoteId; break; }
      if (o.userData && o.userData.trafficCar) { carHit = o.userData.trafficCar; break; }
      o = o.parent;
    }
    if (npcHit) {
      puff(h.point, 0xd93a2a);
      if (isClient()) netToHost({ t: 'dmgNpc', i: npcs.indexOf(npcHit), dmg: w.dmg, kx: dir.x, kz: dir.z });
      else damageNPC(npcHit, w.dmg, dir.x, dir.z);
    }
    else if (remoteHit) { netSendHit(remoteHit, w.dmg); puff(h.point, 0xd93a2a); }
    else if (copMHit >= 0) { puff(h.point, 0xd93a2a); netToHost({ t: 'dmgCop', i: copMHit, dmg: w.dmg, kx: dir.x, kz: dir.z }); }
    else if (copHit) { damageCop(copHit, w.dmg, dir.x, dir.z); puff(h.point, 0xd93a2a); }
    else if (carHit) {
      puff(h.point, 0xd8c860);
      if (carHit.stolen) {
        // your (or a parked stolen) ride takes real damage
        carHit.carHP = (carHit.carHP === undefined ? 100 : carHit.carHP) - w.dmg;
        if (carHit.carHP <= 0) igniteCar(carHit);
      } else if (isClient()) {
        netToHost({ t: 'shootCar', i: cars.indexOf(carHit), rate: w.rate });
      } else {
        carHit.dmgT += w.rate;
        if (carHit.dmgT >= 1.5 && !carHit.berserk) { goBerserk(carHit); lastCrimeT = T; }
      }
    }
    else puff(h.point, 0xbbbbbb);
  }
  pitch = Math.min(1.45, pitch + 0.012 + Math.random() * 0.008);
}

function hurtPlayer(d) {
  if (state.dead) return;
  state.hp -= d; state.lastHurt = T;
  var f = document.getElementById('dmgFlash'); f.style.transition = 'none'; f.style.opacity = 0.45;
  requestAnimationFrame(function () { f.style.transition = 'opacity .45s'; f.style.opacity = 0; });
  if (state.hp <= 0) {
    state.hp = 0; state.dead = true;
    if (driving) { driving.pspeed = 0; driving = null; document.getElementById('crosshair').style.display = ''; vm.visible = true; }
    if (inside) exitStore(true);   // clean up interior cops + lockout, respawn is outside anyway
    var lost = Math.floor(state.money * 0.25); state.money -= lost;
    document.getElementById('deadInfo').textContent = lost > 0 ? 'You dropped $' + lost + ' on the pavement.' : 'At least you were already broke.';
    document.getElementById('deadScreen').classList.remove('hidden');
    state.wanted = 0; state.civKills = 0; updateStarsHUD();
    // drop everything you were carrying
    var dropped = 0;
    GUN_LIST.forEach(function (k) {
      if (!state.owned[k]) return;
      var a = (dropped * 1.3) + Math.random();
      dropWeapon(k, player.x + Math.cos(a) * (1.5 + dropped * 0.8), player.z + Math.sin(a) * (1.5 + dropped * 0.8));
      state.owned[k] = false;
      dropped++;
    });
    setEquipped('fists');
    setTimeout(function () { player.x = -72; player.z = -97; player.y = EYE; yaw = 0; pitch = 0; state.hp = 100; state.dead = false; document.getElementById('deadScreen').classList.add('hidden'); }, 2600);
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
  { k: 'photo', n: 'FACE STYLE', names: ['PAINTED', 'FACE 1', 'FACE 2', 'FACE 3', 'FACE 4', 'FACE 5', 'FACE 6'] },
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
    cprev.char.traverse(function (o) { if (o.material && o.material.map && o.material.map.dispose) o.material.map.dispose(); });
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
  if (b.light) { b.light.broken = true; b.light.glow.visible = false; b.light.pool.visible = false; }
  var cols = b.type === 'tree' ? [0x4c8038, 0x3f6f2e, 0x7a5a3a] : [0xffe9a8, 0x8a8f94, 0xd8d8d4];
  var n = b.type === 'tree' ? 14 : 9;
  for (var i = 0; i < n; i++) {
    puff(new THREE.Vector3(
      b.x + (Math.random() - 0.5) * 2.4,
      0.6 + Math.random() * (b.type === 'tree' ? 4.5 : 6.5),
      b.z + (Math.random() - 0.5) * 2.4), cols[i % 3]);
  }
  sfx('crash');
}
var fallAxis = new THREE.Vector3(), fallQ = new THREE.Quaternion();
function updateWorldFx(dt) {
  // cars snap trees & street lights (works on host and on mirrored client cars)
  for (var i = 0; i < cars.length; i++) {
    var c = cars[i];
    var m = c.car.group.position;
    var hx = c._bx === undefined ? m.x : c._bx, hz = c._bz === undefined ? m.z : c._bz;
    var mvx = m.x - hx, mvz = m.z - hz;
    c._bx = m.x; c._bz = m.z;
    if (c.exploded) continue;
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
        sfx('thud');
        for (var pi = 0; pi < 5; pi++) puff(new THREE.Vector3(bb.x + bb.fx * (2 + Math.random() * 3), 0.5, bb.z + bb.fz * (2 + Math.random() * 3)), 0x8a8478);
      }
    }
    bb.respawnT -= dt;
    if (bb.respawnT <= 0) {
      bb.broken = false; bb.fallT = 0;
      bb.g.quaternion.copy(bb.yq);
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
function noiseBurst(dur, freq, gain) { if (!ac) return; var n = ac.sampleRate * dur, buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0); for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); var src = ac.createBufferSource(); src.buffer = buf; var f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; var g = ac.createGain(); g.gain.value = gain; src.connect(f); f.connect(g); g.connect(ac.destination); src.start(); }
function beep(freq, dur, gain, type, slide) { if (!ac) return; var o = ac.createOscillator(), g = ac.createGain(); o.type = type || 'square'; o.frequency.setValueAtTime(freq, ac.currentTime); if (slide) o.frequency.exponentialRampToValueAtTime(slide, ac.currentTime + dur); g.gain.setValueAtTime(gain, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur); o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur); }
function sfx(kind) {
  if (!ac) return;
  switch (kind) {
    case 'pistol': noiseBurst(0.14, 1700, 0.5); beep(220, 0.08, 0.12, 'square', 90); break;
    case 'smg': noiseBurst(0.09, 2100, 0.35); break;
    case 'rifle': noiseBurst(0.3, 900, 0.8); beep(120, 0.18, 0.2, 'sawtooth', 45); break;
    case 'whoosh': beep(280, 0.1, 0.1, 'sine', 90); break;
    case 'hit': beep(140, 0.09, 0.3, 'square', 70); noiseBurst(0.05, 900, 0.2); break;
    case 'ko': beep(90, 0.3, 0.35, 'sawtooth', 40); break;
    case 'thud': beep(70, 0.2, 0.4, 'sine', 35); break;
    case 'cash': beep(880, 0.08, 0.15, 'square'); setTimeout(function () { beep(1320, 0.1, 0.15, 'square'); }, 70); break;
    case 'buy': beep(660, 0.09, 0.15, 'square'); setTimeout(function () { beep(990, 0.12, 0.15, 'square'); }, 80); break;
    case 'deny': beep(150, 0.2, 0.25, 'sawtooth', 110); break;
    case 'alarm': beep(760, 0.18, 0.2, 'square'); setTimeout(function () { beep(560, 0.18, 0.2, 'square'); }, 180); setTimeout(function () { beep(760, 0.18, 0.2, 'square'); }, 360); break;
    case 'copshot': noiseBurst(0.12, 1500, 0.3); break;
    case 'copsmg': noiseBurst(0.08, 1900, 0.22); break;
    case 'grunt': beep(150, 0.28, 0.4, 'sawtooth', 55); noiseBurst(0.1, 600, 0.18); break;
    case 'auto': noiseBurst(0.11, 1300, 0.5); break;
    case 'eat': noiseBurst(0.09, 2500, 0.2); setTimeout(function () { noiseBurst(0.09, 2200, 0.18); }, 140); setTimeout(function () { noiseBurst(0.09, 2400, 0.15); }, 280); break;
    case 'rocketfire': noiseBurst(0.5, 800, 0.7); beep(220, 0.4, 0.3, 'sawtooth', 50); break;
    case 'crash': noiseBurst(0.3, 900, 0.8); beep(85, 0.18, 0.35, 'square', 45); break;
    case 'boom': noiseBurst(0.8, 320, 1.3); beep(60, 0.6, 0.6, 'sine', 24); setTimeout(function () { noiseBurst(0.4, 700, 0.4); }, 120); break;
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
    var left = document.createElement('div'); left.innerHTML = '<b>' + w.name + '</b> — <span class="cash">$' + w.price + '</span><small>' + w.desc + '</small>'; row.appendChild(left);
    if (state.owned[k]) { var sp = document.createElement('span'); sp.className = 'owned'; sp.textContent = 'OWNED'; row.appendChild(sp); }
    else { var btn = document.createElement('button'); btn.textContent = 'BUY'; btn.disabled = state.money < w.price; btn.onclick = function () { if (state.money < w.price) { sfx('deny'); return; } state.money -= w.price; state.owned[k] = true; sfx('buy'); popup(w.name + ' purchased!'); refreshShop(); }; row.appendChild(btn); }
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
  var any = GUN_LIST.some(function (k) { return state.owned[k]; });
  if (!any) { var hint = document.createElement('div'); hint.className = 'row'; hint.innerHTML = '<small>No guns yet — earn cash and visit the dealer ($ on the minimap).</small>'; rows.appendChild(hint); }
}
function openMenu(which) { setZoom(false); state.menu = which; document.exitPointerLock && document.exitPointerLock(); if (which === 'shop') { refreshShop(); document.getElementById('shopPanel').classList.remove('hidden'); } if (which === 'inv') { refreshInv(); document.getElementById('invPanel').classList.remove('hidden'); } if (which === 'clerk') { refreshClerk(); document.getElementById('clerkPanel').classList.remove('hidden'); } }
function closeMenus(relock) { state.menu = null; document.getElementById('shopPanel').classList.add('hidden'); document.getElementById('invPanel').classList.add('hidden'); document.getElementById('clerkPanel').classList.add('hidden'); if (relock !== false && state.running) lockPointer(); }

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
  // lake
  mg.fillStyle = '#3f82ae'; mg.save(); mg.translate(w2m(LAKE.x), w2m(LAKE.z)); mg.scale(1.25, 0.85); mg.beginPath(); mg.arc(0, 0, LAKE.r * MMS, 0, 7); mg.fill(); mg.restore();
  // concrete pads under buildings
  mg.fillStyle = '#b8b3a6'; for (var pv = 0; pv < mapPave.length; pv++) { var pp = mapPave[pv]; mg.fillRect(w2m(pp.x - pp.w / 2), w2m(pp.z - pp.d / 2), pp.w * MMS, pp.d * MMS); }
  // parking + access roads
  mg.fillStyle = '#4a4a50'; for (var p = 0; p < mapParking.length; p++) { var q = mapParking[p]; mg.fillRect(w2m(q.x - q.w / 2), w2m(q.z - q.d / 2), q.w * MMS, q.d * MMS); }
  mg.fillStyle = '#3a3a40'; for (var dr = 0; dr < mapDrives.length; dr++) { var dd = mapDrives[dr]; mg.fillRect(w2m(dd.x - dd.w / 2), w2m(dd.z - dd.d / 2), dd.w * MMS, dd.d * MMS); }
  // roads
  mg.fillStyle = '#33333a';
  mg.fillRect(0, w2m(-MAIN_HW), mm.width, MAIN_HW * 2 * MMS);
  mg.fillRect(w2m(-CROSS_HW), 0, CROSS_HW * 2 * MMS, mm.height);
  // buildings
  for (var b = 0; b < mapBuildings.length; b++) { var m = mapBuildings[b]; mg.fillStyle = m.c; mg.fillRect(w2m(m.x - m.w / 2), w2m(m.z - m.d / 2), Math.max(2, m.w * MMS), Math.max(2, m.d * MMS)); }
  // cars
  mg.fillStyle = '#e8a13a'; for (var c = 0; c < cars.length; c++) { var cm = cars[c].car.group.position; mg.fillRect(w2m(cm.x) - 1, w2m(cm.z) - 1, 2, 2); }
  // npcs
  mg.fillStyle = '#eeeeee'; for (var n = 0; n < npcs.length; n++) { if (npcs[n].state === 'down') continue; mg.fillRect(w2m(npcs[n].x) - 1, w2m(npcs[n].z) - 1, 2, 2); }
  // cops (blue, slightly bigger)
  mg.fillStyle = '#3f8fe8'; for (var cop = 0; cop < cops.length; cop++) { if (cops[cop].state === 'down') continue; mg.fillRect(w2m(cops[cop].x) - 1.5, w2m(cops[cop].z) - 1.5, 3, 3); }
  for (var cop2 = 0; cop2 < copsM.length; cop2++) { mg.fillRect(w2m(copsM[cop2].x) - 1.5, w2m(copsM[cop2].z) - 1.5, 3, 3); }
  // other players (cyan)
  mg.fillStyle = '#4ae8d8'; for (var rp in net.remotes) { var rpp = net.remotes[rp]; mg.fillRect(w2m(rpp.x) - 2, w2m(rpp.z) - 2, 4, 4); }
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
function lockPointer() { if (canvas.requestPointerLock) canvas.requestPointerLock(); }
var startScreen = document.getElementById('startScreen');
var pauseScreen = document.getElementById('pauseScreen');
function startGame() {
  initAudio();
  startScreen.classList.add('hidden');
  state.running = true;
  lockPointer();
  toast('Welcome to <b>Westchase</b>. Punch people for cash, rob the gas station (the <b style="color:#e05a3a">G</b> on your minimap), and buy guns from the dealer (the gold <b style="color:#ffd94a">$</b>). <b>TAB</b> = inventory.', 11000);
}

// ---------------- multiplayer (PeerJS data channels, host = hub) ----------------
var net = { mode: 'sp', peer: null, conns: [], remotes: {}, id: null, sendT: 0, envSyncT: 0, worldT: 0, worldSnap: null, copList: [] };
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
    { urls: 'turn:' + T + ':80?transport=tcp', username: user, credential: pass },
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
function updateLobbyStatus() {
  var el = document.getElementById('lobbyStatus');
  if (el) el.textContent = net.conns.length + (net.conns.length === 1 ? ' friend connected' : ' friends connected');
}
function makeTag(text) {
  // name on top, health bar underneath; redraw via sp.userData.draw(name, hp)
  var c = document.createElement('canvas'); c.width = 160; c.height = 44;
  var g = c.getContext('2d');
  var t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter;
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  sp.scale.set(2.9, 0.8, 1);
  sp.userData.draw = function (name, hp) {
    g.clearRect(0, 0, 160, 44);
    g.font = 'bold 19px Courier New'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = '#000'; g.lineWidth = 5; g.strokeText(name, 80, 12);
    g.fillStyle = '#8fd0e8'; g.fillText(name, 80, 12);
    var w = 100, h = 8, x = (160 - w) / 2, y = 28;
    g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(x - 2, y - 2, w + 4, h + 4);
    var f = Math.max(0, Math.min(1, hp / 100));
    g.fillStyle = f > 0.5 ? '#6fdc5a' : (f > 0.25 ? '#ffd94a' : '#e5533d');
    g.fillRect(x, y, w * f, h);
    t.needsUpdate = true;
  };
  sp.userData.draw(text, 100);
  return sp;
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
  // free any car they were driving
  for (var i = 0; i < cars.length; i++) if (cars[i].drivenBy === id) cars[i].drivenBy = null;
}
function handleNet(m, conn) {
  if (!m || !m.t) return;
  if (m.t === 's') {
    var r = ensureRemote(m.id);
    r.tx = m.x; r.tz = m.z; r.ty = m.y || 0; r.tyaw = m.yaw || 0;
    r.drv = m.drv || 0; r.h = m.h || 0; r.dead = m.dead || 0; r.w = m.w || 0;
    if (m.n) r.name = m.n;
    if (m.hp !== undefined) r.hp = m.hp;
    if (m.cc && r.cc !== m.cc) {
      // they picked a custom character — swap the placeholder avatar
      var ncfg = decodeCC(m.cc);
      if (ncfg) {
        r.cc = m.cc;
        scene.remove(r.mesh);
        r.mesh = buildCharacter(ncfg);
        r.mesh.userData.remoteId = m.id;
        r.mesh.position.set(r.x, Math.max(-59.9, r.y - EYE), r.z);
        scene.add(r.mesh);
      }
    }
    if (r.name !== r.tagName || Math.abs(r.hp - r.tagHp) >= 1) {
      r.tagName = r.name; r.tagHp = r.hp;
      r.tag.userData.draw(r.name, r.hp);
    }
    netRelay(m, conn);
  } else if (m.t === 'hit') {
    if (m.to === net.id) {
      if (driving) {
        driving.carHP = (driving.carHP === undefined ? 100 : driving.carHP) - m.dmg * 2;
        var cp3 = driving.car.group.position;
        puff(new THREE.Vector3(cp3.x + (Math.random() - 0.5) * 2, 1 + Math.random(), cp3.z + (Math.random() - 0.5) * 2), 0xd8c860);
        if (driving.carHP <= 0) igniteCar(driving);
      } else hurtPlayer(m.dmg);
    }
    else if (net.mode === 'host') { for (var i = 0; i < net.conns.length; i++) if (net.conns[i].peer === m.to) { try { net.conns[i].send(m); } catch (e) { } } }
  } else if (m.t === 'boom') {
    boomAt(m.x, m.z, true);
    netRelay(m, conn);
  } else if (m.t === 'world') {
    if (net.mode === 'client') net.worldSnap = m;
  } else if (m.t === 'env') {
    if (net.mode === 'client') { envT = m.envT; raining = m.raining; rainLeft = m.rainLeft; }
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
  } else if (net.mode === 'host') {
    // ---- client → host world actions (host is authoritative) ----
    if (m.t === 'dmgNpc') {
      var n = npcs[m.i];
      if (n && n.state !== 'down' && n.state !== 'ragdoll') {
        damageNPC(n, m.dmg, m.kx, m.kz, true);
        if (n.state === 'down') { try { conn.send({ t: 'kill', kind: 'npc' }); } catch (e) { } }
      }
    } else if (m.t === 'dmgCop') {
      var cpx = net.copList[m.i];
      if (cpx && cpx.state !== 'down') {
        damageCop(cpx, m.dmg, m.kx, m.kz, true);
        if (cpx.state === 'down') { try { conn.send({ t: 'kill', kind: 'cop' }); } catch (e) { } }
      }
    } else if (m.t === 'shootCar') {
      var scc = cars[m.i];
      if (scc && !scc.stolen && !scc.exploded) { scc.dmgT += m.rate; if (scc.dmgT >= 1.5 && !scc.berserk) goBerserk(scc); }
    } else if (m.t === 'ragNpc') {
      var rn = npcs[m.i];
      if (rn && rn.state !== 'down' && rn.state !== 'ragdoll') killNpcRagdoll(rn, m.kx, m.kz, m.pw || 9);
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
          } else if (!sc.jacked) kickDriver(sc);
          sc.jacked = true; sc.stolen = true; sc.drivenBy = conn.peer;
        }
      }
    } else if (m.t === 'park') {
      var pk = cars[m.i];
      if (pk) { pk.drivenBy = null; pk.stolen = true; pk.car.group.position.set(m.x, 0, m.z); pk.car.group.rotation.y = m.ry; }
    } else if (m.t === 'ram') {
      var rc = cars[m.i];
      if (rc && !rc.stolen && !rc.exploded) goBerserk(rc);
    } else if (m.t === 'carBoom') {
      var bc = cars[m.i];
      if (bc) { bc.drivenBy = null; if (!bc.exploded) explodeCar(bc); }
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
    }
  } else if (m.t === 'cash') {
    state.money += m.val; popup('+$' + m.val); sfx('cash');
  } else if (m.t === 'kill') {
    if (m.kind === 'npc') { state.civKills++; if (state.civKills % 5 === 0) { addStar(1); popup2('WANTED LEVEL UP'); } lastCrimeT = T; popup('KO!'); }
    else if (m.kind === 'cop') { addStar(1); popup('COP DOWN!'); }
  }
}
function onConn(c) {
  net.conns.push(c);
  updateLobbyStatus();
  if (net.mode === 'host') {
    var sendEnv = function () { try { c.send({ t: 'env', envT: envT, raining: raining, rainLeft: rainLeft }); } catch (e) { } };
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
function hostGame() {
  if (typeof Peer === 'undefined') { netError('Multiplayer unavailable (peerjs.min.js missing)'); return; }
  net.mode = 'host';
  netError('Setting up lobby…');
  saveName();
  net.peer = new Peer(peerOptions());
  net.peer.on('open', function (id) {
    net.id = id;
    document.getElementById('netErr').classList.add('hidden');
    document.getElementById('inviteLink').value = location.href.split('#')[0] + '#join=' + id;
    document.getElementById('menuMain').classList.add('hidden');
    document.getElementById('lobby').classList.remove('hidden');
  });
  net.peer.on('connection', onConn);
  net.peer.on('error', function (e) { netError('Network error: ' + e.type + ' (multiplayer needs internet)'); });
}
function joinGame(code) {
  if (typeof Peer === 'undefined') { netError('Multiplayer unavailable (peerjs.min.js missing)'); return; }
  var hostId = code.indexOf('#join=') >= 0 ? code.split('#join=').pop() : code;
  hostId = hostId.trim();
  if (!hostId) { netError('Paste an invite link or code first'); return; }
  net.mode = 'client';
  netError('Connecting…');
  saveName();
  net.peer = new Peer(peerOptions());
  net.peer.on('open', function () {
    net.id = net.peer.id;
    var c = net.peer.connect(hostId, { reliable: false });
    // watchdog: if the tunnel never opens (NAT/relay trouble), say so
    var joined = false;
    var watchdog = setTimeout(function () {
      if (!joined) netError('Still connecting… if this hangs, host and joiner may both need to refresh and retry (relay servers can take a moment).');
    }, 12000);
    c.on('open', function () {
      joined = true; clearTimeout(watchdog);
      document.getElementById('netErr').classList.add('hidden');
      onConn(c);
      startGame();
    });
    c.on('error', function (e) { clearTimeout(watchdog); netError('Could not join: ' + e.type); });
  });
  net.peer.on('error', function (e) { netError('Could not join: ' + e.type + ' (check the code / internet)'); });
}
function updateNet(dt) {
  if (!net.peer) return;
  // broadcast our state ~14x/s
  net.sendT -= dt;
  if (net.sendT <= 0 && netActive()) {
    net.sendT = 0.07;
    var msg = { t: 's', id: net.id, x: Math.round(player.x * 10) / 10, y: Math.round(player.y * 10) / 10, z: Math.round(player.z * 10) / 10, yaw: Math.round(yaw * 100) / 100, drv: driving ? 1 : 0, h: driving ? Math.round(driving.car.group.rotation.y * 100) / 100 : 0, dead: state.dead ? 1 : 0, w: state.wanted, n: getPlayerName(), hp: Math.round(Math.max(0, state.hp)), cc: encodeCC(playerChar) };
    if (net.mode === 'host') netBroadcast(msg);
    else net.conns[0] && net.conns[0].send(msg);
  }
  if (net.mode === 'host' && netActive()) {
    // weather/time sync
    net.envSyncT -= dt;
    if (net.envSyncT <= 0) { net.envSyncT = 3; netBroadcast({ t: 'env', envT: envT, raining: raining, rainLeft: rainLeft }); }
    // authoritative world snapshot ~8x/s: traffic, npcs, street cops, cash
    net.worldT -= dt;
    if (net.worldT <= 0) {
      net.worldT = 0.12;
      var carsArr = [];
      for (var i = 0; i < cars.length; i++) {
        var cc = cars[i], mm = cc.car.group;
        carsArr.push([Math.round(mm.position.x * 10) / 10, Math.round(mm.position.z * 10) / 10, Math.round(mm.rotation.y * 100) / 100,
          (cc.exploded ? 1 : 0) | (cc.berserk ? 2 : 0) | (cc.burning ? 4 : 0) | (cc.stolen ? 8 : 0) | ((cc.drivenBy || cc === driving) ? 16 : 0)]);
      }
      var npcArr = [];
      for (i = 0; i < npcs.length; i++) {
        var nn = npcs[i];
        npcArr.push([Math.round(nn.x * 10) / 10, Math.round(nn.z * 10) / 10, Math.round(nn.mesh.rotation.y * 100) / 100,
          nn.state === 'down' ? 2 : (nn.state === 'ragdoll' ? 3 : 0), Math.round(nn.mesh.position.y * 10) / 10]);
      }
      net.copList = [];
      var copArr = [];
      for (i = 0; i < cops.length; i++) {
        var cq = cops[i];
        if (cq.interior) continue;
        net.copList.push(cq);
        copArr.push([Math.round(cq.x * 10) / 10, Math.round(cq.z * 10) / 10, Math.round(cq.mesh.rotation.y * 100) / 100, cq.state === 'down' ? 2 : 0]);
      }
      var cashArr = [];
      for (i = 0; i < cashes.length; i++) { var kp = cashes[i].mesh.position; cashArr.push([Math.round(kp.x * 10) / 10, Math.round(kp.z * 10) / 10]); }
      netBroadcast({ t: 'world', cars: carsArr, npcs: npcArr, cops: copArr, cash: cashArr });
    }
  }
  if (isClient()) applyWorldSnap(dt);
  // interpolate remote players
  for (var id in net.remotes) {
    var r = net.remotes[id];
    var k = Math.min(1, dt * 12);
    r.x += (r.tx - r.x) * k; r.z += (r.tz - r.z) * k; r.y += (r.ty - r.y) * k;
    var dy = r.tyaw - r.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    r.yaw += dy * k;
    var moved = Math.sqrt((r.x - r.lx) * (r.x - r.lx) + (r.z - r.lz) * (r.z - r.lz));
    r.phase += moved * 3.4;
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
      animPerson(r.mesh, r.dead ? 0 : (moved / Math.max(dt, 0.001) > 0.5 ? 2 : 0), dt, r.phase);
      r.tag.position.set(r.x, r.y - EYE + 2.5, r.z);
    }
  }
}

// client: mirror the host's world snapshot
var copsM = [];
function applyWorldSnap(dt) {
  var s = net.worldSnap;
  if (!s) return;
  var k = Math.min(1, dt * 10);
  for (var i = 0; i < cars.length && i < s.cars.length; i++) {
    var c = cars[i], a = s.cars[i], m = c.car.group;
    if (c === driving) continue;               // we own this one locally
    var fl = a[3];
    c.exploded = !!(fl & 1); c.berserk = !!(fl & 2); c.burning = !!(fl & 4); c.stolen = !!(fl & 8); c.playerDriven = !!(fl & 16);
    m.visible = !c.exploded;
    if (c.exploded) { if (c.eng) c.eng.g.gain.value = 0; continue; }
    m.position.x += (a[0] - m.position.x) * k;
    m.position.z += (a[1] - m.position.z) * k;
    m.rotation.y = a[2];
    if (c.berserk || c.burning) {
      c.smokeT = (c.smokeT || 0) - dt;
      if (c.smokeT <= 0) { c.smokeT = 0.1; puff(new THREE.Vector3(m.position.x, 1.1, m.position.z), c.burning ? 0xff8828 : 0x555555); }
    }
    var edx = player.x - m.position.x, edz = player.z - m.position.z;
    var ed = Math.sqrt(edx * edx + edz * edz);
    ensureEngine(c);
    if (c.eng) { var vol = Math.max(0, 1 - ed / 80); c.eng.g.gain.value = c.stolen ? 0 : vol * vol * 0.055; c.eng.o.frequency.value = 62; }
    if (!driving && !c.stolen && Math.abs(edx) < 2.6 && Math.abs(edz) < 2.6 && !state.dead) {
      var dd = ed || 1;
      player.x += (edx / dd) * 2.4; player.z += (edz / dd) * 2.4;
      if (T - state.lastCarHit > 0.8) { state.lastCarHit = T; hurtPlayer(12); sfx('thud'); }
    }
  }
  while (npcs.length < s.npcs.length) spawnNPC();
  for (i = 0; i < s.npcs.length && i < npcs.length; i++) {
    var n = npcs[i], b = s.npcs[i], nm = n.mesh;
    n.x += (b[0] - n.x) * k; n.z += (b[1] - n.z) * k;
    var st = b[3];
    n.state = st === 2 ? 'down' : (st === 3 ? 'ragdoll' : 'walk');
    nm.position.set(n.x, st === 3 ? (b[4] || 0) : 0, n.z);
    nm.rotation.y = b[2];
    nm.rotation.x = st >= 2 ? -1.5 : 0;
    if (nm.userData.shadow) nm.userData.shadow.visible = st < 2;
    if (st === 0) { n.phase += dt * 5; animPerson(nm, 2, dt, n.phase); }
  }
  while (copsM.length < s.cops.length) { var cm2 = buildCop(); cm2.userData.copM = copsM.length; scene.add(cm2); copsM.push({ mesh: cm2, x: 0, z: 0, phase: Math.random() * 9 }); }
  while (copsM.length > s.cops.length) { var oldc = copsM.pop(); scene.remove(oldc.mesh); }
  for (i = 0; i < copsM.length; i++) {
    var cp = copsM[i], cs = s.cops[i];
    cp.x += (cs[0] - cp.x) * k; cp.z += (cs[1] - cp.z) * k;
    cp.mesh.position.set(cp.x, 0, cp.z);
    cp.mesh.rotation.y = cs[2];
    cp.mesh.rotation.x = cs[3] === 2 ? -1.5 : 0;
    cp.mesh.userData.copM = i;
    cp.phase += dt * 5;
    animPerson(cp.mesh, cs[3] === 2 ? 0 : 2, dt, cp.phase);
  }
  // cash mirror
  if (cashes.length !== s.cash.length) {
    for (i = 0; i < cashes.length; i++) scene.remove(cashes[i].mesh);
    cashes.length = 0;
    for (i = 0; i < s.cash.length; i++) {
      var cmesh = new THREE.Mesh(cashGeo, cashMats);
      cmesh.position.set(s.cash[i][0], 0.4, s.cash[i][1]);
      scene.add(cmesh);
      cashes.push({ mesh: cmesh, val: 0, life: 9999, baseY: 0, netCash: true, pend: false });
    }
  } else {
    for (i = 0; i < cashes.length; i++) { cashes[i].mesh.position.x = s.cash[i][0]; cashes[i].mesh.position.z = s.cash[i][1]; }
  }
}
function netSendHit(toId, dmg) {
  var m = { t: 'hit', to: toId, dmg: dmg };
  if (net.mode === 'host') { for (var i = 0; i < net.conns.length; i++) if (net.conns[i].peer === toId) { try { net.conns[i].send(m); } catch (e) { } } }
  else net.conns[0] && net.conns[0].send(m);
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
document.addEventListener('pointerlockchange', function () { var locked = document.pointerLockElement === canvas; if (!locked && state.running && !state.menu) pauseScreen.classList.remove('hidden'); else if (locked) pauseScreen.classList.add('hidden'); });
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
  if (list.length < 2) return;
  var idx = list.indexOf(state.equipped);
  if (idx < 0) idx = 0;
  setEquipped(list[(idx + dir + list.length) % list.length]);
}
document.addEventListener('wheel', function (e) {
  if (document.pointerLockElement !== canvas) return;
  cycleEquip(e.deltaY > 0 ? 1 : -1);
}, { passive: true });
document.addEventListener('keydown', function (e) {
  keys[e.code] = true;
  if (e.code === 'Tab') { e.preventDefault(); if (!state.running) return; if (state.menu === 'inv') closeMenus(); else { closeMenus(false); openMenu('inv'); } }
  if (e.code === 'KeyE') {
    if (!state.running) return;
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
    var sc = nearestStealableCar();
    if (sc) enterCar(sc);
  }
  if (e.code === 'Escape' && state.menu) closeMenus(false);
  if (e.code === 'Escape' && !state.running && creatorOpen) closeCreator();
});
document.addEventListener('keyup', function (e) { keys[e.code] = false; });

// ---------------- player update ----------------
function updatePlayer(dt) {
  if (state.menu || state.dead) return;
  if (driving) {
    updateDriving(dt);
    if (state.hp < 100 && T - state.lastHurt > 5) state.hp = Math.min(100, state.hp + 5 * dt);
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) flash.visible = false; }
    document.getElementById('prompt').textContent = '[E] EXIT CAR';
    return;
  }
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
  if (mouseDown && !WEAPONS[state.equipped].melee && WEAPONS[state.equipped].auto) tryAttack();
  if (state.hp < 100 && T - state.lastHurt > 5) state.hp = Math.min(100, state.hp + 5 * dt);
  camera.position.set(player.x, player.y, player.z); camera.rotation.y = yaw; camera.rotation.x = pitch;
  var moving = (f || s) && player.grounded; var bob = moving ? Math.sin(T * (spd > 6 ? 13 : 9)) * 0.035 : 0; camera.position.y += bob;
  recoil = Math.max(0, recoil - dt * 8); vm.position.z = recoil * 0.07; vm.position.y = bob * 0.5; vm.rotation.x = recoil * 0.06;
  var pt = T - punchT;
  if (WEAPONS[state.equipped].melee) {
    if (pt < 0.28) { var kk = Math.sin((pt / 0.28) * Math.PI); punchArm.position.z = punchArmBase.z - kk * 0.5; punchArm.position.x = punchArmBase.x - kk * 0.14; punchArm.rotation.x = -kk * 0.4; }
    else { punchArm.position.copy(punchArmBase); punchArm.rotation.x = 0; }
  }
  if (flashT > 0) { flashT -= dt; if (flashT <= 0) flash.visible = false; }
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
      var nsc = nearestStealableCar();
      if (nsc) prompt.textContent = carDrivenByPlayer(nsc) ? '[E] HIJACK CAR' : '[E] STEAL CAR';
      else prompt.textContent = '';
    }
  }
}
function updateHUD() { document.getElementById('money').textContent = '$' + state.money; document.getElementById('hpBar').style.width = Math.max(0, state.hp) + '%'; }

// ---------------- main loop ----------------
var last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  var dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!state.running) { renderer.render(scene, camera); renderCreatorFrame(dt); return; }
  T += dt;
  updatePlayer(dt); updateNPCs(dt); updateCops(dt); updateCars(dt); updateRockets(dt); updateDrops(dt); updateCash(dt); updatePuffs(dt); updateBooms(dt); updateDecals(dt); updateWorldFx(dt); updateEnv(dt); updateNet(dt); updateHUD(); drawMinimap();
  renderer.render(scene, camera);
}
setEquipped('fists');
updateStarsHUD();
camera.position.set(player.x, player.y, player.z);
requestAnimationFrame(loop);

// debug hook
window.__wc = {
  state: state, player: player, npcs: npcs, cashes: cashes, cops: cops,
  setWanted: setWanted, damageCop: damageCop,
  start: function () { startScreen.classList.add('hidden'); state.running = true; },
  setYaw: function (y) { yaw = y; camera.position.set(player.x, player.y, player.z); camera.rotation.y = yaw; camera.rotation.x = pitch; },
  setPitch: function (p2) { pitch = p2; camera.rotation.x = pitch; },
  teleport: function (x, z) { player.x = x; player.z = z; },
  tryAttack: tryAttack, setEquipped: setEquipped, cycleEquip: cycleEquip,
  enterStore: enterStore, exitStore: exitStore, refreshClerk: refreshClerk,
  isInside: function () { return inside; },
  storeState: function () { return { robbed: robbedVisit, copsCalled: copsCalledVisit, closedUntil: gasClosedUntil, now: T }; },
  resetCooldowns: function () { punchT = -99; lastShot = -99; },
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
  goBerserk: goBerserk, igniteCar: igniteCar,
  breakables: breakables, breakProp: breakProp, lakeBedY: lakeBedY,
  isUnderwater: function () { return underwater; },
  net: net, startGame: startGame, hostGame: hostGame, joinGame: joinGame, handleNet: handleNet,
  buildIceConfig: buildIceConfig, hmacSha1B64: hmacSha1B64,
  buildCharacter: buildCharacter, randomCharConfig: randomCharConfig,
  encodeCC: encodeCC, decodeCC: decodeCC, seededRng: seededRng,
  openCreator: openCreator, closeCreator: closeCreator,
  creatorSpin: function (v) { if (cprev) cprev.spin = v; },
  getPlayerChar: function () { return playerChar; },
  setPlayerChar: function (c) { playerChar = c; },
  tick: function (dt) { T += dt; updatePlayer(dt); updateNPCs(dt); updateCops(dt); updateCars(dt); updateRockets(dt); updateDrops(dt); updateCash(dt); updatePuffs(dt); updateBooms(dt); updateDecals(dt); updateWorldFx(dt); updateEnv(dt); updateNet(dt); renderer.render(scene, camera); }
};

})();
