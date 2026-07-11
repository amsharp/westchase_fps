// sweep pistol left-arm (bones 24,25) eulers via dbgArm; report lHand local pos.
// goal: tuck the support hand LOW + slightly back-left, out of the FP frame.
const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.resolve(__dirname, '../../index.html');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__wc && window.__wc.scene, { timeout: 60000 });
  await page.evaluate(() => { try { __wc.startGame(); } catch (e) { __wc.start(); } __wc.state.hp = 100; __wc.setWanted(0); __wc.setClock(60); __wc.teleport(0, 300); __wc.state.owned.pistol = true; __wc.setEquipped('pistol'); __wc.setYaw(0); __wc.setPitch(0); });
  await page.waitForFunction(() => window.__wc.handPos() !== null, { timeout: 20000 }).catch(() => {});
  // candidate left-arm poses [shoulder.L, upper.L, fore.L, hand.L]
  const cands = {
    cur:  [[-1.59,-0.3,1.2],[-0.6,0.0,1.4],[0.1,0.0,0.0],[0.0,0.0,0.0]],
    A:    [[-1.2,0.4,0.3],[0.4,0.0,0.6],[0.3,0.0,0.0],[0.0,0.0,0.0]],
    B:    [[-0.8,0.6,0.0],[0.2,0.0,0.3],[0.4,0.0,0.0],[0.0,0.0,0.0]],
    C:    [[-1.9,0.3,0.4],[0.2,0.0,0.8],[0.5,0.0,0.0],[0.0,0.0,0.0]],
    D:    [[-2.2,0.0,0.2],[0.0,0.0,0.5],[0.6,0.0,0.0],[0.0,0.0,0.0]],
    E:    [[-1.5,0.5,-0.3],[0.5,0.0,0.2],[0.5,0.0,0.0],[0.0,0.0,0.0]],
  };
  for (const k in cands) {
    const r = await page.evaluate((ov) => { __wc.dbgArm(ov); __wc.poseArmsNow(); var g = __wc.gripDbg(); __wc.dbgArm(null); return g; }, cands[k]);
    console.log(k.padEnd(4), 'lHand', JSON.stringify(r.lHand));
  }
  await browser.close();
})();
