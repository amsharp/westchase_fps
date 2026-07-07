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
  `peerjs.min.js` (PeerJS 1.5.4). Singleplayer is fully offline; multiplayer
  needs internet only for PeerJS cloud signaling.
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
- Multiplayer is testable headlessly: host in the main window, join from a
  hidden iframe at `/index.html`, drive both sides with their own
  `__wc.tick`. PeerJS cloud handshake takes 1–3 s; poll with intervals.

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
  `gasRob {x:60,z:42}`.
- SW: Dollar Tree, self-storage, blue-roof strip malls westward.
- NE: Regions Bank, pharmacy, Sakura Sushi, Dunkin.
- NW: Bank of America, **Publix** (player + dealer spawn in its parking lot:
  player (-72,-97), dealer `dealerPos (-72,-106)`), Farnell Middle School,
  townhouses, lake `LAKE (-255,-150)`, 5-story red-roof house (-278,-78).
- Gas station interior is a hidden room **under the map** at y=-60
  (`INT` box, `intColliders`, clerk at `clerkPos`). The `inside` flag switches
  floor height and collider set (pushOut takes an optional collider list).
- Minimap draws from data registers: `mapBuildings` (with heights, used for
  rain collision too), `mapPave`, `mapDrives`, `mapParking`, `mapForest`.

## Systems summary

- **Weapons** (`WEAPONS`/`GUN_LIST`): fists, pistol $150, TEC-9 smg $400,
  rifle $600 (right-click scope = `setZoom`), AK-47 auto $1000, rocket
  launcher $2000 (visible projectile, 5 s cooldown, self-damage). Snack item
  (gas station, $20, +50 hp, consumable). Death drops all owned guns as
  pickups (2 min despawn; duplicate pickup = half-price refund).
- **Wanted** (0–5 stars): rob register at gunpoint → 2★; every 5 civ kills →
  +1★; cop kill → +1★; decays after ~18 s clean & no cops near. Cops: 3
  patrol at 0★, +2 per star; pistols <4★, full-auto SMGs 4–5★; 1★ = only
  proximity aggro. Interior cops (`c.interior`, `c.baseY`) spawn on a failed
  unarmed robbery and are always local, never synced.
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
- **Multiplayer** (PeerJS, host-as-hub): menu offers Singleplayer / Host
  (invite link `…#join=<peerid>`) / Join, plus a display-name input
  (localStorage `wc_name`; sent as `n`+`hp` in state msgs, drawn on the
  overhead tag sprite with a health bar). `ICE_CONFIG` adds public TURN
  relays (openrelay.metered.ca) so same-NAT/same-house peers can connect. **Host-authoritative world**: host
  sims traffic/NPCs/street-cops/cash and broadcasts `world` snapshots @8 Hz;
  clients gate their sims via `isClient()` and mirror in `applyWorldSnap`
  (street-cop mirrors live in `copsM`). Client actions are messages the host
  resolves: `dmgNpc dmgCop shootCar ragNpc steal park ram carBoom takeCash`;
  host answers kills with `kill` (star credit) and cash with `cash`. Player
  state @14 Hz includes wanted (`w`) so host cops hunt remote players;
  `hit` messages carry PvP/cop damage (client applies car redirect while
  driving). Env synced @3 Hz + on join. A remote driver's car is the synced
  world car (host mirrors `drivenBy`); remote avatars get name tags.
  Weapon drops + interiors intentionally stay per-player.

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
- Palms/oaks have no collision (only forest patches block movement).
- If the multiplayer host leaves, guests keep their local sim but the shared
  world freezes updating (listen-server tradeoff).
- Berserk cars that find open ground blow up on a 6 s timer instead of
  hitting something.
