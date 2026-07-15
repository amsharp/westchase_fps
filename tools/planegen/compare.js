// Alignment-safe GLB reader. Compares the ORIGINAL vs Meshy-textured GLB:
// object/node structure, UV arrays (did enable_original_uv preserve them?), tris.
const fs = require('fs');
function parse(file) {
  const b = fs.readFileSync(file);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.slice(20, 20 + jsonLen).toString('utf8'));
  let off = 20 + jsonLen, bin = null;
  while (off < b.length) { const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4); if (type === 0x004E4942) { bin = b.slice(off + 8, off + 8 + len); break; } off += 8 + len; }
  function acc(i) {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
    const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const n = a.count * comps;
    const CT = { 5126: [Float32Array, 4], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5121: [Uint8Array, 1] }[a.componentType];
    const [C, sz] = CT;
    // alignment-safe: copy the exact bytes into a fresh aligned buffer
    const bytes = Buffer.from(bin.subarray(start, start + n * sz));
    return new C(bytes.buffer, bytes.byteOffset, n);
  }
  const objs = [];
  (json.nodes || []).forEach((nd, ni) => {
    if (nd.mesh === undefined) return;
    let uv = null, uvcount = 0, tris = 0;
    for (const prim of json.meshes[nd.mesh].primitives) {
      if (prim.attributes.TEXCOORD_0 !== undefined && !uv) uv = acc(prim.attributes.TEXCOORD_0);
      if (prim.attributes.TEXCOORD_0 !== undefined) uvcount += acc(prim.attributes.TEXCOORD_0).length / 2;
      const P = acc(prim.attributes.POSITION); tris += (prim.indices !== undefined ? acc(prim.indices).length : P.length / 3) / 3;
    }
    objs.push({ name: nd.name || ('node' + ni), uvcount, tris, uv });
  });
  return { objs, nodes: (json.nodes || []).length, meshes: (json.meshes || []).length, images: (json.images || []).length };
}
const orig = parse('/root/.claude/uploads/6762ca26-85bb-50ae-aa02-dab118a4400c/ec5d50fd-learjet.glb');
const SCRATCH = '/tmp/claude-0/-home-user-westchase-fps/6762ca26-85bb-50ae-aa02-dab118a4400c/scratchpad';
const mesh = parse(SCRATCH + '/learjet_textured.glb');
console.log('ORIGINAL: nodes=' + orig.nodes + ' meshes=' + orig.meshes + ' images=' + orig.images + ' objects=[' + orig.objs.map(o => o.name).join(', ') + ']');
console.log('MESHY:    nodes=' + mesh.nodes + ' meshes=' + mesh.meshes + ' images=' + mesh.images + ' objects=[' + mesh.objs.map(o => o.name).join(', ') + ']');
console.log('\nORIGINAL tris total:', orig.objs.reduce((s, o) => s + o.tris, 0), ' MESHY tris total:', mesh.objs.reduce((s, o) => s + o.tris, 0));
// compare UVs of matching-named objects
console.log('\nper-object UV match (original vs meshy):');
orig.objs.forEach(o => {
  const m = mesh.objs.find(x => x.name === o.name) || mesh.objs.find(x => x.uvcount === o.uvcount);
  if (!m || !o.uv || !m.uv) { console.log('  ' + o.name + ': no match / no uv'); return; }
  let same = o.uv.length === m.uv.length, maxd = 0;
  if (same) for (let i = 0; i < o.uv.length; i++) { const d = Math.abs(o.uv[i] - m.uv[i]); if (d > maxd) maxd = d; }
  console.log('  ' + o.name.padEnd(10) + ' origUVs=' + o.uvcount + ' meshyUVs=' + m.uvcount + ' identical=' + (same && maxd < 1e-4) + ' maxDelta=' + (same ? maxd.toFixed(5) : 'len-mismatch'));
});
