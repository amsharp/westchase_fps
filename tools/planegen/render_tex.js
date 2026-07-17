// Render the ORIGINAL geometry (with its UVs) using Meshy's base-color texture,
// to confirm the decoupled approach (your mesh + Meshy paint) lines up. 3 views.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const { parseGLB } = require('../chargen/glbparse.js');
const SCRATCH = '/tmp/claude-0/-home-user-westchase-fps/6762ca26-85bb-50ae-aa02-dab118a4400c/scratchpad';
const ORIG = process.argv[2] || (SCRATCH + '/../../../../../root/.claude/uploads/6762ca26-85bb-50ae-aa02-dab118a4400c/ec5d50fd-learjet.glb');
const origPath = '/root/.claude/uploads/6762ca26-85bb-50ae-aa02-dab118a4400c/ec5d50fd-learjet.glb';
const parsed = parseGLB(origPath);
// merge all prims into one position+uv soup (visual check only)
const pos = [], uv = [];
parsed.prims.forEach(p => { pos.push(...p.pos); uv.push(...p.uv); });
const texB64 = fs.readFileSync(SCRATCH + '/learjet_tex.png').toString('base64');
const threeSrc = fs.readFileSync(path.resolve(__dirname, '../../three.min.js'), 'utf8');
const html = `<!doctype html><html><head><meta charset=utf8></head><body><canvas id=c width=560 height=560></canvas>
<script>${threeSrc}</script><script>
const POS=${JSON.stringify(pos)}, UV=${JSON.stringify(uv)};
const renderer=new THREE.WebGLRenderer({canvas:document.getElementById('c'),antialias:true});
renderer.setClearColor(0x88a0c0);
const scene=new THREE.Scene();
const g=new THREE.BufferGeometry();
g.setAttribute('position',new THREE.Float32BufferAttribute(POS,3));
g.setAttribute('uv',new THREE.Float32BufferAttribute(UV,2));
g.computeVertexNormals();
const img=new Image();
const tex=new THREE.Texture(); tex.flipY=false;
window.__ready=false;
img.onload=function(){ tex.image=img; tex.needsUpdate=true; window.__ready=true; };
img.src='data:image/png;base64,${texB64}';
const mat=new THREE.MeshBasicMaterial({map:tex, side:THREE.DoubleSide});
const mesh=new THREE.Mesh(g,mat); scene.add(mesh);
let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
for(let i=0;i<POS.length;i+=3){for(let d=0;d<3;d++){mn[d]=Math.min(mn[d],POS[i+d]);mx[d]=Math.max(mx[d],POS[i+d]);}}
const ctr=[(mn[0]+mx[0])/2,(mn[1]+mx[1])/2,(mn[2]+mx[2])/2];
const rad=Math.max(mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2])*0.62;
const cam=new THREE.OrthographicCamera(-rad,rad,rad,-rad,-1000,1000);
window.shoot=function(v){
  if(v==='plan'){cam.position.set(ctr[0],ctr[1]+rad,ctr[2]);cam.up.set(0,0,-1);}   // model up is -Z; looking down +Y shows the plan
  if(v==='side'){cam.position.set(ctr[0]+rad,ctr[1],ctr[2]);cam.up.set(0,0,-1);}
  if(v==='belly'){cam.position.set(ctr[0],ctr[1]-rad,ctr[2]);cam.up.set(0,0,1);}
  cam.lookAt(ctr[0],ctr[1],ctr[2]);
  renderer.render(scene,cam);
  return renderer.domElement.toDataURL('image/png');
};
</script></body></html>`;
fs.writeFileSync(path.resolve(__dirname, '_rtex.html'), html);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage();
  await p.goto('file://' + path.resolve(__dirname, '_rtex.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__ready===true', { timeout: 30000 });
  for (const v of ['plan', 'side', 'belly']) {
    const url = await p.evaluate(v => window.shoot(v), v);
    fs.writeFileSync(path.resolve(__dirname, 'tex_' + v + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote tex_' + v + '.png');
  }
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
