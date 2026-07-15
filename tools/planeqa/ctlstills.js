const { chromium } = require('playwright'); const path=require('path'),fs=require('fs');
const three=fs.readFileSync(path.resolve(__dirname,'../../three.min.js'),'utf8');
const planejs=fs.readFileSync(path.resolve(__dirname,'../../plane.js'),'utf8');
const html=`<!doctype html><body><canvas id=gl width=720 height=460></canvas>
<script>${three}</script><script>window.THREE=THREE;</script><script>${planejs}</script><script>
var R=new THREE.WebGLRenderer({canvas:gl,antialias:true});R.setClearColor(0x8fb0d6);
var scene=new THREE.Scene();scene.add(new THREE.AmbientLight(0xffffff,0.85));
var dl=new THREE.DirectionalLight(0xffffff,0.75);dl.position.set(0.5,1,0.4);scene.add(dl);
var built=WC_PLANE.build();scene.add(built.group);
var cam=new THREE.PerspectiveCamera(42,720/460,0.1,400);
function look(px,py,pz,tx,ty,tz){cam.position.set(px,py,pz);cam.lookAt(tx,ty,tz);}
window.shot=function(camv,a,e,r,g){WC_PLANE.setControls(built.parts,a,e,r);WC_PLANE.setGear(built.parts,g);
 if(camv==='ail')look(3,9,-15,0,0.5,1);else if(camv==='elev')look(17,2.5,-7,0,1.2,-5);
 else if(camv==='rud')look(2,15,-9,0,0.5,-5);else if(camv==='gear')look(9,-4,13,0,-1,3);
 R.render(scene,cam);return gl.toDataURL('image/png');};
window.__ready=true;</script></body>`;
fs.writeFileSync(path.resolve(__dirname,'_cs.html'),html);
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage();await p.goto('file://'+path.resolve(__dirname,'_cs.html'),{waitUntil:'domcontentloaded'});
await p.waitForFunction('window.__ready===true',{timeout:30000});
const shots=[['ail',1,0,0,0],['elev',0,1,0,0],['rud',0,0,1,0],['gear',0,0,0,0.55]];
for(const s of shots){const u=await p.evaluate(a=>window.shot(a[0],a[1],a[2],a[3],a[4]),s);
 fs.writeFileSync(path.resolve(__dirname,'cs_'+s[0]+'.png'),Buffer.from(u.split(',')[1],'base64'));}
console.log('wrote 4 stills');await b.close();})().catch(e=>{console.error(e);process.exit(2);});
