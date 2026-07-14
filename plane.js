// plane.js — procedural low-poly Learjet 35 business jet for Westchase FPS.
// Plain-file ES5 / Three.js r149 (global THREE from the UMD build). Do NOT use
// THREE at load time — only inside the exported functions.
//
// COORDINATE / ORIENTATION CONTRACT (physics agent depends on this EXACTLY):
//   +Z = forward (nose direction)
//   +Y = up
//   +X = right wing  (left wing = -X)
//   Origin at the center of mass ~= the wing mid-chord point.
// Scale is in world units (= meters): fuselage length ~14.6 (Z),
// wingspan ~11.8 (X, tip-to-tip including tip tanks), fuselage dia ~1.5,
// tail height ~3.6. Gear puts the wheel contact point at y = -1.6, so the
// fuselage centerline (the group origin) sits 1.6 above ground when parked.
//   WC_PLANE.GROUND_CLEARANCE = 1.6  (origin -> wheel contact, gear deployed)
var WC_PLANE = (function () {
  'use strict';

  var GROUND_CLEARANCE = 1.6; // origin(CG) -> wheel contact point, gear down
  var LENGTH = 14.6;          // nose tip (+Z) to tail tip (-Z)
  var SPAN = 11.8;            // tip-tank to tip-tank across X
  var SCALE = 1.3;            // v1.68.2: whole model +30% (user: "a bit too small")

  // ---- deflection / retract constants (the sign convention lives here) ----
  var AIL_MAX = 0.4;   // rad, aileron
  var ELV_MAX = 0.35;  // rad, elevator
  var RUD_MAX = 0.4;   // rad, rudder
  var GN_RET = -1.55;  // nose gear retracted rotation.x (folds forward/up)
  var GL_RET = 1.55;   // left main retracted rotation.z (folds inward/up)
  var GR_RET = -1.55;  // right main retracted rotation.z (folds inward/up)

  // Build a solid slab (thin faceted prism) from 4 planar corners + a
  // thickness offset vector. corners: array of 4 [x,y,z] forming a quad in
  // consistent order; tv = [dx,dy,dz] to the opposite face. Low-poly, 8 verts.
  function slab(corners, tv, mat) {
    var T = window.THREE;
    var pos = [];
    var i;
    for (i = 0; i < 4; i++) pos.push(corners[i][0], corners[i][1], corners[i][2]);
    for (i = 0; i < 4; i++) pos.push(corners[i][0] + tv[0], corners[i][1] + tv[1], corners[i][2] + tv[2]);
    var idx = [
      0, 1, 2, 0, 2, 3,          // A face
      4, 6, 5, 4, 7, 6           // B face (reversed)
    ];
    for (i = 0; i < 4; i++) {     // side quads
      var j = (i + 1) % 4;
      idx.push(i, j, j + 4, i, j + 4, i + 4);
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return new T.Mesh(g, mat);
  }

  // A tip-tank / bullet fairing: pointed nose (+Z) + body + rounded tail.
  function bullet(radius, len, mat) {
    var T = window.THREE;
    var grp = new T.Group();
    var body = new T.Mesh(new T.CylinderGeometry(radius, radius, len * 0.55, 12), mat);
    body.rotation.x = Math.PI / 2; // axis -> Z
    grp.add(body);
    var nose = new T.Mesh(new T.ConeGeometry(radius, len * 0.32, 12), mat);
    nose.rotation.x = -Math.PI / 2; // tip toward +Z
    nose.position.z = len * 0.275 + len * 0.16;
    grp.add(nose);
    var tail = new T.Mesh(new T.SphereGeometry(radius, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    tail.rotation.x = Math.PI / 2; // dome toward -Z
    tail.position.z = -len * 0.275;
    grp.add(tail);
    return grp;
  }

  // A strut + black wheel gear leg, hanging in -Y, pivot at group origin (top).
  function gearLeg(strutLen, wheelR, wheelW, strutMat, tireMat, hubMat) {
    var T = window.THREE;
    var grp = new T.Group();
    var strut = new T.Mesh(new T.CylinderGeometry(0.06, 0.05, strutLen, 8), strutMat);
    strut.position.y = -strutLen / 2;
    grp.add(strut);
    var wheel = new T.Mesh(new T.CylinderGeometry(wheelR, wheelR, wheelW, 14), tireMat);
    wheel.rotation.z = Math.PI / 2; // rolling axis -> X
    wheel.position.y = -strutLen;
    grp.add(wheel);
    var hub = new T.Mesh(new T.CylinderGeometry(wheelR * 0.42, wheelR * 0.42, wheelW * 1.05, 8), hubMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.y = -strutLen;
    grp.add(hub);
    return grp;
  }

  function build() {
    var T = window.THREE;
    var group = new T.Group();
    var parts = {};

    // ---- materials ----
    var white = new T.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.55, metalness: 0.12, flatShading: true });
    var whiteS = new T.MeshStandardMaterial({ color: 0xe9ebef, roughness: 0.6, metalness: 0.12, flatShading: true, side: T.DoubleSide });
    var glass = new T.MeshStandardMaterial({ color: 0x0b1622, roughness: 0.18, metalness: 0.65, flatShading: true, side: T.DoubleSide });
    var engine = new T.MeshStandardMaterial({ color: 0x3b3e44, roughness: 0.5, metalness: 0.55, flatShading: true });
    var engDark = new T.MeshStandardMaterial({ color: 0x141518, roughness: 0.7, metalness: 0.3 });
    var accent = new T.MeshStandardMaterial({ color: 0x123a63, roughness: 0.45, metalness: 0.2, side: T.DoubleSide });
    var steel = new T.MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.4, metalness: 0.85 });
    var tire = new T.MeshStandardMaterial({ color: 0x101012, roughness: 0.85, metalness: 0.05 });
    var hub = new T.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.35, metalness: 0.8 });

    // ---- fuselage (lathe of revolution, axis Y then rotated to Z) ----
    // profile: Vector2(radius, zpos). tail at -6.4, nose tip at +8.2.
    var prof = [
      [0.04, -6.4], [0.34, -6.0], [0.55, -5.0], [0.7, -3.9], [0.75, -2.0],
      [0.76, 0.0], [0.76, 2.0], [0.73, 3.6], [0.66, 5.0], [0.5, 6.2],
      [0.28, 7.3], [0.04, 8.2]
    ];
    var pts = [];
    for (var p = 0; p < prof.length; p++) pts.push(new T.Vector2(prof[p][0], prof[p][1]));
    var fuseGeo = new T.LatheGeometry(pts, 14);
    var body = new T.Mesh(fuseGeo, white);
    body.rotation.x = Math.PI / 2; // lathe Y-axis -> world Z
    group.add(body);
    parts.body = body;

    // cheatline / window band stripe (thin dark box each side at window height)
    var stripeGeo = new T.BoxGeometry(0.04, 0.16, 4.0);
    var stripeL = new T.Mesh(stripeGeo, accent); stripeL.position.set(-0.735, 0.16, 2.4); group.add(stripeL);
    var stripeR = new T.Mesh(stripeGeo, accent); stripeR.position.set(0.735, 0.16, 2.4); group.add(stripeR);

    // ---- cabin windows: row of 6 small dark discs each side ----
    var winGeo = new T.CircleGeometry(0.1, 10);
    for (var w = 0; w < 6; w++) {
      var wz = 4.2 - w * 0.62;
      var wl = new T.Mesh(winGeo, glass);
      wl.position.set(-0.752, 0.24, wz); wl.rotation.y = -Math.PI / 2; group.add(wl);
      var wr = new T.Mesh(winGeo, glass);
      wr.position.set(0.752, 0.24, wz); wr.rotation.y = Math.PI / 2; group.add(wr);
    }

    // ---- cockpit windscreen: dark canopy patch on top-front + side panes ----
    var canopy = slab(
      [[-0.45, 0.58, 5.15], [0.45, 0.58, 5.15], [0.2, 0.34, 6.35], [-0.2, 0.34, 6.35]],
      [0, -0.04, 0], glass);
    group.add(canopy);
    var paneL = slab(
      [[-0.6, 0.5, 5.1], [-0.58, 0.15, 6.2], [-0.5, -0.05, 6.15], [-0.62, 0.15, 5.1]],
      [-0.03, 0, 0], glass);
    group.add(paneL);
    var paneR = slab(
      [[0.6, 0.5, 5.1], [0.62, 0.15, 5.1], [0.5, -0.05, 6.15], [0.58, 0.15, 6.2]],
      [0.03, 0, 0], glass);
    group.add(paneR);

    // ---- wings: low-mounted, swept, tapered slabs ----
    var wingY = -0.32, wingTh = 0.16;
    // right wing planform corners (x,z): rootLE, tipLE, tipTE, rootTE
    var rw = [[0.62, wingY, 1.55], [5.35, wingY, -0.35], [5.35, wingY, -1.35], [0.62, wingY, -1.2]];
    group.add(slab(rw, [0, wingTh, 0], whiteS));
    var lw = [[-0.62, wingY, 1.55], [-0.62, wingY, -1.2], [-5.35, wingY, -1.35], [-5.35, wingY, -0.35]];
    group.add(slab(lw, [0, wingTh, 0], whiteS));

    // ---- wingtip fuel tanks (Learjet signature) ----
    var tankR = new T.Group();
    var tR = bullet(0.28, 2.5, white); tR.position.set(5.4, wingY + 0.04, 0.05); group.add(tR);
    var tL = bullet(0.28, 2.5, white); tL.position.set(-5.4, wingY + 0.04, 0.05); group.add(tL);

    // ---- rear-fuselage turbofan nacelles + pylons ----
    function makeEngine(sx) {
      var g = new T.Group();
      var nac = new T.Mesh(new T.CylinderGeometry(0.42, 0.4, 1.95, 14), engine);
      nac.rotation.x = Math.PI / 2; g.add(nac);
      // intake lip (dark ring) + fan face
      var lip = new T.Mesh(new T.CylinderGeometry(0.44, 0.42, 0.14, 14), engDark);
      lip.rotation.x = Math.PI / 2; lip.position.z = 0.95; g.add(lip);
      var fan = new T.Mesh(new T.CircleGeometry(0.36, 14), engDark);
      fan.position.z = 1.0; g.add(fan);
      // exhaust cone
      var ex = new T.Mesh(new T.ConeGeometry(0.34, 0.5, 14), engDark);
      ex.rotation.x = -Math.PI / 2; ex.position.z = -1.1; g.add(ex);
      // pylon to fuselage
      var pyl = new T.Mesh(new T.BoxGeometry(0.5, 0.18, 1.0), engine);
      pyl.position.set(-sx * 0.42, 0, 0); g.add(pyl);
      g.position.set(sx * 1.02, 0.18, -3.55);
      return g;
    }
    parts.engineR = makeEngine(1); group.add(parts.engineR);
    parts.engineL = makeEngine(-1); group.add(parts.engineL);

    // ---- cruciform tail: vertical fin + mid-high horizontal stab ----
    // vertical fin (fixed portion, LE -> rudder hinge)
    var fin = slab(
      [[-0.09, 0.55, -4.3], [-0.09, 2.85, -5.5], [-0.09, 2.85, -5.95], [-0.09, 0.55, -5.85]],
      [0.18, 0, 0], whiteS);
    group.add(fin);
    // horizontal stabilizer (fixed portion), mounted partway up the fin
    var stabY = 2.35;
    var stab = slab(
      [[-2.15, stabY, -5.45], [2.15, stabY, -5.45], [2.15, stabY, -5.95], [-2.15, stabY, -5.95]],
      [0, 0.1, 0], whiteS);
    group.add(stab);
    // small dorsal fillet where fin meets fuselage
    var fillet = slab(
      [[-0.06, 0.55, -3.3], [-0.06, 0.62, -4.3], [-0.06, 0.55, -4.35], [-0.06, 0.5, -3.4]],
      [0.12, 0, 0], whiteS);
    group.add(fillet);

    // ================= HINGED CONTROL SURFACES =================
    // Each is a Group whose origin sits ON the hinge line; the surface
    // geometry extends AFT (-Z) in local space so a local rotation deflects it.

    // Ailerons: outboard trailing edge of each wing. hinge axis ~ X.
    // local slab: span x in [-1,1], extends aft to z=-0.5.
    function aileron() {
      var g = new T.Group();
      g.add(slab([[-1.0, 0, 0], [1.0, 0, 0], [1.0, 0, -0.5], [-1.0, 0, -0.5]], [0, -0.08, 0], whiteS));
      return g;
    }
    parts.aileronR = aileron(); parts.aileronR.position.set(4.3, wingY + 0.04, -1.32); group.add(parts.aileronR);
    parts.aileronL = aileron(); parts.aileronL.position.set(-4.3, wingY + 0.04, -1.32); group.add(parts.aileronL);

    // Elevators: trailing edge of each horizontal-stab half. hinge axis ~ X.
    function elevator() {
      var g = new T.Group();
      g.add(slab([[-0.95, 0, 0], [0.95, 0, 0], [0.95, 0, -0.4], [-0.95, 0, -0.4]], [0, -0.06, 0], whiteS));
      return g;
    }
    parts.elevR = elevator(); parts.elevR.position.set(1.12, stabY + 0.05, -5.95); group.add(parts.elevR);
    parts.elevL = elevator(); parts.elevL.position.set(-1.12, stabY + 0.05, -5.95); group.add(parts.elevL);

    // Rudder: trailing edge of the vertical fin. hinge axis ~ Y (vertical).
    // local slab in the Z-Y plane, thickness along X, extends aft (-Z).
    parts.rudder = new T.Group();
    parts.rudder.add(slab(
      [[-0.07, -1.15, 0], [-0.07, 1.15, 0], [-0.07, 1.05, -0.5], [-0.07, -1.15, -0.42]],
      [0.14, 0, 0], whiteS));
    parts.rudder.position.set(0, 1.7, -5.92); group.add(parts.rudder);

    // ================= LANDING GEAR =================
    // Nose gear: single wheel, folds forward/up. pivot at fuselage belly.
    parts.gearNose = gearLeg(0.72, 0.24, 0.16, steel, tire, hub);
    parts.gearNose.position.set(0, -0.72, 4.4);
    group.add(parts.gearNose);
    // Main gear: one under each wing root, folds inward/up.
    parts.gearR = gearLeg(0.86, 0.28, 0.2, steel, tire, hub);
    parts.gearR.position.set(1.0, -0.62, -0.35);
    group.add(parts.gearR);
    parts.gearL = gearLeg(0.86, 0.28, 0.2, steel, tire, hub);
    parts.gearL.position.set(-1.0, -0.62, -0.35);
    group.add(parts.gearL);

    // start deployed (parked-ready)
    setControls(parts, 0, 0, 0);
    setGear(parts, 0);

    group.scale.setScalar(SCALE);   // +30% overall (hinges/gear are children -> unaffected by uniform scale)
    return { group: group, parts: parts };
  }

  // setControls(parts, aileron, elevator, rudder) — inputs each in -1..+1.
  // Sign convention (documented so physics agent passes normalized commands):
  //   aileron = +1  -> ROLL RIGHT: right aileron UP, left aileron DOWN.
  //                    (TE up on a wing lowers its lift -> that wing drops.)
  //     rotation.x > 0 raises a surface's trailing edge (aft, -Z, toward +Y).
  //     aileronR.rotation.x = +cmd*MAX ; aileronL.rotation.x = -cmd*MAX.
  //   elevator = +1 -> PITCH UP (nose up): both elevator TEs UP.
  //     elev*.rotation.x = +cmd*MAX.
  //   rudder = +1   -> YAW RIGHT: rudder TE deflects to the RIGHT (+X), which
  //                    pushes the tail left and swings the nose right.
  //     rotation.y < 0 swings the aft edge toward +X, so rudder.rotation.y = -cmd*MAX.
  function setControls(parts, aileron, elevator, rudder) {
    var a = clamp(aileron), e = clamp(elevator), r = clamp(rudder);
    parts.aileronR.rotation.x = a * AIL_MAX;
    parts.aileronL.rotation.x = -a * AIL_MAX;
    parts.elevR.rotation.x = e * ELV_MAX;
    parts.elevL.rotation.x = e * ELV_MAX;
    parts.rudder.rotation.y = -r * RUD_MAX;
  }

  // setGear(parts, t) — t in [0..1]: 0 = fully DEPLOYED (down/parked),
  // 1 = fully RETRACTED (wheels tucked up). Smoothstep eased.
  function setGear(parts, t) {
    var s = smooth(clamp01(t));
    parts.gearNose.rotation.x = s * GN_RET; // folds forward/up
    parts.gearL.rotation.z = s * GL_RET;    // folds inward/up
    parts.gearR.rotation.z = s * GR_RET;    // folds inward/up
  }

  // buildDebris() — ~10 scattered wreckage meshes, each origin-centered,
  // ~0.5-2 units, charred + scorched-white. Physics agent positions them.
  function buildDebris() {
    var T = window.THREE;
    var charred = new T.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.95, metalness: 0.15, flatShading: true, side: T.DoubleSide });
    var scorch = new T.MeshStandardMaterial({ color: 0xcbc9c2, roughness: 0.85, metalness: 0.1, flatShading: true, side: T.DoubleSide });
    var tireM = new T.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.9, metalness: 0.05 });
    var engM = new T.MeshStandardMaterial({ color: 0x26282c, roughness: 0.7, metalness: 0.45, flatShading: true });
    var out = [];

    // 1. bent fuselage panel (curved thin slab, scorched)
    var panelGeo = new T.CylinderGeometry(0.9, 0.9, 1.6, 8, 1, true, 0, Math.PI * 0.9);
    var panel = new T.Mesh(panelGeo, scorch); panel.rotation.z = Math.PI / 2; out.push(panel);

    // 2. broken wing chunk WITH a tip tank
    var wingChunk = new T.Group();
    wingChunk.add(slab([[-0.9, 0, 0.5], [0.9, 0, 0.35], [0.9, 0, -0.4], [-0.9, 0, -0.5]], [0, 0.12, 0], scorch));
    var tnk = bulletMat(0.24, 1.6, charred); tnk.position.set(0.95, 0.06, 0.0); wingChunk.add(tnk);
    out.push(wingChunk);

    // 3. tail fin piece (charred triangular slab)
    out.push(slab([[0, -0.6, 0.3], [0, 0.7, -0.2], [0, 0.6, -0.5], [0, -0.6, -0.4]], [0.1, 0, 0], charred));

    // 4. engine nacelle (charred cylinder + exhaust)
    var nac = new T.Group();
    var nc = new T.Mesh(new T.CylinderGeometry(0.4, 0.36, 1.5, 12), engM); nc.rotation.x = Math.PI / 2; nac.add(nc);
    var ncf = new T.Mesh(new T.CircleGeometry(0.32, 12), charred); ncf.position.z = 0.76; nac.add(ncf);
    out.push(nac);

    // 5. wheel
    var wh = new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 0.2, 14), tireM); wh.rotation.z = Math.PI / 2; out.push(wh);

    // 6. cabin seat (base + back)
    var seat = new T.Group();
    seat.add(new T.Mesh(new T.BoxGeometry(0.5, 0.14, 0.5), charred));
    var back = new T.Mesh(new T.BoxGeometry(0.5, 0.5, 0.14), charred); back.position.set(0, 0.28, -0.2); seat.add(back);
    out.push(seat);

    // 7-10. jagged metal shards (irregular thin slabs, mixed charred/scorch)
    var shardPts = [
      [[-0.4, 0, 0.3], [0.5, 0, 0.1], [0.2, 0, -0.5], [-0.35, 0, -0.2]],
      [[-0.3, 0, 0.5], [0.3, 0, 0.35], [0.45, 0, -0.4], [-0.2, 0, -0.3]],
      [[-0.5, 0, 0.2], [0.35, 0, 0.4], [0.25, 0, -0.35], [-0.4, 0, -0.45]],
      [[-0.25, 0, 0.45], [0.45, 0, 0.15], [0.15, 0, -0.5], [-0.45, 0, -0.15]]
    ];
    for (var s = 0; s < shardPts.length; s++) {
      var sh = slab(shardPts[s], [0, 0.05, 0], (s % 2 ? charred : scorch));
      sh.rotation.set(Math.random() * 0.6, Math.random() * 6.28, Math.random() * 0.6);
      out.push(sh);
    }
    return out;
  }

  // bullet fairing built with an explicit material (for debris).
  function bulletMat(radius, len, mat) { return bullet(radius, len, mat); }

  // scorchTexture() — black smoldering burnt-ground scorch decal, 256px,
  // radial dark->transparent with charred cracks + faint ember flecks.
  function scorchTexture() {
    var T = window.THREE;
    var S = 256;
    var cv = document.createElement('canvas'); cv.width = cv.height = S;
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, S, S);
    var cx = S / 2, cy = S / 2;
    // base radial burn
    var g = ctx.createRadialGradient(cx, cy, 6, cx, cy, S * 0.5);
    g.addColorStop(0, 'rgba(6,5,4,0.96)');
    g.addColorStop(0.45, 'rgba(14,11,9,0.9)');
    g.addColorStop(0.72, 'rgba(30,22,16,0.55)');
    g.addColorStop(1, 'rgba(30,22,16,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, S * 0.5, 0, 6.2832); ctx.fill();
    // charred cracks radiating out
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 2;
    var i, a, r0, r1;
    for (i = 0; i < 14; i++) {
      a = Math.random() * 6.2832; r0 = 8 + Math.random() * 20; r1 = 60 + Math.random() * 60;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      var mx = cx + Math.cos(a + 0.2) * (r1 * 0.6), my = cy + Math.sin(a + 0.2) * (r1 * 0.6);
      ctx.quadraticCurveTo(mx, my, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    // faint ember-orange flecks
    for (i = 0; i < 40; i++) {
      a = Math.random() * 6.2832; r1 = Math.random() * S * 0.42;
      var x = cx + Math.cos(a) * r1, y = cy + Math.sin(a) * r1;
      var e = Math.random();
      ctx.fillStyle = e > 0.6 ? 'rgba(255,150,40,0.5)' : 'rgba(120,40,10,0.5)';
      ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    var tex = new T.CanvasTexture(cv);
    tex.magFilter = T.NearestFilter;
    tex.minFilter = T.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }

  // ---- small utils ----
  function clamp(v) { return v < -1 ? -1 : (v > 1 ? 1 : v); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function smooth(t) { return t * t * (3 - 2 * t); }

  return {
    build: build,
    setControls: setControls,
    setGear: setGear,
    buildDebris: buildDebris,
    scorchTexture: scorchTexture,
    GROUND_CLEARANCE: GROUND_CLEARANCE * SCALE,
    LENGTH: LENGTH * SCALE,
    SPAN: SPAN * SCALE
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = WC_PLANE;
