# housegen — Street View → PS1 house pipeline

Turns real Google Street View photos of houses/buildings into low-poly
in-game buildings: procedural geometry **with real 3D depth features**
(eaves/soffits, porches, garage insets, window frames, chimneys, dormers —
target look: elbolilloduro's PSX "House" pack) plus AI-painted PSX-style
texture sets, batched **9-textures-per-image** via tiled generation (see
TILING.md — 3x3 verified, 4x4 collapses).

```
lat/lng ──fetchrefs.js──▶ work/<id>_sv1.jpg,_sv2.jpg,_sat.png   (Google APIs)
                              │
clusters.json ──genfacade.js──▶ ONE tiled 3x3 gpt-image-1 call per cluster
                              │    └─ SLICE_FN → 9 tiles: front/side/back/roof
                              │       + garage/door/trim/gable/concrete
                              │       → 256px posterized JPEG data-URLs
                              ▼
layout.json ──mkhouses.js──▶ houses.js  (HOUSE_CLUSTERS + HOUSE_INSTANCES)
                              │
runtime_buildhouse.js (game-side builder) ──▶ THREE.Group per instance
```

## Prerequisites

- Node 22 (global `fetch`), playwright chromium (`/opt/pw-browsers`,
  `--use-gl=angle --use-angle=swiftshader --no-sandbox`), no npm installs.
- **API keys from env only — NEVER in files, NEVER committed:**
  `GOOGLE_MAPS_KEY` (Street View Static + Static Maps + Geocoding),
  `OPENAI_API_KEY` (gpt-image-1).
- `work/` is gitignored (same precedent as tools/chargen).

## Recipe (one building cluster)

```bash
cd tools/housegen

# 1. References (metadata probe is FREE and aborts if no coverage).
GOOGLE_MAPS_KEY=... node fetchrefs.js H1 28.06010 -82.61705 180
#    args: id lat lng [heading]; omit heading to auto-aim pano→target.
#    EYEBALL work/H1_sv1.jpg — tree-blocked/blurred houses waste AI calls.

# 2. Describe the cluster in work/clusters.json:
#    [{ id, refs:["work/H1_sv1.jpg","work/H1_sv2.jpg"],
#       desc:"single-story tan stucco Florida ranch house ...",
#       roofDesc:"gray-brown asphalt shingles",
#       trimDesc:"warm white", doorDesc:"the dark brown paneled front door",
#       garageDesc:"the white two-car garage door ..." }]   // last 3 optional
#    then generate the texture set (ONE tiled image = 9 textures):
OPENAI_API_KEY=... node genfacade.js work/clusters.json H1_CLUSTER
#    EYEBALL work/<id>_tiled.png (gates below) — rerun deletes nothing;
#    rm work/<id>_tiled.png to force a regeneration.

# 3. Add dims/roofType/wallColor/trimColor + feat (depth features, below) +
#    instances to work/layout.json, then:
node mkhouses.js work/layout.json work/houses.js

# 4. Verify in three.js (serve the REPO ROOT):
/opt/node22/bin/http-server . -p 8155 -c-1 &     # from the repo root
node shots.js   # writes work/shot_street/porch/garage/aerial/compare/
                # front/recolor.png + logs per-cluster tri counts — VIEW THEM
```

## Quality gates for `<id>_tiled.png`

1. **Grid is a clean 3x3** (it always was in testing; see TILING.md if not).
2. **Front-wall tile (1) is PLAIN** — no windows/doors/roofline. Front doors,
   garage doors and front windows are geometry now, so the old "garage door
   fills the tile" failure is designed out.
3. **Roof tile (4) is pure material swatch** — no eave strip, no wall. The
   prompt words this hard already; still the most likely tile to drift.
4. **Door tile (6)**: door must be the darkest big rectangle in the tile —
   the crunch auto-crops it by luminance (`DOORCROP_FN`, logs its crop).
   A white door on a white wall would defeat the crop (add `doorDesc` with a
   dark color, or hand-crop).
5. Wall color matches the photo (a white house came out beige once —
   putting "BRIGHT WHITE ... not beige" in `desc` fixed it).
   Retry cost is one image (~$0.07 = 9 textures), so gate hard.
   The 3-cluster production run needed 0 retries (27/27 tiles usable).

## Data formats

`work/<id>_tex.json` (genfacade): `{front, side, back, roof, garage, door,
trim, gable, concrete}` JPEG data-URLs — walls 256x170, roof/gable 256x256,
garage 256x128, door 128x256 (auto-cropped), trim/concrete 128x128,
posterized 24 levels. ~60-65 KB per cluster (~25-35 KB gzipped on the wire).

`houses.js` (mkhouses — load before game.js like meshychars.js):
```js
var HOUSE_CLUSTERS = { id: { tex:{...9 keys...},
                             dims:[w,d,h], roofType:'hip'|'gable'|'flat',
                             roofH, wallColor:'#rrggbb', trimColor, glassColor,
                             feat:{...} } };
var HOUSE_INSTANCES = [ [clusterId, x, z, rotDeg, colorShift], ... ];
// colorShift: 0 or [hueDeg, satMul, lightMul]
```

### feat — per-cluster depth features (all optional; omit feat for the old
flat box, old 4-texture clusters still build)

```js
feat: {
  soffit: true,                    // eave soffit slab + fascia (trim tex)
  win: { f:[[x,cy,w,h],...],       // geometric window units (trim ring +
         b:[...], l:[...], r:[...] },  // dark glass box). x = 0..1 fraction
                                   // along that wall, cy = center height (m),
                                   // w/h meters. f=+z front, b=back, l/r sides
                                   // (fraction runs front→back on sides)
  door: { x:0.72, w:1.1, h:2.05,   // front door unit (door tile on a box)
          porch:{ d:1.6, posts:2 } // + porch: concrete stoop, step, pitched
                                   //   shed roof (shingles) on square posts
          /* OR recess:true */ },  // or pier-and-header alcove instead
  garage: { x:0.28, w:4.9, h:2.3,  // garage-door inset: wall-textured piers
            out:0.4 },             // + header protrude `out`; garage tile
                                   // recessed at the wall plane + apron slab
  chimney: { x:0.3, z:0.35, w:0.7 },// x/z footprint fractions, w meters
  dormer: { x:0.5, w:2.2 },        // front-slope dormer: batten-sided box,
                                   // window unit, tiny gable roof
  ac: true                         // AC box + concrete pad, right (+x) wall
}
```

Geometry notes: window/door/garage x-fractions are shared between the spec
and (optionally) the texture prompt, so painted and built detail can't
disagree — v2 keeps front walls plain and lets geometry carry the detail.
Pier/surround boxes wear the plain front-wall TEXTURE (not a solid color)
so per-instance recolors shift them exactly like the wall.

**Triangle budget** (target <450/house): flat box ≈ 24; prototype clusters:
RANCH_TAN (garage+porch+3 windows+ac) **276**, RANCH_WHITE (garage+recess
door+3 windows+chimney+ac, textured gable ends) **302**, TWOSTORY_GRAY
(everything incl. dormer) **432**. shots.js prints `window.__tris` per run.

`runtime_buildhouse.js`: ES5 game-side builder (`buildHouse(cluster,
shift)` → THREE.Group anchored at y=0, front facing +z;
`buildHouseInstances(scene)` places all instances). Verified against the
game's vendored three.min.js r149.

## Recolor reuse (verified)

One cluster texture + per-instance `colorShift` gives "same model, different
paint" — a blue-gray house convincingly becomes sage with
`[-95, 1.9, 1.0]`, tan becomes a browner tan with `[14, 1.0, 0.9]`.
Implementation details that matter (all in runtime_buildhouse.js):
- Recolor is **chroma-gated**: only pixels whose chroma (color minus its
  own gray level) is within ~0.09 of `wallColor`'s chroma shift; ramps to 0
  by ~0.135. Without this, white trim turns pink and windows tint.
  `wallColor` must therefore be sampled from the WALL, not trim.
- The **roof never shifts** (green shingles read wrong; real subdivisions
  vary wall paint, not roof color). Trim/gable/concrete/door tiles are
  never shifted either.
- Recolored variants are cached per (texture, shift) in `houseTexCache`.
- Solid-color materials drift under recolor vs the textured wall (a tan
  surround went yellow) — hence the "piers wear the wall texture" rule.

## Cost per cluster

| item | tiled 3x3 (recommended) | tiled 2x2 (v1) | untiled |
|---|---|---|---|
| gpt-image-1 (medium) | 1 × 1536x1024 ≈ **$0.07 for all 9 textures** | $0.07 for 4 | 9 × 1024px ≈ $0.38 |
| Street View refs | 2 × $0.007 + satellite $0.002 ≈ $0.016/house | same | same |

3x3 at 1024x1024 medium ($0.04/cluster) also survives the crunch if budget
matters; `quality:low` breaks the grid above 2x2 (TILING.md). The whole v2
upgrade (density experiment: 8 images + 3 cluster regens) cost ≈ $0.65.

## Gotchas (hard-won)

- **Street View coverage**: gated communities (all of Bishopsford Dr /
  Cypress Reserve Dr interiors!) have NO panos — the free metadata endpoint
  returns ZERO_RESULTS; probe with radius≈45 before paying for images.
  House-number geocoding there is RANGE_INTERPOLATED (useless for aiming);
  aim by probing pano points along the street and shooting perpendicular.
- **three r149 + WebGL2 texture resize**: a CanvasTexture whose canvas is
  resized after first render keeps its immutable 8x8 texStorage → renders
  black. `t.dispose(); t.needsUpdate = true;` in the Image onload fixes it.
- **Gable slope rotation**: a slope box at z=-hd/2 needs `rotation.x=-ang`
  (negative!) to form a ridge; +ang forms a valley. (game.js stripMall has
  the opposite sign convention because its slopes overlap at the ridge.)
- ShapeGeometry UVs equal the shape's raw xy coords — remap before
  `rotateY` (gable ends divide by 3.2 for ~3.2m batten repeat).
- Porch-post height must clear the pitched porch slab underside
  (`prY - sin(rot)*(pd+0.55)/2 - ...`) or posts poke through the roof.
- Never say "gable" in a swatch tile description and always call the roof
  tile a "seamless MATERIAL SWATCH" (TILING.md failure modes).
- gpt-image-1 refuses nothing here but drifts: keep per-tile descriptions
  to one sentence; re-roll single clusters with `node genfacade.js
  work/clusters.json <id>` after deleting only that cluster's tiled png.

## Integration checklist (for the agent wiring the survey output in)

1. Generate final `houses.js` (repo root, next to meshychars.js) and add
   `<script src="houses.js"></script>` BEFORE game.js in index.html.
2. Paste/adapt runtime_buildhouse.js into game.js (or load it as its own
   script before game.js, streetprops.js-style). Guard with
   `typeof HOUSE_CLUSTERS !== 'undefined'`. Call `buildHouseInstances`
   from the city-layout section (function declarations hoist; `var`
   materials do NOT — see CLAUDE.md load-order gotcha).
3. Per instance: `addCollider(x, z, w, d)` with rot-90 footprint swap, and
   `mapBuildings.push({x,z,w,d,h,c:wallColor,pad:false})` for minimap+rain.
   Porches/garage piers protrude ≤2m past dims on +z; the base footprint
   collider is fine (matches how the gas-station pumps are handled).
4. Bump `GAME_VERSION`, update repo README, screenshot in-game via the
   /upload pipeline (CLAUDE.md workflow) before reporting done.
5. The survey workflow output (scratchpad survey/) should be reduced to as
   FEW clusters as possible + recolors; ~60 KB per cluster adds up.
