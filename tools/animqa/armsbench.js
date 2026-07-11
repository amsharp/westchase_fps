// tools/animqa/armsbench.js — first-person ARMS + GRIP inspection bench.
//
// The FP arms live parented to the camera, so the normal screenshot only shows
// them head-on. This renders each weapon from the FP view PLUS three external
// angles (side / top / front) aimed at the actual hand positions, so we can see
// how the hands grip the gun and whether the arm mesh itself is broken.
//
// Run: NODE_PATH=/opt/node22/lib/node_modules node tools/animqa/armsbench.js [weapon...]
// Out: tools/animqa/arms/<weapon>.png  (2x2: FP | side | top | front)
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
const OUT = path.join(__dirname, 'arms');
const W = 900, H = 900;
const WEAPONS = process.argv.slice(2).length ? process.argv.slice(2) : ['pistol', 'smg', 'rifle', 'auto', 'rocket'];
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  let browser = null;
  async function shoot(w) {
    if (browser) { try { await browser.close(); } catch (_) {} }
    browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
    // start the REAL rAF frame() loop so initPSXArms() builds the skinned arms
    await page.evaluate((w) => { try { __wc.startGame(); } catch (e) { __wc.start(); }   // startGame() builds psxArms via initPSXArms()
      __wc.state.hp = 100; __wc.setWanted(0); __wc.setClock(60); __wc.state.owned[w] = true; __wc.teleport(0, 300); }, w);
    await page.waitForFunction(() => window.__wc.handPos() !== null, { timeout: 20000 }).catch(() => {});   // wait for arms to build
    var CLIP = process.env.CLIP || 'relax', CT = parseFloat(process.env.CT || '0.75');
    await page.evaluate(([w, CLIP, CT]) => { __wc.setEquipped(w); __wc.setYaw(0); __wc.setPitch(0.2); __wc.setGunHold(CLIP, CT); __wc.poseArmsNow(); }, [w, CLIP, CT]);
    await page.waitForTimeout(500);   // let a few rAF frames pose the arms for this weapon
    const info = await page.evaluate((w) => {
      var T = window.THREE;
      var cam = __wc.camera;
      var sheet = document.createElement('canvas'); sheet.width = 900; sheet.height = 900;
      var sx = sheet.getContext('2d'); sx.fillStyle = '#20242b'; sx.fillRect(0, 0, 900, 900);
      var gl = __wc.renderer.domElement;
      function put(i) { var col = i % 2, row = (i / 2) | 0; try { sx.drawImage(gl, 0, 0, 900, 900, col * 450, row * 450, 450, 450); } catch (e) {} }
      function label(i, txt) { var col = i % 2, row = (i / 2) | 0; sx.fillStyle = '#0af'; sx.font = 'bold 20px monospace'; sx.fillText(txt, col * 450 + 8, row * 450 + 24); }

      // cell 0: FP at pitch 0.0 (the TRUE level playing angle — main tuning target)
      __wc.setPitch(0.0); __wc.poseArmsNow(); cam.updateMatrixWorld(true);
      __wc.renderer.render(__wc.scene, cam); put(0); label(0, 'FP pitch 0.0 (level)');
      // cell 1: FP at pitch 0.2 (slight up-look — original tuning angle)
      __wc.setPitch(0.2); __wc.poseArmsNow(); cam.updateMatrixWorld(true);
      __wc.renderer.render(__wc.scene, cam); put(1); label(1, 'FP pitch 0.2');

      // external grip-inspection views computed at pitch 0.0 (level)
      __wc.setPitch(0.0); __wc.poseArmsNow(); cam.updateMatrixWorld(true);
      var hp = __wc.handPos();
      var ctr = hp ? new T.Vector3((hp.L[0] + hp.R[0]) / 2, (hp.L[1] + hp.R[1]) / 2, (hp.L[2] + hp.R[2]) / 2)
                   : cam.position.clone();
      var fwd = new T.Vector3(); cam.getWorldDirection(fwd); fwd.normalize();
      var up = new T.Vector3(0, 1, 0);
      var right = new T.Vector3().crossVectors(fwd, up).normalize();
      var tcam = new T.PerspectiveCamera(22, 1, 0.01, 200);
      var D = 0.85;
      function view(pos, i) { tcam.position.copy(pos); tcam.lookAt(ctr); tcam.updateMatrixWorld(true); __wc.renderer.render(__wc.scene, tcam); put(i); }
      view(new T.Vector3().copy(ctr).addScaledVector(right, D).addScaledVector(fwd, 0.15), 2); label(2, 'side');   // grip profile
      view(new T.Vector3().copy(ctr).addScaledVector(fwd, D).addScaledVector(up, 0.15), 3); label(3, 'front');     // muzzle side

      return { url: sheet.toDataURL('image/png'), hp: hp, ctr: [ctr.x, ctr.y, ctr.z].map(function (v) { return Math.round(v * 100) / 100; }),
               grip: __wc.gripDbg && __wc.gripDbg() };
    }, w);
    fs.writeFileSync(path.join(OUT, w + '_' + (process.env.CLIP||'relax') + '.png'), Buffer.from(info.url.split(',')[1], 'base64'));
    console.log(w, '| grip', JSON.stringify(info.grip), '| pageErrs', errs.length);
  }
  for (const w of WEAPONS) { try { await shoot(w); } catch (e) { console.log('FAIL', w, e.message.split('\n')[0]); } }
  if (browser) await browser.close();
  console.log('ALLDONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
