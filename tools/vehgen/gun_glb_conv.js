// raw gun json -> MESHY_GUNS entry json. Rotate about Y (deg) so the muzzle
// lands on -X, up +Y, left side +Z; center at origin; quantize.
const fs=require('fs');
const RAW=process.argv[2], OUT=process.argv[3], NAME=process.argv[4], ROTY=+(process.argv[5]||0), FLIPZ=process.argv[6]==='flipz';
const d=JSON.parse(fs.readFileSync(RAW,'utf8'));
const a=ROTY*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a);
const P=d.P.slice();
for(let i=0;i<P.length;i+=3){let x=P[i],y=P[i+1],z=P[i+2];
  let nx=x*ca+z*sa, nz=-x*sa+z*ca; if(FLIPZ)nz=-nz;
  P[i]=nx;P[i+1]=y;P[i+2]=nz;}
// center
let mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9,mnz=1e9,mxz=-1e9;
for(let i=0;i<P.length;i+=3){mnx=Math.min(mnx,P[i]);mxx=Math.max(mxx,P[i]);mny=Math.min(mny,P[i+1]);mxy=Math.max(mxy,P[i+1]);mnz=Math.min(mnz,P[i+2]);mxz=Math.max(mxz,P[i+2]);}
const cx=(mnx+mxx)/2,cy=(mny+mxy)/2,cz=(mnz+mxz)/2;
let maxAbs=0;
for(let i=0;i<P.length;i+=3){P[i]-=cx;P[i+1]-=cy;P[i+2]-=cz;maxAbs=Math.max(maxAbs,Math.abs(P[i]),Math.abs(P[i+1]),Math.abs(P[i+2]));}
const dims=[mxx-mnx,mxy-mny,mxz-mnz];
const q=32767/maxAbs;
const qp=new Int16Array(P.length); for(let i=0;i<P.length;i++)qp[i]=Math.round(P[i]*q);
const qu=new Uint16Array(d.U.length); for(let i=0;i<d.U.length;i++)qu[i]=Math.max(0,Math.min(65535,Math.round(d.U[i]*8192)));
const qi=new Uint16Array(d.I);
const entry={n:NAME,q,tris:d.I.length/3,dims,
  p:Buffer.from(qp.buffer).toString('base64'),
  u:Buffer.from(qu.buffer).toString('base64'),
  i:Buffer.from(qi.buffer).toString('base64'),
  tex:d.tex};
fs.writeFileSync(OUT,JSON.stringify(entry));
console.log(NAME,'roty',ROTY,'flipz',FLIPZ,'dims',dims.map(x=>x.toFixed(2)),'lenX',dims[0].toFixed(2),'q',q.toFixed(1));
