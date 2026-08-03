// headless aerial/oblique capture of the downtown build. Renders with a custom
// camera (synchronous inside one evaluate so RAF can't overwrite the frame) and
// writes PNGs to tools/citygen/shots/.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const OUT = path.resolve(__dirname, 'shots'); if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
const VIEWS = [
  { name: 'top_all', eye: [2246, 1500, 2082], look: [2246, 0, 2081], fov: 52, up: [0, 0, -1] },
  { name: 'top_center', eye: [2086, 800, 2171], look: [2086, 0, 2170], fov: 52, up: [0, 0, -1] },
  { name: 'oblique_center', eye: [2086, 420, 2560], look: [2086, 40, 2170], fov: 60 },
  { name: 'oblique_garage1', eye: [2525, 160, 1500], look: [2525, 20, 1712], fov: 55 },
  { name: 'oblique_ne', eye: [2680, 150, 1520], look: [2480, 10, 1760], fov: 60 },
  { name: 'street', eye: [2100, 6, 1900], look: [2200, 8, 1997], fov: 70 }
];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage(); await p.setViewportSize({ width: 1280, height: 800 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '../../index.html'), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 90000 });
  await p.evaluate(() => { __wc.start(); __wc.setWanted(0); if (__wc.state) __wc.state.hp = 100; if (__wc.setClock) __wc.setClock(180); });
  // let a few frames run so lazy geometry/materials warm up
  await p.waitForTimeout(1500);
  await p.evaluate(async () => { for (let i = 0; i < 30; i++) { __wc.setClock && __wc.setClock(180); __wc.tick(1 / 30); await new Promise(r => setTimeout(r, 20)); } });
  for (const v of VIEWS) {
    const url = await p.evaluate((v) => {
      const T = window.THREE, cam = new T.PerspectiveCamera(v.fov, 1280 / 800, 0.5, 6000);
      cam.position.set(v.eye[0], v.eye[1], v.eye[2]); cam.up.set(v.up ? v.up[0] : 0, v.up ? v.up[1] : 1, v.up ? v.up[2] : 0); cam.lookAt(v.look[0], v.look[1], v.look[2]);
      const savedFog = __wc.scene.fog; __wc.scene.fog = null;   // fog whitewashes distant filler — drop it for the capture
      __wc.renderer.render(__wc.scene, cam);
      __wc.scene.fog = savedFog;
      return __wc.renderer.domElement.toDataURL('image/png');
    }, v);
    fs.writeFileSync(path.join(OUT, v.name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', v.name);
  }
  console.log('pageerrors:', errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
