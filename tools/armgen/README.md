# armgen — first-person arms GLB converter

Converts the skinned "PSX First Person Arms" free asset pack
(`arms_rig.glb` + `arms_01.png`) into `meshyarms.js` at the repo root: a
plain-script data file (`var MESHY_ARMS = {...}`) the game can load before
`game.js` and detect with `typeof MESHY_ARMS`. Node-only, no npm deps
(fs/Buffer/zlib).

## Rerun

```
node tools/armgen/genarms.js [arms_rig.glb] [arms_01.png] [out]
node tools/armgen/verify.js  [meshyarms.js]     # sanity checks the output
```

Defaults point at the asset copy in the session scratchpad
(`assets/psxfirstpersonarmsfreegameassets/`) and write
`/home/user/westchase_fps/meshyarms.js`.

## Output format

- `tex` — 512x512 PNG data-URL. The source PNG is 16-bit RGBA (398KB); the
  tool decodes it and re-encodes the high bytes as 8-bit RGB with per-row
  filter selection + zlib level 9 (206KB, pixel-identical at 8-bit — which
  is all the browser uses anyway). It embeds whichever is smaller of the
  external `arms_01.png` vs the GLB-embedded image (they are identical in
  this pack), then whichever of that vs the re-encode is smaller.
- `skel` — 52 joints. `names`, `parents` (index into names, -1 = root:
  `root` plus the 4 baked IK targets `handIK/elbowIK .L/.R`; `camera` is a
  child of `root`), and base64 Float32 node-local bind TRS: `t` xyz, `r`
  quat xyzw, `s` xyz per joint.
- `geo` — `nv=758` verts, 1176 tris. `p` Int16 positions * `q`
  (q = 32000/maxAbsCoord = 19303.92), `u` Uint16 uv*8192, `i` Uint16
  indices (`i32:1` would flag Uint32 — not needed here), `si` Uint8
  skinIndex 4/vert, `sw` Uint8 skinWeight 4/vert normalized to sum exactly
  255.
- `clips` — sampled at 15 fps, frame-major `[frame][joint][...]`:
  `q` Int16 quats*16384 (hemisphere-corrected nlerp), `t` Int16
  translations*1024 (absolute joint-local; would carry a per-clip `ts`
  scale if max|t|*1024 overflowed Int16 — it doesn't, max |t| is 1.69).
  Joints without channels fall back to bind pose (all 18 source anims
  cover all 52 joints, though). Channels carry translation AND rotation —
  the IK was baked; both must be applied at runtime.

## Clip mapping (18 in GLB, 6 kept)

| GLB name   | key   | duration | frames |
|------------|-------|----------|--------|
| guard_idle | idle  | 2.167s   | 34     |
| jab.L      | jabL  | 1.0s     | 16     |
| jab.R      | jabR  | 1.0s     | 16     |
| relax      | relax | 2.0s     | 31     |
| grab.R     | grab  | 0.733s   | 12     |
| push.R     | push  | 0.8s     | 13     |

Dropped: finger_gun_* (4), guard_draw, knife_* (4), grab.L, push.L, rest.

## Gotchas hit / verified

- Node Buffer pooling: every typed-array view built from a base64/file
  Buffer `b` uses `new X(b.buffer, b.byteOffset, ...)`; accessor reads also
  copy when the offset breaks element alignment.
- Armature scale: verified 1.0 (Blender export; ArmsRig node is identity,
  all node scales are 1 within float noise) — nothing baked, but the tool
  checks every root joint's ancestor chain and bakes a uniform scale into
  bind + clip translations if it ever isn't 1 (Meshy-style 0.01 rigs).
- Bind TRS export validated against the skin's inverseBindMatrices: FK of
  the exported node-local TRS times IBM = identity to 7e-7 for all 52
  joints.
- Quantization divisors computed from the values actually stored
  (positions maxAbs 1.6577 -> q 19303.92; anim max |t| 1.685 * 1024 well
  inside Int16).
- Animation scale channels exist (156 chans = 52 t + 52 r + 52 s) but
  deviate from 1 by <1e-6 — dropped.

Verification (`verify.js`): file loads via `new Function`, no NaNs, bind +
frame-0 quat norms ~1, extents 1.677 x 0.488 (matches GLB min/max), all
indices < nv, all skinIndex < 52, weights sum 255±2. Output is ~415KB.
