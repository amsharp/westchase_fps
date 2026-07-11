// gripzoom.js — extreme close-up of the support hand vs gun from 4 tight angles
// (down-barrel, side, top, camera-FP) so the fist-vs-handguard geometry is
// actually readable. Uses the real game pose (poseArmsNow).
// Run: NODE_PATH=... node tools/animqa/gripzoom.js <weapon> '[gx,gy,gz]'
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
const OUT = path.join(__dirname, 'arms');
const W = process.argv[2] || 'auto';
const G = process.argv[3] ? JSON.parse(process.argv[3]) : null;
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate((w) => { try { __wc.startGame(); } catch (e) { __wc.start(); }
    __wc.state.hp = 100; __wc.setWanted(0); __wc.setClock(60); __wc.state.owned[w] = true; __wc.teleport(0, 300); __wc.setYaw(0); __wc.setPitch(0); }, w = W);
  await page.waitForFunction(() => window.__wc.handPos() !== null, { timeout: 20000 }).catch(() => {});
  const url = await page.evaluate(async (args) => {
    var w = args.w, g = args.g, T = window.THREE;
    __wc.setEquipped(w); __wc.setYaw(0); __wc.setPitch(0);
    if (g) __wc.setGrip(w, g);
    __wc.poseArmsNow(); __wc.camera.updateMatrixWorld(true);
    var cam = __wc.camera, gl = __wc.renderer.domElement;
    // left-hand world center (bone 27)
    var hp = __wc.handPos(); var lh = new T.Vector3(hp.L[0], hp.L[1], hp.L[2]);
    var CW = 500, CH = 500, sheet = document.createElement('canvas'); sheet.width = CW * 2; sheet.height = CH * 2;
    var sx = sheet.getContext('2d'); sx.fillStyle = '#111'; sx.fillRect(0, 0, sheet.width, sheet.height);
    function putGL(i) { var col = i % 2, row = (i / 2) | 0; try { sx.drawImage(gl, 0, 0, gl.width, gl.height, col * CW, row * CH, CW, CH); } catch (e) {} }
    function label(i, t) { var col = i % 2, row = (i / 2) | 0; sx.fillStyle = '#0f0'; sx.font = 'bold 22px monospace'; sx.fillText(t, col * CW + 10, row * CH + 28); }
    var fwd = new T.Vector3(); cam.getWorldDirection(fwd); fwd.normalize();
    var up = new T.Vector3(0, 1, 0), right = new T.Vector3().crossVectors(fwd, up).normalize();
    var tc = new T.PerspectiveCamera(24, 1, 0.005, 50); var D = 0.32;
    function view(pos, i, lbl) { tc.position.copy(pos); tc.lookAt(lh); tc.updateMatrixWorld(true); __wc.renderer.render(__wc.scene, tc); putGL(i); label(i, lbl); }
    // 0: FP camera itself (what the player sees), zoomed by rendering the main cam then cropping around the hand — just use a tight cam from near the eye
    view(new T.Vector3().copy(cam.position).addScaledVector(fwd, 0.02), 0, 'FP eye');
    view(new T.Vector3().copy(lh).addScaledVector(right, D).addScaledVector(fwd, 0.05), 1, 'side');
    view(new T.Vector3().copy(lh).addScaledVector(up, D).addScaledVector(fwd, 0.02), 2, 'top');
    view(new T.Vector3().copy(lh).addScaledVector(fwd, D), 3, 'down-barrel');
    return sheet.toDataURL('image/png');
  }, { w: W, g: G });
  const tag = G ? G.join('_') : 'ship';
  fs.writeFileSync(path.join(OUT, 'gripzoom_' + W + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote gripzoom_' + W + '.png (grip ' + (G ? JSON.stringify(G) : 'shipped') + ')');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
