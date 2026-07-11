// tools/animqa/gemini/lineup.js — NPC model LINEUP batches for the animqa
// record/review pipeline. Consumed by record.js:
//     NODE_PATH=... MODE=<mode> node record.js lineup:<batch> [outfile]
// Env:
//   MODE = idle | walk | run | carry   (default idle)
//   PER  = models per batch             (default 6)
//
// Renders a row of SPECIFIC, LABELED civilian models. Names are baked as 3D
// sprites above each character (parented to the mesh) so they survive record.js's
// off-screen RT capture (which never composites the DOM). Roster is enumerated
// via __wc.charRoster(): preset 0 = procedural PSX, 1..3 = PSX_SKINS (JESS/
// MARCUS/SPIKE), 4.. = Meshy civ meshes — 39 distinct models total (7 batches@6).
//
// idle: a static row facing the camera. walk/run: the row translates across the
// frame in profile (so foot-plant vs skating is judgeable) and wraps. carry:
// walk + a rotating set of accessories (bag/umbrella/cup/stroller/walker/dog/
// cane/bike/suitcase/skateboard) — updateAccessories() poses them inside tick().
const MODE = process.env.MODE || 'idle';
const PER = parseInt(process.env.PER || '6', 10);

function scenario(batch) {
  batch = parseInt(String(batch), 10) || 0;
  const start = batch * PER;
  const secs = MODE === 'idle' ? 6 : 10;
  const setup = `(function(){
    var wc = window.__wc, T = window.THREE, MODE = ${JSON.stringify(MODE)}, PER = ${PER}, start = ${start};
    var R = wc.charRoster(); var names = R.names, maxP = R.presetMax;
    // stand in the quiet far end (matches the weapon clips' clean street) and
    // look along -Z; the row sits ~6m in front, walkers cross +X.
    wc.teleport(0, 300); wc.setYaw(0); wc.setPitch(-0.03);
    if (wc.hideVM) wc.hideVM(true);                 // hide the FP fists/weapon so the row is unobstructed
    var CZ = 294;
    function label(txt){
      var cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
      var x = cv.getContext('2d');
      x.fillStyle = 'rgba(0,0,0,0.66)'; x.fillRect(0,0,256,64);
      x.strokeStyle = '#0af'; x.lineWidth = 3; x.strokeRect(1.5,1.5,253,61);
      x.fillStyle = '#fff'; x.font = 'bold 34px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(txt, 128, 34);
      var tx = new T.CanvasTexture(cv); tx.minFilter = T.LinearFilter; tx.needsUpdate = true;
      var sp = new T.Sprite(new T.SpriteMaterial({ map: tx, depthTest: false, depthWrite: false }));
      sp.scale.set(1.7, 0.42, 1); return sp;
    }
    var ACCS = ['shopping_bags','umbrella','coffee_cup','stroller','walker','dog','cane','bicycle','suitcase','skateboard'];
    var lu = { chars: [], phase: 0, last: 0, mode: MODE, W: PER * 1.7 / 2 + 2.2 };
    window.__lu = lu;
    for (var k = 0; k < PER; k++){
      var preset = start + k; if (preset >= maxP) break;
      var cfg = wc.randomCharConfig(); cfg.preset = preset;
      cfg.hat = cfg.glasses = cfg.extra = 0;
      var m; try { m = wc.buildCharacter(cfg); } catch(e){ continue; }
      m.id = k + 1;                                   // avoid NaN in skinned idle (m.id % 10)
      var x0 = (k - (PER - 1) / 2) * 1.75;
      m.position.set(x0, 0, CZ);
      m.rotation.y = (MODE === 'idle') ? 0 : Math.PI / 2;   // idle faces +Z(camera); moving faces +X(profile)
      wc.scene.add(m);
      var nm = names[preset] || ('P' + preset);
      var spr = label(nm); spr.position.set(0, 2.35, 0); m.add(spr);
      var rec = { mesh: m, x: x0, name: nm };
      if (MODE === 'carry'){
        var an = ACCS[k % ACCS.length];
        var nsh = { mesh: m, x: x0, z: CZ, acc: null, speed: 1.4 };
        try { wc.attachAccessory(nsh, an); } catch(e){}
        rec.npc = nsh; rec.acc = an;
      }
      lu.chars.push(rec);
    }
  })();`;
  const step = `(function(t){
    var lu = window.__lu, wc = window.__wc; if (!lu) return;
    var dt = t - lu.last; if (dt < 0) dt = 0; if (dt > 0.1) dt = 0.1; lu.last = t;
    var spd = lu.mode === 'run' ? 4.6 : (lu.mode === 'idle' ? 0 : 1.4);
    lu.phase += spd * dt * 3.4;
    for (var i = 0; i < lu.chars.length; i++){
      var c = lu.chars[i];
      if (spd > 0){
        c.x += spd * dt; if (c.x > lu.W) c.x -= lu.W * 2;
        c.mesh.position.x = c.x;
        if (c.npc) c.npc.x = c.x;                    // side/leash accessories read owner world pos
      }
      wc.animPerson(c.mesh, spd, dt, lu.phase + i * 0.9);
    }
  })(t);`;
  return { setup: setup, secs: secs, step: step };
}
module.exports = { scenario: scenario };
