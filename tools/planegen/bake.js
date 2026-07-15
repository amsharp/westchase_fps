// Bake per-object livery textures (ORIGINAL UVs preserved) by position-driven
// painting, then render the assembled textured plane for verification.
// Model space: nose +Y, up = -Z (h=-z), ground +Z, wings +-X.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GEO = fs.readFileSync(path.resolve(__dirname, 'planegeo.json'), 'utf8');
const three = fs.readFileSync(path.resolve(__dirname, '../../three.min.js'), 'utf8');

// ---- the paint function (ES5, will be ported into plane.js). Returns [r,g,b]. ----
const PAINT = `
function planeColor(x,y,z,nx,ny,nz,obj){
  var WHITE=[233,237,240], NAVY=[27,47,110], SILVER=[150,156,164], BLACK=[16,17,21],
      WINDOW=[14,18,32], GLASS=[18,32,58], WHEEL=[20,20,24], RED=[200,32,42], GREEN=[31,159,67],
      RIM=[201,205,211], ANTI=[26,28,32];
  var ax=Math.abs(x), h=-z;
  if(obj==='gearNose'||obj==='gearL'||obj==='gearR'){ return (z>-0.28)?WHEEL:SILVER; }
  if(obj==='aileronL'||obj==='aileronR'||obj==='elevator'||obj==='rudder'){ return WHITE; }
  // ---- BODY ----
  // engine intake/exhaust end-caps (fake holes) + silver rim
  if(Math.abs(ny)>0.5 && ax>0.45 && ax<1.35){
    if(Math.abs(y-1.56)<0.14 || Math.abs(y+0.13)<0.14){
      var ex=(x>0?0.85:-0.85), ez=-0.72, rr=Math.sqrt((x-ex)*(x-ex)+(z-ez)*(z-ez));
      return (rr>0.23)?RIM:BLACK;
    }
  }
  // cockpit windscreen on the forward nose taper
  if(y>4.5 && y<5.05 && h>0.62 && ny>0.3){ if(ax<0.035) return WHITE; return GLASS; }
  // anti-glare panel on the nose top just ahead of the windscreen
  if(y>5.0 && y<5.4 && h>0.5 && nz<-0.3) return ANTI;
  // cabin windows: 5 per side, just above the cheatline
  if(ax>0.3 && Math.abs(nx)>0.5 && y>-1.05){
    var WY=[0.78,1.26,1.74,2.22,2.70], zc=-0.965, wi, dy, dz;
    for(wi=0;wi<5;wi++){ dy=(y-WY[wi])/0.15; dz=(z-zc)/0.075; if(dy*dy*dy*dy+dz*dz*dz*dz<1) return WINDOW; }
  }
  // cheatline: navy band + silver pinstripe on the fuselage sides
  if(Math.abs(nx)>0.55 && ax<0.6 && y>-1.05){
    if(z<=-0.85 && z>-0.905) return NAVY;
    if(z<=-0.828 && z>-0.85) return SILVER;
  }
  // wingtip-tank nav lights (red port -X, green starboard +X)
  if(y>2.32){ if(x<-2.85) return RED; if(x>2.85) return GREEN; }
  return WHITE;
}`;

const html = `<!doctype html><html><body><canvas id=c width=640 height=640></canvas>
<script>${three}</script><script>${PAINT}</script><script>
var GEO=${GEO};
// ---- N166ER text bitmap (for the fin) ----
function makeText(){ var t=document.createElement('canvas'); t.width=256; t.height=64; var g=t.getContext('2d');
  g.fillStyle='#fff'; g.fillRect(0,0,256,64); g.fillStyle='#12141c'; g.font='bold 46px Arial'; g.textAlign='center'; g.textBaseline='middle'; g.fillText('N166ER',128,34); return g.getImageData(0,0,256,64); }
var TXT=makeText();
function textAt(u,v){ var px=Math.floor(u*256), py=Math.floor((1-v)*64); if(px<0||px>255||py<0||py>63) return 255; return TXT.data[(py*256+px)*4]; }
// ---- bake one object's texture ----
function bake(obj, name, S){
  var cv=document.createElement('canvas'); cv.width=S; cv.height=S; var ctx=cv.getContext('2d');
  ctx.fillStyle='rgb(233,237,240)'; ctx.fillRect(0,0,S,S);
  var img=ctx.getImageData(0,0,S,S), D=img.data;
  var p=obj.p, u=obj.u, n=obj.n, idx=obj.i;
  for(var f=0;f<idx.length;f+=3){
    var a=idx[f],b=idx[f+1],c=idx[f+2];
    var ux=[u[a*2],u[b*2],u[c*2]], uy=[u[a*2+1],u[b*2+1],u[c*2+1]];
    // pixel coords (v flipped to match THREE flipY default)
    var X=[ux[0]*S,ux[1]*S,ux[2]*S], Y=[(1-uy[0])*S,(1-uy[1])*S,(1-uy[2])*S];
    var minx=Math.max(0,Math.floor(Math.min(X[0],X[1],X[2]))), maxx=Math.min(S-1,Math.ceil(Math.max(X[0],X[1],X[2])));
    var miny=Math.max(0,Math.floor(Math.min(Y[0],Y[1],Y[2]))), maxy=Math.min(S-1,Math.ceil(Math.max(Y[0],Y[1],Y[2])));
    var d=(X[1]-X[0])*(Y[2]-Y[0])-(X[2]-X[0])*(Y[1]-Y[0]); if(Math.abs(d)<1e-9) continue;
    for(var py=miny;py<=maxy;py++)for(var px=minx;px<=maxx;px++){
      var w0=((X[1]-px)*(Y[2]-py)-(X[2]-px)*(Y[1]-py))/d;
      var w1=((X[2]-px)*(Y[0]-py)-(X[0]-px)*(Y[2]-py))/d;
      var w2=1-w0-w1; if(w0<-0.001||w1<-0.001||w2<-0.001) continue;
      var X3=p[a*3]*w0+p[b*3]*w1+p[c*3]*w2, Y3=p[a*3+1]*w0+p[b*3+1]*w1+p[c*3+1]*w2, Z3=p[a*3+2]*w0+p[b*3+2]*w1+p[c*3+2]*w2;
      var NX=n[a*3]*w0+n[b*3]*w1+n[c*3]*w2, NY=n[a*3+1]*w0+n[b*3+1]*w1+n[c*3+1]*w2, NZ=n[a*3+2]*w0+n[b*3+2]*w1+n[c*3+2]*w2;
      var col=planeColor(X3,Y3,Z3,NX,NY,NZ,name);
      // N166ER on the fin sides (body only): fin region y[-2.05,-1.15], upper (h>1.3), side-facing
      if(name==='body' && Y3<-1.15 && Y3>-2.05 && (-Z3)>1.3 && Math.abs(NX)>0.5){
        var tu=(Y3-(-2.05))/((-1.15)-(-2.05)); // along fin length -> u
        if(NX>0) tu=1-tu;                        // mirror so it reads correctly on both faces
        var tv=((-Z3)-1.3)/(2.45-1.3);          // height -> v
        if(textAt(tu,tv)<128) col=[18,20,28];
      }
      var o=(py*S+px)*4; D[o]=col[0];D[o+1]=col[1];D[o+2]=col[2];D[o+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
  return cv.toDataURL('image/png');
}
window.__texes={};
window.doBake=function(){ for(var k in GEO){ window.__texes[k]=bake(GEO[k], k, k==='body'?1024:256); } return Object.keys(window.__texes); };
// ---- assemble textured model + render ----
var renderer=new THREE.WebGLRenderer({canvas:document.getElementById('c'),antialias:true}); renderer.setClearColor(0x8aa0be);
var scene=new THREE.Scene(); scene.add(new THREE.AmbientLight(0xffffff,0.72));
var dl=new THREE.DirectionalLight(0xffffff,0.7); dl.position.set(0.6,1,0.5); scene.add(dl);
var grp=new THREE.Group(); var mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
window.buildScene=function(){
  for(var k in GEO){ var o=GEO[k]; var g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(o.p,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(o.u,2));
    g.setIndex(o.i); g.computeVertexNormals();
    var tex=new THREE.Texture(); var im=new Image(); im.src=window.__texes[k]; tex.image=im; im.onload=(function(t){return function(){t.needsUpdate=true;};})(tex);
    grp.add(new THREE.Mesh(g,new THREE.MeshLambertMaterial({map:tex})));
    for(var i=0;i<o.p.length;i+=3)for(var dd=0;dd<3;dd++){mn[dd]=Math.min(mn[dd],o.p[i+dd]);mx[dd]=Math.max(mx[dd],o.p[i+dd]);}
  }
  scene.add(grp);
};
window.shoot=function(v){
  var ctr=[(mn[0]+mx[0])/2,(mn[1]+mx[1])/2,(mn[2]+mx[2])/2], rad=Math.max(mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2])*0.62;
  var cam=new THREE.OrthographicCamera(-rad,rad,rad,-rad,-1000,1000);
  if(v==='side'){cam.position.set(ctr[0]+rad,ctr[1],ctr[2]);cam.up.set(0,0,-1);}
  if(v==='plan'){cam.position.set(ctr[0],ctr[1]+rad,ctr[2]);cam.up.set(0,0,-1);}
  if(v==='nose34'){cam.position.set(ctr[0]+rad*0.7,ctr[1]+rad*0.5,ctr[2]+rad*0.6);cam.up.set(0,0,-1);}
  if(v==='rear'){cam.position.set(ctr[0],ctr[1]-rad,ctr[2]);cam.up.set(0,0,-1);}
  if(v==='nose'){var nx=mx[1]-0.9; cam=new THREE.OrthographicCamera(-1.4,1.4,1.4,-1.4,-1000,1000); cam.position.set(1.5,nx,1.2); cam.up.set(0,0,-1); cam.lookAt(0.1,nx,-0.7); renderer.render(scene,cam); return renderer.domElement.toDataURL('image/png');}
  cam.lookAt(ctr[0],ctr[1],ctr[2]); renderer.render(scene,cam);
  return renderer.domElement.toDataURL('image/png');
};
window.__ready=true;
</script></body></html>`;
fs.writeFileSync(path.resolve(__dirname, '_bake.html'), html);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '_bake.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__ready===true', { timeout: 30000 });
  const keys = await p.evaluate(() => window.doBake());
  console.log('baked textures:', keys.join(', '));
  // save per-object textures
  const texes = await p.evaluate(() => window.__texes);
  const outdir = path.resolve(__dirname, 'tex'); fs.mkdirSync(outdir, { recursive: true });
  for (const k in texes) fs.writeFileSync(path.join(outdir, k + '.png'), Buffer.from(texes[k].split(',')[1], 'base64'));
  await p.evaluate(() => window.buildScene());
  await p.waitForTimeout(400);
  for (const v of ['nose34','side','plan','rear','nose']) {
    const url = await p.evaluate(v => window.shoot(v), v);
    fs.writeFileSync(path.resolve(__dirname, 'bk_' + v + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote bk_' + v + '.png');
  }
  console.log('errors:', errs.length, JSON.stringify(errs.slice(0, 4)));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
