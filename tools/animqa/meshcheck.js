// tools/animqa/meshcheck.js — automated mesh-breakage detector for Westchase FPS.
//
// Drives every skinned character model through every animation clip, and each
// frame samples the skeleton's bone world-positions to flag "weird mesh
// breakage": NaN/Infinity transforms, bounding-box explosion (mesh blows up),
// bone detachment (a limb flies away from the body), vertical breakage (sinks
// through the floor / launches skyward), and near-T-pose collapse. Also checks
// the first-person weapon arms across pose / fire / reload.
//
// Run:  NODE_PATH=/opt/node22/lib/node_modules node tools/animqa/meshcheck.js
// Out:  tools/animqa/report.json  (+ ranked console summary; exit 1 if breakages)
//
// Headless, no game code changes — reads live state through window.__wc.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
const FRAMES = 12;                         // samples per clip cycle
const CLIPS = ['idle', 'walk', 'run', 'jab'];
// breakage thresholds (ratios vs. the model's own idle baseline, or absolute)
const TH = { explode: 1.8, detach: 2.6, sinkY: -0.6, flyY: 3.6, tpose: 1.55 };

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--no-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  const perr = [];
  page.on('pageerror', e => perr.push('PAGEERR ' + e.message));
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate(() => { __wc.start(); __wc.setWanted(0); __wc.state.hp = 100; });

  // --- skinned character sweep: sample bones on the LIVE spawned NPCs ---
  // (MESHY_LIST is IIFE-private; the live npcs give real, varied skinned meshes.)
  const charReport = await page.evaluate(() => {
    var out = [], MAX = 60, tagctr = 0, seen = {};
    function skelBones(g) {
      var bones = null;
      g.traverse(function (o) { if (o.isSkinnedMesh && o.skeleton) bones = o.skeleton.bones; });
      if (!bones && g.userData.skin) bones = g.userData.skin.bones || null;
      return bones;
    }
    function sample(g) {
      g.updateMatrixWorld(true);
      var bones = skelBones(g); if (!bones) return null;
      var V = g.position.constructor, pts = [];
      for (var i = 0; i < bones.length; i++) { var p = new V(); bones[i].getWorldPosition(p); pts.push([p.x, p.y, p.z]); }
      return pts;
    }
    function metrics(pts) {
      var nan = 0, cx = 0, cy = 0, cz = 0, n = pts.length;
      var minx=1e9,miny=1e9,minz=1e9,maxx=-1e9,maxy=-1e9,maxz=-1e9;
      for (var i = 0; i < n; i++) { var x=pts[i][0],y=pts[i][1],z=pts[i][2];
        if (!isFinite(x)||!isFinite(y)||!isFinite(z)) { nan++; continue; }
        cx+=x;cy+=y;cz+=z; if(x<minx)minx=x;if(y<miny)miny=y;if(z<minz)minz=z;
        if(x>maxx)maxx=x;if(y>maxy)maxy=y;if(z>maxz)maxz=z; }
      var m=n-nan; cx/=m;cy/=m;cz/=m;
      var dx=maxx-minx,dy=maxy-miny,dz=maxz-minz, diag=Math.sqrt(dx*dx+dy*dy+dz*dz), far=0;
      for (i=0;i<n;i++){var p=pts[i]; if(!isFinite(p[0]))continue;
        var d=Math.sqrt((p[0]-cx)*(p[0]-cx)+(p[1]-cy)*(p[1]-cy)+(p[2]-cz)*(p[2]-cz)); if(d>far)far=d; }
      return { nan:nan, diag:diag, dy:dy, miny:miny, maxy:maxy, far:far };
    }
    var ns = __wc.npcs, tested = 0;
    for (var idx = 0; idx < ns.length && tested < MAX; idx++) {
      var n = ns[idx], g = n && n.mesh; if (!g || !g.userData || !g.userData.skin) continue;
      // dedupe by model identity (skin.d object) so we cover distinct models
      var d0 = g.userData.skin.d; var tag = d0 ? (d0.__aqtag || (d0.__aqtag = ++tagctr)) : ('idx'+idx);
      if (seen[tag]) continue; seen[tag] = 1; tested++;
      var name = (g.userData.skin.name || g.userData.skin.n || d0 && d0.n || ('model#'+tag));
      var bx = 200 + idx * 3, bz = 200;                 // park far from the crowd, on flat ground
      var baseline = null;
      for (var ci = 0; ci < 4; ci++) {
        var clip = ['idle','walk','run','jab'][ci];
        for (var f = 0; f < 12; f++) {
          var phase = (f/12) * Math.PI * 2 * 2;
          g.position.set(bx, 0, bz); g.rotation.y = 0;
          try {
            if (clip === 'jab') __wc.animPersonClip(g, 'jab', f*0.08, true);
            else __wc.animPerson(g, clip==='idle'?0:(clip==='run'?3.2:1.6), 0.06, phase);
          } catch (e) { out.push({model:name,clip:clip,frame:f,kind:'POSE_THREW',detail:e.message}); break; }
          var pts = sample(g); if (!pts) { out.push({model:name,clip:clip,frame:f,kind:'NO_SKELETON',detail:'no bones found'}); break; }
          var mt = metrics(pts);
          if (clip==='idle' && f===2) baseline = mt;
          var base = baseline || mt;
          if (mt.nan > 0) out.push({model:name,clip:clip,frame:f,kind:'NAN_BONES',detail:mt.nan+' non-finite bones'});
          if (base.diag>0.05 && mt.diag>base.diag*1.8) out.push({model:name,clip:clip,frame:f,kind:'EXPLODE',detail:'bbox '+mt.diag.toFixed(2)+' vs base '+base.diag.toFixed(2)});
          if (base.far>0.05 && mt.far>base.far*2.6) out.push({model:name,clip:clip,frame:f,kind:'DETACH',detail:'far '+mt.far.toFixed(2)+' vs base '+base.far.toFixed(2)});
          if (mt.miny < -0.6) out.push({model:name,clip:clip,frame:f,kind:'SINK',detail:'minY '+mt.miny.toFixed(2)});
          if (mt.maxy > 3.6) out.push({model:name,clip:clip,frame:f,kind:'FLYUP',detail:'maxY '+mt.maxy.toFixed(2)});
        }
      }
    }
    out.__tested = tested;
    return { rows: out, tested: tested };
  });

  // --- first-person weapon arms: pose + fire + reload per weapon ---
  const armReport = await page.evaluate(() => {
    var out = [], guns = ['fists','pistol','smg','rifle','auto','rocket','raygun','neon_blaster','silenced'];
    function armMetrics() {
      var hp = __wc.handPos(); if (!hp) return null;   // {L:[x,y,z], R:[x,y,z]} world
      var nan = 0, arr = hp.L.concat(hp.R), i;
      for (i = 0; i < arr.length; i++) if (!isFinite(arr[i])) nan++;
      for (i = 0; i < 48; i++) { var q = __wc.getBoneQ(i); if (!q) break; for (var j = 0; j < q.length; j++) if (!isFinite(q[j])) nan++; }
      var span = Math.sqrt(Math.pow(hp.L[0]-hp.R[0],2)+Math.pow(hp.L[1]-hp.R[1],2)+Math.pow(hp.L[2]-hp.R[2],2));
      var cam = __wc.camera.position;
      var dcam = Math.min(
        Math.sqrt(Math.pow(hp.L[0]-cam.x,2)+Math.pow(hp.L[1]-cam.y,2)+Math.pow(hp.L[2]-cam.z,2)),
        Math.sqrt(Math.pow(hp.R[0]-cam.x,2)+Math.pow(hp.R[1]-cam.y,2)+Math.pow(hp.R[2]-cam.z,2)));
      return { nan: nan, span: span, dcam: dcam };
    }
    __wc.teleport(0, 20); __wc.setYaw(Math.PI); __wc.setPitch(-0.03);
    for (var i = 0; i < guns.length; i++) {
      var w = guns[i];
      try { __wc.state.owned[w] = true; __wc.setEquipped(w); } catch (e) { continue; }
      __wc.tick(0.3); var base = armMetrics();
      __wc.resetCooldowns && __wc.resetCooldowns(); __wc.tryAttack();
      for (var f = 0; f < 8; f++) { __wc.tick(w === 'rocket' ? 0.6 : 0.05);
        var m = armMetrics(); if (!m) continue;
        if (m.nan > 0) out.push({ model:'ARMS:'+w, clip:'fire', frame:f, kind:'NAN_BONES', detail:m.nan+' non-finite' });
        if (m.span > 2.0) out.push({ model:'ARMS:'+w, clip:'fire', frame:f, kind:'ARM_STRETCH', detail:'hand span '+m.span.toFixed(2)+'m' });
        if (m.dcam > 4.0) out.push({ model:'ARMS:'+w, clip:'fire', frame:f, kind:'ARM_DETACH', detail:'hand '+m.dcam.toFixed(2)+'m from camera' });
      }
    }
    return out;
  });

  const all = charReport.rows.concat(armReport);
  const byKind = {};
  all.forEach(r => { byKind[r.kind] = (byKind[r.kind] || 0) + 1; });
  const version = await page.evaluate(() => { var e = document.querySelector('#ver, .version, #version'); var t = (e && e.textContent) || (document.body.innerText.match(/v1\.[0-9.]+/) || [''])[0]; return t || '?'; });
  const report = { version: version, modelsTested: charReport.tested, pageErrors: perr, breakages: all, byKind: byKind };
  fs.writeFileSync(path.join(__dirname, 'report.json'), JSON.stringify(report, null, 2));
  console.log('=== animqa meshcheck ' + version + ' ===');
  console.log('models tested:', charReport.tested, '| page errors:', perr.length);
  console.log('breakages:', all.length, JSON.stringify(byKind));
  all.slice(0, 40).forEach(r => console.log('  [' + r.kind + '] ' + r.model + ' ' + r.clip + ' f' + r.frame + ' — ' + r.detail));
  await browser.close();
  process.exit(all.length || perr.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
