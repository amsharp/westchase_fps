// one-shot measurement: relax right/left hand positions in each gun-group local frame
const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate(() => { try { __wc.startGame(); } catch (e) { __wc.start(); } __wc.state.hp = 100; __wc.setWanted(0); __wc.setClock(60); __wc.teleport(0, 300); });
  await page.waitForFunction(() => window.__wc.handPos() !== null, { timeout: 20000 }).catch(() => {});
  for (const w of ['pistol', 'smg', 'rifle', 'auto', 'rocket']) {
    const r = await page.evaluate((w) => { __wc.state.owned[w] = true; __wc.setEquipped(w); __wc.setYaw(0); __wc.setPitch(0); __wc.poseArmsNow(); return __wc.gripDbg(); }, w);
    console.log(w.padEnd(8), JSON.stringify(r));
  }
  await browser.close();
})();
