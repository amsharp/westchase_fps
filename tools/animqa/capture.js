// tools/animqa/capture.js — visual animation contact sheets for Westchase FPS.
//
// Drives each animation and tiles an 8-frame sequence into ONE contact sheet
// per subject, so a whole motion cycle is reviewable in a single image. Use it
// alongside meshcheck.js: meshcheck flags breakage quantitatively, capture.js
// lets a human (or an image-reading agent) eyeball smoothness / weirdness.
//
// Compositing is done IN-PAGE (2D-canvas drawImage from the WebGL canvas) —
// the bundled ffmpeg has no PNG decoder, so we can't tile with ffmpeg.
//
// Run:  NODE_PATH=/opt/node22/lib/node_modules node tools/animqa/capture.js
// Out:  tools/animqa/sheets/<subject>.png
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
const OUT = path.join(__dirname, 'sheets');
const W = 940, H = 588, N = 8;
const VM_CROP = [250, 200, 680, 380], NPC_CROP = [130, 30, 680, 540];
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  let browser = null, page = null, since = 0; const errs = [];
  async function boot() {
    // swiftshader corrupts the whole chromium process after a dozen renders, so
    // relaunch the BROWSER (not just the page) each boot — keeps captures stable.
    if (browser) { try { await browser.close(); } catch (_) {} }
    browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
    page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
    await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
    await page.evaluate(() => {
      __wc.start(); __wc.setWanted(0); __wc.state.hp = 100;
      ['pistol','smg','rifle','auto','rocket'].forEach(k => __wc.state.owned[k] = true);
      __wc.setClock(60);
      window.__mk = function (crop) { var c = document.createElement('canvas'); c.width = 340 * 4; c.height = 190 * 2;
        window.__SC = { c: c, x: c.getContext('2d'), crop: crop, i: 0 }; window.__SC.x.fillStyle = '#101014'; window.__SC.x.fillRect(0, 0, c.width, c.height); };
      window.__cell = function () { var s = window.__SC, g = __wc.renderer.domElement, col = s.i % 4, row = (s.i / 4) | 0;
        try { s.x.drawImage(g, s.crop[0], s.crop[1], s.crop[2], s.crop[3], col * 340, row * 190, 340, 190); } catch (e) {} s.i++; };
      window.__url = function () { return window.__SC.c.toDataURL('image/png'); };
    });
    since = 0;
  }
  await boot();
  async function cap(name, setupStr, crop, stepStr, dt, _retry) {
    try {
      if (!page || page.isClosed() || since >= 2) await boot(); since++;
      await page.evaluate(([setupStr, crop]) => { (0, eval)('(' + setupStr + ')')(); window.__mk(crop); }, [setupStr, crop]);
      for (let i = 0; i < N; i++) await page.evaluate(([i, dt, body]) => { (0, eval)('(' + body + ')')(i, dt); window.__cell(); }, [i, dt, stepStr]);
      const url = await page.evaluate(() => window.__url());
      fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
      console.log('sheet', name);
    } catch (e) {
      // swiftshader can crash the browser tab mid-run — reboot a fresh page and retry once
      console.log('retry', name, '(' + e.message.split('\n')[0] + ')');
      try { page = null; } catch (_) {}
      if (!_retry) { await boot(); since = 1; await cap(name, setupStr, crop, stepStr, dt, true); }
      else console.log('FAIL', name);
    }
  }
  const tick = 'function(i,dt){ __wc.tick(dt); }';
  // viewmodels: idle sway + fire recoil
  for (const w of ['fists','pistol','rifle','auto','rocket']) {
    await cap('vm_' + w + '_idle', `function(){ __wc.teleport(0,20); __wc.setYaw(Math.PI); __wc.setPitch(-0.03); __wc.setEquipped('${w}'); __wc.tick(0.5); }`, VM_CROP, tick, 0.12);
  }
  for (const w of ['pistol','auto','rocket']) {
    await cap('vm_' + w + '_fire', `function(){ __wc.teleport(0,20); __wc.setYaw(Math.PI); __wc.setPitch(-0.03); __wc.setEquipped('${w}'); __wc.resetCooldowns&&__wc.resetCooldowns(); __wc.tick(0.4); __wc.tryAttack(); }`, VM_CROP, tick, w === 'rocket' ? 0.6 : 0.05);
  }
  // NPC locomotion: park a skinned + a second npc in front of a fixed camera and drive animPerson
  const npcSetup = `function(){
    __wc.teleport(0,106); __wc.setYaw(0); __wc.setPitch(-0.06); __wc.state.hp=100; __wc.setWanted(0);
    var ns=__wc.npcs; window.__A=null; window.__B=null;
    for(var i=0;i<ns.length;i++){ if(ns[i].mesh&&ns[i].mesh.userData.skin){ if(!window.__A)window.__A=ns[i]; else if(!window.__B){window.__B=ns[i]; break;} } }
    window.__PH=0;
    [[window.__A,-1.3],[window.__B,1.3]].forEach(function(p){ var n=p[0]; if(!n)return; n.paused=true; n.mesh.position.set(p[1],0,100); n.mesh.rotation.y=Math.PI; n.mesh.updateMatrixWorld(true); });
    __wc.renderer.render(__wc.scene,__wc.camera); }`;
  const loco = spd => `function(i,dt){ window.__PH += ${spd}*3.4*dt;
    [[window.__A,-1.3],[window.__B,1.3]].forEach(function(p){ var n=p[0]; if(!n)return; n.mesh.position.set(p[1],0,100); n.mesh.rotation.y=Math.PI; __wc.animPerson(n.mesh,${spd},dt,window.__PH); n.mesh.updateMatrixWorld(true); });
    __wc.renderer.render(__wc.scene,__wc.camera); }`;
  await cap('npc_walk', npcSetup, NPC_CROP, loco(1.6), 0.14);
  await cap('npc_run', npcSetup, NPC_CROP, loco(3.2), 0.10);
  await cap('npc_idle', npcSetup, NPC_CROP, loco(0.0), 0.22);
  await cap('npc_jab', npcSetup, NPC_CROP, `function(i,dt){ [[window.__A,-1.3],[window.__B,1.3]].forEach(function(p){ var n=p[0]; if(!n)return; n.mesh.position.set(p[1],0,100); n.mesh.rotation.y=Math.PI; __wc.animPersonClip(n.mesh,'jab',i*0.09,true); n.mesh.updateMatrixWorld(true); }); __wc.renderer.render(__wc.scene,__wc.camera); }`, 0.09);
  console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 6)));
  await browser.close(); console.log('ALLDONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
