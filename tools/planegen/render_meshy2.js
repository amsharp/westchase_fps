const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const SCRATCH = '/tmp/claude-0/-home-user-westchase-fps/6762ca26-85bb-50ae-aa02-dab118a4400c/scratchpad';
function parse(file) {
  const b = fs.readFileSync(file);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.slice(20, 20 + jsonLen).toString('utf8'));
  let off = 20 + jsonLen, bin = null;
  while (off < b.length) { const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4); if (type === 0x004E4942) { bin = b.slice(off + 8, off + 8 + len); break; } off += 8 + len; }
  function acc(i) {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
    const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], n = a.count * comps;
    const CT = { 5126: [Float32Array, 4], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5121: [Uint8Array, 1] }[a.componentType];
    const bytes = Buffer.from(bin.subarray(start, start + n * CT[1])); return new CT[0](bytes.buffer, bytes.byteOffset, n);
  }
  const pos = [], uv = [];
  (json.nodes || []).forEach(nd => { if (nd.mesh === undefined) return; for (const prim of json.meshes[nd.mesh].primitives) { const P = acc(prim.attributes.POSITION), U = acc(prim.attributes.TEXCOORD_0), Idx = prim.indices !== undefined ? acc(prim.indices) : null; const cnt = Idx ? Idx.length : P.length / 3; for (let k = 0; k < cnt; k++) { const vi = Idx ? Idx[k] : k; pos.push(P[vi * 3], P[vi * 3 + 1], P[vi * 3 + 2]); uv.push(U[vi * 2], U[vi * 2 + 1]); } } });
  let img = null;
  if (json.images && json.images[0] && json.images[0].bufferView !== undefined) { const bv = json.bufferViews[json.images[0].bufferView]; img = 'data:' + (json.images[0].mimeType || 'image/png') + ';base64,' + bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength).toString('base64'); }
  return { pos, uv, img };
}
const M = parse(SCRATCH + '/learjet_textured.glb');
console.log('parsed meshy: verts=' + M.pos.length / 3 + ' hasImg=' + !!M.img);
const threeSrc = fs.readFileSync(path.resolve(__dirname, '../../three.min.js'), 'utf8');
const html = `<!doctype html><html><body><canvas id=c width=560 height=560></canvas><script>${threeSrc}</script><script>
const POS=${JSON.stringify(M.pos)},UV=${JSON.stringify(M.uv)};
const R=new THREE.WebGLRenderer({canvas:c,antialias:true});R.setClearColor(0x88a0c0);
const scene=new THREE.Scene();const g=new THREE.BufferGeometry();
g.setAttribute('position',new THREE.Float32BufferAttribute(POS,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(UV,2));g.computeVertexNormals();
const tex=new THREE.Texture();tex.flipY=false;const im=new Image();window.__ready=false;
im.onload=function(){tex.image=im;tex.needsUpdate=true;window.__ready=true;};im.src=${JSON.stringify(M.img)};
scene.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide})));
let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(let i=0;i<POS.length;i+=3)for(let d=0;d<3;d++){mn[d]=Math.min(mn[d],POS[i+d]);mx[d]=Math.max(mx[d],POS[i+d]);}
const ctr=[(mn[0]+mx[0])/2,(mn[1]+mx[1])/2,(mn[2]+mx[2])/2],rad=Math.max(mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2])*0.6;
const cam=new THREE.OrthographicCamera(-rad,rad,rad,-rad,-1000,1000);
window.shoot=function(v){if(v==='plan'){cam.position.set(ctr[0],ctr[1]+rad,ctr[2]);cam.up.set(0,0,-1);}if(v==='side'){cam.position.set(ctr[0]+rad,ctr[1],ctr[2]);cam.up.set(0,0,-1);}cam.lookAt(ctr[0],ctr[1],ctr[2]);R.render(scene,cam);return R.domElement.toDataURL('image/png');};
</script></body></html>`;
fs.writeFileSync(path.resolve(__dirname, '_rm2.html'), html);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage(); await p.goto('file://' + path.resolve(__dirname, '_rm2.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__ready===true', { timeout: 30000 });
  for (const v of ['plan', 'side']) { const url = await p.evaluate(v => window.shoot(v), v); fs.writeFileSync(path.resolve(__dirname, 'm2_' + v + '.png'), Buffer.from(url.split(',')[1], 'base64')); console.log('wrote m2_' + v + '.png'); }
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
