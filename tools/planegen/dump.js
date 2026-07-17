const fs = require('fs');
const file = process.argv[2];
const b = fs.readFileSync(file);
const jsonLen = b.readUInt32LE(12);
const json = JSON.parse(b.slice(20, 20 + jsonLen).toString('utf8'));
let off = 20 + jsonLen, bin = null;
while (off < b.length) { const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4); if (type === 0x004E4942) { bin = b.slice(off + 8, off + 8 + len); break; } off += 8 + len; }
function acc(i){const a=json.accessors[i],bv=json.bufferViews[a.bufferView];const start=(bv.byteOffset||0)+(a.byteOffset||0);const n=a.count*{SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];const C={5126:Float32Array,5123:Uint16Array,5125:Uint32Array,5121:Uint8Array}[a.componentType];return new C(bin.buffer,bin.byteOffset+start,n);}
function mTRS(n){if(n.matrix)return n.matrix.slice();const t=n.translation||[0,0,0],q=n.rotation||[0,0,0,1],s=n.scale||[1,1,1];const[x,y,z,w]=q,x2=x+x,y2=y+y,z2=z+z,xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;return[(1-(yy+zz))*s[0],(xy+wz)*s[0],(xz-wy)*s[0],0,(xy-wz)*s[1],(1-(xx+zz))*s[1],(yz+wx)*s[1],0,(xz+wy)*s[2],(yz-wx)*s[2],(1-(xx+yy))*s[2],0,t[0],t[1],t[2],1];}
function mul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;}
function xf(m,p){return[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];}
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const out=[];
function walk(ni,parent){const n=json.nodes[ni];const world=mul(parent,mTRS(n));if(n.mesh!==undefined){const tris=[];for(const prim of json.meshes[n.mesh].primitives){const P=acc(prim.attributes.POSITION);const Idx=prim.indices!==undefined?acc(prim.indices):null;const cnt=Idx?Idx.length:P.length/3;for(let k=0;k<cnt;k++){const vi=Idx?Idx[k]:k;const p=xf(world,[P[vi*3],P[vi*3+1],P[vi*3+2]]);tris.push(p[0],p[1],p[2]);}}out.push({name:n.name,pivot:xf(world,[0,0,0]),tris});}for(const c of n.children||[])walk(c,world);}
const scene=json.scenes[json.scene||0];for(const ni of scene.nodes)walk(ni,I);
fs.writeFileSync(process.argv[3],JSON.stringify(out));
console.log('dumped',out.length,'objects');
