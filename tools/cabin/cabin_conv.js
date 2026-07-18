// raw gun-parse json ({P,U,I,tex,bbox}) -> cabin.js (var CABIN_DATA).
// Orient (rot about Y deg so the door faces +Z), center X/Z, drop bottom to y=0,
// quantize (int16 pos /q, uint16 uv*8192, uint16 index), downsize texture to
// <=256px JPEG. node cabin_conv.js raw.json out.js VARNAME [rotYdeg]
const fs=require('fs'), path=require('path');
const RAW=process.argv[2], OUT=process.argv[3], VAR=process.argv[4]||'CABIN_DATA', ROTY=+(process.argv[5]||0);
const d=JSON.parse(fs.readFileSync(RAW,'utf8'));
const a=ROTY*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a);
const P=d.P.slice();
for(let i=0;i<P.length;i+=3){const x=P[i],z=P[i+2]; P[i]=x*ca+z*sa; P[i+2]=-x*sa+z*ca;}
let mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9,mnz=1e9,mxz=-1e9;
for(let i=0;i<P.length;i+=3){mnx=Math.min(mnx,P[i]);mxx=Math.max(mxx,P[i]);mny=Math.min(mny,P[i+1]);mxy=Math.max(mxy,P[i+1]);mnz=Math.min(mnz,P[i+2]);mxz=Math.max(mxz,P[i+2]);}
const cx=(mnx+mxx)/2, cz=(mnz+mxz)/2;
let maxAbs=0;
for(let i=0;i<P.length;i+=3){P[i]-=cx; P[i+1]-=mny; P[i+2]-=cz; maxAbs=Math.max(maxAbs,Math.abs(P[i]),Math.abs(P[i+1]),Math.abs(P[i+2]));}
const dims=[mxx-mnx, mxy-mny, mxz-mnz];
const q=32767/maxAbs;
const qp=new Int16Array(P.length); for(let i=0;i<P.length;i++)qp[i]=Math.max(-32767,Math.min(32767,Math.round(P[i]*q)));
const qu=new Uint16Array(d.U.length); for(let i=0;i<d.U.length;i++)qu[i]=Math.max(0,Math.min(65535,Math.round(d.U[i]*8192)));
const qi=new Uint16Array(d.I);
(async()=>{
  // downsize texture with chromium
  let tex=d.tex;
  try{
    const { chromium }=require('/opt/node22/lib/node_modules/playwright');
    const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
    const pg=await b.newPage();
    tex=await pg.evaluate(async(src)=>{
      const im=new Image(); im.src=src; await im.decode();
      const M=256, sc=Math.min(1, M/Math.max(im.width,im.height));
      const w=Math.max(1,Math.round(im.width*sc)), h=Math.max(1,Math.round(im.height*sc));
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      const g=c.getContext('2d'); g.imageSmoothingEnabled=true; g.drawImage(im,0,0,w,h);
      // posterize a touch for the PSX look
      const id=g.getImageData(0,0,w,h); const p=id.data;
      for(let i=0;i<p.length;i++){ if(i%4!==3) p[i]=Math.round(p[i]/24)*24; }
      g.putImageData(id,0,0);
      return c.toDataURL('image/jpeg',0.82);
    }, d.tex);
    await b.close();
  }catch(e){ console.error('tex downsize failed, keeping original:', e.message); }
  const entry={q:+q.toFixed(3), dims:dims.map(x=>+x.toFixed(4)), tris:d.I.length/3,
    p:Buffer.from(qp.buffer).toString('base64'),
    u:Buffer.from(qu.buffer).toString('base64'),
    i:Buffer.from(qi.buffer).toString('base64'),
    tex};
  const js='// cabin.js — forest cabin model (Meshy image-to-3d from a pallet-wood shed seed).\n'+
    '// Quantized geo (int16 pos /q, uint16 uv/8192, uint16 index) + embedded 256px JPEG\n'+
    '// texture. Loaded before game.js; game guards typeof '+VAR+'. Bottom at y=0, centered\n'+
    '// in X/Z, door faces +Z. dims = authored [w,h,d]. tris:'+(d.I.length/3)+'\n'+
    'var '+VAR+' = '+JSON.stringify(entry)+';\n';
  fs.writeFileSync(OUT, js);
  console.log('wrote',OUT,'tris',d.I.length/3,'dims',dims.map(x=>x.toFixed(2)),'q',q.toFixed(1),'texlen',tex.length);
})();
