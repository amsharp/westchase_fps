# CLAUDE.md — Westchase FPS

Guidance for Claude Code when working in this repo. The only project here is
`westchase-fps/` — a browser FPS/crime-sim set in a recreation of the
Race Track Rd / Countryway Blvd intersection in Westchase, FL (Tampa).
Everything below was true as of the last session; verify against the code if
something seems off.

## Hard environment constraints

- **No Node, no Python, no build tools** on this machine. Everything must run
  as plain files in a browser. Never introduce npm/bundlers.
- The game runs by **double-clicking `index.html`** (file:// must keep
  working). All textures are canvas-generated at runtime; never reference
  external image/font/CDN URLs from the game.
- Third-party libs are **vendored locally**: `three.min.js` (Three.js r149
  UMD — last UMD line, do not upgrade to module-only builds) and
  `peerjs.min.js` (PeerJS 1.5.4 — legacy, netcode now uses the Railway
  WebSocket relay; still loaded, safe to drop later). Singleplayer is fully
  offline; multiplayer needs internet only to reach the relay server.
- Plain ES5-flavored JS (`var`, function declarations). Match that style.
- **Imported-model textures: DO NOT downscale (user policy).** The user-imported
  building models (`skyscrapers.js` boa/pnc/regions/sykes/wellsfargo/bbt/suntrust,
  `airport_main/atc/hangar/terminal.js`, `jail.js`, etc. — all `{q,dims,p,u,i,tex}`
  decoded by `decodeAirModel`) each texture a whole building on ONE UV atlas that
  is already low-res/pixelated; downscaling it in the converter makes it mush.
  When (re)generating any building's data file, embed the ORIGINAL texture at
  full resolution (PNG or high-quality JPEG data-URL, no canvas resize). Guns +
  items (`meshyguns.js`, `meshyprops.js`, `axedata.js`) are fine as-is — the
  no-downscale rule is specifically for buildings. `decodeAirModel` sets
  `texture.anisotropy = MAXANISO` so grazing/tall surfaces stay sharp.
  **Adding skyscrapers:** `tools/skygen/glb2sky.js` (+ README) converts a textured
  building `.glb` → a catalog entry (centers X/Z, base→y=0, `q=32760/maxAbs`, raw-v
  UVs, native-res JPEG atlas). `bbt`+`suntrust` (v1.117) were imported this way; the
  showcase (`placeSkyscraperShowcase`) uses one shared scale for the pair to keep the
  Blender-authored relative height. Placement is by footprint width (uniform scale,
  never stretched), so correct `dims` = correct relative height.
- **Precise building collision (v1.112):** imported buildings no longer collide as
  one bounding box — `pushMeshColliders(cache, scale, wx, wz, rotY, topY, tag)`
  decodes the actual ground-level footprint from `cache.geo` (`meshFootprintRects`:
  rasterize only the ground-slice **VERTICAL** faces (walls/pillars — `minY <
  miny+max(1.2,H*0.14)` AND face normal `|ny|<0.6`; horizontal floor/roof slabs are
  skipped so covered drop-offs / overhangs stay walkable — v1.112.1) into an
  occupancy grid (edge-sampled), flood-fill the exterior so enclosed interiors fill
  solid while open areas bounded only by gapped pillars stay free, then greedy
  maximal-rect decompose) and registers a set of oriented-box colliders
  (`addColliderOBB`, tagged `building`, `topY` set) that follow the real shape
  (L-wings, notches, thin ATC shaft). Falls back to one yaw box on bad geo.
  Callers: `placeCatalogModel` (skyscrapers/REMAP_MODELS → returns `placed.cols`),
  airport main/terminals/ATC/hangars. Destructible towers store `cols` (array) and
  toggle every box `.active` on collapse/rebuild (was a single `t.col`). pushOut is
  grid-accelerated so the extra boxes are cheap (~5–30 per tower, ~16 per airport
  bldg). Jail (interior walls) + cabin (already a tight rect box) unchanged.

## Files

```
westchase-fps/
  index.html    — HUD/menus markup + all CSS (one file)
  game.js       — the entire game (~2600 lines, one big IIFE)
  three.min.js  — vendored Three.js r149
  peerjs.min.js — vendored PeerJS 1.5.4
  serve.ps1     — PowerShell HttpListener dev server (port 8123)
  README.md     — player-facing docs; keep updated when features change
.claude/launch.json — preview config: runs serve.ps1 (name "westchase")
```

## Dev server & verification workflow (important)

Use `preview_start` with config name **westchase**. Two quirks:

1. **The preview tab is usually backgrounded** → `preview_screenshot` times
   out and `requestAnimationFrame` is frozen. Do NOT fight this. Instead use
   the debug hook `window.__wc` (bottom of game.js) to drive frames manually
   and capture screenshots yourself:
   - `__wc.tick(dt)` runs one full update+render step.
   - Draw the WebGL canvas onto a 2D canvas, `toDataURL`, then
     `fetch('/upload', {method:'POST', body: dataURL})` — **serve.ps1 has a
     POST /upload route** that writes `capture.jpg` into the game folder.
     Then `Read` that file to see it. Delete `capture.jpg` when done.
2. If you edit `serve.ps1`, `preview_start` reuses the old process — kill the
   PowerShell process running serve.ps1 (find via `Win32_Process` CommandLine
   match; the port itself shows as owned by System/http.sys) and start again.

`__wc` exposes (non-exhaustive): `state, player, npcs, cops, cars, cashes,
drops, rockets, net, start/startGame, hostGame, joinGame, teleport(x,z),
setYaw, setPitch, setEquipped, tryAttack, resetCooldowns, rob → (gone; use
enterStore/exitStore/refreshClerk), setWanted, damageCop, goBerserk,
igniteCar, boomAt, killNpcRagdoll, setRain(on), setClock(envT), envState(),
isDriving, drivingCar, enterCar, exitCar, pressKey(code,down), isInside,
storeState, renderer, scene, camera, tick(dt)`.

### Headless-testing gotchas (learned the hard way)

- Paused/teleported NPCs don't sync their mesh: set `n.mesh.position` +
  `updateMatrixWorld(true)` before raycast tests.
- Long combat tests die to cops/cars: pin `state.hp=100` / `setWanted(0)`
  each tick, or teleport far away.
- `setTimeout` (death respawn = 2.6 s) can't fire inside one synchronous
  eval — split across two evals or set state manually.
- Recoil accumulates camera pitch between manual shots; zero
  `camera.rotation.x` before aim-sensitive tests.
- Don't place test coordinates inside forest-patch colliders (pushOut will
  teleport the player out).
- Multiplayer is testable headlessly: run `server/server.js` on a local
  port, point pages at it via `window.WC_SERVER_URL` (addInitScript), call
  `__wc.playOnline()` in each, drive every page with its own `__wc.tick`.
  Stub `requestAnimationFrame` in test pages or a loaded page's RAF loop
  starves the next page's ~43MB script parse (see tools/_maintest.js).

## game.js architecture

One IIFE, top-to-bottom sections: constants → state → renderer/scene →
texture helpers → materials/geo helpers → sky → ground/roads → palms/oaks →
facades → city layout → pavement → street lights → day/night+rain → people →
gas-station interior → police/wanted → cars → driving → cash/puffs →
decals/ragdoll/explosions/rockets/drops → NPC logic → collision → viewmodels
→ combat → audio → UI → minimap → input/menu/net → player update → main loop
→ `window.__wc` exports.

**Load-order gotcha:** function declarations hoist but `var` materials/
geometries do NOT. Anything the city-layout section calls at load time
(car meshes, oak/leaf materials, CARCOLS…) must be defined textually above
the layout block, or you get "Cannot read properties of undefined". Builders
that only run at runtime are safe anywhere.

`Object3D.add()` returns the **parent** — never chain
`scene.add(mesh).rotation…` (this once rotated the whole scene).

## World layout (hand-authored, matches satellite reference)

Map is 680×680 (HALF=340), origin at the main intersection. Main road E–W at
z=0 (MAIN_HW=14), cross road N–S at x=0 (CROSS_HW=11). Perimeter = fogged
forest walls + "ROAD CLOSED" barriers at the four road exits.

- SE: **RaceTrac** gas station (robbable, enterable interior) — entry zone
  `gasRob {x:60,z:42}` — deliberately the ONLY building on that corner.
- SW: Dollar Tree, self-storage, blue-roof strip malls westward; **Dunkin**
  at (-116,31) fronting the first strip mall, across the main road from
  Starbucks (-116,-30).
- NE: Regions Bank, pharmacy, Sakura Sushi.
- NW: Bank of America, **Publix** (player + dealer spawn in its parking lot:
  player (-72,-97), dealer `dealerPos (-72,-106)`), Farnell Middle School,
  townhouses (two rows east of the lake, two moved NORTH of it at
  (-210,-215)/(-210,-245) — nothing may sit over the water), lake
  `LAKE (-255,-150)`, 5-story red-roof house (-278,-78).
- **Lake is swimmable**: paraboloid bed (`lakeBedY`, `LAKE_DEPTH=4`,
  surface `WATER_Y=0.2`), transparent double-sided water. Its collider is
  flagged `.lake` — the player's pushOut uses `landColliders` (filtered)
  so only NPCs/cops/cars are blocked. Center fountain (own collider) with
  `fountainDrops` particles. Head below `WATER_Y` → `setUnderwater`:
  `#waterFx` overlay + `uwGain` muffled loop.
- **Sidewalk layering gotcha**: sidewalks are 4 flanking strips (y 0.12 /
  0.125 for cross to avoid corner z-fights) laid AFTER roadStrip (y 0.05).
  A full-width sidewalk slab under the road once hid the asphalt entirely.
- **NPC scatter + perf cull (v1.111.0):** `NPC_W_MAP=0.40` of pedestrians are
  "map roamers" — `assignNpcHome` homes them to a random collider-free point
  anywhere on the whole WLO..WHI map (`mapRoamSpot`) with `n.roamer=true`, and
  `npcTargetFor` ambles them within ~70u of that home, so the crowd spreads over
  the map instead of clustering at the Publix intersection. **Cull**: `updateNPCs`
  (and `updateKids`) call `refreshCullCam` then `cullFar(x,z)` — a pedestrian
  BEHIND the camera (`dot(rel, camFwd)<0` & `>55u`) or deep in the fog
  (`>560u`) freezes + hides (`mesh.visible=false`, `continue`); ambient states
  only (ragdoll/down/hidden still resolve), un-hidden the instant it's back in
  view. Cuts the skinned-anim sim to just the on-screen crowd.
- NPCs wander with an 85% sidewalk bias (`npcTarget`). Buildings register
  entrances in `npcDoors` (venues via the REMAP_VENUES front-face formula,
  houses via `feat.door`); NPCs run errands into them (`doorSeek` →
  state `'hidden'` = inside, unhittable, mesh invisible → re-emerge), killed
  NPCs respawn by WALKING OUT of a door (never pop in), and `spawnCop` snaps
  to the nearest door ≥30u from the player. The `hidden` state is wire value
  4 in the world snapshot; clients SNAP position (no lerp glide) on hidden
  transitions. NPCs also steer around obstacles pre-contact (`pointFree`
  whisker probe, every 3rd frame, walk state only).
- **Breakables**: every oak/palm/streetlight registers in `breakables`
  (`registerBreakable`); any car moving >3 u/s snaps them (`breakProp` →
  ease-out topple + puff burst, 60 s respawn) in `updateWorldFx`, which
  also runs the fountain + underwater check. Works on host and on
  mirrored client cars, but breaks are per-peer (not net-synced).
- Gas station interior is a hidden room **under the map** at y=-60
  (`INT` box, `intColliders`, clerk at `clerkPos`). The `inside` flag switches
  floor height and collider set (pushOut takes an optional collider list).
- Minimap draws from data registers: `mapBuildings` (with heights, used for
  rain collision too), `mapPave`, `mapDrives`, `mapParking`, `mapForest`.

## Map editor & expansion pipeline

`editor.html` (repo root, opens standalone in a browser; loads `remapdata.js`
so it shows the CURRENT map) is a top-down CAD editor → **Save Map** downloads
`westchase_map.json` → `node tools/mapimport.js westchase_map.json` regenerates
`remapdata.js` (`REMAP_ROADS/EXITS/CLEAR/VENUES/SURFACES/AREAS`), consumed by
game.js under `WC_REMAP`. Frame: junction `(0,0)`, **+x east / +z south**.
- **World bounds (v1.78 E+S expansion):** ASYMMETRIC `WLO=-600, WHI=1800`
  (2400×2400, 4× the old area) — the town keeps its coordinates in the NW
  corner and the world opens EAST + SOUTH. `HALF=600` is now just the *original*
  centered-map half (town road/exit spans still use it); world-edge logic uses
  `WLO/WHI` (player clamp, `remapPerimeter`, ground plane `E`, minimap `w2m`/`TOTAL`).
  Same `WLO/WHI` live in editor.html + tools/mapimport.js — keep all three in
  sync to resize. Because `WLO === -HALF`, `w2m` value is unchanged; only `TOTAL`
  (span) doubled → town lands in the NW quadrant of the minimap. `remapPerimeter`
  only walls/barriers exits that sit on a real world edge (`exitOnWorldEdge`), so
  the town's E/S road exits now open into the empty new land instead of hitting a
  ROAD CLOSED barrier. The new land is bare grass — the canvas for the editor
  expansion (nothing generated there yet).
- **NPC/cop world clamps use `WLO/WHI`, not `HALF` (v1.110.3):** every per-frame
  movement clamp AND spawn clamp for cops (`spawnCop`, cop-move in `updateCops`),
  cop cars (`spawnCopCar`), NPCs (walk + ragdoll paths), and kids now clamps to
  `[WLO+m, WHI-m]` instead of the original `±HALF`. Previously they were pinned to
  the OLD centered-map border, so a crime committed out in the E/S expansion drew
  cops that got shoved back to the ±HALF edge. The player clamp already used
  `WLO/WHI`. (Ambient NPC WANDER targets — `WALK`/`sidewalkSpot`/`npcTarget` — are
  still town-centered since the expansion has no roads/sidewalks yet; this change is
  about the *capability* to traverse the whole map, which pursuit/flee/knockback now
  can. Money-UFO crash + player waypoint clamps intentionally stay `HALF`.)
- Editor authors: roads (polyline, `cls` 0–3 ground) + **new**: `kind:'highway'`
  (elevated, `elev`), `kind:'ramp'` (ground↔highway), `kind:'water'` (river);
  **areas** (`REMAP_AREAS` rects: `kind` forest/water/ocean); surfaces, buildings,
  props, zones. Road **extend** = click an endpoint ring-node with the Road tool;
  vertices **snap** onto other roads' nodes (`nodeSnap`) for seamless junctions
  across types (ramp→highway, etc.). mapimport skips wall-exit generation for
  rivers.
  - **Ramp↔highway auto-match (v1.118.1):** `buildRamp` no longer trusts the ramp's
    own authored profile at its deck end — `rampDeckLink(r)` finds the highway/exitdeck
    its high end joins (nearest end within `RAMP_JOIN_R=14`) and the ramp INHERITS that
    deck's `elev`, `hw`, `oneway`, and `lanes`, then SNAPS its top vertex exactly onto
    the join point. So an editor-drawn on/off ramp lines up flush with the highway it
    feeds (same height, width, median/one-way, and no gap) regardless of the elev/width
    it was given — just draw it and node-snap the end to the highway. Falls back to the
    ramp's authored values only when it doesn't reach any highway end. (Draw the ramp's
    last segment roughly tangent to the highway so the decks meet at a clean angle.)
  - **Jersey-barrier junction stitching (v1.118.2):** each elevated road rails only its
    OWN two edges, so where two of them meet end-to-end the rails used to stop short and
    leave a gap. `buildHighway`/`buildExitDeck` (both jersey edges) and `buildRamp` (its
    deck-END parapets) now `registerHwBarrierEnds`; after all elevated roads build,
    `stitchHwBarriers()` bridges barrier termini of DIFFERENT roads whose deck-ENDS
    coincide (`JUNC_R=6`) with a short guardrail box (`hw:barrier`), shortest-gap-first so
    same-side termini bridge before any cross-deck pair, `STITCH_MAX=11`. Only end-to-end
    junctions bridge — mid-span exit throats (`barGap`) are never road-ends, so they stay
    open. Runs at map load ⇒ any highway drawn + node-snapped in the editor auto-connects
    its rail to the neighbour's. Debug: `window.__hwStitch` ({ends, bridges:[[x,z]…]}).
- **PENDING game-side rendering (TODO when the expansion map lands):** game.js
  does NOT yet render `REMAP_AREAS` (forest/lake/ocean) or the new road kinds.
  Need: areas → forest scatter / swimmable water like `LAKE` / big ocean plane;
  `kind:'highway'` → raised drivable deck at `elev`; `kind:'ramp'` → elevation
  transition the car climbs; `kind:'water'` → river water strip. Until then the
  editor + JSON + remapdata carry the data but it won't appear in-game.
- **Downtown filler buildings (v1.120, reworked v1.121):** `citybuildings.js`
  (`CITY_BUILDINGS` catalog — 21 entries: brick rowhouses, citybiz storefronts,
  offices, one highrise; 5 shared JPEG atlases via `texRef`, ~3.4MB; loaded blocking
  BEFORE game.js, pushed into `MODEL_CATALOGS`) holds the models. Converter:
  `tools/citygen/glb2city.js` (multi-object GLB → catalog, dedupes atlases; source
  GLBs committed in `tools/citygen/glbs/`).
  - **MODEL ORIENTATION (verified by render):** every family's FRONT (storefront /
    entrance / lobby) is on the model's **local +X face**, so `dims[2]` (Z) is the
    FRONTAGE width and `dims[0]` (X) is the DEPTH. placeCatalogModel scales by
    `w/dims[0]`, so the stored `w` == depth; frontage = `dims[2]*w/dims[0]`. To face
    the road: rotate +X toward it → `rot = atan2(Nu[1], -Nu[0])` (Nu = normal away
    from road). Getting this wrong makes buildings show their SIDE to the street.
  - **Placement generator** `tools/citygen/placebuildings.js` frontage-walks every
    ground road (hw≥8) in the downtown box (X 1632–2860, Z 1474–2689), lines both
    sides fronts-to-road, tiers by distance from the skyscraper centroid (offices +
    near-core highrises in the middle band, rowhouses on the fringe; highrises/offices
    scaled BIG so fewer fit), writes `westchase_map.json` (buildings `gen:'city'`,
    idempotent re-run strips priors + old garage/lot artifacts) → `tools/mapimport.js`
    regens `remapdata.js` REMAP_MODELS (526 = 8 skyscrapers + 518 fillers). Keep-out
    seeds from the SKYSCRAPERS only (ignores prior gen fillers still in remapdata).
  - **Foundations (v1.121, merged v1.121.1):** `placeCatalogModel({foundation:true})`
    only RAISES the building onto `FOUND_H=0.45` (< STEP_UP so you walk up).
    `buildDowntownFoundations()` (after placeRemapModels) pours the actual concrete:
    rasterises the downtown region (cell 3u), marks road/garage/building cells,
    flood-fills the OPEN exterior from the border, then pours foundation over every
    building footprint + any road-ENCLOSED block that holds a building (so alleys
    aren't grassy; open road-frontages merge into strips), greedy-rects into raised
    concrete deck slabs (topY=FOUND_H, `deck` so never walls you). ~555 slabs.
    `foundMat`/`addFoundation` (per-building plinth) are now dead but kept.
  - **Foundations lift EVERYTHING (v1.121.2):** buildDowntownFoundations publishes an
    O(1) height field (`_fdGrid` + `foundationHeightAt(x,z)`); `surfaceHeightAt` raises
    every mover (player/NPC/car/cop car) onto FOUND_H over it, and `planeGroundY` /
    `heliGroundY` too — no per-slab colliders (they'd wall cars). Props ride on at
    PLACEMENT (grid is ready post-pour): `registerBreakable` (lamps/hydrants/poles/
    trees), env `place()`, and street-prop `spFull` (SP_SOLID branch) each add
    `foundationHeightAt`. Don't double-lift SP_SNAP props — those are breakables, lifted
    once by registerBreakable.
  - **User ground textures (v1.121.2):** `groundtex.js` (`GRASS_TEX_RGBA` +
    `CONCRETE_TEX_RGBA`, 128² raw RGBA base64, decoded by `tools/citygen/decodetex.js`
    from the user's grass.jpg/concrete.jpg, POT so RepeatWrapping tiles). `rawImgTex()`
    builds them SYNCHRONOUSLY (putImageData) so cloned materials get real pixels at load.
    `grassT`→grass (ground/medians); `concreteT`→concrete (sidewalks/pads/foundations),
    and `CONC_TEX` swaps onto `hwConcreteM`/`hwUnderM` (highway+monorail piers/underside),
    `monoDeckM`, garage `_grgFloorM`/`_grgWallM`, `foundMat`. Loaded before game.js.
  - **Roofs walkable:** already free from v1.112 — building OBB colliders carry
    `topY=foundH+H`, so the 2.5D `surfaceHeightAt` logic lets you stand on any roof
    (parachute/heli land, jump off).
  - **Destruction (v1.121):** `placeRemapModels` registers a `cityBuildings[]` rec per
    model + pushes skyscrapers/offices/highrises (`isTowerModel`) into `towers[]`.
    Plane crash → `towerAt` ignites the big event (offices/highrises too); non-tower
    hit → `rubbleSwapBuilding` (instant footprint-scaled rubble). `startTowerCollapse`
    → `chainCollapse` rubble-swaps every neighbour in radius (all types). Rubble reuses
    `buildRubblePile(fake)`. Debug: `__wc.cityBuildings/towers/rubbleSwap/collapseTower/surfAt`.
  - **Parking garages are now EDITOR-placed:** editor "Parking Garage" building
    (`type:'garage'`, BUILDINGS entry) → mapimport `REMAP_GARAGES` → game
    `placeRemapGarages()` (axis-aligned `buildParkingGarage`, rot stored but ignored).
    Wire E/W entrances to streets with roads. `GARAGE_SPOTS` keeps only the SW test one.
  - Verify: `tools/citygen/bootcheck.js` (boot + 0 pageerrors + shots),
    `desttest.js` (roof/foundation/rubble/chain), `frontshot.js` (street facing).

## Systems summary

- **Weapons** (`WEAPONS`/`GUN_LIST`): fists, pistol $150, TEC-9 smg $400,
  rifle $600 (right-click scope = `setZoom`), AK-47 auto $1000, rocket
  launcher $2000 (visible projectile, 5 s cooldown, self-damage). Snack item
  (gas station, $20, +50 hp, consumable). Death drops all owned guns as
  pickups (2 min despawn; duplicate pickup = half-price refund).
- **Forest cabin + axe pickup** (`CABIN`, `getCabinMesh`, `placeForestCabin`,
  `ensureCabinAxe`): a Meshy image-to-3d pallet-wood shed w/ corrugated barrel
  roof (`cabin.js` = `CABIN_DATA`, same `{q,dims,p,u,i,tex}` quantization as the
  guns, decoded like `getAxeMesh`; loaded before game.js, game guards
  `typeof CABIN_DATA`). Placed at `CABIN {x:-344,z:-470}` in the empty NW forest
  corridor (door baked to +Z via the converter's 180° ROTY; footprint collider;
  a ring of oaks/palms/bushes around it with a clear apron + open door approach).
  It's a SECRET — deliberately NOT on the minimap (no `mapBuildings` entry, and
  `drawMinimap` skips `drops` flagged `.cabin`). The AXE now spawns here instead of the dealer:
  `WEAPONS.axe.worldOnly` (kept in `GUN_LIST` so it still counts as an armed
  weapon, but `refreshShop` skips `worldOnly`), and `ensureCabinAxe()` (called
  each frame before `updateDrops`) keeps a spinning axe `drops` pickup at
  `CABIN_AXE` whenever `!state.owned.axe` — grab it once; a fresh one only
  reappears after you lose it (death clears `owned.axe`). Local/per-player, never
  net-synced. `dropMesh('axe')` renders the real axe model. Offline gen tooling:
  scratchpad `cabin/` (seed.js gpt-image seed → `tools/vehgen/vehpipe.js`
  image-to-3d → `gun_glb_parse.js` → `cabin/cabin_conv.js` bottom-at-0 quantize +
  256px tex). Original 21k-tri mesh kept (Meshy's remesh to <1k holed the walls).
  **UFO flyover easter egg** (`CABIN_DOOR`, `cabinKnock`, `spawnCabinUfo`,
  `updateCabinUfo`, `cabinUfo`): press E within ~4u of the cabin door to knock;
  10 knocks IN ONE NIGHT (`isNightNow()` = `dayFactor()<0.32`; knocks reset if
  not night or the night changes) spawns a UFO that silently drifts over and
  vanishes (~13s or 18s cap). Reuses `getUfoMesh('ufo')` but is NEVER tagged
  `userData.ufo`, so bullets pass through — not killable. Once per night:
  `cabinUfoNight` latches the `nightIndex()` (`floor(envT/DAY_LEN)`), re-armable
  only when a new night rolls around. Separate from the money UFO (`ufo`); shares
  its hum but won't stomp it (`!ufo` guards). `updateCabinUfo` runs each frame
  after `updateUfo`. Local/per-player.
- **Gore**: shotgun ($500) close headshot decapitates (`decapitateNPC`:
  PSX hides `userData.head` + flings a gib; skinned shrinks `userData.headBone`;
  restored on respawn). Axe (`worldOnly` — NOT sold; spawns at the forest
  cabin, see below) (`melee`+`bisect`) `bisectNPC` swaps the NPC
  for TWO copies of a generic bloody half-body gib (`halfbody.js` /
  `HALFBODY_DATA` — a Meshy full body split down x=0 with a blood-capped cut
  face, ONE half stored + mirrored via scale.x=-1 for the other); they topple
  opposite ways and despawn (`halves`/`updateHalves`). Reused for all NPCs/cops.
  Kids are never in any hit list, so they can't be gored. Regenerate the gib
  via `tools/chargen/halfbodygen.js`.
- **Wanted** (0–5 stars, v1.107 rework): stars come from ONE **kill-points**
  tally (`state.killPts`, `KILL_STAR_PTS=[3,9,21,39,69]`): a lethal kill = **+3**
  (`creditCivKill`/`creditCopKill`→`addKillPts(3)`), a **fist KNOCKOUT = +1**
  (`creditKnockout`). So 1 kill = 1★, then +2/+4/+6/+10 kills for 2–5★ (23 kills
  total). Civ vs cop no longer differ. Fist kills route through `damageNPC`'s
  `isKO` branch → NPC `state='down'` + `n.ko=true`, **no `bloodPool`**, `KO_TTL=25`s;
  shooting a downed `ko` body (raycast path, `npcHit.state==='down' && npcHit.ko`)
  converts it to a real kill (bloodPool + `creditCivKill`). Direct crimes still
  snap floors (rob=2★, reckless=3★, vault=4★, **skyscraper collapse=5★** in
  `igniteTower`) — `setWanted` tops `killPts` up to the star's threshold and arms
  the hide timer. **Spray paint** only stars you (1★) when `copWitnessing()` is
  true (a cop with LOS/proximity via `posSeesPlayer`) — otherwise it's a silent
  Vandalism charge, no heat.
  **Detection + manhunt** (`heat` object + `recomputeHeat` at top of `updateCops`):
  cops only KNOW your position via `posSeesPlayer` = proximity (`COP_PROX2`=9²) OR
  line-of-sight within `COP_VISION2`=58² (cars 82²). `heat.known` gates
  `copPickTarget` (engage) vs SEARCH (`copSearchPoint` → last-known `heat.lkx/lkz`
  + predictive along `heat.lkvx/lkvz`; cop cars have a `search` state too). New
  responders spawn from `responseAnchor()` = **last-known** spot (not your live
  pos) so fleeing works; `spawnCop` ring is 90–150u. **Losing heat**: no more
  per-star decay — stay unseen `wanted*HIDE_PER_STAR` (60s/star) and ALL stars
  drop at once (`clearHeat`); being seen resets `heat.loseT`. **Cop counts (v1.116,
  cut way down — a long chase used to pile up a 25+ mob that all fired at once →
  lag):** `desiredCops` = `w===0?2 : (2+w*1.6)|0` (0★=2,1★=3,2★=5,3★=6,4★=8,5★=10);
  `desiredCopCars` per its own formula. **Hard cap:** the spawn block trims the
  surplus every frame — if `alive > desiredCops()` it retires the FARTHEST cops that
  are `>85u` from the hunted player (`hottestPlayerPos`), so foot cops (which never
  despawn on their own) can't balloon past the level target from disgorged cop-car
  crews or star decay. `parkAndDisgorge` also clamps its crew to the remaining room
  under the cap, and (v1.116.1) if the cap is already FULL it returns `false` without
  parking — the caller keeps the cruiser chasing instead of stopping it and faking the
  `cardoor` sound with nobody getting out (the old "cop got out but there's no cop"
  phantom). **Fire stagger (v1.116):** cops TAKE TURNS — a shared
  `lastCopFireT`/`COP_FIRE_STAGGER` (0.15s) in `copShoot` lets only one cop open fire
  per window, so a squad never volleys on one frame (was a bullet-wall + per-shot
  sfx/hitscan lag). **Patrol cop cars**: `copCars` spawn `state:'patrol'`
  (lights off, cruise road waypoints via `copRoadPoint`), flip to `seek/chase`
  when a crime happens near them or they spot you; `driveCopCar` has patrol/
  search/pursuit target selection. **Per-cop weapons** (v1.113, `rollCopGun(stars)`
  + `COP_GUN_STATS`): each cop rolls its own gun the first time it draws (persisted
  on `c.gun`). At 1–3★ → pistol (70%) or shotgun; at 4–5★ → auto/smg dominant (~70%)
  but pistol/shotgun still appear. Held guns are the REAL player models (`dropMesh`→
  `realGunModel`→`getGunMesh`, oriented at runtime by `copAimArm`/`copLowReady`'s
  `lookAt` on the group-local -Z barrel) and fire the PLAYER gun `sfx` (`copWeapon(c)`
  maps `.sfx`). Heli gunner uses `'rifle'` (scoped kar98k). Killed cops **drop their
  gun** (`dropWeapon(c.gun,…)` in the death branch); picking one you already own
  grants **half a mag** of that ammo type instead (`applyDropPickup` owned branch →
  `state.ammoRes`). Interior cops
  (`c.interior`,`c.baseY`) spawn on a failed unarmed robbery, always local. Heat
  logic is host/local; clients mirror stars via `w`. `__wc` test hooks: `heatInfo`,
  `creditKill`, `posSeesPlayer`, `setHideTimer`.
- **Kill → respawn lull (v1.114):** killing any pursuit unit holds its category's
  spawn timer off for a random **30–60s** (`copRespawnDelay()` = `30+rand*30`), so
  gunning police down actually buys breathing room instead of an instant refill.
  Set on: foot-cop lethal kill (`damageCop` down-branch → `copSpawnT`), destroyed
  cruiser (`updateCopCars` `hp<=0` → `copCarSpawnT`), downed chopper (`crashHeli`
  → `heliSpawnT`). The INITIAL response to a fresh crime still ramps up fast — the
  timer is only pushed out on a kill, not during buildup (buildup resets to the
  short 2.6/4.5/6s intervals). `clearPolice` (respawn/jail) overrides with its own
  ~4s grace. **Unit HP (v1.114):** `COPCAR_HP=500` (was 130), `HELI_HP=1000` (was
  220) — the chopper is the tankiest pursuit unit, well above a cruiser; `fireRocket`
  splash bumped to 900 (cop car, still a one-shot) / 420 (heli, ~2-3 rockets).
  **Shooting a cruiser = heat (v1.114):** `damageCopCar` now sets `lastCrimeT` and
  floors wanted to **2★** (`setWanted(2)` if `<2` and `!state.dead`), so plinking a
  calm patrol car actually draws a response instead of eating rounds for free. (One
  choke point covers bullets from both shoot handlers AND the rocket splash.)
- **Police stay for the death/arrest cinematic (v1.114):** `updateCopCars`/
  `updateHelis` compute `cine = state.dead || arrested` and, while it's true, skip
  the want-based spawn AND the want===0 / roadblock / peel-off despawns — so the
  cruisers + choppers you drew stay on the map (and keep moving) as the death/arrest
  camera zooms out. They're removed only at the ACTUAL respawn/jail-teleport moment
  by `clearPolice` (called from `doRespawn` after `endDeathCam`, and `enterJailCell`).
  Foot cops already lingered until `clearPolice`; this makes cars/helis match.
- **Pursuit catch-up warp (v1.115, `updatePursuitWarp`/`pursuitReposition`):** once
  the police actually SEE you (`heat.known` → stamps `heat.lastSeenT`) and the chase
  has run **~20s** (`PURSUIT_TP_INTERVAL`), any foot cop or cruiser that's fallen
  `> PURSUIT_TP_FAR` (165u) away **warps in off-screen** so a cross-map chase stays a
  chase. `offscreenSpot(dist,forCar)` picks a jittered point in the REAR hemisphere of
  the **camera** (`playerSeesPoint` rejects anything on-screen — in front + within
  ~60° + unoccluded), `pushOut`-cleared; cruisers then `copCarJoinLane` + `rmAt`-snap
  onto the nearest lane so they can drive at you. Fires every 20s while seen. Foot cops
  land ~42-64u behind, cruisers ~70-92u. Host/local only (`isClient()`/`WC_BOT` bail —
  it keys off the local camera; helis are NOT warped, they already track from the air).
  A car/pillar briefly breaking LOS won't reset the clock — a `PURSUIT_GRACE` (6s)
  window rides through flicker; only a genuine ~6s evasion re-arms it (so the next
  spot restarts the 20s). `updatePursuitWarp` runs in `updateCops` right after
  `recomputeHeat`. `__wc`: `pursuitReposition()`, `pursuitInfo()`.
- **Heat ops** (v1.109, `updateHeatOps` in loop + `__wc.tick`, host-only —
  `isClient()` bails; local like cop cars/helis): while you're **driving at 3+★**
  the police escalate the chase. `roadAhead(dist)` snaps a point `dist` ahead of
  your travel (`driving.mvx/mvz`) onto the road via `copRoadPoint` and returns the
  road tangent + perpendicular (`roadTangentAt` = nearest `RM.edge` tangent). Every
  ~16–30s (`heatOpsT`) if `|pspeed|>12` it deploys either a **roadblock** (bias
  0.6 at 4+★ else 0.4) or a **spike strip**. `spawnRoadblock()`: 3 cruisers
  broadside (`makeCopCarAt(x,z,h,'roadblock')` — extracted from `spawnCopCar`; the
  `roadblock` state in `driveCopCar` just idles the car with lights flashing, and
  `updateCopCars` gives them their own despawn: wanted<2 / far>340 / life>85) plus
  a `spawnCopAt` officer behind each; toast "ROADBLOCK AHEAD" + `sfx('alarm')`.
  `spawnSpikeStrip()`: a `Group` (black backing box + cone spikes) laid across the
  lane, pushed to `spikeStrips[]`; `updateSpikeStrips` (in `updateHeatOps`) checks
  the driven car crossing it (along/perp vs the strip's px/tx axes, `|pspeed|>4`) →
  `blowTires(driving)` sets `c.tiresBlown` (caps `pspeed` to 12, forces a slide).
  `updateDriving` reads `tiresBlown` → `topF=min(14)`/`topR=min(6)` + constant
  `slid` so a spiked car crawls forever; the flag lives on the car entry so a fresh
  jack is clean, a spiked one stays crippled. (**SWAT removed v1.113** — the
  placeholder black vest box read badly; 5★ cops are now regular officers whose
  `rollCopGun` roll just skews to the automatics. A proper Meshy SWAT model may
  replace it later.) `__wc`: `spikeStrips`,
  `spawnRoadblock`, `spawnSpikeStrip`, `updateHeatOps`.
- **Helicopter model** (v1.110, `heli.js` = `HELI_MODEL`, loaded before game.js,
  game guards `typeof HELI_MODEL`): the user's Blender AS350 GLB, 3 rigid parts
  (`body`/`mainRotor`/`tailRotor`) quantized like the airport models
  (`{q,dims,parts:{pivot,axis,p,u,i}}`) at 0.55 scale, nose baked to +X, skids at
  y=-`skid` so a group at y=`skid` sits on the ground. `buildHeliMesh(variant)`
  builds `{group,mainRotor,tailRotor}` (same contract the old procedural mesh had —
  now `buildHeliMeshProc` fallback): `mainRotor` spins about **Y**, `tailRotor`
  about **Z** (`updateHeli`/`updatePlayerHeli` already drive those). `buildHeliMesh`
  is model-generic (`buildHeliFromModel(model,texUrl,keyPrefix)` + `heliGeoFor`/
  `heliTexFor`). **Police** choppers use `HELI_MODEL.texPolice` (Hillsborough Sheriff
  livery baked into the GLB). **Civilian** (player-flyable, `spawnPlayerHeli` →
  `buildHeliMesh('civilian')`) now has its OWN file **`civheli.js` = `CIV_HELI_MODEL`**
  (v1.118, loaded before game.js, game guards `typeof CIV_HELI_MODEL`): the user
  re-authored the UV layout, so it's a separate model/atlas — but it's the SAME AS350
  mesh, so `tools/skygen`-style the converter (`tools/heligen/glb2civheli.js`) maps the
  raw GLB (nose +Z, Blender scale) onto the OLD model's sim space via a similarity fit
  (Ry+90°, scale ~0.55, translate) to the body bbox and REUSES the old part pivots →
  identical geometry/pivots/spin, only UVs+skin differ. Falls back to
  `HELI_MODEL.texCivilian` if `civheli.js` is absent. Textures are full-res 1536×1024
  JPEG data-URLs (no downscale). `heliSideTex` + the procedural mesh are the fallback.
- **Rooftop exit (v1.122.3):** `exitHeli`'s landed branch keeps the player on
  whatever surface the chopper set down on. The skids rest at `roofY + HELI_SKID`,
  so `roofY = g.position.y - HELI_SKID` is the deck; the step-out spot uses
  feetY-aware `pushOut(..., roofY)` + `surfaceHeightAt(..., roofY)` and sets
  `player.y = surf + EYE` (was a hardcoded `EYE`, which dumped you to the street
  next to a skyscraper). If the sideways step would drop off the roof edge to a
  lower surface, it steps out under the chopper instead so you stay on the deck.
- **Player heli bail/land** (v1.117.1/v1.118): landing eases the held cyclic tilt to
  level so it sits upright on the skids (`exitHeli` also snaps level on a ground exit);
  no big `[E] EXIT` HUD prompt (corner box shows it). **Exiting mid-air** (>2.5u up)
  deploys the parachute like the plane (`deployParachute`) and the chopper flies on
  **pilotless** (`heliVeh.pilotless` → `updateHeliFreeFlight`): keeps its momentum,
  falls under gravity with a dead-stick tumble, and explodes on the first ground/
  building/highway contact via `crashPlayerHeli` (a plain fireball — NEVER `igniteTower`,
  so it can't collapse a skyscraper like the heavier jet can).
- **Rotor sound** (v1.110, `startHeliSound`/`updateHeliSound`, called at the end of
  `updateHelis`): a procedural whump — brown-noise rotor wash bandpassed + chopped
  by a ~13 Hz sawtooth LFO (blade slap), a 46 Hz engine rumble, a 560 Hz turbine
  whine — through a master gain driven by the NEAREST chopper (police `helis` in
  fly/falling, or the player's `heliVeh`, loudest when piloting) and stereo-panned
  by bearing off `camera.getWorldDirection`. Audible out to 240u so you hear the
  police coming; local like the choppers. Gated on `ac`.
- **Police helicopters** (`helis`, `spawnHeli`/`updateHeli`/`updateHelis`, 3★=1/
  4★=2/5★=3, local like the plane) got a v1.109.1 pass: (1) **speed cap** —
  `HELI_MAX_SPD=48`, below the plane's `PLANE_MAX_SPD=78` and the Porsche's 73, so
  those outrun it (a normal car / runner still gets caught); `updateHeli` clamps
  the per-frame horizontal step to `HELI_MAX_SPD*dt`. (2) **Spawn far + go to the
  crime scene** — `spawnHeli` now spawns 240–330u out from `responseAnchor()`
  (last-known, not live pos), and `updateHeli` orbits the crime-scene center (`cX/
  cZ` = `responseAnchor()`) whenever `!heat.known`, only locking onto the live
  player once a unit SEES you — same lose-them-by-hiding rule as the ground units.
  (3) **Only fires when armed** — `heliGunnerFire` bails unless `heliPlayerArmed()`
  (a real gun in `GUN_LIST` equipped, and NOT driving/piloting the plane), so
  fleeing unarmed / in a vehicle draws no fire. `__wc.helis`/`spawnHeli` for tests.
- **Progressive arrest (v1.122.2):** an unarmed catch is no longer instant. A cop
  has to be RIGHT on you (`ARREST_REACH=1.9`) for `ARREST_HOLD=2s` while you hold
  still (`pspd<ARREST_STILL=1.6`) — a `#arrestHud` bar ("BEING ARRESTED — STAY
  STILL") fills as `arrestProg` accumulates in `updateCops` (after the cop loop),
  and drains 2.2×-fast the moment you move/climb away. `arrestAllowed(cop)` gates
  it: never while `inVehicleOrAir()` (driving/parachute/plane/heli) and never
  across a height gap (`|player-feet − cop.baseY| > ARREST_DY=2.6`, so a cop on
  the ground can't cuff you up on a roof). The cuff branch in `updateCops` sets a
  frame-scoped `_arrestReach` instead of calling `bustPlayer` directly. `__wc`:
  `arrestState().arrestProg`, `arrestAllowed(cop)`.
- **Police response pacing (v1.122.2):** a fresh crime from 0★ holds ALL responders
  off for `COP_FIRST_RESPONSE=8s` (`setWanted` sets `copSpawnT`/`copCarSpawnT`/
  `heliSpawnT` only when escalating FROM 0★, so an ongoing chase isn't slowed), then
  units trickle in one at a time via `COP_SPAWN_GAP=4.5` / `COPCAR_SPAWN_GAP=7` /
  `HELI_SPAWN_GAP=9` instead of the whole squad materialising at once.
- **Arrest → jail** (`bustPlayer`→`jailPlayer`→arrest cam→`enterJailCell`/
  `releaseFromJail`/`updateJail`, per-player): an unarmed catch cuffs you instead
  of KO'ing — NO fine anymore. `jailPlayer(stars)` captures the charge list, then
  confiscates the whole kit (`state.owned/ammoRes/mag/snacks/sodas/bag`,
  snapshotted into `jailReturn` ONLY if stars≤2), clears wanted/kills/stolen +
  `resetRap()`, and starts the **arrest cinematic** (`arrested` flag gates
  `updatePlayer`/`hurtPlayer`; loop + `__wc.tick` call `updateArrestCam`):
  `startArrestCam` builds a STANDING player body, camera zooms out top-down
  (`ARREST_ZOOM_S=2.6`) fading `#arrestFade` to black, then `#arrestScreen` shows
  "ARRESTED" + `chargeList()` for `ARREST_HOLD_S=5`, then `finishArrest`→
  `enterJailCell` teleports into `JAIL` and starts the sentence. Sentence =
  30s×stars (`jailT` counts down in the main loop; `#jailHud` shows the timer).
  **Charges** (`rap` object, `chargeList()`, reset in `clearHeat`/`resetRap` when
  you get away or on death): Assault (fist knockout), Murder (any lethal kill,
  1-4) / Mass shooting (`rap.gunKills>4`; gun kills tracked via `byGun` in
  `damageNPC`/`damageCop`), Grand theft auto (`enterCar`/`boardPlane`/`boardHeli`),
  Robbery (gas rob/bank teller/vault/ATM), Terrorism (`fireRocket`/`igniteTower`),
  Vandalism (spray on static surface / car wreck). `__wc`: `rapInfo`,
  `arrestState`, `testCharge`. **v1.110.2 fixes**: (1) the arrest's
  `exitPointerLock` no longer pops the PAUSED overlay — the `pointerlockchange`
  handler + the Esc handler both gate on `!arrested`; (2) `finishArrest` restores
  the FP fists viewmodel (`vm.visible=true; setEquipped('fists')`) since
  `startArrestCam` hid it, so the cell isn't handless; (3) new `inVehicleOrAir()`
  (driving/`para`/`arrested`/plane-or-heli piloting) gates `cycleEquip`/
  `selectWeaponSlot` AND `setEquipped`'s `vm.visible`, so you can't switch weapons
  or see the viewmodel in third-person (parachute, piloting). Release restores the
  snapshot for ≤2★, forfeits it for 3–5★, then teleports to the town spawn
  (`JAIL.doorOut` = Publix lot). The cell is a Blender GLB (`jail.js` =
  `JAIL_DATA`, single double-sided UV atlas, full-res JPEG — user said don't
  downscale) placed at `JAIL_ORIGIN {300,-140,300}`, `JAIL_SCALE=1.7` for
  headroom; colliders hand-authored from the model bboxes (walls/bars + sink/
  toilet/bed), interior spec carries `pushR:0.30` (tight room shrinks the player
  radius from 0.55) and `ceilY` (world ceiling height → the player-update jump
  clamp keeps the eye 0.34u below it so your head can't poke through the low
  ceiling; generalized to any interior that sets `ceilY`). No `exitZone`, so E
  can't spring you early. Local, never net-synced. **Dark cell (v1.108.2)**:
  lighting is a browser-Three.js thing (real per-fragment lights — `hemi`
  HemisphereLight + `sun` DirectionalLight on layer 0, cross-faded by day/night;
  materials are lit Lambert/Phong, NOT baked). The cell is isolated from that
  daylight via a **light layer**: `mesh.layers.set(JAIL_LAYER=1)` + `camera.layers
  .enable(1)`, and its own PointLights (`lamp` warm cell bulb, `hallLamp` cold
  hallway glow) are on layer 1, so ONLY they light it — a genuinely dim cell. The
  atlas is light-coloured so the material is also tinted down (`color.setScalar
  (0.42)`). This layer trick is the template for a dark club (isolate from
  daylight, add coloured PointLights/SpotLights that tint whatever they hit).
- **Bank heist** (BofA interior, `heist` state + `updateBankHeist`, per-player):
  the SW corner of the bank is a walled vault chamber behind a functional round
  door (`BANK.vault`: `door` group hinge-swings open, `col.active=false` un-blocks
  the doorway). Open it via (a) a teller at gunpoint → random 4-digit `heist.code`
  → `#keypadPanel` overlay (`openMenu('keypad')`/`keypadPress`), or (b) a rocket
  fired near+facing the door (`bankRocketCheck` in `fireRocket`, since rockets
  underground are janky). Open ⇒ 4★, 30s `graceT`, then `spawnBankCops(2)` every
  10s. 3–7 money/gold stacks (`spawnVaultStacks`); hold **E** 5s on one → `+500`
  into `state.stolen` (NOT `money`). `state.stolen` shows as "COLLECTED $N" on the
  HUD and is paid into `money` only when wanted decays to 0 (in updateCops); dying
  first drops it (cleared in `hurtPlayer` on death). Opening the vault sets a
  **10-min shared lockdown** (`bankClosedUntil = T + 600`, broadcast via
  `netSendRobCD('bank', 600)` / `bankCD` in env snapshots for late joiners, same
  plumbing as the gas-station `gasClosedUntil`); teller/keypad/rocket/`openBankVault`
  all bail while `T < bankClosedUntil`. The door-frame ring (`BANK.vault.frame`) is
  `visible=false` while open (it otherwise plugs the doorway) and back on in
  `resetHeist`, which runs on every bank enter (`BANK.onEnter`). Trees/props are
  kept out of the bank entrance walkway by `bankDoorClear(x,z)` (checked in
  `oak`/`palm`/landscape `myrtle`/`ipalm`/prop `place`).
- **Cars**: shootable (1.5 "seconds of fire" → `goBerserk`: veers hard off
  road, spins, explodes on contact); E to carjack (driver flees), WASD +
  mouse-orbit third-person cam, player cars have 100 HP under police fire →
  `igniteCar` = 5 s fire warning → explode. PvP hijack: E on a car another
  player drives kicks them out (`jacked` to victim, `jackCD` broadcast,
  `JACK_CD=15` s per-car cooldown enforced host-side + locally via snapshot
  flag bit 16 → `c.playerDriven`); victim's forced `exitCar(true)` skips the
  `park` message so ownership stays with the thief.
- **Environment**: `DAY_LEN=360` day/night with street lights (`setLamps`),
  random rain (localized particles around player w/ per-building collision
  heights + splashes + sound). All lerped in `updateEnv`.
- **Ambient audio** (`startAmbient`/`updateAmbient`, all Web-Audio synthesis, no
  files): a brown-noise bed (`ambBrownGain`) + day "suburban hum" + night
  "cicada" bandpass-noise beds + sparse one-shots (`ambChirp`/`ambDog`/`ambCarPass`/
  `ambFlutter`). **v1.108.2: gutted to interiors-only** — the ONLY ambience now is
  the plain brown-noise bed, and it fades in ONLY when `inside`; the day/night
  beds are gained to 0 and the one-shots don't fire (user is bringing their own
  outdoor ambience; the code + nodes are all still there to re-enable).
- **Weapon switching**: scroll wheel cycles owned weapons (`cycleEquip`,
  requires pointer lock) alongside the TAB inventory.
- **Multiplayer** (WebSocket relay on Railway; ONE shared world): menu is
  PLAY ONLINE / Singleplayer + a display-name input (localStorage `wc_name`;
  sent as `n`+`hp` in state msgs, drawn on the overhead tag sprite with a
  health bar). No host codes: everyone joins room `MAIN` via `joinMain`; the
  server's own **world bot** (server.js `startWorldBot`, headless Chromium
  loading `index.html?bot=1`, `WC_BOT` in game.js — never sends `'s'`, player
  parked at 320,320, cop response uses `hottestPlayerPos()`) permanently
  hosts, so humans are always pure clients. If the host dies the server
  PROMOTES the bot first, else the longest-connected human (`host-promote` /
  `host-changed`; `becomeHost()` converts the mirrors into authoritative
  state, on-demand vconns adopt peers). `/health` reports `players` (humans
  only) — the home screen polls it for the "N players in town" ticker. The
  server also serves the game statically (the bot loads it from its own
  origin) and deploys via the root Dockerfile (playwright base image,
  BOT_ENABLE=1). Legacy coded rooms (hostGame/joinGame) still work for tests.
  OLD PeerJS/TURN notes (dead code kept in-file): `buildIceConfig()` mints
  short-lived TURN credentials in-browser (TURN REST scheme: username =
  expiry unix time, credential = HMAC-SHA1(`openrelayprojectsecret`,
  username) — pure-ES5 sha1/hmac in game.js) for
  `staticauth.openrelay.metered.ca` so same-NAT/same-house peers can relay.
  `window.WC_NET_OVERRIDE` (merged into the Peer options) lets tests point
  the game at a local PeerServer + local TURN and force
  `iceTransportPolicy:'relay'` — the sandbox rig in scratchpad
  (`mpnet/rig.js` + `test_samenet.js`, npm pkgs `peer` + `node-turn`)
  emulates same-router NAT failure and asserts via getStats that the
  selected candidate pair is relay/relay. **Host-authoritative world**: host
  sims traffic/NPCs/street-cops/cash and broadcasts `world` snapshots @8 Hz;
  clients gate their sims via `isClient()` and mirror in `applyWorldSnap`
  (street-cop mirrors live in `copsM`). Client actions are messages the host
  resolves: `dmgNpc dmgCop shootCar ragNpc steal park ram carBoom takeCash`;
  host answers kills with `kill` (star credit) and cash with `cash`. Player
  state @14 Hz includes wanted (`w`) so host cops hunt remote players;
  `hit` messages carry PvP/cop damage (client applies car redirect while
  driving). Env synced @3 Hz + on join. A remote driver's car is the synced
  world car (host mirrors `drivenBy`); remote avatars get name tags.
  Weapon drops are host-authoritative (broadcast in the `world` snapshot as
  `drps`; clients request via `dropGun`/`takeDrop`). ATM/meter cash is routed
  to the host (`spawnCashNet`→`atmCash`) so it snapshots to all peers. Host
  cops scale to the HIGHEST-heat player (`maxWanted()` folds in remote `w`).
  Interiors intentionally stay per-player.

## PSX characters (v1.5)

- Everyone (NPCs, cops, dealer, clerk, remote players) is built by
  `buildCharacter(cfg)` from `PSX_MESH`: real mesh data reverse-engineered
  from JashiPSX's "Simple Character PSX" GLB (user-supplied zip; credit in
  README). 762 tris split into rigid parts (head/torso/armL/armR/legL/legR
  + the asset's glasses lens) by dominant bone, quantized to mm, base64-
  embedded. Arms are authored in T-pose — dropped via `rotation.z = ±1.25`
  on the shoulder pivot groups; `animPerson` swings `rotation.x` as before
  (`userData.limbs` contract unchanged).
- `charAtlas(cfg)` repaints the asset's 256px UV layout per character:
  triangles filled by class (skin/shirt/pants/shoe/sock/hair — classified
  offline by sampling the original texture), shirt styles clipped to shirt
  tris, face features painted along a face basis from `PSX_MESH.anchors`
  (nose/chin/top/eyes; the face island is rotated 90° in UV space). The
  asset ships denim shorts + bare shins: "long pants" paints shin/sock
  classes with the pants color; skin-class tris reaching above the shorts
  hem (`maxY > 0.66`) always get covered.
- Config `cfg` = 17 small ints (see `CC_FIELDS`); `encodeCC`/`decodeCC`
  (base36 string, 'a' prefix) — persisted as localStorage `wc_char`, sent
  as `cc` in state msgs, remote avatars rebuild on change. POLICE hat
  (hat=4) is cops-only. `buildPerson(shirt,pants,skin,opts)` is a legacy
  shim for dealer/clerk/cops (forces long pants + dark shoes).
- Character creator: CHARACTER button on the menu → `#charPanel`, tiny
  second WebGLRenderer (96×126 upscaled, `image-rendering:pixelated`),
  `renderCreatorFrame` runs from the main loop while at the menu.
  `__wc.creatorSpin(v)` poses the turntable for screenshots.
- The offline generator (GLB→PSX_MESH) lives in the session scratchpad as
  `genpsx.js`; rerun it against the asset zip if the mesh data ever needs
  regenerating. True bone pivots come from full inverse-bind-matrix
  inversion (geometric estimates disjointed the shoulders by ~11cm).
- `PSX_SKINS`: three complete AI-painted character textures (JESS /
  MARCUS / SPIKE, ~13-15KB JPEG data-URLs each) used whole via
  `getPresetTex` when `cfg.preset` 1–3 (creator row PRESET; ~30% of
  NPCs). Produced by the offline projection workflow in the scratchpad
  (v2, quality iteration): `claypose.js` renders the mesh T-posed
  front+back on white → gpt-image-1 edits paint the character over it →
  `clayhead.js` + `gen_heads.sh` do a second 3×-zoom head-only painting
  round per character (`aigen/hh_*.png`) → `bake2.js` projects both
  paintings onto the UV atlas. Key bake2 lessons (hard-won): the AI
  redraws figures ~3-8% bigger/shifted (global affine calibration from
  clay-vs-painted silhouette bboxes), heads at arbitrary scale with
  DIFFERENT internal proportions than the mesh UV face (the original
  artist's eye texels sit at world x −0.011/+0.066, nose at 0), so the
  head is sampled through a hand-measured piecewise-linear feature warp
  (`PRESET_HEADS`: face edges/eyes/nose/chin per painting — re-measure
  via gridded crops if paintings regenerate), with jaw-taper clamping so
  cheek/chin texels never hit the painted outline strokes; "smear"
  triangles (long thin UV slivers, anisotropic uv/3d edge scale > 4)
  must be skipped or they paint diagonal streaks across other islands.
  `gen_template.js` makes a color-coded UV template (alternate
  atlas-direct workflow, abandoned). `faceline.js`/`faceclose.js`/
  `abtest.js` render in-game A/B comparisons vs the original texture.
  Never call AI APIs from the game itself. cc is 18 fields.
- Leg triangles whose class looks like shoe/sock but that reach above
  y 0.3 are denim fly/hem shading — painted as (shaded) pants, never shoe.

## Meshy AI characters (v1.6, SKINNED as of v1.7)

- `meshychars.js` (repo root, loaded by index.html BEFORE game.js; game
  guards with `typeof MESHY_CHARS`) holds full AI-generated characters:
  `[{n:'RYAN', tex:<256px JPEG data-url>, parts:{head/torso/armL/armR/
  legL/legR: {pv,n,p,u,i}}}]` — same quantization scheme as PSX_MESH.
  `buildCharacter` dispatches `cfg.preset > PSX_SKINS.length` →
  `buildMeshyChar` (same limbs/shadow/cc contract, arms T-pose-dropped
  ±1.42, no hats/glasses/gear — heads don't fit the PSX fittings).
  Creator PRESET row + CC_MAX.preset extend automatically from
  MESHY_CHARS; ~18% of non-preset NPCs roll a Meshy look.
- Offline pipeline (durable copy: **`tools/chargen/` in the repo** — README.md there is the source of truth, plus `.claude/skills/asset-pipeline/SKILL.md`; scratchpad `meshy/` was the original): gpt-image-1 seed (T-pose PSX
  character, style-anchored on `aigen/h_man2.png` via images/edits) →
  Meshy image-to-3d (`model_type:lowpoly, pose_mode:t-pose,
  should_remesh, target_polycount:1600, topology:triangle`) → Meshy
  rigging (`input_task_id`, gives Mixamo-style 24-joint skeleton + FREE
  walking/running GLBs) → `gensplit.js` dominant-joint split into the 6
  rigid parts w/ IBM-inverted pivots (genpsx method), 4K→256px
  posterized JPEG texture → `meshychars_data.json` → meshychars.js.
  `pipeline.js` runs seeds through the whole chain concurrently.
  Costs: ~30cr gen + 5cr rig (+5cr standalone remesh); balance via
  /openapi/v1/balance. Meshy key in scratchpad SECRETS.md — NEVER commit.
- **v1.7: characters are true SkinnedMeshes** (user rejected the rigid
  split — joint gaps). meshychars.js entries now carry skel (24-joint
  Mixamo-style bind pose; Meshy's Armature node scale 0.01 baked into
  bind translations — joints are authored in CENTIMETERS), geo with
  skinIndex/skinWeight, and 15fps quantized quaternion clips (walk+run,
  root XZ motion stripped, Y bob kept). Runtime: getMeshySkin /
  buildMeshySkinned build THREE.Skeleton+SkinnedMesh programmatically
  (no loaders); meshyPose slerps clip frames; animPerson dispatches
  m.userData.skin (phase/2pi = clip cycles, spd>2.2 = run clip);
  userData.limbs points at the actual THREE.Bones so ragdoll works.
  All 7 share the same skeleton — clip data could be deduped/unified
  across characters later. tools/chargen/genskin.js converts walk+run
  GLBs; clips expire on Meshy's CDN so download promptly (saved in
  scratchpad meshy/clips/). Old rigid path (entry.parts +
  buildMeshyChar) kept as fallback.
- **NPC text bubbles DISABLED (v1.110.1, user request)**: `speechBubble(n,text)`
  is a hard no-op at the top — NO floating NPC dialogue banners render (the
  Georgia-serif world-space sprites over NPCs' heads). Every ambient caller
  (`grpNextBeat` group chat, group-aware barks, shop-customer `barkAtCustomer` /
  SHOP_ASK lines) still runs — NPCs enter chat poses and play voice audio — they
  just show no text. The sprite pool/`drawSpeech`/`makeSpeechSprite` are dead but
  kept. Player-initiated shop chat `staffSay` (press E → top `#toast`) is separate
  and still shows; remove that too if the user wants ALL NPC text gone.
- **TTS dialogue (v1.7)**: tools/ttsgen (Fish Audio -> psxify 8-bit
  11kHz crunch -> voicelines.js data-URL WAVs, optional script before
  game.js). playVoice(id,gain,cooldown) via the game AudioContext;
  triggers: dealer shop/no-cash/buy, clerk greet/rob/panic, cop barks in
  copShoot. Character->voice registry in tools/ttsgen/voices.json — one
  reference_id per character, always. Fish key from user env, never
  committed.
- **Voice deferral (v1.78.2)**: the ~33MB of TTS audio (npcvoices1..N,
  shopvoices1, kidvoices1, vendvoices, voicelines) is NO LONGER blocking-loaded
  in index.html — it defers. game.js `loadVoicePacks()` (setTimeout 800ms after
  boot) injects them as `<script>` tags once the game is interactive; npcvoices1
  declares NPC_VOICE_CHUNKS and its onload kicks `loadNpcVoiceChunks()` for
  chunks 2..N. This cut the blocking payload from ~71MB → ~22MB (WC_BOOT_TOTAL
  in index.html excludes the voice weights — re-sum if you add a voice pack; add
  new packs to loadVoicePacks, NOT to a blocking <script> tag). Every consumer
  already guards typeof NPC_VOICES|SHOP_VOICES|KID_VOICES|VEND_VOICES|VOICE_LINES
  and falls back to generic barks until a pack lands, so a brief warm-up window
  at session start is silent-safe. <script src> injection keeps file:// working
  (fetch/XHR would not).
- Gotchas: Meshy ignores/overshoots target_polycount without
  should_remesh (9.5k tris); store RAW glb uv v in the quantized data
  (game loader applies the 1-v flip); occluded-in-T-pose regions (inner
  thighs under shirt hems) come back with neighbor-color texture bleed —
  visible mid-stride, unsolved; skinned-playback path (SkinnedMesh +
  Meshy anim library) validated offline (`skinframe.js`) but not wired
  into the game; anim clip URLs per char saved in
  `meshy/char_*_anims.json`.

## User preferences / history

- Rejected the original blocky "PS1" look: wants **higher-poly meshes with
  realistic but low-res procedural textures** (480p internal render, AA on).
- Building placements around the intersection should stay faithful to the
  satellite reference (see README for corner-by-corner mapping).
- Verify changes in-game (screenshots via the /upload pipeline) before
  reporting done; the user notices regressions like disappearing viewmodels.
- Update README.md when gameplay features change.
- **Bump `GAME_VERSION`** (top of game.js, shown bottom-left of the main
  menu) with every change to the game, no matter how small.

## Known jank / accepted tradeoffs

- Ragdolled NPC ragdolls & booms use 2D distance; rockets fired inside the
  gas station interact with surface coordinates (rare, accepted).
- ~~Palms/oaks have no collision~~ fixed v1.45/46: trees, lamp/utility/sign
  poles, hydrants, benches etc. carry small trunk/base colliders
  (`registerBreakable` collR param / `SP_SOLID` / `SP_BLOCKR`); a breakable's
  collider goes `.active=false` while car-toppled and back on at respawn.
  Bushes, cones, barricades, carts and yard-sign stakes stay pass-through.
- If the multiplayer host leaves, guests keep their local sim but the shared
  world freezes updating (listen-server tradeoff).
- Berserk cars that find open ground blow up on a 6 s timer instead of
  hitting something.
- Broken trees/street lights are local-only in multiplayer (each peer
  breaks them from its own view of car positions — usually consistent,
  never authoritative).
