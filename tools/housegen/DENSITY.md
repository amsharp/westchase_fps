# densityprops.js — map-density asset pack (phase-2 output)

50+ cheap texture-on-simple-geometry props to make the town read RICH and
LIVED-IN, generated OFFLINE with the 3x3 gpt-image-1 tiling hack (TILING.md)
and crunched to 256px PSX JPEGs. **This file is data only** — no game code was
touched. A separate phase-3 agent places these in the map.

- Data file: **`densityprops.js`** (repo root), `var DENSITY_PROPS = [...]`,
  ~884 KB, 54 records. Load before game.js like `meshychars.js` /
  `streetprops.js`; guard with `typeof DENSITY_PROPS !== 'undefined'`.
- Generator (NOT in repo, lives in the session scratchpad `density/`):
  `assets.js` (the 54 definitions + prompts), `gen.js` (batch → 3x3 image →
  slice → crunch, reuses `tools/housegen/lib.js`), `build.js` (assemble the
  data file), `contact.js` (contact sheet). Rerun any batch with
  `OPENAI_API_KEY=... node gen.js <batchId>` after `rm work/<batchId>_tiled.png`.

## Record schema

```js
{ n:   'oil_stain',            // unique name/id
  cat: 'decal',               // 'decal' | 'sign' | 'clutter' | 'fence'
  geo: 'quad',                // geometry hint (below)
  dims: [2.2, 2.2],           // meters, meaning depends on geo
  tex: 'data:image/jpeg;...', // one 256px PSX-crunched JPEG data-URL
  notes: 'flat ground quad, y~0.03, alpha-from-luminance optional' }
```

### geo values and how to build them

| geo | build | dims meaning |
|---|---|---|
| `quad` | flat HORIZONTAL quad on the ground, texture face-up, lay at ~y0.03 above the surface (decals) | `[w, d]` meters |
| `quad-vertical` | flat UPRIGHT quad (billboard/sign), face the camera / mount on a pole or wall face | `[w, h]` meters |
| `box` | `THREE.BoxGeometry`, same `tex` on all faces | `[w, h, d]` meters |
| `cylinder` | `THREE.CylinderGeometry`, `tex` wrapped around the side | `[diam, h, diam]` meters |
| `strip` | extruded fence/wall run: a vertical quad (or thin box) with the `tex` REPEATING horizontally (`tex.wrapS = RepeatWrapping`, repeat.x = runLength/dims[0]) | `[height]` meters |

### Transparency (important for a few)

These JPEGs have no alpha. Most props are opaque. A handful read best with
**alpha-from-luminance** (make near-black pixels transparent) — build the
texture into a `MeshBasicMaterial`/`MeshLambertMaterial` with `alphaMap` or a
tiny canvas pass that sets `a = luminance > threshold ? 255 : 0`:

- `chainlink_fence` (fence) — diamond mesh on near-black; MUST key out the
  black or it renders as a solid dark panel.
- `stop_sign`, `roadwork_sign` (signs) — octagon/diamond on a dark field;
  key out corners for the true shape, or just accept the square panel.
- Ground decals `grass_tuft`, `leaves_scatter`, `litter_scatter` — optional
  luminance/multiply blend so they sit on whatever ground is beneath.

The `notes` field on each record flags this per-asset.

## Contents (54)

- **decal (18)**: oil_stain, asphalt_cracks, asphalt_patch, manhole,
  storm_drain, road_arrow, skid_marks, sidewalk_gum, puddle, litter_scatter,
  grass_tuft, mud_patch, chalk_hopscotch, center_line, crosswalk,
  utility_plate, leaves_scatter, cracked_slab. Flat ground quads for roads,
  sidewalks, dirt verges, parking lots.
- **sign (18)**: billboard_ad, storefront_sign, grand_opening_banner,
  flyer_sheet, for_sale_sign, menu_board, bus_route_sign, graffiti_panel,
  wall_mural, roadwork_sign, stop_sign, gas_price_sign, yard_sign,
  lost_pet_flyer, neon_bar_sign, parking_sign, speed_limit_sign,
  garage_sale_sign. Upright quads on poles / building faces / stakes.
- **clutter (13)**: cardboard_box, wooden_crate, trash_bags, wood_pallet,
  barrel_delineator, sandbag, bucket, blue_tarp, propane_tank, ac_condenser,
  utility_box, potted_plant (box/cylinder); mulch_bed (flat quad).
- **fence (5)**: chainlink_fence, privacy_fence, hedge_row, brick_low_wall,
  guardrail — tileable `strip` textures; `dims[0]` is the intended height.

## Placement suggestions for phase-3 (density, not realism)

- Scatter decals thickly on the asphalt/parking lots and sidewalks — oil
  stains + cracks + patches under the gas station and strip-mall lots; skid
  marks in the intersection; crosswalk/center_line/road_arrow ON the roads.
- Signs: billboard on a 2-post frame at a road exit; storefront/menu/neon on
  the strip-mall + Dunkin/Starbucks facades; for_sale/yard/garage_sale on
  lawns in the NW residential blocks; stop/speed/parking/roadwork on roadside
  poles; graffiti/mural on the self-storage + underpass walls.
- Clutter clusters behind stores (dumpster areas): boxes + pallets + crates +
  trash_bags; ac_condenser + utility_box against building walls; barrel
  delineators + sandbags around any "road closed" barrier; potted_plant +
  mulch_bed at storefront entrances.
- Fences: chainlink around the self-storage + school; privacy_fence + hedge
  between townhouse rows; brick_low_wall at Publix/BofA lot edges; guardrail
  along the perimeter road shoulders.

## Generation notes (for regen / more assets)

- 6 images × 9 tiles = 54. Batches: `decalA`, `decalB`, `signC`, `signD`,
  `clutterE`, `mixF` (clutter + fences). One `medium` 1536×1024 call each.
- **Sign batches need a pure-black-background prompt** (`blackbg:true` in
  `gen.js`), NOT the "tiles fill edge to edge" wording — otherwise the model
  renders framed posters on colored mats with no black gutters and the
  index-slicer mis-cuts. With black-bg framing the signs sit on a dark field,
  slice cleanly, AND become alpha-from-luminance friendly.
- **A tile that is itself mostly near-black defeats the dark-band slicer**
  (`SLICE_FN` walks inward "past the gutter while mostly dark" and eats the
  cell). `chainlink_fence` collapsed to a sliver and was re-cropped by hand
  from the raw grid's center third (see `contact.js` sibling one-off). If you
  add more dark-on-black tiles, put them where you can hand-crop, or brighten
  the tile background.
- gpt-image sign text has small typos at this size ("GARACE", "PAIRHING",
  "Fastrics") — invisible/legible-enough after the 256px crunch; accepted.
