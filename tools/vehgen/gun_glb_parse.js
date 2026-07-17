// parse GLB -> world-space triangle soup + base-color texture -> ak_raw.json
const fs=require('fs');
const GLB=process.argv[2], OUT=process.argv[3];
const b=fs.readFileSync(GLB);
const jl=b.readUInt32LE(12); const json=JSON.parse(b.slice(20,20+jl).toString('utf8'));
let off=20+jl,bin=null; while(off<b.length){const len=b.readUInt32LE(off),t=b.readUInt32LE(off+4); if(t===0x004E4942){bin=b.slice(off+8,off+8+len);break;} off+=8+len;}
function acc(i){const a=json.accessors[i],bv=json.bufferViews[a.bufferView];const s=(bv.byteOffset||0)+(a.byteOffset||0);const comp={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type];const C={5126:Float32Array,5123:Uint16Array,5125:Uint32Array,5121:Uint8Array,5122:Int16Array,5120:Int8Array}[a.componentType];return new C(bin.buffer,bin.byteOffset+s,a.count*comp);}
function mul(a,c){const o=new Array(16);for(let r=0;r<4;r++)for(let cc=0;cc<4;cc++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*c[cc*4+k];o[cc*4+r]=s;}return o;}
function trs(n){if(n.matrix)return n.matrix.slice();const t=n.translation||[0,0,0],q=n.rotation||[0,0,0,1],s=n.scale||[1,1,1];const[x,y,z,w]=q,x2=x+x,y2=y+y,z2=z+z,xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;return[(1-(yy+zz))*s[0],(xy+wz)*s[0],(xz-wy)*s[0],0,(xy-wz)*s[1],(1-(xx+zz))*s[1],(yz+wx)*s[1],0,(xz+wy)*s[2],(yz-wx)*s[2],(1-(xx+yy))*s[2],0,t[0],t[1],t[2],1];}
const P=[],U=[],I=[];let base=0;
const scene=json.scenes[json.scene||0];
// pick base-color texture from material 0 if present
let texImgIdx=0;
if(json.materials&&json.materials[0]&&json.materials[0].pbrMetallicRoughness&&json.materials[0].pbrMetallicRoughness.baseColorTexture){
  const ti=json.materials[0].pbrMetallicRoughness.baseColorTexture.index; texImgIdx=json.textures[ti].source;
}
function walk(ni,parent){const n=json.nodes[ni];const m=mul(parent,trs(n));
  if(n.mesh!=null){for(const pr of json.meshes[n.mesh].primitives){
    const pos=acc(pr.attributes.POSITION);const uv=pr.attributes.TEXCOORD_0!=null?acc(pr.attributes.TEXCOORD_0):null;const idx=pr.indices!=null?acc(pr.indices):null;const vc=pos.length/3;
    for(let v=0;v<vc;v++){const x=pos[v*3],y=pos[v*3+1],z=pos[v*3+2];
      P.push(m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]);
      U.push(uv?uv[v*2]:0,uv?uv[v*2+1]:0);}
    if(idx)for(let k=0;k<idx.length;k++)I.push(base+idx[k]);else for(let k=0;k<vc;k++)I.push(base+k);
    base+=vc;}}
  if(n.children)for(const c of n.children)walk(c,m);}
for(const ni of scene.nodes)walk(ni,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
let tex=null;const im=json.images[texImgIdx]||json.images[0];
if(im){const bv=json.bufferViews[im.bufferView];tex='data:'+(im.mimeType||'image/png')+';base64,'+bin.slice(bv.byteOffset||0,(bv.byteOffset||0)+bv.byteLength).toString('base64');}
let mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9,mnz=1e9,mxz=-1e9;
for(let i=0;i<P.length;i+=3){mnx=Math.min(mnx,P[i]);mxx=Math.max(mxx,P[i]);mny=Math.min(mny,P[i+1]);mxy=Math.max(mxy,P[i+1]);mnz=Math.min(mnz,P[i+2]);mxz=Math.max(mxz,P[i+2]);}
fs.writeFileSync(OUT,JSON.stringify({P,U,I,tex,bbox:[mnx,mxx,mny,mxy,mnz,mxz],tris:I.length/3,texImgIdx,nImages:json.images.length}));
console.log('verts',P.length/3,'tris',I.length/3,'bbox x',mnx.toFixed(2),mxx.toFixed(2),'y',mny.toFixed(2),mxy.toFixed(2),'z',mnz.toFixed(2),mxz.toFixed(2),'texImg',texImgIdx,'/',json.images.length);
