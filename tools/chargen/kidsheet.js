// Render a labeled contact grid of kid looks, built EXACTLY like the game's
// buildMeshySkinned/meshyPose (skinned mesh, own walk clip, posed mid-stride),
// with optional per-look texture overrides for variants. One chromium at
// PORT 8205. Proves the rig animates and the variant atlases map cleanly.
//   node kidsheet.js <out.png> [walkCycle] [--only NAME,NAME]
// Looks come from work/kidskins_data.json (bases) + work/kid_variants_tex/
//   <NAME>.jpg overrides listed in kid_reskins_manifest.json (if present).
const fs = require('fs');
const path = require('path');
const http = require('http');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const ROOT = path.join(__dirname, '..', '..'), WORK = path.join(__dirname, 'work');
const PORT = 8205;

const OUT = process.argv[2] || path.join(__dirname, 'aigen', 'kids_contact.png');
const CYCLE = process.argv.indexOf('--only') >= 0 && !isNaN(+process.argv[3]) ? +process.argv[3] : (+process.argv[3] || 0.28);
const onlyI = process.argv.indexOf('--only');
const ONLY = onlyI >= 0 ? process.argv[onlyI + 1].split(',') : null;

const bases = JSON.parse(fs.readFileSync(path.join(WORK, 'kidskins_data.json'), 'utf8'));
const baseByName = {}; bases.forEach(b => baseByName[b.n] = b);

// Build the list of looks: every base + every variant (texture override).
const looks = [];
for (const b of bases) if (!ONLY || ONLY.includes(b.n)) looks.push({ label: b.n + ' [' + b.race + ']', base: b.n });
const manPath = path.join(__dirname, 'kid_reskins_manifest.json');
if (fs.existsSync(manPath)) {
  for (const m of JSON.parse(fs.readFileSync(manPath, 'utf8'))) {
    const tf = path.join(WORK, m.file);
    if (!fs.existsSync(tf)) continue;
    if (ONLY && !ONLY.includes(m.n)) continue;
    looks.push({ label: m.n + ' [' + m.race + ']', base: m.base, tex: 'data:image/jpeg;base64,' + fs.readFileSync(tf).toString('base64') });
  }
}
console.log('looks:', looks.length);

// serialize the entries + looks the page needs
const payload = { entries: baseByName, looks: looks.map(l => ({ label: l.label, base: l.base, tex: l.tex || null })), cycle: CYCLE };

const PAGE = '<!doctype html><html><head><meta charset=utf8></head><body><script src="/three.min.js"></script></body></html>';
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  if (p === '/') { res.setHeader('Content-Type', 'text/html'); res.end(PAGE); return; }
  if (p === '/payload.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(payload)); return; }
  const f = path.join(ROOT, p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.setHeader('Content-Type', 'application/javascript'); res.end(fs.readFileSync(f)); }
  else { res.statusCode = 404; res.end(); }
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => console.log('ERR', String(e)));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof THREE !== 'undefined', { timeout: 15000 });
  const dataUrl = await page.evaluate(async () => {
    const pay = await (await fetch('/payload.json')).json();
    function b64Bytes(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
    const texCache = {};
    function makeTex(src) {
      if (texCache[src]) return texCache[src];
      const im = new Image(); const t = new THREE.Texture(im);
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
      im.src = src; texCache[src] = { t, im }; return texCache[src];
    }
    // ---- port of getMeshySkin (own-clips only) ----
    function getSkin(e) {
      const parents = e.skel.parents;
      const bt = new Int16Array(b64Bytes(e.skel.t).buffer);
      const br = new Int16Array(b64Bytes(e.skel.r).buffer);
      let rootI = 0; for (let i = 0; i < parents.length; i++) if (parents[i] < 0) rootI = i;
      const qp = new Int16Array(b64Bytes(e.geo.p).buffer), qu = new Uint16Array(b64Bytes(e.geo.u).buffer);
      const fp = new Float32Array(qp.length), fu = new Float32Array(qu.length);
      for (let i = 0; i < qp.length; i++) fp[i] = qp[i] / 2000;
      for (let i = 0; i < qu.length; i += 2) { fu[i] = qu[i] / 8192; fu[i + 1] = 1 - qu[i + 1] / 8192; }
      const si = b64Bytes(e.geo.si), sw = b64Bytes(e.geo.sw);
      const fsi = new Uint16Array(si.length), fsw = new Float32Array(sw.length);
      for (let i = 0; i < si.length; i++) { fsi[i] = si[i]; fsw[i] = sw[i] / 255; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(fp, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(fu, 2));
      g.setAttribute('skinIndex', new THREE.BufferAttribute(fsi, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(fsw, 4));
      g.setIndex(new THREE.BufferAttribute(new Uint16Array(b64Bytes(e.geo.i).buffer), 1));
      g.computeVertexNormals();
      const clips = {};
      for (const k in e.clips) { const c = e.clips[k]; if (c.q) clips[k] = { d: c.d, f: c.f, q: new Int16Array(b64Bytes(c.q).buffer), y: new Int16Array(b64Bytes(c.y).buffer), gy: c.gy || 0 }; }
      return { parents, bt, br, rootI, geo: g, clips, names: e.skel.names };
    }
    function buildSkinned(e, texSrc) {
      const d = getSkin(e), nj = d.parents.length, bones = []; let root = null;
      for (let i = 0; i < nj; i++) { const b = new THREE.Bone(); b.position.set(d.bt[i * 3] / 2000, d.bt[i * 3 + 1] / 2000, d.bt[i * 3 + 2] / 2000); b.quaternion.set(d.br[i * 4] / 16383, d.br[i * 4 + 1] / 16383, d.br[i * 4 + 2] / 16383, d.br[i * 4 + 3] / 16383); bones.push(b); }
      for (let i = 0; i < nj; i++) { if (d.parents[i] >= 0) bones[d.parents[i]].add(bones[i]); else root = bones[i]; }
      const tx = makeTex(texSrc || e.tex).t;
      const mesh = new THREE.SkinnedMesh(d.geo, new THREE.MeshLambertMaterial({ map: tx, side: THREE.DoubleSide }));
      mesh.add(root); mesh.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(bones)); mesh.frustumCulled = false;
      return { grp: mesh, d, bones, rootBindY: bones[d.rootI].position.y };
    }
    const _pq = new THREE.Quaternion();
    function pose(sk, cyc) {
      const d = sk.d, c = d.clips.walk, nj = d.parents.length;
      const ft = (cyc - Math.floor(cyc)) * (c.f - 1), f0 = Math.floor(ft), f1 = Math.min(c.f - 1, f0 + 1), a = ft - f0;
      for (let i = 0; i < nj; i++) { const b = sk.bones[i]; if (!b) continue; const o0 = (f0 * nj + i) * 4, o1 = (f1 * nj + i) * 4; b.quaternion.set(c.q[o0] / 16383, c.q[o0 + 1] / 16383, c.q[o0 + 2] / 16383, c.q[o0 + 3] / 16383); _pq.set(c.q[o1] / 16383, c.q[o1 + 1] / 16383, c.q[o1 + 2] / 16383, c.q[o1 + 3] / 16383); b.quaternion.slerp(_pq, a); }
      sk.bones[d.rootI].position.y = sk.rootBindY + (c.gy || 0) + (c.y[f0] / 2000) * (1 - a) + (c.y[f1] / 2000) * a;
    }

    const cols = Math.ceil(Math.sqrt(pay.looks.length)) + 1;
    const rows = Math.ceil(pay.looks.length / cols);
    const CELL = 200, LBL = 16;
    const W = cols * CELL, H = rows * (CELL + LBL);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(CELL, CELL);
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const octx = out.getContext('2d'); octx.fillStyle = '#2a2f36'; octx.fillRect(0, 0, W, H);

    for (let li = 0; li < pay.looks.length; li++) {
      const look = pay.looks[li];
      const e = pay.entries[look.base];
      const sk = buildSkinned(e, look.tex);
      pose(sk, pay.cycle);
      // wait for the texture image to load
      const src = look.tex || e.tex;
      if (texCache[src] && !texCache[src].im.complete) await new Promise(r => { texCache[src].im.onload = r; texCache[src].im.onerror = r; });
      if (texCache[src]) texCache[src].t.needsUpdate = true;
      const sc = new THREE.Scene(); sc.background = new THREE.Color(0x3a4048);
      sc.add(new THREE.AmbientLight(0xffffff, 0.9));
      const dl = new THREE.DirectionalLight(0xffffff, 0.5); dl.position.set(2, 4, 3); sc.add(dl);
      const g = new THREE.Group(); g.add(sk.grp); sc.add(g);
      // frame to the mesh height h (game units)
      const h = e.h || 1.2;
      const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
      cam.position.set(0, h * 0.55, h * 2.1); cam.lookAt(0, h * 0.5, 0);
      g.rotation.y = 0.5;
      renderer.render(sc, cam);
      const cx = (li % cols) * CELL, cy = Math.floor(li / cols) * (CELL + LBL);
      octx.drawImage(renderer.domElement, cx, cy, CELL, CELL);
      octx.fillStyle = '#fff'; octx.font = '11px monospace'; octx.fillText(look.label, cx + 3, cy + CELL + 12);
    }
    return out.toDataURL('image/png');
  });
  fs.writeFileSync(OUT, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('saved', OUT);
  await browser.close(); server.close();
})().catch(e => { console.error(String(e)); process.exit(1); });
