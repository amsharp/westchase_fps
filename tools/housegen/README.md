# housegen — Street View → PS1 house pipeline

Turns real Google Street View photos of houses/buildings into low-poly
in-game buildings: procedural box+roof geometry with AI-painted PSX-style
texture sets, batched 4-textures-per-image via tiled generation (see
TILING.md — verified, use it).

```
lat/lng ──fetchrefs.js──▶ work/<id>_sv1.jpg,_sv2.jpg,_sat.png   (Google APIs)
                              │
clusters.json ──genfacade.js──▶ ONE tiled gpt-image-1 call per cluster
                              │    └─ slice.js logic → front/side/back/roof
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
#       roofDesc:"gray-brown asphalt shingles" }]
#    then generate the texture set (ONE tiled image = 4 textures):
OPENAI_API_KEY=... node genfacade.js work/clusters.json H1_CLUSTER
#    EYEBALL work/<id>_tiled.png (gate below) — rerun deletes nothing;
#    rm work/<id>_tiled.png to force a regeneration.

# 3. Add dims/roofType/wallColor + instances to work/layout.json, then:
node mkhouses.js work/layout.json work/houses.js

# 4. Verify in three.js (serve the REPO ROOT):
/opt/node22/bin/http-server -p 8151 -s <repo root> &
node shots.js     # writes work/shot_street/aerial/recolor/front.png — VIEW THEM
```

## Quality gates for `<id>_tiled.png` (learned over 6 generations)

1. **Front tile shows the WHOLE facade** — the model loves drawing the
   garage door filling the entire tile (took 3 tries on RANCH_TAN). The
   prompt now demands "garage door SMALL, about 30 percent of tile width";
   still verify. A garage door stretched over a 14 m wall looks absurd.
2. **No roofline/gable/eaves painted inside wall tiles** (prompt forbids it;
   the model added them anyway ~1 try in 3).
3. **Roof tile is pure shingles** — it once painted another wall with an
   eave strip. Prompt now says "seamless MATERIAL SWATCH ... nothing but
   shingles".
4. Wall color matches the photo (a white house came out beige once —
   putting "BRIGHT WHITE ... not beige" in `desc` fixed it).
   Retry cost is only one image (~$0.07), so gate hard.

## Data formats

`work/<id>_tex.json` (genfacade): `{front, side, back, roof}` JPEG
data-URLs — walls 256x170 (wall tiles are 1.5:1 in the 1536x1024 grid),
roof 256x256, posterized 24 levels. ~25-35 KB per cluster.

`houses.js` (mkhouses — load before game.js like meshychars.js):
```js
var HOUSE_CLUSTERS = { id: { tex:{front,side,back,roof},
                             dims:[w,d,h], roofType:'hip'|'gable'|'flat',
                             roofH, wallColor:'#rrggbb' } };
var HOUSE_INSTANCES = [ [clusterId, x, z, rotDeg, colorShift], ... ];
// colorShift: 0 or [hueDeg, satMul, lightMul]
```

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
  vary wall paint, not roof color).
- Recolored variants are cached per (texture, shift) in `houseTexCache`.

## Cost per cluster

| item | tiled (recommended) | untiled |
|---|---|---|
| gpt-image-1 (medium) | 1 × 1536x1024 ≈ **$0.07** for all 4 textures | 4 × 1024x1024 ≈ $0.19 |
| Street View refs | 2 × $0.007 + satellite $0.002 ≈ $0.016/house | same |

Quality "low" quarters the image cost if needed; medium was used for the
prototype. Metadata + geocoding are free. The whole prototype (tiling
experiment + 3 clusters incl. 3 retries) cost ≈ $0.65.

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
- Wall tiles map square-ish textures onto ~2:1 walls — horizontal stretch
  is visible on garage doors if the AI drew them too wide (gate #1).
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
4. Bump `GAME_VERSION`, update repo README, screenshot in-game via the
   /upload pipeline (CLAUDE.md workflow) before reporting done.
5. The survey workflow output (scratchpad survey/) should be reduced to as
   FEW clusters as possible + recolors; ~30 KB per cluster adds up.
