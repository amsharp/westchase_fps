const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const three = fs.readFileSync(path.resolve(__dirname,'../../three.min.js'),'utf8');
const planejs = fs.readFileSync(path.resolve(__dirname,'../../plane.js'),'utf8');
const html = `<!doctype html><body><canvas id=c width=640 height=480></canvas>
<script>${three}</script><script>window.THREE=THREE;</script><script>${planejs}</script><script>
var R=new THREE.WebGLRenderer({canvas:c,antialias:true});R.setClearColor(0x8aa0be);
var scene=new THREE.Scene();scene.add(new THREE.AmbientLight(0xffffff,0.8));
var dl=new THREE.DirectionalLight(0xffffff,0.7);dl.position.set(0.5,1,0.6);scene.add(dl);
var built=WC_PLANE.build();scene.add(built.group);
window.__built = { hasGroup:!!built.group, parts:Object.keys(built.parts), children:built.group.children.length };
// bbox
var box=new THREE.Box3().setFromObject(built.group); var s=box.getSize(new THREE.Vector3()), c2=box.getCenter(new THREE.Vector3());
window.__bbox={size:[s.x.toFixed(2),s.y.toFixed(2),s.z.toFixed(2)],ctr:[c2.x.toFixed(2),c2.y.toFixed(2),c2.z.toFixed(2)]};
window.setGear01=function(t){WC_PLANE.setGear(built.parts,t);};
window.setCtl=function(a,e,r){WC_PLANE.setControls(built.parts,a,e,r);};
window.shoot=function(v){ var rad=9; var cam=new THREE.OrthographicCamera(-rad,rad,rad*0.75,-rad*0.75,-100,100);
  if(v==='side'){cam.position.set(20,0,0);}
  if(v==='threeq'){cam.position.set(14,7,16);}
  if(v==='top'){cam.position.set(0,20,0);cam.up.set(0,0,-1);}
  cam.lookAt(0,0,0);R.render(scene,cam);return R.domElement.toDataURL('image/png');};
window.__ready=true;
</script></body>`;
fs.writeFileSync(path.resolve(__dirname,'_bc.html'),html);
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+path.resolve(__dirname,'_bc.html'),{waitUntil:'domcontentloaded'});
await p.waitForFunction('window.__ready===true',{timeout:30000});
console.log('built:',JSON.stringify(await p.evaluate(()=>window.__built)));
console.log('bbox:',JSON.stringify(await p.evaluate(()=>window.__bbox)));
await p.waitForTimeout(500);
for(const v of ['threeq','side','top']){const u=await p.evaluate(v=>window.shoot(v),v);fs.writeFileSync(path.resolve(__dirname,'built_'+v+'.png'),Buffer.from(u.split(',')[1],'base64'));}
// gear retracted view
await p.evaluate(()=>window.setGear01(1)); await p.waitForTimeout(100);
{const u=await p.evaluate(()=>window.shoot('threeq'));fs.writeFileSync(path.resolve(__dirname,'built_gearup.png'),Buffer.from(u.split(',')[1],'base64'));}
console.log('errors:',errs.length,JSON.stringify(errs.slice(0,4)));
await b.close();})().catch(e=>{console.error('FATAL',e);process.exit(2);});
