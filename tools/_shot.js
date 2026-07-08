// parametric aerial: node _shot.js NAME CX CZ H [page]
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [name, cx, cz, h] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5]];
  const page = process.argv[6] || 'wctest.html';
  const outdir = '/tmp/claude-0/-home-user-westchase-fps/efaef73e-76aa-5d75-8d6c-935e41bd5d2d/scratchpad';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader'] });
  const p = await (await browser.newContext({ viewport: { width: 900, height: 900 } })).newPage();
  await p.goto('http://127.0.0.1:8155/' + page, { waitUntil: 'load', timeout: 40000 });
  await p.waitForTimeout(3500);
  await p.evaluate(() => {
    const wc = window.__wc; wc.state.running = false;
    wc.camera.traverse(o => { if (o !== wc.camera && o.type === 'Group' && o.parent === wc.camera) o.visible = false; });
    ['hud','minimap','crosshair','startScreen','pauseScreen','charPanel'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none';});
    document.querySelectorAll('.overlay').forEach(e=>e.style.display='none');
    wc.scene.fog = null;
  });
  await p.evaluate(([cx,cz,h])=>{const c=window.__wc.camera;c.up.set(0,0,-1);c.position.set(cx,h,cz);c.far=5000;c.updateProjectionMatrix();c.lookAt(cx,0,cz);},[cx,cz,h]);
  await p.waitForTimeout(300);
  fs.writeFileSync(outdir + '/' + name + '.png', await p.screenshot());
  const hs = await p.evaluate(() => window.__wc.houses);
  console.log('wrote', name + '.png at', cx, cz, 'h', h, '| houses:', JSON.stringify(hs));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
