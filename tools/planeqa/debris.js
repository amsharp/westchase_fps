// debris.js — smoke-test buildDebris() + scorchTexture(), render the debris.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const PAGE = 'file://' + path.resolve(__dirname, 'plane.html');
const OUT = path.join(__dirname, 'debris.png');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 520, height: 520 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
  await page.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__ready === true, { timeout: 60000 });
  const res = await page.evaluate(() => {
    var T = window.THREE, P = window.WC_PLANE;
    var scene = new T.Scene(); scene.background = new T.Color(0x777777);
    scene.add(new T.AmbientLight(0xffffff, 0.8));
    var d = new T.DirectionalLight(0xffffff, 1); d.position.set(3, 6, 4); scene.add(d);
    var debris = P.buildDebris();
    var report = 'debris count=' + debris.length;
    for (var i = 0; i < debris.length; i++) {
      var m = debris[i];
      var col = (i % 4) - 1.5, row = Math.floor(i / 4) - 1;
      m.position.set(col * 1.6, 0, row * 1.6);
      scene.add(m);
    }
    // scorch decal on a plane
    var tex = P.scorchTexture();
    var okTex = !!(tex && tex.image);
    var decal = new T.Mesh(new T.PlaneGeometry(4, 4), new T.MeshBasicMaterial({ map: tex, transparent: true }));
    decal.rotation.x = -Math.PI / 2; decal.position.set(0, -0.6, 0); scene.add(decal);
    var cam = new T.PerspectiveCamera(38, 1, 0.1, 100);
    cam.position.set(5, 5, 6); cam.lookAt(0, 0, 0);
    window.__renderer.render(scene, cam);
    return { url: window.__renderer.domElement.toDataURL('image/png'), report: report, okTex: okTex };
  });
  fs.writeFileSync(OUT, Buffer.from(res.url.split(',')[1], 'base64'));
  console.log(res.report, 'scorchTex.image=', res.okTex, '-> wrote', OUT);
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
