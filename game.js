/* ============================================================
   WESTCHASE — retro FPS
   v3: hand-authored map matching the Linebaugh Ave intersection
   ============================================================ */
(function () {
'use strict';

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
  auto:   { name: 'AK-47',  price: 1000, dmg: 28, rate: 0.11, auto: true, spread: 0.012, desc: 'Full auto, long range.', flashAt: [0.26, -0.255, -1.2] },
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
function sidewalk(cx, cz, w, d) {
  var geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2);
  var m = lamb({ map: walkT.clone() }); m.map.repeat.set(w / 8, d / 8); m.map.needsUpdate = true;
  var mesh = new THREE.Mesh(geo, m); mesh.position.set(cx, 0.12, cz); scene.add(mesh);
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

// main + cross roads with flanking sidewalks
sidewalk(0, 0, TOTAL, MAIN_HW * 2 + 10);
sidewalk(0, 0, CROSS_HW * 2 + 10, TOTAL);
roadStrip(0, 0, TOTAL, MAIN_HW * 2, false);
roadStrip(0, 0, CROSS_HW * 2, TOTAL, true);

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

// ---------------- lake ----------------
(function lake() {
  var w = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r, 30), phong({ color: 0x3f82ae, shininess: 80, specular: 0xaaccdd }));
  w.rotation.x = -Math.PI / 2; w.scale.set(1.25, 1, 0.85); w.position.set(LAKE.x, 0.2, LAKE.z); scene.add(w);
  var rim = new THREE.Mesh(new THREE.RingGeometry(LAKE.r, LAKE.r + 3, 30), lamb({ color: 0xb9a778 }));
  rim.rotation.x = -Math.PI / 2; rim.scale.set(1.25, 1, 0.85); rim.position.set(LAKE.x, 0.19, LAKE.z); scene.add(rim);
  addCollider(LAKE.x, LAKE.z, LAKE.r * 2.3, LAKE.r * 1.5); // don't walk into the water
  for (var i = 0; i < 10; i++) { var a = i / 10 * Math.PI * 2; oak(LAKE.x + Math.cos(a) * (LAKE.r * 1.3), LAKE.z + Math.sin(a) * (LAKE.r * 0.95)); }
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
// NE bank / pharmacy / sushi
bankBldg(52, -48, 'REGIONS BANK');
shop(20, 44, 12, 11, 5, '#e8862e', ['DUNKIN'], '#e01a7a', '#ff8c42', { face: -1, mmColor: '#e8862e' });
shop(52, -112, 24, 20, 6, '#e8dcc6', ['WESTCHASE PHARMACY'], '#1c4d8f', '#ffe9a0', { face: 1, mmColor: '#3f8fd0' });
shop(108, -112, 28, 22, 7, '#c0392b', ['SAKURA SUSHI'], '#111111', '#ffcf3a', { face: 1, mmColor: '#d94f3d' });
// NW bank / supermarket / school / townhouses
bankBldg(-48, -48, 'BANK OF AMERICA');
supermarket(-72, -140);
school(-72, -238);
townhouseRow(-150, -120, 6, 0);
townhouseRow(-150, -150, 6, 0);
townhouseRow(-210, -120, 6, 0);
townhouseRow(-210, -150, 6, 0);
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
  streetLights.push({ head: head, glow: glow, pool: pool });
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
  streetlight(40, 33, 0, 1);                                        // RaceTrac/Dunkin
})();
var lampsOn = false;
function setLamps(on) {
  if (on === lampsOn) return;
  lampsOn = on;
  for (var i = 0; i < streetLights.length; i++) {
    var L = streetLights[i];
    L.head.material = on ? lampOnM : lampOffM;
    L.glow.visible = on;
    L.pool.visible = on;
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
var SKINS = [0xe8b88a, 0xc98d5e, 0x8a5a38, 0xf0cba2, 0x6e4428];
var SHIRTS = ['#c04434', '#3d6fb8', '#4a9a50', '#d8c447', '#b86fb8', '#e8e4da', '#e07f3c', '#4ab0b0'];
var PANTS = ['#31435c', '#4a4a4e', '#6e5a3a', '#3a5a3a', '#7c8288'];
var HAIRC = [0x2a1c10, 0x4a3520, 0x111111, 0x777060, 0x8a5a20];
var eyeMat = lamb({ color: 0x1a1a1a });

function buildPerson(shirtC, pantsC, skinC, opts) {
  opts = opts || {};
  var g = new THREE.Group();
  var skin = lamb({ color: skinC });
  var shirt = lamb({ map: clothTex(shirtC) });
  var pants = lamb({ map: clothTex(pantsC) });
  var shoeM = lamb({ color: 0x26221e });
  var legGeo = new THREE.CylinderGeometry(0.075, 0.06, 0.85, 8); legGeo.translate(0, -0.425, 0);
  var legL = new THREE.Mesh(legGeo, pants); legL.position.set(-0.11, 0.85, 0);
  var legR = new THREE.Mesh(legGeo, pants); legR.position.set(0.11, 0.85, 0);
  var shoeGeo = new THREE.BoxGeometry(0.13, 0.09, 0.26);
  var shL = new THREE.Mesh(shoeGeo, shoeM); shL.position.set(0, -0.81, 0.05); legL.add(shL);
  var shR = new THREE.Mesh(shoeGeo, shoeM); shR.position.set(0, -0.81, 0.05); legR.add(shR);
  var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.155, 0.58, 10), shirt); torso.scale.z = 0.72; torso.position.y = 1.14;
  var hips = sph(0.155, pants, 0, 0.87, 0); hips.scale.set(1, 0.5, 0.72);
  var shoulders = sph(0.17, shirt, 0, 1.42, 0); shoulders.scale.set(1, 0.5, 0.72);
  function makeArm(side) {
    var arm = new THREE.Group(); arm.position.set(0.235 * side, 1.4, 0);
    var sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.05, 0.26, 8), shirt); sleeve.position.y = -0.13; arm.add(sleeve);
    var fore = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.04, 0.34, 8), skin); fore.position.y = -0.42; arm.add(fore);
    arm.add(sph(0.05, skin, 0, -0.62, 0, 8, 6)); arm.rotation.z = 0.08 * side; return arm;
  }
  var armL = makeArm(-1), armR = makeArm(1);
  var neck = cyl(0.05, 0.055, 0.09, 8, skin, 0, 1.46, 0);
  var head = sph(0.155, skin, 0, 1.585, 0, 12, 10);
  var hairMat = lamb({ color: opts.hairColor !== undefined ? opts.hairColor : HAIRC[(Math.random() * HAIRC.length) | 0] });
  var hair = new THREE.Mesh(new THREE.SphereGeometry(0.162, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat); hair.position.set(0, 1.59, -0.012); hair.rotation.x = -0.15;
  g.add(legL, legR, torso, hips, shoulders, armL, armR, neck, head, hair);
  g.add(sph(0.022, skin, 0, 1.565, 0.148, 6, 5));
  if (opts.shades) g.add(box(0.15, 0.045, 0.03, eyeMat, 0, 1.61, 0.14));
  else { g.add(sph(0.018, eyeMat, -0.055, 1.615, 0.135, 6, 5)); g.add(sph(0.018, eyeMat, 0.055, 1.615, 0.135, 6, 5)); }
  var shadow = blobShadow(0.42, 0.42, 0.16); g.add(shadow);
  g.userData.limbs = { legL: legL, legR: legR, armL: armL, armR: armR };
  g.userData.shadow = shadow;
  var sc = 0.95 + Math.random() * 0.12; g.scale.set(sc, sc, sc);
  return g;
}

var npcs = [];
var NPC_COUNT = 28;
var WALK = { x0: -270, x1: 150, z0: -160, z1: 150 };
function randTarget() { return [WALK.x0 + Math.random() * (WALK.x1 - WALK.x0), WALK.z0 + Math.random() * (WALK.z1 - WALK.z0)]; }
function spawnNPC() {
  var mesh = buildPerson(SHIRTS[(Math.random() * SHIRTS.length) | 0], PANTS[(Math.random() * PANTS.length) | 0], SKINS[(Math.random() * SKINS.length) | 0]);
  var start = randTarget(), tgt = randTarget();
  var n = { mesh: mesh, x: start[0], z: start[1], tx: tgt[0], tz: tgt[1], hp: 100, state: 'walk', speed: 1.5 + Math.random() * 1.1, phase: Math.random() * 9, pause: 0, fleeT: 0, fleeDX: 0, fleeDZ: 0, downT: 0, hurtFlash: 0 };
  mesh.position.set(n.x, 0, n.z); mesh.userData.npc = n;
  scene.add(mesh); npcs.push(n); return n;
}
for (var ni = 0; ni < NPC_COUNT; ni++) spawnNPC();

// dealer
var dealer = buildPerson('#1b1b1f', '#141418', 0xc98d5e, { shades: true, hairColor: 0x111111 });
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
var clerk = buildPerson('#c0392b', '#31435c', SKINS[1], { hairColor: 0x2a1c10 });
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
  var g = buildPerson('#1e3a6e', '#16233f', SKINS[(Math.random() * SKINS.length) | 0],
    { cap: true, capColor: 0x14213f, shades: true, hairColor: 0x111111 });
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
function desiredCops() { return state.wanted === 0 ? 3 : 3 + state.wanted * 2; }
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
    if (alive < desiredCops() && copSpawnT <= 0) { spawnCop(state.wanted >= 2); copSpawnT = 1.2; }
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
        c.stolen = false; c.jacked = false;
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
function nearestStealableCar() {
  var best = null, bestD = 30;
  for (var i = 0; i < cars.length; i++) {
    var c = cars[i];
    if (c.exploded) continue;
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
  driving = c;
  c.stolen = true;
  c.drivenBy = null;
  if (c.carHP === undefined) c.carHP = 100;
  c.pspeed = c.jacked ? 0 : c.speed;   // take over at its current speed on a fresh jack
  var g = c.car.group;
  if (!c.jacked) {
    c.jacked = true;
    kickDriver(c);
    popup2('CARJACKED');
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
function exitCar() {
  if (!driving) return;
  var g = driving.car.group;
  var h = g.rotation.y;
  var px = g.position.x + Math.cos(h + Math.PI / 2) * 2.6;
  var pz = g.position.z - Math.sin(h + Math.PI / 2) * 2.6;
  var p = pushOut(px, pz, 0.55);
  player.x = p.x; player.z = p.z; player.y = EYE; player.vy = 0;
  driving.pspeed = 0;
  if (isClient()) netToHost({ t: 'park', i: cars.indexOf(driving), x: Math.round(g.position.x * 10) / 10, z: Math.round(g.position.z * 10) / 10, ry: Math.round(h * 100) / 100 });
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
      if (n.downT <= 0) { var s = randTarget(); n.x = s[0]; n.z = s[1]; var t = randTarget(); n.tx = t[0]; n.tz = t[1]; n.hp = 100; n.state = 'walk'; m.rotation.x = 0; if (m.userData.shadow) m.userData.shadow.visible = true; }
      m.position.set(n.x, m.position.y, n.z); continue;
    }
    var vx = 0, vz = 0, spd = n.speed;
    if (n.state === 'flee') {
      n.fleeT -= dt; spd = 4.6; vx = n.fleeDX; vz = n.fleeDZ; if (n.fleeT <= 0) n.state = 'walk';
    } else {
      if (n.pause > 0) { n.pause -= dt; animPerson(m, 0, dt); continue; }
      var dx = n.tx - n.x, dz = n.tz - n.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d < 1) { var tt = randTarget(); n.tx = tt[0]; n.tz = tt[1]; if (Math.random() < 0.25) n.pause = 1 + Math.random() * 3; continue; }
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
var ac = null, ambientStarted = false, rainGain = null;
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
  var c = document.createElement('canvas'); c.width = 128; c.height = 32;
  var g = c.getContext('2d');
  g.font = 'bold 20px Courier New'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.strokeStyle = '#000'; g.lineWidth = 5; g.strokeText(text, 64, 16);
  g.fillStyle = '#8fd0e8'; g.fillText(text, 64, 16);
  var t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter;
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  sp.scale.set(2.6, 0.65, 1);
  return sp;
}
function hashStr(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function ensureRemote(id) {
  if (net.remotes[id]) return net.remotes[id];
  var hsh = hashStr(id);
  var mesh = buildPerson(SHIRTS[hsh % SHIRTS.length], PANTS[hsh % PANTS.length], SKINS[hsh % SKINS.length], { hairColor: HAIRC[hsh % HAIRC.length] });
  mesh.userData.remoteId = id;
  scene.add(mesh);
  var tag = makeTag(id.slice(0, 6));
  scene.add(tag);
  var r = { id: id, mesh: mesh, tag: tag, x: -72, z: -97, y: 0, tx: -72, tz: -97, ty: 0, yaw: 0, tyaw: 0, h: 0, drv: 0, dead: 0, w: 0, phase: 0, lx: -72, lz: -97 };
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
      if (sc && !sc.exploded) { if (!sc.jacked) { kickDriver(sc); sc.jacked = true; } sc.stolen = true; sc.drivenBy = conn.peer; }
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
  net.peer = new Peer();
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
  net.peer = new Peer();
  net.peer.on('open', function () {
    net.id = net.peer.id;
    var c = net.peer.connect(hostId, { reliable: false });
    c.on('open', function () {
      document.getElementById('netErr').classList.add('hidden');
      onConn(c);
      startGame();
    });
    c.on('error', function (e) { netError('Could not join: ' + e.type); });
  });
  net.peer.on('error', function (e) { netError('Could not join: ' + e.type + ' (check the code / internet)'); });
}
function updateNet(dt) {
  if (!net.peer) return;
  // broadcast our state ~14x/s
  net.sendT -= dt;
  if (net.sendT <= 0 && netActive()) {
    net.sendT = 0.07;
    var msg = { t: 's', id: net.id, x: Math.round(player.x * 10) / 10, y: Math.round(player.y * 10) / 10, z: Math.round(player.z * 10) / 10, yaw: Math.round(yaw * 100) / 100, drv: driving ? 1 : 0, h: driving ? Math.round(driving.car.group.rotation.y * 100) / 100 : 0, dead: state.dead ? 1 : 0, w: state.wanted };
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
          (cc.exploded ? 1 : 0) | (cc.berserk ? 2 : 0) | (cc.burning ? 4 : 0) | (cc.stolen ? 8 : 0)]);
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
    c.exploded = !!(fl & 1); c.berserk = !!(fl & 2); c.burning = !!(fl & 4); c.stolen = !!(fl & 8);
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
  var eyeFloor = (inside ? INT.y : 0) + EYE;
  if (player.y <= eyeFloor) { player.y = eyeFloor; player.vy = 0; player.grounded = true; }
  player.x = Math.max(-HALF + 1.2, Math.min(HALF - 1.2, player.x)); player.z = Math.max(-HALF + 1.2, Math.min(HALF - 1.2, player.z));
  var p = pushOut(player.x, player.z, 0.55, inside ? intColliders : colliders); player.x = p.x; player.z = p.z;
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
    else if (nearestStealableCar()) prompt.textContent = '[E] STEAL CAR';
    else prompt.textContent = '';
  }
}
function updateHUD() { document.getElementById('money').textContent = '$' + state.money; document.getElementById('hpBar').style.width = Math.max(0, state.hp) + '%'; }

// ---------------- main loop ----------------
var last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  var dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!state.running) { renderer.render(scene, camera); return; }
  T += dt;
  updatePlayer(dt); updateNPCs(dt); updateCops(dt); updateCars(dt); updateRockets(dt); updateDrops(dt); updateCash(dt); updatePuffs(dt); updateBooms(dt); updateDecals(dt); updateEnv(dt); updateNet(dt); updateHUD(); drawMinimap();
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
  tryAttack: tryAttack, setEquipped: setEquipped,
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
  net: net, startGame: startGame, hostGame: hostGame, joinGame: joinGame,
  tick: function (dt) { T += dt; updatePlayer(dt); updateNPCs(dt); updateCops(dt); updateCars(dt); updateRockets(dt); updateDrops(dt); updateCash(dt); updatePuffs(dt); updateBooms(dt); updateDecals(dt); updateEnv(dt); updateNet(dt); renderer.render(scene, camera); }
};

})();
