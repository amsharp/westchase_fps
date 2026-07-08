// Headless boot + remap verification for WC_REMAP staged data.
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const page = process.argv[2] || 'wctest.html';
  const outdir = '/tmp/claude-0/-home-user-westchase-fps/efaef73e-76aa-5d75-8d6c-935e41bd5d2d/scratchpad';
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const p = await ctx.newPage();
  const errors = [], logs = [];
  p.on('pageerror', e => errors.push('PAGEERROR: ' + (e.stack || e.message)));
  p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE.ERR: ' + m.text()); else logs.push(m.type() + ': ' + m.text()); });
  await p.goto('http://127.0.0.1:8155/' + page, { waitUntil: 'load', timeout: 30000 });
  // let load-time construction run
  await p.waitForTimeout(3500);

  const info = await p.evaluate(() => {
    const wc = window.__wc;
    if (!wc) return { noWc: true };
    const out = {};
    out.WC_REMAP = (function(){ try { return wc.WC_REMAP; } catch(e){ return 'n/a'; } })();
    try { out.hasRM = !!(wc.scene); } catch(e){}
    // start the game to spawn NPCs/cars/traffic
    try { if (wc.startGame) wc.startGame(); else if (wc.start) wc.start(); } catch(e){ out.startErr = String(e); }
    return out;
  });
  await p.waitForTimeout(2500);

  // drive a few frames and collect stats
  const stats = await p.evaluate(() => {
    const wc = window.__wc;
    const o = {};
    try { for (let i = 0; i < 30; i++) wc.tick(1 / 30); } catch(e){ o.tickErr = String(e); }
    try { o.npcs = wc.npcs ? wc.npcs.length : 'n/a'; } catch(e){ o.npcs = 'err'; }
    try { o.cops = wc.cops ? wc.cops.length : 'n/a'; } catch(e){}
    try { o.cars = wc.cars ? wc.cars.length : 'n/a'; } catch(e){}
    try { o.renderCalls = wc.renderer ? wc.renderer.info.render.calls : 'n/a'; } catch(e){}
    try { o.triangles = wc.renderer ? wc.renderer.info.render.triangles : 'n/a'; } catch(e){}
    try { o.geometries = wc.renderer ? wc.renderer.info.memory.geometries : 'n/a'; } catch(e){}
    try { o.textures = wc.renderer ? wc.renderer.info.memory.textures : 'n/a'; } catch(e){}
    try { o.houseStats = window.houseStats || (wc.houseStats) || 'n/a'; } catch(e){}
    return o;
  });

  // screenshot a few vantage points
  async function shot(name, fn) {
    try { await p.evaluate(fn); } catch(e) { errors.push('shot-setup ' + name + ': ' + e); }
    await p.evaluate(() => { try { window.__wc.tick(0.016); window.__wc.tick(0.016); } catch(e){} });
    await p.waitForTimeout(200);
    const buf = await p.screenshot();
    fs.writeFileSync(outdir + '/' + name + '.png', buf);
  }
  await shot('boot_spawn', () => {});
  await shot('boot_aerial', () => {
    const wc = window.__wc, c = wc.camera;
    c.position.set(0, 320, 0); c.rotation.set(-Math.PI/2, 0, 0);
  });
  await shot('boot_origin', () => {
    const wc = window.__wc, c = wc.camera;
    c.position.set(60, 40, 60); c.lookAt ? c.lookAt(0,0,0) : (c.rotation.set(-0.5, 2.3, 0));
    if (c.lookAt) c.lookAt(0,2,0);
  });

  fs.writeFileSync(outdir + '/boot_report.json', JSON.stringify({ info, stats, errors, logCount: logs.length }, null, 2));
  console.log('=== INFO ==='); console.log(JSON.stringify(info));
  console.log('=== STATS ==='); console.log(JSON.stringify(stats));
  console.log('=== ERRORS (' + errors.length + ') ===');
  errors.slice(0, 40).forEach(e => console.log(e));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
