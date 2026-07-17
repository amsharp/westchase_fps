// Generate the new plane.js (WC_PLANE) from the user's model: embedded per-object
// geometry (original UVs) + baked per-object textures, transformed model->game
// (nose +Y -> +Z, up -Z -> +Y), with the same setControls/setGear contract the
// flight code already calls. Crash debris + scorch decal reused from old plane.js.
const fs = require('fs');
const GEO = JSON.parse(fs.readFileSync('tools/planegen/planegeo.json', 'utf8'));
const cur = fs.readFileSync('plane.js', 'utf8').split('\n');
const slice = (a, b) => cur.slice(a - 1, b).join('\n');   // 1-indexed inclusive
const slabSrc = slice(31, 71);        // slab + bullet
const debrisSrc = slice(285, 336);    // buildDebris
const bulletMatSrc = slice(338, 339); // bulletMat
const scorchSrc = slice(341, 381);    // scorchTexture
const utilSrc = slice(383, 386);      // clamp/clamp01/smooth

// textures -> data URLs (body 512 downscaled would need a lib; keep baked sizes)
const TEX = {};
for (const k of Object.keys(GEO)) {
  const png = fs.readFileSync('tools/planegen/tex/' + k + '.png');
  TEX[k] = 'data:image/png;base64,' + png.toString('base64');
}

// transform constants
const CX = 0, CY = 1.2, CZ = -0.8, SCALE = 1.85;
const xb = GEO.body.p; // for AABB not reliable; use known model AABB
const LENGTH = +(7.95 * SCALE).toFixed(3), SPAN = +(6.58 * SCALE).toFixed(3), GC = +((0.07 - CZ) * SCALE).toFixed(3);

const out = `// plane.js — WC_PLANE: the flyable Learjet 35 (user's Blender model).
// Built from 8 named objects (body, gearNose/L/R, aileronL/R, elevator, rudder)
// with per-object procedural livery textures baked on the ORIGINAL UVs. Model
// space is nose +Y / up -Z; a +90deg X-rotation + scale brings it into the game's
// +Z=forward / +Y=up / +X=right-wing frame. Same build/setControls/setGear
// contract game.js already drives. Textures embedded as data-URLs (editable).
var WC_PLANE = (function () {
  'use strict';
  // ---- model->game transform (nose +Y -> +Z, up -Z -> +Y), recentred on the CG ----
  var CX = ${CX}, CY = ${CY}, CZ = ${CZ}, SCALE = ${SCALE};
  function gpt(x, y, z) { return [(x - CX) * SCALE, -(z - CZ) * SCALE, (y - CY) * SCALE]; }
  // dimensions reported to the flight code (game space)
  var GROUND_CLEARANCE = ${GC}, LENGTH = ${LENGTH}, SPAN = ${SPAN};
  // control-surface + gear deflection limits (rad) — same convention as before
  var AIL_MAX = 0.4, ELV_MAX = 0.35, RUD_MAX = 0.4;
  var GN_RET = -1.55, GL_RET = 1.55, GR_RET = -1.55;

  var GEO = ${JSON.stringify(GEO)};
  var TEX = ${JSON.stringify(TEX)};
  var _tex = {};
  function getTex(name) {
    if (_tex[name]) return _tex[name];
    var T = window.THREE;
    var tex = new T.Texture();
    var im = new Image();
    im.onload = (function (t) { return function () { t.image = im; t.needsUpdate = true; }; })(tex);
    im.src = TEX[name];
    tex.anisotropy = 2;
    _tex[name] = tex;
    return tex;
  }

  function build() {
    var T = window.THREE;
    var group = new T.Group();
    var parts = {};
    for (var name in GEO) {
      if (!GEO.hasOwnProperty(name)) continue;
      var o = GEO[name];
      var moving = (name !== 'body');
      var pv = o.pivot ? gpt(o.pivot[0], o.pivot[1], o.pivot[2]) : [0, 0, 0];
      var P = o.p, N = o.n, pos = [], nor = [], k, g;
      for (k = 0; k < P.length; k += 3) {
        g = gpt(P[k], P[k + 1], P[k + 2]);
        if (moving) { g[0] -= pv[0]; g[1] -= pv[1]; g[2] -= pv[2]; }
        pos.push(g[0], g[1], g[2]);
        nor.push(N[k], -N[k + 2], N[k + 1]);   // normal under the same rotation
      }
      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new T.Float32BufferAttribute(o.u, 2));
      geo.setIndex(o.i);
      var mesh = new T.Mesh(geo, new T.MeshLambertMaterial({ map: getTex(name) }));
      if (moving) { var sg = new T.Group(); sg.position.set(pv[0], pv[1], pv[2]); sg.add(mesh); parts[name] = sg; group.add(sg); }
      else { parts.body = mesh; group.add(mesh); }
    }
    setControls(parts, 0, 0, 0);
    setGear(parts, 0);
    return { group: group, parts: parts };
  }

  // setControls(parts, aileron, elevator, rudder) — each -1..+1.
  function setControls(parts, aileron, elevator, rudder) {
    var a = clamp(aileron), e = clamp(elevator), r = clamp(rudder);
    if (parts.aileronR) parts.aileronR.rotation.x = a * AIL_MAX;
    if (parts.aileronL) parts.aileronL.rotation.x = -a * AIL_MAX;
    if (parts.elevator) parts.elevator.rotation.x = e * ELV_MAX;
    if (parts.rudder) parts.rudder.rotation.y = -r * RUD_MAX;
  }
  // setGear(parts, t) — 0 = deployed, 1 = retracted.
  function setGear(parts, t) {
    var s = smooth(clamp01(t));
    if (parts.gearNose) parts.gearNose.rotation.x = s * GN_RET;
    if (parts.gearL) parts.gearL.rotation.z = s * GL_RET;
    if (parts.gearR) parts.gearR.rotation.z = s * GR_RET;
  }

${slabSrc}

${debrisSrc}

${bulletMatSrc}

${scorchSrc}

${utilSrc}

  return {
    build: build,
    setControls: setControls,
    setGear: setGear,
    buildDebris: buildDebris,
    scorchTexture: scorchTexture,
    GROUND_CLEARANCE: GROUND_CLEARANCE,
    LENGTH: LENGTH,
    SPAN: SPAN
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = WC_PLANE;
`;
fs.writeFileSync('plane.js', out);
console.log('wrote plane.js:', (out.length / 1024).toFixed(0) + 'KB  (GC=' + GC + ' LENGTH=' + LENGTH + ' SPAN=' + SPAN + ')');
