# Fences — reusable fence system

Data-driven fences for the WC_REMAP world. Everything lives in **one section
of `game.js`** ("REUSABLE FENCE SYSTEM"): a builder + a `FENCE_RUNS` table.
No new files, no assets — textures are procedural or reuse `densityprops.js`.

NOTE (fence cleanup round, v1.66.96): the `FENCE_RUNS` **table** now lives
textually ABOVE the densityLayer IIFE (the density strips clip against it);
the loader/builder section is unchanged further down. There are TWO fence
systems and they now cooperate:

- `FENCE_RUNS` (breakable panels + merged posts). Road rejection is now
  **per panel** (was per edge-midpoint): panels over asphalt are skipped
  individually and their boundary posts remain as gateposts. Post batches
  are keyed by colour (a shared key used to paint every chainlink post with
  the first run's tint).
- densityprops `fenceRun`/`fenceRect` strips (solid, non-breakable). These
  now drop **posts** every ~2.5u (+ a top rail for chainlink) so they no
  longer read as floating texture cards (mrg49ri9), and they **clip
  themselves**: cut where they'd cross road asphalt, a FENCE_RUNS line, or
  an already-built strip — an X-crossing becomes two T-joins. hedge_row /
  brick_low_wall stay post-free (self-supporting).

Audit tooling: `tools/_fenceaudit.js` (headless) sweeps every fence collider
for X-crossings / road overlap / degenerate segments / missing posts — keep
it at zero findings when touching fences.

## Adding a fence = append ONE row

Edit the `FENCE_RUNS` array in `game.js` and add:

```js
{ type: 'picket'|'chainlink'|'wood', h: <height u>, pts: [[x,z],[x,z], ...] }
```

`pts` is a polyline of game-coord waypoints (junction = origin, +x east,
+z south — the WC_REMAP frame from `remapdata.js`). Each edge is segmented
into post-spaced panels; the loader tiles panels, drops posts at every
boundary, adds a thin OBB collider per edge (so the player is BLOCKED), and
merges all geometry of a type into a few draw calls.

Optional per-row keys:

| key         | default                    | meaning                                   |
|-------------|----------------------------|-------------------------------------------|
| `color`     | type default               | post/pole/rail tint (e.g. `0x2b2f31` black)|
| `roadGuard` | `1.2`                      | u of clearance kept from every road        |
| `noClip`    | `false`                    | skip the auto road-rejection               |

A segment whose midpoint is within `roadGuard` u of any true road's asphalt
is auto-skipped, so a run can never wall off a road or driveway.

## The three types

- **picket** — flat white pointed-picket ALPHA CARDS (~0 thickness, 2D
  billboards) between square posts every ~2.4u. Procedural keyed-alpha
  texture (`picketTex`).
- **chainlink** — see-through diamond-mesh ALPHA CARD (reuses the
  `densityprops` `chainlink_fence` texture, else procedural) + real
  vertical POLE posts every ~2.5u + a top rail. Pass a dark `color` for
  the black school / pond fences.
- **wood** — solid privacy PLANKS with a small ~0.06u thickness (extruded
  box panels, reuses the `densityprops` `privacy_fence` texture) + posts.

## Placement workflow (how the current runs were authored)

1. **Street View study.** The map is a *stylized, compressed* recreation
   (e.g. Farnell Middle geocodes ~400 m from the real intersection but sits
   at game `(-104,-80)`), so there is **no linear game↔lat/lng transform**.
   Instead, study Google Street View at the real Westchase venues to learn
   what fences actually exist and of what type/color, then map them onto
   this map's faithfully-*arranged* building footprints. Observed:
   - Farnell/Bryant schools: **dark** metal-mesh fence around fields/courts
   - self-storage lots: chainlink security fence
   - townhome communities (alley-loaded): **wood** privacy fence at yards
   - retention ponds: **low dark** chainlink banks
   - lakeside/park lawns & some single-family yards: white **picket**
   (Community edges along the main roads are brick walls — out of scope.)
2. **Validate before committing.** A run must clear roads, the swimmable
   lake, and every building footprint. The throwaway validator used lives
   in the session scratchpad (`validate.js` + `runs.json`): it re-implements
   `remapPointClear` / `inLake` and a rotated-rect building test from
   `remapdata.js` (`REMAP_ROADS` / `REMAP_VENUES`) and prints any segment
   that hits a road / lake / building. Reproduce it from those two functions
   in `game.js` if you need to place more.
3. **Verify in-game** (screenshots) — pickets read as white slat cards,
   chainlink shows its poles + top rail + see-through mesh, wood shows
   thickness, and one aerial confirms placement.

## Tests / hooks

`window.__wc` exposes `buildFenceRun(pts,type,opts)`, `fenceRuns`
(the table), and `remapPointClear(x,z,pad)` for headless checks.
