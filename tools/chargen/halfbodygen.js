// halfbodygen.js — builds the generic bloody half-body gib (halfbody.js) used by
// the AXE bisection. Pipeline: gpt-image-1 seed of a plain low-poly full body ->
// Meshy image-to-3d (lowpoly, remesh, ~1400 tris, NO rigging) -> this script:
// split the body down the sagittal plane (x=0), keep one half, cap the flat cut
// face with a bloody fan, normalize (feet at y=0, cut plane at x=0), quantize.
// A separate chromium step paints a gory red patch into the texture's bottom-right
// corner (cap UV 0.985) and downsizes to a 256px JPEG; then assemble into
// `var HALFBODY_DATA = {q,dims,p,u,tex}`. At runtime ONE half is stored and
// mirrored (scale.x=-1) to make the other half — reused for every NPC/cop.
//   node halfbodygen.js body.glb   ->   halfbody_data.json
const fs=require('fs'),path=require('path');
const fs=require('fs'),path=require('path');
const GLB=process.argv[2], DIR=__dirname;
const b=fs.readFileSync(GLB);
const jl=b.readUInt32LE(12); const json=JSON.parse(b.slice(20,20+jl).toString('utf8'));
let off=20+jl,bin=null; while(off<b.length){const len=b.readUInt32LE(off),t=b.readUInt32LE(off+4); if(t===0x004E4942){bin=b.slice(off+8,off+8+len);break;} off+=8+len;}
function acc(i){const a=json.accessors[i],bv=json.bufferViews[a.bufferView];const s=(bv.byteOffset||0)+(a.byteOffset||0);const comp={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];const C={5126:Float32Array,5123:Uint16Array,5125:Uint32Array,5121:Uint8Array}[a.componentType];return new C(bin.buffer,bin.byteOffset+s,a.count*comp);}
// gather triangles (world = local, single node identity)
const tris=[]; // each: [{x,y,z,u,v}*3]
for(const m of json.meshes)for(const pr of m.primitives){
  const pos=acc(pr.attributes.POSITION), uv=pr.attributes.TEXCOORD_0!=null?acc(pr.attributes.TEXCOORD_0):null;
  const idx=pr.indices!=null?acc(pr.indices):null; const n=idx?idx.length:pos.length/3;
  for(let k=0;k<n;k+=3){const a=idx?idx[k]:k,c=idx?idx[k+1]:k+1,d=idx?idx[k+2]:k+2;
    const V=g=>({x:pos[g*3],y:pos[g*3+1],z:pos[g*3+2],u:uv?uv[g*2]:0,v:uv?uv[g*2+1]:0});
    tris.push([V(a),V(c),V(d)]);}}
// texture
let tex=null; if(json.images&&json.images[0]){const im=json.images[0],bv=json.bufferViews[im.bufferView];tex='data:'+(im.mimeType||'image/png')+';base64,'+bin.slice(bv.byteOffset||0,(bv.byteOffset||0)+bv.byteLength).toString('base64');}

const CUT=0, EPS=1e-6;
function lerp(a,c,t){return {x:a.x+(c.x-a.x)*t,y:a.y+(c.y-a.y)*t,z:a.z+(c.z-a.z)*t,u:a.u+(c.u-a.u)*t,v:a.v+(c.v-a.v)*t,onp:true};}
const out=[]; const bedges=[]; // boundary edges (verts on plane)
for(const T of tris){
  const poly=[];
  for(let i=0;i<3;i++){
    const cur=T[i],nxt=T[(i+1)%3];
    const ci=cur.x<=CUT+EPS, ni=nxt.x<=CUT+EPS;
    if(ci){const cc=Object.assign({},cur);cc.onp=Math.abs(cur.x-CUT)<1e-4;poly.push(cc);}
    if(ci!==ni){const t=(CUT-cur.x)/(nxt.x-cur.x);const nv=lerp(cur,nxt,t);nv.x=CUT;poly.push(nv);}
  }
  if(poly.length<3)continue;
  // fan triangulate
  for(let i=1;i<poly.length-1;i++)out.push([poly[0],poly[i],poly[i+1]]);
  // boundary edges: consecutive poly verts both on plane
  for(let i=0;i<poly.length;i++){const a=poly[i],c=poly[(i+1)%poly.length];if(a.onp&&c.onp)bedges.push([a,c]);}
}
// bloody cap: fan each boundary edge to a spine point at x=0
let zc=0,cn=0; for(const e of bedges){zc+=e[0].z+e[1].z;cn+=2;} zc=cn?zc/cn:0;
const CAPU=0.985,CAPV=0.985;
for(const e of bedges){const a=e[0],c=e[1];const s={x:CUT,y:(a.y+c.y)/2,z:zc};
  out.push([{x:a.x,y:a.y,z:a.z,u:CAPU,v:CAPV},{x:c.x,y:c.y,z:c.z,u:CAPU,v:CAPV},{x:s.x,y:s.y,z:s.z,u:CAPU,v:CAPV}]);}
console.log('kept tris',out.length,'boundary edges',bedges.length);
// normalize: feet(min y) -> 0
let miny=1e9,maxy=-1e9,maxAbs=0,minx=1e9,maxx=-1e9,minz=1e9,maxz=-1e9;
for(const T of out)for(const p of T){miny=Math.min(miny,p.y);maxy=Math.max(maxy,p.y);minx=Math.min(minx,p.x);maxx=Math.max(maxx,p.x);minz=Math.min(minz,p.z);maxz=Math.max(maxz,p.z);}
// fan triangulation shares vertex objects across tris — shift each UNIQUE vert once
const seen=new Set();
for(const T of out)for(const p of T){if(seen.has(p))continue;seen.add(p);p.y-=miny;maxAbs=Math.max(maxAbs,Math.abs(p.x),Math.abs(p.y),Math.abs(p.z));}
const dims=[maxx-minx,maxy-miny,maxz-minz];
// quantize
const q=32767/maxAbs; const P=[],U=[];
for(const T of out)for(const p of T){P.push(Math.round(p.x*q),Math.round(p.y*q),Math.round(p.z*q));U.push(Math.round(Math.min(1,Math.max(0,p.u))*8192),Math.round(Math.min(1,Math.max(0,p.v))*8192));}
const pB=Buffer.from(new Int16Array(P).buffer).toString('base64');
const uB=Buffer.from(new Uint16Array(U).buffer).toString('base64');
fs.writeFileSync(path.join(DIR,'halfbody_data.json'),JSON.stringify({q,dims,p:pB,u:uB,verts:P.length/3,tex}));
console.log('dims',dims.map(d=>d.toFixed(3)),'verts',P.length/3,'maxAbs',maxAbs.toFixed(3));
console.log('wrote halfbody_data.json');
