# ACCESS_PROPS — pedestrian accessory asset pack

Accessories NPCs carry / push / walk with (dogs, strollers, umbrellas…).
AI-generated with the ENV_PROPS offline pipeline (gpt-image-1 seed -> Meshy
image-to-3d lowpoly, should_remesh, triangle, **no rigging** — dogs & wheels
animate procedurally in-game). Data lives in
`/home/user/westchase_fps/accessprops.js` as `var ACCESS_PROPS = [...]`;
contact sheet at `tools/vehgen/ACCESSPROPS_contact.png`. OFFLINE asset-prep —
nothing is wired into game.js/index.html yet (that is follow-up task #70).

**13 props, 38 variant textures.** Meshy spend this pass: **385 credits**
(2119 -> 1734). Two of the 13 are FREE (no Meshy gen): `boombox` reuses the
existing ENV_PROPS mesh, `coffee_cup` is a procedural cup built + textured in
the converter. 11 meshes were generated.

## Schema (per entry)
`{ n, cat, tex, texVariants:[...], q, tris, p, u, dims:[x,y,z], solid, hold, anim, notes }`
- `p` Int16 xyz / `q` (divisor), `u` Uint16 uv (RAW glTF v — the loader applies `1 - v`), `tex` 128px posterized JPEG data-URL base texture. **Non-indexed** (no `i` buffer).
- `texVariants` — array of **256px** JPEG recolor atlases for the SAME mesh/UVs (drop-in replacements for `tex`). Pick one per NPC at spawn. Empty = single look.
- Authored **bbox-centered on x/z, ground at y=0**, real-world **meters** (one bbox axis pinned to a target size). `dims` are true meters. Front authored toward **-x** (yaw=0).
- `cat`: `walk` (led/wheeled alongside) · `push` (driven from behind) · `hold` (carried in hand / overhead).

## Integration (task #70)
Load `accessprops.js` before game.js (guard `typeof ACCESS_PROPS`). Build the
mesh exactly like `getStreetProp()`: decode p/q + u (1-v flip),
`computeVertexNormals`, NearestFilter unlit/Lambert map, NO `setIndex` (these
are non-indexed). Parent the accessory to (or position-drive it from) the NPC
using the `hold` hint; roll `texVariants` per NPC. `anim` is the suggested
procedural motion (no skeletons — spin wheels, bob the dog, sway the balloon).

### Texture-variant recipe (for regenerating / adding colorways)
`tools/vehgen/work/access/accvariants.js` feeds the asset's baked UV atlas
(`atlas/<n>.png`) to gpt-image-1 **edits** and asks for an RxC grid of
recolored copies of the SAME atlas layout (TILING.md 3x3 hack), then slices +
crunches to 256px. Grid mode (1 call/asset) is the default and preserved UV
layout well for every asset. When a grid recolor comes back muddy (dark
shading baked into the base atlas bleeds through — this hit the umbrella), rerun
`--only <n> --force --percell`: one edit call per variant edits the actual
atlas and gives clean solids. Balloon variants are **procedural color swaps
in-game** (single sphere UV) — no atlas gen needed.

## walk (led / wheeled alongside)

| n | dims (m) | tris | variants | attach (`hold`) | anim |
|---|----------|------|----------|-----------------|------|
| `dog` | 0.21 x 0.55 x 0.78 | 637 | 6 (golden, black-&-tan, black lab, chocolate, dalmatian, husky) | leash clip at the collar ring on the neck; NPC holds leash end ~0.9m up | trot: vertical body bob + slight leg swing at walk phase, head bob |
| `bicycle` | 1.77 x 1.05 x 0.67 | 651 | 4 (red, blue, green, black frame) | one hand on the handlebar; NPC walks alongside, wheels on ground | both spoked wheels spin ∝ ground speed |
| `suitcase` | 0.52 x 0.95 x 0.31 | 320 | 3 (black, navy, red shell) | hand grips top of the extended handle ~0.95m; case rolls behind on 2 wheels | tilt back ~20° while rolling; the 2 ground wheels spin |
| `wagon` | 0.59 x 0.50 x 0.36 | 381 | 3 (red, blue, green tub) | one hand on the long front pull-handle; NPC walks ahead pulling | all 4 wheels spin ∝ speed; handle swings loosely |

## push (driven from behind)

| n | dims (m) | tris | variants | attach (`hold`) | anim |
|---|----------|------|----------|-----------------|------|
| `stroller` | 0.83 x 1.00 x 0.59 | 475 | 4 (navy, pink, green, black canopy) | both hands on the rear push-handle bar ~1.0m; NPC walks directly behind | front+rear wheel spin ∝ speed; tiny canopy jiggle |
| `walker` | 0.85 x 0.85 x 0.51 | 422 | 2 (gray, blue frame) | both hands on the two top grips ~0.85m; NPC shuffles directly behind | front wheels spin slowly; frame nudges forward each step |

## hold (carried in hand / overhead)

| n | dims (m) | tris | variants | attach (`hold`) | anim |
|---|----------|------|----------|-----------------|------|
| `umbrella` | 1.00 x 0.95 x 1.00 | 296 | 4 (red, black, polka-dot, rainbow) | one hand on the handle at the pole bottom; canopy held overhead | gentle canopy sway/tilt + bob with walk |
| `shopping_bags` | 0.37 x 0.40 x 0.30 | 262 | 4 (kraft, white, red, navy) | one hand grips both rope handles at top; bags hang at the side | pendulum sway with stride |
| `balloon` | 0.27 x 0.35 x 0.27 | 210 | 0 (color = procedural swap) | string drawn in-game from the hand up to the knot; floats ~1.2m above the hand | buoyant sway/bob on the (runtime) string |
| `cane` | 0.18 x 0.90 x 0.07 | 140 | 2 (brown wood, black) | one hand grips the crook handle ~0.9m; tip near the ground beside the foot | plant/lift in time with stride (small fwd-back tilt) |
| `skateboard` | 0.80 x 0.18 x 0.30 | 248 | 3 (red, blue-flame, black deck) | carried under one arm by the deck, OR ridden underfoot; long axis forward | if ridden, the 4 wheels spin; if carried, static |
| `coffee_cup` | 0.15 x 0.15 x 0.15 | 48 | 3 (red, green, kraft) | one hand grips the cup body ~1.0m up at the side | static; slight bob with stride. **Procedural cup + lid, baked texture** |
| `boombox` | 0.60 x 0.45 x 0.28 | 162 | 0 | balanced on one shoulder beside the head, OR carried by the top handle | static (optional bass-thump scale pulse). **Reuses ENV_PROPS boombox mesh** |

## Notes / known quality
- Style: 128px posterized base JPEG + 256px variant JPEGs, NearestFilter — matches ENV_PROPS / STREET_PROPS / MESHY_UFO PSX look. Tris 48–651 (mean ~330), all within the vehicle/prop-tier budget.
- Hero asset `dog` came out clean — recognizable labrador body with collar/leash ring; all 6 breed recolors map correctly (dalmatian spots, husky gray, black lab all read).
- **Weakest asset: `shopping_bags`** — the base Meshy atlas baked a dark shadow between the two bags, so every variant carries some black splotch. Reads fine at gameplay distance (PSX-acceptable) but is the least clean recolor set. Regenerate with a cleaner seed (bags spaced further apart) if it bothers.
- `umbrella` grid recolors first came back muddy (dark ribs bled through); regenerated per-cell — now clean solids + a good rainbow/polka set.
- `balloon` ships a red base; do in-game color swaps procedurally (single-color sphere, trivial). `boombox`/`coffee_cup` carry no Meshy cost.
- Orientation: all radially/bilaterally near-symmetric except the directional ones (`dog`, `bicycle`, `suitcase`, `wagon`, `skateboard`, `stroller`, `walker`) — front is toward -x; give a per-asset yaw at integration to face the NPC's travel/side as appropriate (reuse the STREET_PROPS `SP_FACE` convention).

## Rebuild
```
cd tools/vehgen/work/access
OPENAI_API_KEY=… node accseeds.js          # 11 PSX seeds -> seeds/
MESHY_API_KEY=…  node accpipe.js            # image-to-3d + remesh -> glb/ (state.json resumes)
node genaccess.js                           # GLB -> accessprops.js (+ atlas/, procedural cup, reuse boombox)
OPENAI_API_KEY=… node accvariants.js        # grid recolor variants -> variants/  (add --only x --force --percell to fix)
node genaccess.js                           # re-run to merge texVariants
node contact.js ../../ACCESSPROPS_contact.png
```
Intermediates (`seeds/ glb/ atlas/ variants/ *.png`) are gitignored; `state.json` resumes a timed-out Meshy run.
