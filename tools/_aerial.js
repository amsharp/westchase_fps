const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const page = process.argv[2] || 'wctest.html';
  const tag = process.argv[3] || 'remap';
  const outdir = '/tmp/claude-0/-home-user-westchase-fps/efaef73e-76aa-5d75-8d6c-935e41bd5d2d/scratchpad';
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 1000 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push('PAGEERROR: ' + (e.stack || e.message)));
  p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('CONSOLE.ERR: ' + m.text()); });
  await p.goto('http://127.0.0.1:8155/' + page, { waitUntil: 'load', timeout: 30000 });
  await p.waitForTimeout(3500);

  const info = await p.evaluate(() => {
    const wc = window.__wc;
    if (!wc) return { noWc: true };
    // keep the game paused so the rAF loop renders scene+camera without
    // moving the camera; hide the camera-attached viewmodel (hands/gun)
    wc.state.running = false;
    wc.camera.traverse(function (o) { if (o !== wc.camera && o.type === 'Group' && o.parent === wc.camera) o.visible = false; });
    // also hide the DOM HUD so aerials are clean
    ['hud', 'minimap', 'crosshair', 'startScreen', 'pauseScreen', 'charPanel'].forEach(function (id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; });
    document.querySelectorAll('.overlay').forEach(function (el) { el.style.display = 'none'; });
    window.__savedFog = wc.scene.fog; wc.scene.fog = null;   // fog kills wide aerials
    return {
      npcs: wc.npcs.length, cops: wc.cops.length, cars: wc.cars.length,
      houses: wc.houses,
      renderCalls: wc.renderer.info.render.calls,
      triangles: wc.renderer.info.render.triangles,
    };
  });

  async function aerial(name, cx, cz, h) {
    await p.evaluate(([cx, cz, h]) => {
      const c = window.__wc.camera;
      c.up.set(0, 0, -1);
      c.position.set(cx, h, cz);
      c.far = 5000; c.updateProjectionMatrix();
      c.lookAt(cx, 0, cz);
    }, [cx, cz, h]);
    await p.waitForTimeout(250);
    fs.writeFileSync(outdir + '/' + name + '.png', await p.screenshot());
  }
  async function oblique(name, cx, cz, h, tx, tz) {
    await p.evaluate(([cx, cz, h, tx, tz]) => {
      const c = window.__wc.camera;
      c.up.set(0, 1, 0);
      c.position.set(cx, h, cz);
      c.far = 5000; c.updateProjectionMatrix();
      c.lookAt(tx, 2, tz);
    }, [cx, cz, h, tx, tz]);
    await p.waitForTimeout(250);
    fs.writeFileSync(outdir + '/' + name + '.png', await p.screenshot());
  }

  await aerial(tag + '_map', 0, 0, 1500);          // whole map
  await aerial(tag + '_venue', -40, -10, 380);      // core venue / Y-junction
  await aerial(tag + '_hoodNW', -300, -250, 300);   // NW neighborhood houses
  await oblique(tag + '_street', 70, 90, 30, -10, 0); // oblique over the junction
  fs.writeFileSync(outdir + '/' + tag + '_info.json', JSON.stringify({ info, errors }, null, 2));
  console.log(JSON.stringify(info, null, 2));
  console.log('ERRORS(' + errors.length + '):'); errors.slice(0,20).forEach(e=>console.log(e));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
