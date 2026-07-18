// Render a GLB's RAW Meshy texture dead-on rear + rear-3/4, no game processing.
// node rawview.js FILE.glb OUTPREFIX
const path = require('path'); const fs = require('fs');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const src = fs.readFileSync('porschepreview.js', 'utf8');
eval(src.split('const FILE =')[0].replace(/^let chromium.*$/m, ''));
const model = parseGLB(process.argv[2]);
const three = fs.readFileSync(path.join(__dirname, '..', '..', 'three.min.js'), 'utf8');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
  await page.setContent('<canvas id=c></canvas>');
  await page.addScriptTag({ content: three });
  // the raw GLB nose direction is unknown; render BOTH ends dead-on + one 3/4
  const views = [
    { n: 'endA', yaw: Math.PI / 2, pitch: 0.08 }, { n: 'endB', yaw: -Math.PI / 2, pitch: 0.08 },
    { n: 'q34', yaw: -Math.PI * 0.3, pitch: 0.2 },
  ];
  for (const v of views) {
    const data = await page.evaluate(async (o) => {
      const { model, view } = o;
      const rnd = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      rnd.setSize(900, 620); rnd.setClearColor(0xcdd4d9, 1);
      const sc = new THREE.Scene();
      sc.add(new THREE.AmbientLight(0xffffff, 0.95));
      const dl = new THREE.DirectionalLight(0xffffff, 0.5); dl.position.set(2, 6, 3); sc.add(dl);
      const texes = await Promise.all(model.images.map(s2 => s2 ? new Promise(res => { const im = new Image(); im.src = s2; im.onload = () => { const t = new THREE.Texture(im); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; res(t); }; im.onerror = () => res(null); }) : Promise.resolve(null)));
      const grp = new THREE.Group();
      let mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9];
      for (const pr of model.prims) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pr.pos), 3));
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pr.uv), 2));
        g.computeVertexNormals();
        const tex = pr.texIdx >= 0 ? texes[pr.texIdx] : null;
        grp.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial(tex ? { map: tex } : { color: 0x3366bb })));
        for (let i = 0; i < pr.pos.length; i += 3) for (let a = 0; a < 3; a++) { mn[a]=Math.min(mn[a],pr.pos[i+a]); mx[a]=Math.max(mx[a],pr.pos[i+a]); }
      }
      grp.position.set(-(mn[0]+mx[0])/2, -(mn[1]+mx[1])/2, -(mn[2]+mx[2])/2); sc.add(grp);
      // long axis may be x or z in raw space: orbit around Y hits both ends either way
      const r = Math.max(mx[0]-mn[0], mx[1]-mn[1], mx[2]-mn[2]);
      const cam = new THREE.PerspectiveCamera(28, 900/620, 0.01, 1000);
      const d = r * 2.0;
      cam.position.set(Math.sin(view.yaw)*d*Math.cos(view.pitch), Math.sin(view.pitch)*d, Math.cos(view.yaw)*d*Math.cos(view.pitch));
      cam.lookAt(0, 0, 0);
      rnd.render(sc, cam);
      return rnd.domElement.toDataURL('image/png');
    }, { model, view: v });
    fs.writeFileSync('work/' + process.argv[3] + '_' + v.n + '.png', Buffer.from(data.split(',')[1], 'base64'));
    console.log('wrote', process.argv[3] + '_' + v.n);
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e && e.message); process.exit(2); });
