// tools/animqa/gemini/sweep.js — parameter-sweep recorder for Gemini-in-the-loop
// tuning. Records a clip while ONE parameter sweeps linearly across a range,
// with the live value BURNED INTO the frame (DOM overlay + full-page capture),
// so Gemini can be asked "at which displayed value does X look best?" — one
// video + one review = an entire tuning pass.
//
// Run: NODE_PATH=... node sweep.js <name> <from> <to> <seconds> "<applyExpr>" [setupExpr]
//   applyExpr: page-side JS using `v` (the current value), e.g.
//     "__wc.setAnchor('auto',[0.11, -0.05 + v, -0.39])"
//     "__wc.tuneVM && __wc.tuneVM('auto', { lift: v })"
//   setupExpr (optional): page-side JS run once (e.g. own+equip the weapon).
// Out: clips/sweep_<name>.webm  (video only — sweeps don't need audio)
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../../index.html');
const OUT = path.join(__dirname, 'clips');
const [NAME, FROM, TO, SECS, APPLY, SETUP] = process.argv.slice(2);
if (!APPLY) { console.error('usage: sweep.js <name> <from> <to> <seconds> "<applyExpr(v)>" [setupExpr]'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--no-sandbox']
  });
  const ctx = await browser.newContext({
    viewport: { width: 800, height: 600 },
    recordVideo: { dir: OUT, size: { width: 800, height: 600 } }   // full page => DOM overlay included
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate(() => { try { __wc.startGame(); } catch (e) { __wc.start(); }
    __wc.state.hp = 100; __wc.setWanted(0); __wc.setClock(60);
    __wc.teleport(0, 300); __wc.setYaw(0); __wc.setPitch(0); });
  await page.waitForFunction(() => window.__wc.handPos() !== null, { timeout: 20000 }).catch(() => {});
  if (SETUP) await page.evaluate(SETUP);
  await page.waitForTimeout(500);
  await page.evaluate(([from, to, secs, apply]) => new Promise(done => {
    // big readable overlay: Gemini reads the value straight off the frame
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;top:8px;left:8px;z-index:99999;background:#000c;color:#0f0;' +
      'font:bold 30px monospace;padding:6px 14px;border:2px solid #0f0;pointer-events:none';
    document.body.appendChild(ov);
    var t0 = performance.now(), dur = secs * 1000;
    (function step() {
      var k = Math.min(1, (performance.now() - t0) / dur);
      var v = from + (to - from) * k;
      try { (0, eval)(apply); } catch (e) { ov.textContent = 'ERR ' + e.message.slice(0, 40); }
      ov.textContent = 'v = ' + v.toFixed(3);
      if (k < 1) requestAnimationFrame(step); else setTimeout(done, 400);
    })();
  }), [parseFloat(FROM), parseFloat(TO), parseFloat(SECS || '10'), APPLY]);
  await page.close();
  const vid = await (await ctx.pages(), ctx).close().then(() => null).catch(() => null);
  // playwright names the file itself — rename the newest .webm in OUT
  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.webm') && !f.startsWith('sweep_') && !['ak','smg','rifle','rocket','pistol','punch','npcwalk','run','drive'].some(s => f === s + '.webm'))
    .map(f => ({ f, t: fs.statSync(path.join(OUT, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  if (files[0]) {
    const dst = path.join(OUT, 'sweep_' + NAME + '.webm');
    fs.renameSync(path.join(OUT, files[0].f), dst);
    console.log('wrote', dst, Math.round(fs.statSync(dst).size / 1024) + 'KB');
  } else console.error('no video produced');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
