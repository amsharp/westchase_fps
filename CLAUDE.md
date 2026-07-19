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
- Editor authors: roads (polyline, `cls` 0–3 ground) + **new**: `kind:'highway'`
  (elevated, `elev`), `kind:'ramp'` (ground↔highway), `kind:'water'` (river);
  **areas** (`REMAP_AREAS` rects: `kind` forest/water/ocean); surfaces, buildings,
  props, zones. Road **extend** = click an endpoint ring-node with the Road tool;
  vertices **snap** onto other roads' nodes (`nodeSnap`) for seamless junctions
  across types (ramp→highway, etc.). mapimport skips wall-exit generation for
  rivers.
- **PENDING game-side rendering (TODO when the expansion map lands):** game.js
  does NOT yet render `REMAP_AREAS` (forest/lake/ocean) or the new road kinds.
  Need: areas → forest scatter / swimmable water like `LAKE` / big ocean plane;
  `kind:'highway'` → raised drivable deck at `elev`; `kind:'ramp'` → elevation
  transition the car climbs; `kind:'water'` → river water strip. Until then the
  editor + JSON + remapdata carry the data but it won't appear in-game.

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
- **Wanted** (0–5 stars): rob register at gunpoint → 2★; every 5 civ kills →
  +1★; cop kill → +1★; decays one star per ~35 s clean & no cops near. Cops: 2
  patrol at 0★, +2 per star (spawn interval 2.6 s); pistols <4★, full-auto
  SMGs 4–5★; 1★ = only proximity aggro. Interior cops (`c.interior`, `c.baseY`) spawn on a failed
  unarmed robbery and are always local, never synced.
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
  heights + splashes + sound), brown-noise ambient bed. All lerped in
  `updateEnv`.
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
