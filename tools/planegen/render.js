// Render the plane geometry from 3 orthographic views (front/side/top) with each
// object in a distinct color, so we can see nose/up orientation. Uses the game's
// vendored three.min.js in a headless page.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const geo = fs.readFileSync(path.resolve(__dirname, 'geo.json'), 'utf8');
const threeSrc = fs.readFileSync(path.resolve(__dirname, '../../three.min.js'), 'utf8');
const COLORS = { body: 0xcccccc, gearNose: 0xff3030, gearL: 0x30a0ff, gearR: 0x30ff60, aileronL: 0xffd020, aileronR: 0xff8020, elevator: 0xc040ff, rudder: 0x20ffe0 };
const html = `<!doctype html><html><head><meta charset=utf8></head><body><canvas id=c width=520 height=520></canvas>
<script>${threeSrc}</script><script>
const OBJS = ${geo};
const COL = ${JSON.stringify(COLORS)};
const renderer = new THREE.WebGLRenderer({canvas:document.getElementById('c'),antialias:true});
renderer.setClearColor(0x202028);
const scene = new THREE.Scene();
const grp = new THREE.Group();
let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
OBJS.forEach(o=>{
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(o.tris,3));
  g.computeVertexNormals();
  const m=new THREE.MeshLambertMaterial({color:COL[o.name]||0x888888, side:THREE.DoubleSide, flatShading:true});
  grp.add(new THREE.Mesh(g,m));
  for(let i=0;i<o.tris.length;i+=3){for(let d=0;d<3;d++){mn[d]=Math.min(mn[d],o.tris[i+d]);mx[d]=Math.max(mx[d],o.tris[i+d]);}}
});
scene.add(grp);
const ctr=[(mn[0]+mx[0])/2,(mn[1]+mx[1])/2,(mn[2]+mx[2])/2];
const rad=Math.max(mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]);
scene.add(new THREE.AmbientLight(0xffffff,0.6));
const dl=new THREE.DirectionalLight(0xffffff,0.8); dl.position.set(1,1,1); scene.add(dl);
const cam=new THREE.OrthographicCamera(-rad*0.6,rad*0.6,rad*0.6,-rad*0.6,-1000,1000);
window.shoot=function(view){
  if(view==='front'){cam.position.set(ctr[0],ctr[1],ctr[2]+rad);cam.up.set(0,1,0);}      // looking down -Z (game 'front' = toward nose if nose +Z)
  if(view==='side'){cam.position.set(ctr[0]+rad,ctr[1],ctr[2]);cam.up.set(0,1,0);}        // looking down -X (right side)
  if(view==='top'){cam.position.set(ctr[0],ctr[1]+rad,ctr[2]);cam.up.set(0,0,-1);}        // looking down -Y
  cam.lookAt(ctr[0],ctr[1],ctr[2]);
  renderer.render(scene,cam);
  return renderer.domElement.toDataURL('image/png');
};
window.ready=true;
</script></body></html>`;
fs.writeFileSync(path.resolve(__dirname, '_render.html'), html);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage();
  await p.goto('file://' + path.resolve(__dirname, '_render.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.ready===true', { timeout: 30000 });
  for (const v of ['front', 'side', 'top']) {
    const url = await p.evaluate(v => window.shoot(v), v);
    fs.writeFileSync(path.resolve(__dirname, 'view_' + v + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote view_' + v + '.png');
  }
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
