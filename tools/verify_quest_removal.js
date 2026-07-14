// Headless verification that the quest system is fully removed and the game
// still boots + runs. Run:
//   cd /home/user/wt-quest && NODE_PATH=/opt/node22/lib/node_modules \
//     /opt/node22/bin/node tools/verify_quest_removal.js
var { chromium } = require('playwright');

(async function () {
  var jsErrors = [];    // uncaught JS exceptions + JS console errors (must be 0)
  var netErrors = [];   // network resource failures (expected offline; informational)
  var browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--no-sandbox']
  });
  var page = await browser.newPage({ viewport: { width: 1024, height: 640 } });

  page.on('pageerror', function (e) { jsErrors.push('pageerror: ' + (e && e.message ? e.message : e)); });
  page.on('console', function (m) {
    if (m.type() !== 'error') return;
    var t = m.text();
    if (/Failed to load resource|ERR_CONNECTION|ERR_NETWORK|ERR_NAME_NOT_RESOLVED|net::/.test(t)) netErrors.push(t);
    else jsErrors.push('console.error: ' + t);
  });

  await page.goto('file:///home/user/wt-quest/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });

  // wait for the game to finish parsing + expose the debug hook
  await page.waitForFunction('window.__wc && typeof window.__wc.start === "function" && window.__wc.scene', null, { timeout: 60000 });

  // start singleplayer + advance a few frames
  await page.evaluate(function () { window.__wc.start(); });
  await page.evaluate(function () { for (var i = 0; i < 8; i++) window.__wc.tick(0.03); });

  // KeyJ must NOT open a quest menu and must not throw
  await page.evaluate(function () {
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', bubbles: true }));
  });
  await page.evaluate(function () { for (var i = 0; i < 2; i++) window.__wc.tick(0.03); });
  var questPanelPresent = await page.evaluate(function () { return !!document.getElementById('questPanel'); });
  var menuVal = await page.evaluate(function () { return window.__wc.state ? window.__wc.state.menu : 'n/a'; });

  // fire a weapon
  await page.evaluate(function () {
    try { window.__wc.setEquipped && window.__wc.setEquipped('pistol'); } catch (e) {}
    if (window.__wc.state) window.__wc.state.owned && (window.__wc.state.owned.pistol = true);
    window.__wc.setEquipped && window.__wc.setEquipped('pistol');
    window.__wc.tryAttack && window.__wc.tryAttack();
    for (var i = 0; i < 3; i++) window.__wc.tick(0.03);
  });

  // spawn the plane
  await page.evaluate(function () { window.__wc.spawnPlane && window.__wc.spawnPlane(); for (var i = 0; i < 3; i++) window.__wc.tick(0.03); });

  var npcCount = await page.evaluate(function () { return window.__wc.npcs ? window.__wc.npcs.length : -1; });
  var childCount = await page.evaluate(function () { return window.__wc.scene ? window.__wc.scene.children.length : -1; });

  await page.screenshot({ path: 'tools/verify_quest_removal.png' });

  await browser.close();

  console.log('--- VERIFICATION RESULTS ---');
  console.log('uncaught JS errors  :', jsErrors.length, '(expected 0)');
  jsErrors.forEach(function (e) { console.log('   ', e); });
  console.log('network errors      :', netErrors.length, '(offline sandbox — informational)');
  netErrors.forEach(function (e) { console.log('   ', e); });
  console.log('questPanel in DOM   :', questPanelPresent, '(expected false)');
  console.log('state.menu after J  :', JSON.stringify(menuVal), '(expected null)');
  console.log('scene child count   :', childCount);
  console.log('npc count           :', npcCount);
  console.log('screenshot          : tools/verify_quest_removal.png');

  var ok = jsErrors.length === 0 && questPanelPresent === false && (menuVal === null || menuVal === undefined);
  console.log(ok ? '\nPASS' : '\nFAIL');
  process.exit(ok ? 0 : 1);
})().catch(function (e) { console.error('HARNESS ERROR', e); process.exit(2); });
