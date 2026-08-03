# citygen — multi-object building GLBs → CITY_BUILDINGS catalog

`glb2city.js` splits **multi-object** building GLBs (each Blender object = one
building) into individual `{id,name,dims,q,tris,p,u,i,tex}` catalog entries and
writes `citybuildings.js` (`var CITY_BUILDINGS = [...]`). Same quantization as
`skyscrapers.js`; consumed via `MODEL_CATALOGS` + `REMAP_MODELS` at footprint
width (uniform scale, never stretched).

## What it does
- Walks the GLB scene graph, bakes each node's transform, emits one entry per
  mesh object.
- Re-origins each: **X/Z centered, base dropped to y=0** (models come in at y=−1).
- **Front convention:** Blender→glTF puts the modelled front on **+Z** (so at
  placement `rotY = atan2(dirToStreetX, dirToStreetZ)` faces the storefront at the road).
- One atlas per file → **native-res high-quality JPEG** (no downscale policy).
- Maps object index → id via each JOB's `idp` + `start` (e.g. the 2nd business
  batch is a UV swap of the first, so it starts at `citybiz6`).

## Categories (the downtown kit)
- `brick1–5` — brick rowhouses (4–5 story), contiguous streetwall
- `citybiz1–10` — businesses w/ apartments (5–6½ story); 5 silhouettes × 2 skin batches
- `office1–5` — mid-rises (5–15 story), standalone deep-footprint lots
- `highrise1` — tall apartment tower, reusable downtown filler

## Run
Edit the `JOBS` array (GLB path + id prefix + start index), then:
```
node tools/citygen/glb2city.js   # writes citybuildings.js to repo root
```
Add `<script src="citybuildings.js">` before game.js and push
`CITY_BUILDINGS` into `MODEL_CATALOGS`.

**Note:** uploaded GLBs expire from the session upload cache — keep the source
files if you'll need to regenerate.
