// gripcheck.js — for ONE full config {g,w,c}, print penetration stats AND render
// FP + side + top + down-barrel so we confirm a real wrap (low inside, contact,
// no clip-through visible from any angle).
// Run: NODE_PATH=... node tools/animqa/gripcheck.js <weapon> '{"g":[..],"w":[..],"c":[..]}'
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
const OUT = path.join(__dirname, 'arms');
const W = process.argv[2] || 'auto';
const C = JSON.parse(process.argv[3] || '{}');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate((w) => { try { __wc.startGame(); } catch (e) { __wc.start(); }
    __wc.state.hp = 100; __wc.setWanted(0); __wc.setClock(60); __wc.state.owned[w] = true; __wc.teleport(0, 300); __wc.setYaw(0); __wc.setPitch(0); }, W);
  await page.waitForFunction(() => window.__wc.handPos() !== null, { timeout: 20000 }).catch(() => {});
  const res = await page.evaluate(async (args) => {
    var w = args.w, C = args.c, T = window.THREE;
    __wc.setEquipped(w); __wc.setYaw(0); __wc.setPitch(0);
    if (C.g) __wc.setGrip(w, C.g);
    if (C.w) { var sp = __wc.getSupPose(w).map(function (a) { return a.slice(); }); sp[3] = C.w; __wc.setSupPose(w, sp); }
    if (C.c && __wc.setLCurl) __wc.setLCurl(C.c[0], C.c[1], C.c[2]);
    __wc.poseArmsNow(); __wc.camera.updateMatrixWorld(true);
    var cam = __wc.camera, arms = null; cam.traverse(function (o) { if (o.isSkinnedMesh) arms = o; });
    var vg = arms; while (vg && vg.parent && vg.parent !== cam) vg = vg.parent;
    var guns = []; if (vg) vg.traverse(function (o) { if (o.isMesh && !o.isSkinnedMesh && o.geometry && o.visible) guns.push(o); });
    arms.updateMatrixWorld(true);
    var ray = new T.Raycaster(), dir = new T.Vector3(1, 0, 0), pos = arms.geometry.attributes.position, v = new T.Vector3(), vc = new T.Vector3();
    var inside = 0, near = 0, tot = 0, bf = arms.boneTransform ? 'boneTransform' : 'applyBoneTransform';
    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); arms[bf](i, v); v.applyMatrix4(arms.matrixWorld); vc.copy(v); cam.worldToLocal(vc);
      if (vc.z > -0.35) continue; tot++;
      ray.set(v, dir); var h = ray.intersectObjects(guns, true);
      if (h.length % 2 === 1) inside++; else if (h.length && h[0].distance < 0.018) near++;
    }
    // render 4 angles
    var gl = __wc.renderer.domElement, hp = __wc.handPos(), lh = new T.Vector3(hp.L[0], hp.L[1], hp.L[2]);
    var CW = 500, CH = 500, sheet = document.createElement('canvas'); sheet.width = CW * 2; sheet.height = CH * 2;
    var sx = sheet.getContext('2d'); sx.fillStyle = '#111'; sx.fillRect(0, 0, sheet.width, sheet.height);
    function put(i) { var col = i % 2, row = (i / 2) | 0; try { sx.drawImage(gl, 0, 0, gl.width, gl.height, col * CW, row * CH, CW, CH); } catch (e) {} }
    function lab(i, t) { var col = i % 2, row = (i / 2) | 0; sx.fillStyle = '#0f0'; sx.font = 'bold 20px monospace'; sx.fillText(t, col * CW + 8, row * CH + 26); }
    var fwd = new T.Vector3(); cam.getWorldDirection(fwd); fwd.normalize();
    var up = new T.Vector3(0, 1, 0), right = new T.Vector3().crossVectors(fwd, up).normalize();
    var tc = new T.PerspectiveCamera(30, 1, 0.005, 50), D = 0.30;
    tc.position.copy(cam.position).addScaledVector(fwd, 0.03); tc.lookAt(lh); tc.updateMatrixWorld(true); __wc.renderer.render(__wc.scene, tc); put(0); lab(0, 'FP eye');
    function view(pos, i, t) { tc.position.copy(pos); tc.lookAt(lh); tc.updateMatrixWorld(true); __wc.renderer.render(__wc.scene, tc); put(i); lab(i, t); }
    view(new T.Vector3().copy(lh).addScaledVector(right, D).addScaledVector(fwd, 0.04), 1, 'side');
    view(new T.Vector3().copy(lh).addScaledVector(up, D).addScaledVector(fwd, 0.02), 2, 'top');
    view(new T.Vector3().copy(lh).addScaledVector(fwd, D), 3, 'down-barrel');
    return { inside: inside, near: near, tot: tot, url: sheet.toDataURL('image/png') };
  }, { w: W, c: C });
  fs.writeFileSync(path.join(OUT, 'gripcheck_' + W + '.png'), Buffer.from(res.url.split(',')[1], 'base64'));
  console.log('config', JSON.stringify(C), '=> inside', res.inside, 'near', res.near, 'tot', res.tot, '| wrote gripcheck_' + W + '.png');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
