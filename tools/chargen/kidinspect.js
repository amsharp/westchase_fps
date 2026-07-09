// Inspect one kid base from multiple yaw angles + walk-cycle phases to diagnose
// mesh/rig artifacts (e.g. MAYA's right-arm blob). Reuses kidsheet's skinned
// builder.  node kidinspect.js NAME [port]
const fs = require('fs');
const path = require('path');
const http = require('http');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const ROOT = path.join(__dirname, '..', '..'), WORK = path.join(__dirname, 'work');
const NAME = process.argv[2] || 'MAYA';
const PORT = +(process.argv[3] || 8208);
const bases = JSON.parse(fs.readFileSync(path.join(WORK, 'kidskins_data.json'), 'utf8'));
const entry = bases.find(b => b.n === NAME);
const PAGE = '<!doctype html><html><head><meta charset=utf8></head><body><script src="/three.min.js"></script></body></html>';
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  if (p === '/') { res.setHeader('Content-Type', 'text/html'); res.end(PAGE); return; }
  if (p === '/e.json') { res.end(JSON.stringify(entry)); return; }
  const f = path.join(ROOT, p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.setHeader('Content-Type', 'application/javascript'); res.end(fs.readFileSync(f)); }
  else { res.statusCode = 404; res.end(); }
});
(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 720 } });
  page.on('pageerror', e => console.log('ERR', String(e)));
  await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof THREE !== 'undefined', { timeout: 15000 });
  const dataUrl = await page.evaluate(async () => {
    const e = await (await fetch('/e.json')).json();
    function b64(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
    const im = new Image(); const t = new THREE.Texture(im); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; im.src = e.tex; await new Promise(r => { im.onload = r; im.onerror = r; }); t.needsUpdate = true;
    function getSkin(e) {
      const parents = e.skel.parents; const bt = new Int16Array(b64(e.skel.t).buffer), br = new Int16Array(b64(e.skel.r).buffer);
      let rootI = 0; for (let i = 0; i < parents.length; i++) if (parents[i] < 0) rootI = i;
      const qp = new Int16Array(b64(e.geo.p).buffer), qu = new Uint16Array(b64(e.geo.u).buffer);
      const fp = new Float32Array(qp.length), fu = new Float32Array(qu.length);
      for (let i = 0; i < qp.length; i++) fp[i] = qp[i] / 2000;
      for (let i = 0; i < qu.length; i += 2) { fu[i] = qu[i] / 8192; fu[i + 1] = 1 - qu[i + 1] / 8192; }
      const si = b64(e.geo.si), sw = b64(e.geo.sw); const fsi = new Uint16Array(si.length), fsw = new Float32Array(sw.length);
      for (let i = 0; i < si.length; i++) { fsi[i] = si[i]; fsw[i] = sw[i] / 255; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(fp, 3)); g.setAttribute('uv', new THREE.BufferAttribute(fu, 2));
      g.setAttribute('skinIndex', new THREE.BufferAttribute(fsi, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(fsw, 4));
      g.setIndex(new THREE.BufferAttribute(new Uint16Array(b64(e.geo.i).buffer), 1)); g.computeVertexNormals();
      const clips = {}; for (const k in e.clips) { const c = e.clips[k]; if (c.q) clips[k] = { d: c.d, f: c.f, q: new Int16Array(b64(c.q).buffer), y: new Int16Array(b64(c.y).buffer), gy: c.gy || 0 }; }
      return { parents, bt, br, rootI, geo: g, clips };
    }
    function build(e) {
      const d = getSkin(e), nj = d.parents.length, bones = []; let root = null;
      for (let i = 0; i < nj; i++) { const b = new THREE.Bone(); b.position.set(d.bt[i * 3] / 2000, d.bt[i * 3 + 1] / 2000, d.bt[i * 3 + 2] / 2000); b.quaternion.set(d.br[i * 4] / 16383, d.br[i * 4 + 1] / 16383, d.br[i * 4 + 2] / 16383, d.br[i * 4 + 3] / 16383); bones.push(b); }
      for (let i = 0; i < nj; i++) { if (d.parents[i] >= 0) bones[d.parents[i]].add(bones[i]); else root = bones[i]; }
      const mesh = new THREE.SkinnedMesh(d.geo, new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));
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
    const yaws = [0, 0.5, 1.57, 3.14, 4.71];
    const cycs = [0, 0.28, 0.6];
    const CELL = 260, W = yaws.length * CELL, H = cycs.length * (CELL + 16);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(CELL, CELL);
    const out = document.createElement('canvas'); out.width = W; out.height = H; const octx = out.getContext('2d'); octx.fillStyle = '#2a2f36'; octx.fillRect(0, 0, W, H);
    const h = e.h || 1.2;
    for (let ci = 0; ci < cycs.length; ci++) for (let yi = 0; yi < yaws.length; yi++) {
      const sk = build(e); pose(sk, cycs[ci]);
      const sc = new THREE.Scene(); sc.background = new THREE.Color(0x3a4048); sc.add(new THREE.AmbientLight(0xffffff, 0.9));
      const dl = new THREE.DirectionalLight(0xffffff, 0.5); dl.position.set(2, 4, 3); sc.add(dl);
      const g = new THREE.Group(); g.add(sk.grp); sc.add(g); g.rotation.y = yaws[yi];
      const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 100); cam.position.set(0, h * 0.55, h * 2.1); cam.lookAt(0, h * 0.5, 0);
      renderer.render(sc, cam);
      const cx = yi * CELL, cy = ci * (CELL + 16); octx.drawImage(renderer.domElement, cx, cy, CELL, CELL);
      octx.fillStyle = '#fff'; octx.font = '11px monospace'; octx.fillText('yaw' + yaws[yi].toFixed(1) + ' cyc' + cycs[ci], cx + 3, cy + CELL + 12);
    }
    return out.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(__dirname, 'aigen', 'inspect_' + NAME + '.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('saved aigen/inspect_' + NAME + '.png');
  await browser.close(); server.close();
})().catch(e => { console.error(String(e)); process.exit(1); });
