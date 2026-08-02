# heligen — civilian helicopter GLB → CIV_HELI_MODEL (civheli.js)

`glb2civheli.js` converts a re-UV'd civilian helicopter `.glb` into
`civheli.js` (`var CIV_HELI_MODEL = {...}`), the player-flyable chopper's model.

## Why it's separate from heli.js

The player wanted a different UV layout / skin for the civilian chopper than the
police one. It's the **same AS350 mesh**, just re-UV'd + re-textured. Rather than
hand-place it, the converter maps the raw GLB onto the EXACT sim space the police
`HELI_MODEL` already uses, so the two fly/sit/spin identically — only the livery
differs.

## How (matches heli.js format `{q,scale,skid,dims,parts:{pivot,axis,p,u,i}}`)

1. Parse the GLB → 3 named nodes `main`/`mainrotor`/`tailrotor` → parts
   `body`/`mainRotor`/`tailRotor` (world-baked positions + raw UVs + indices).
2. Fit a **similarity transform** (rotate **Ry+90°** — Blender nose +Z → sim nose +X —
   uniform **scale ~0.55**, translate) to the OLD body bbox, then apply it to all 3
   parts. Result lines up on the police model to sub-unit precision (it's the same mesh).
3. **Reuse the old part pivots** (body/mainRotor/tailRotor) so rotor spin axes and the
   skids-at-`y=-skid` ground rest are unchanged.
4. Quantize (Int16 pos `/q`, Uint16 UV raw-`v` — loader does `1-v`, Uint16 indices),
   base64.
5. Texture → **native-res high-quality JPEG** (no resize; no-downscale building/vehicle
   texture policy).

## Runtime

`game.js buildHeliMesh('civilian')` → `buildHeliFromModel(CIV_HELI_MODEL,
CIV_HELI_MODEL.texCivilian, 'civ')`. Falls back to `HELI_MODEL.texCivilian` if
`civheli.js` is absent. Loaded in index.html before game.js (guarded by
`typeof CIV_HELI_MODEL`).

## Run

```
node tools/heligen/glb2civheli.js     # edit the GLB const at the top for a new file
```

Writes `civheli.js` to the repo root. Bump `GAME_VERSION`.
