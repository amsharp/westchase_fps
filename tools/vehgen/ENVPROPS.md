# ENV_PROPS — environment / street-furniture asset pack

AI-generated with the existing offline pipeline (gpt-image-1 seed -> Meshy
image-to-3d lowpoly, should_remesh, triangle, no rigging). Data lives in
`/home/user/westchase_fps/envprops.js` as `var ENV_PROPS = [...]`; contact
sheet at `tools/vehgen/ENVPROPS_contact.png`. This is an OFFLINE asset-prep
deliverable — nothing is wired into game.js/index.html yet.

**46 props.** Meshy spend this pass: ~1760 credits (4599 -> 2839).

## Schema (per entry)
`{ n, cat, q, tris, p, u, tex, dims:[x,y,z], solid, interact, anim, spawns, notes }`
- `p` Int16 xyz / `q` (divisor), `u` Uint16 uv (RAW glTF v — the loader applies `1 - v`), `tex` 128px posterized JPEG data-URL.
- Authored **bbox-centered on x/z, ground at y=0**, real-world **meters** (one bbox axis pinned to a measured height — see roster `axis`/`m`). `dims` are true meters.
- Front authored toward **-x** (yaw=0). Most props are radially or bilaterally symmetric; a few directional ones (aframe_sign, monument_sign, skate_ramp, food/ice-cream trucks, barber_pole) may want a small per-asset yaw tweak at integration — reuse the STREET_PROPS `SP_FACE` rotation convention.

## Integration
Load `envprops.js` before game.js (guard `typeof ENV_PROPS`). Build meshes exactly like `getStreetProp()`: decode p/q + u (1-v flip), `setIndex` only if an `i` buffer is present (none here — non-indexed), `computeVertexNormals`, NearestFilter unlit/Lambert map. `solid` -> add an AABB collider (`dims`); `interact` -> phase-5f E-action; `spawns` -> interaction can drop a pickup; `anim` -> suggested idle animation.

### anim vocabulary
`spin` (Y-rotate a sub-part: barber stripes, pizza disc, windmill blades) · `wave` (flag cloth) · `flail` (tube-man arms whipping) · `flow` (water particles + basin ripple) · `flames` (fire flicker) · `smoke` (rising puff) · `sway` (gentle pendulum: umbrella, swing seats) · `glow` (emissive pulse on screens/lights). Empty = static.

### interact vocabulary
`sit` · `drink` · `read` (show sign text) · `play` (mini-interaction / SFX) · `vend` & `buy` & `cook` (transaction; several also set `spawns`).


## seating (4)

| n | dims (m) | tris | solid | interact | anim | spawns | placement |
|---|----------|------|-------|----------|------|--------|-----------|
| `cafe_set` | 1.45 x 0.95 x 1.36 | 374 | yes | sit | - | - | Cafe/coffee frontages (Starbucks -188,116; Dunkin -116,31; RaceTrac). Pair with patio_umbrella. |
| `patio_umbrella` | 2.01 x 2.30 x 2.00 | 174 | yes | - | sway | - | Over cafe_set at cafe frontages; poolside / lakeshore. Canopy sways. |
| `bench_back` | 1.24 x 0.85 x 0.78 | 260 | yes | sit | - | - | Parks, bus stops, Publix & Farnell frontage, lakeshore path. A comfier alt to STREET_PROPS.bench. |
| `bus_bench` | 1.47 x 1.10 x 0.55 | 175 | yes | sit | - | - | Main-road sidewalks beside the existing bus shelters (90,16.8 / -150,16.8 / 140,-16.8). |

## railing (4)

| n | dims (m) | tris | solid | interact | anim | spawns | placement |
|---|----------|------|-------|----------|------|--------|-----------|
| `handrail` | 1.39 x 1.00 x 0.41 | 193 | yes | - | - | - | ADA ramps at store entrances, stair edges, pond banks. TILEABLE: repeat end-to-end (~1.4m/segment). |
| `retaining_wall` | 1.97 x 0.60 x 0.43 | 37 | yes | - | - | - | Landscape berms, parking-lot edges, pond banks. TILEABLE (~2.0m/segment). |
| `pond_fence` | 1.07 x 1.20 x 0.13 | 168 | yes | - | - | - | Perimeter of LAKE (-255,-150) and retention areas. TILEABLE (~1.1m/segment). |
| `screen_wall` | 1.67 x 1.80 x 0.41 | 52 | yes | - | - | - | Hide dumpsters/AC/mechanical yards behind strip malls (as seen at Regions). TILEABLE (~1.7m/segment). |

## bollard (2)

| n | dims (m) | tris | solid | interact | anim | spawns | placement |
|---|----------|------|-------|----------|------|--------|-----------|
| `bollard` | 0.45 x 0.90 x 0.45 | 104 | yes | - | - | - | Store entrances (RaceTrac, Publix), ATM fronts, sidewalk edges. Place in rows. |
| `chain_post` | 0.60 x 0.50 x 0.20 | 121 | yes | - | - | - | Parking-lot corners, landscaped-bed borders. Decorative barrier; repeat for a chain run. |

## planter (3)

| n | dims (m) | tris | solid | interact | anim | spawns | placement |
|---|----------|------|-------|----------|------|--------|-----------|
| `concrete_planter` | 0.89 x 0.80 x 0.88 | 248 | yes | - | - | - | Storefront walkways, plaza entrances, bank porticos. |
| `tiered_planter` | 0.99 x 1.10 x 0.99 | 292 | yes | - | - | - | Plaza centers, bank/cafe entrances. Showpiece. |
| `raised_bed` | 1.35 x 0.50 x 0.95 | 137 | yes | - | - | - | Farnell school garden, townhouse yards, community garden plots. |

## fountain (3)

| n | dims (m) | tris | solid | interact | anim | spawns | placement |
|---|----------|------|-------|----------|------|--------|-----------|
| `fountain` | 2.07 x 1.80 x 2.07 | 473 | yes | - | flow | - | Plaza/bank courtyard centerpiece; lake area. Emit water particles + basin ripple (anim:flow). |
| `drinking_fountain` | 0.47 x 1.00 x 0.48 | 150 | yes | drink | flow | - | Parks, playground, school, lakeside path. E to drink (small heal / SFX). |
| `bird_bath` | 0.80 x 0.80 x 0.80 | 185 | yes | - | - | - | Townhouse yards, lakeshore, ornamental gardens. |

## sign (6)

| n | dims (m) | tris | solid | interact | anim | spawns | placement |
|---|----------|------|-------|----------|------|--------|-----------|
| `monument_sign` | 2.16 x 1.60 x 0.75 | 211 | yes | read | - | - | Subdivision & plaza entrances at the four road exits; strip-mall entries. Blank panel = decal a name. |
| `aframe_sign` | 0.64 x 0.90 x 0.78 | 90 | no | read | - | - | Sidewalk directly in front of stores (Dunkin/Starbucks/RaceTrac). Small, non-solid (step around). |
| `flagpole` | 2.60 x 6.00 x 1.18 | 159 | yes | - | wave | - | Bank fronts, school, civic corners. Flag waves (anim:wave). |
| `barber_pole` | 0.33 x 1.00 x 0.33 | 140 | yes | - | spin | - | Strip-mall storefront (barber/salon unit). Spins (anim:spin). |
| `pizza_sign` | 1.79 x 4.50 x 0.62 | 163 | yes | - | spin | - | Tall pole sign at a strip-mall pizza place. Top disc spins (anim:spin). |
| `tube_man` | 3.63 x 5.00 x 1.41 | 265 | no | - | flail | - | Grand-opening / promo at RaceTrac forecourt or a strip mall. Flails wildly (anim:flail). Non-solid. |

## play (5)

| n | dims (m) | tris | solid | interact | anim | spawns | placement |
|---|----------|------|-------|----------|------|--------|-----------|
| `playground_climber` | 2.38 x 1.80 x 1.80 | 497 | yes | play | - | - | Farnell school / park playground. E to play (kids anim / SFX). |
| `slide` | 0.83 x 2.20 x 2.79 | 245 | yes | play | - | - | Playground clusters (pair with climber & swing_set). |
| `swing_set` | 2.53 x 2.20 x 2.18 | 245 | yes | play | sway | - | Playground / school. Seats sway (anim:sway). |
| `basketball_hoop` | 1.24 x 3.05 x 2.01 | 225 | yes | play | - | - | School blacktop, townhouse driveways, park court. |
| `skate_ramp` | 1.71 x 1.20 x 2.19 | 161 | yes | - | - | - | Park, empty lot, cul-de-sac. Quarter-pipe. |

## misc (19)

| n | dims (m) | tris | solid | interact | anim | spawns | placement |
|---|----------|------|-------|----------|------|--------|-----------|
| `windmill` | 1.18 x 2.50 x 1.32 | 245 | yes | - | spin | - | Decorative landscaping, lakeside, school yard. Blades spin (anim:spin). |
| `park_lamp` | 0.95 x 3.50 x 0.95 | 209 | yes | - | - | - | Sidewalks, plaza, lakeside path, parks. Globe lamp; ties into setLamps day/night. |
| `fire_pit` | 0.81 x 0.50 x 0.81 | 182 | no | - | flames | - | Townhouse yards, lakeside, park. Flames flicker (anim:flames). |
| `bbq_grill` | 0.74 x 1.10 x 0.61 | 217 | yes | cook | smoke | yes | Townhouse yards, park picnic area, tailgate. E to cook; smoke rises (anim:smoke); can drop food. |
| `mailbox_cluster` | 0.69 x 1.40 x 0.69 | 211 | yes | - | - | - | Townhouse rows near the homemailbox placements; apartment blocks. |
| `hotdog_cart` | 1.30 x 2.00 x 1.31 | 382 | yes | buy | smoke | yes | Sidewalk near RaceTrac/plaza, park entrance. E to buy (drops food); steam (anim:smoke). |
| `icecream_truck` | 3.25 x 2.60 x 1.94 | 596 | yes | buy | - | yes | Neighborhood streets, park, school pickup. E to buy (drops treat). |
| `food_truck` | 3.64 x 2.80 x 2.54 | 633 | yes | buy | - | yes | Plaza lot, roadside event. E to buy (drops food). |
| `lemonade_stand` | 1.33 x 1.80 x 1.06 | 231 | yes | buy | - | yes | Townhouse yards, sidewalks. E to buy (drops drink). |
| `arcade_cabinet` | 0.80 x 1.80 x 1.08 | 259 | yes | play | glow | - | Store interiors (RaceTrac), pizza place. E to play; screen glow (anim:glow). |
| `jukebox` | 1.00 x 1.50 x 0.48 | 232 | yes | play | glow | - | Dunkin/diner or store interior. E to play music; light glow (anim:glow). |
| `boombox` | 0.60 x 0.45 x 0.28 | 162 | yes | play | - | - | Park, sidewalk, on a bench. Small. E to play music. |
| `soda_machine` | 1.14 x 1.90 x 0.92 | 197 | yes | vend | glow | yes | Store fronts, gas station, school. E to vend (drops soda); panel glow (anim:glow). |
| `gumball_machine` | 0.48 x 1.20 x 0.56 | 209 | yes | vend | - | yes | Store entrances (Publix, Dollar Tree). E to vend (drops gumball). |
| `claw_machine` | 1.01 x 1.90 x 1.24 | 265 | yes | play | glow | yes | Store entrances / arcade. E to play (may drop a prize); marquee glow (anim:glow). |
| `porta_potty` | 1.15 x 2.30 x 1.08 | 193 | yes | - | - | - | The roadwork scene (cross-road east shoulder z82..118), construction, park events. |
| `trash_recycle` | 1.23 x 1.10 x 0.66 | 271 | yes | - | - | yes | Parks, plaza, sidewalks, school. Kickable; can drop junk (dumpster-dive style). |
| `garden_gnome` | 0.32 x 0.50 x 0.18 | 206 | no | - | - | - | Townhouse yards, ornamental gardens. Non-solid decor. |
| `flamingo` | 0.24 x 0.90 x 0.69 | 164 | no | - | - | - | Townhouse yards, lakeside. Non-solid pink lawn decor. |

## Notes / known quality
- Style: 128px posterized JPEG textures, NearestFilter — matches STREET_PROPS / MESHY_UFO PSX look. Tri counts 37–633 (mean ~230), all within the vehicle-tier budget.
- Weakest asset: `barber_pole` (regenerated once; reads correctly but slightly chunky). `garden_gnome` is rough but recognizable. `flamingo` ships with a small separate base plate.
- `shopping_cart` was dropped — its Meshy gen came out as a sparse wire skeleton and STREET_PROPS already has a good `shoppingcart`.
- Tileable segments (`handrail`, `retaining_wall`, `pond_fence`, `screen_wall`) are single ~1.5–2m units meant to be repeated end-to-end along their x extent.
- Trucks (`icecream_truck`, `food_truck`) came out slightly stubby (Meshy compresses length); scaled by height, so they read as small vans. Fine for a stylized town.
