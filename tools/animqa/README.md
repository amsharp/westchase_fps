# animqa — animation QA pipeline

Headless tooling to debug buggy animations, hunt weird mesh breakages, and
verify new ones for Westchase FPS. Runs the real game under Chromium/swiftshader
and drives it through `window.__wc`.

## Tools

### `meshcheck.js` — automated mesh-breakage detector (quantitative)
Sweeps every distinct **live skinned NPC model** through `idle / walk / run /
jab`, and the **first-person weapon arms** through pose + fire, sampling
skeleton bone world-positions each frame. Flags:

| kind | meaning |
|------|---------|
| `NAN_BONES`   | a bone transform went non-finite (NaN/Infinity) |
| `EXPLODE`     | bone bounding-box blew up vs. the model's idle baseline (mesh explosion) |
| `DETACH`      | a bone flew far from the body centroid (limb detachment) |
| `SINK` / `FLYUP` | character sank through the floor / launched skyward |
| `ARM_STRETCH` / `ARM_DETACH` | FP hands flung apart or off the camera |
| `POSE_THREW` / `NO_SKELETON` | the clip threw, or no skeleton was found |

Run:
```
NODE_PATH=/opt/node22/lib/node_modules node tools/animqa/meshcheck.js
```
Writes `report.json` (all breakages + counts) and prints a ranked summary.
Exit code 1 if any breakage or page error, else 0 — usable as a CI gate.

### `capture.js` — visual contact sheets (qualitative)
Tiles an 8-frame sequence per subject (viewmodel idle/fire, NPC walk/run/idle/jab)
into one PNG under `sheets/`, so a whole motion cycle is reviewable at a glance —
for spotting foot-sliding, snapping, stiffness, or jank that thresholds miss.
```
NODE_PATH=/opt/node22/lib/node_modules node tools/animqa/capture.js
```

## Authoring / fix loop
1. `meshcheck.js` → triage the ranked breakages.
2. `capture.js` → eyeball the suspect (and any new) animations.
3. Fix the animation code in `game.js` (`animPerson` / `animPersonClip` /
   `meshyPose` for characters; the viewmodel recoil/draw/reload block + `armsPose`
   for FP arms).
4. Re-run both → confirm the breakage is gone and the sheet reads smooth.
5. Repeat until `meshcheck` is clean and the sheets look polished.

## Notes / gotchas
- Chromium: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; game loaded via
  `file://…/index.html`.
- swiftshader is unstable past ~6–8 renders per page, so `capture.js` reboots the
  page every 2 subjects. `meshcheck.js` samples bones without rendering (cheap).
- The game's internals (`MESHY_LIST`, `GUN_LIST`, `WEAPONS`, `psxArms`) are
  IIFE-private; the tools reach animation state only through `window.__wc`
  (`npcs`, `animPerson`, `animPersonClip`, `setEquipped`, `tryAttack`, `handPos`,
  `getBoneQ`, `renderer`, `scene`, `camera`, …) and the global `MESHY_CHARS`.
- Env day/night lerps; not relevant to these captures (fixed at midday).
