# skygen — building GLB → SKYSCRAPERS catalog entries

Converts a textured building `.glb` into a `{id,name,dims,q,tris,p,u,i,tex}`
entry for `skyscrapers.js` (the catalog `decodeAirModel`/`placeCatalogModel`
reads under `WC_REMAP`). Same quantization as the airport models.

## What it does (`glb2sky.js`)

1. Parses the GLB (bakes node transforms; single mesh/material/atlas texture).
2. **Centers X/Z, drops the base to y=0** (the catalog convention — buildings
   stand on the ground; placement `(x,z)` is the footprint center).
3. `dims = [w,h,d]` bbox; `q = 32760 / maxAbsCoord` (full Int16 range).
4. Quantizes: positions → Int16 (`/q`), UVs → Uint16 (raw glTF `v`; the game
   loader applies the `1 - v` flip), indices → Uint16 — base64 each.
5. Transcodes the atlas PNG → **native-resolution high-quality JPEG** (q0.92,
   **no resize**) via headless chromium. Honors the no-downscale building-texture
   policy while keeping the blocking payload sane and matching the existing
   JPEG entries. Writes `sky_entries.json`.

## Constraints / gotchas

- **Uniform scale only** — never stretch. `placeCatalogModel` derives ONE
  uniform scale from footprint width (`footW/dims[0]`), so correct `dims` is
  what makes relative heights come out right; the model must be exported at the
  proportions you want.
- Vertex count must stay **≤ 65535** (indices decode as Uint16). Building
  meshes are tiny (tens–hundreds of tris) so this is never an issue in practice.
- One material / one baseColor atlas texture per GLB (multi-texture GLBs would
  need atlas merging — not supported).
- glTF is already Y-up, so height lands on Y with no axis swap.

## Run

```
node tools/skygen/glb2sky.js       # (edit the `jobs` array: id/name/glb path)
```

Then splice the entries into `skyscrapers.js` (append to the `SKYSCRAPERS`
array before the closing `];`) and add a showcase/editor placement in game.js
(`placeSkyscraperShowcase`) or via the map editor (`REMAP_MODELS`, footprint
width `w`). Bump `GAME_VERSION`.

The two current user-imported entries (`bbt`, `suntrust`) were produced this
way from `BBandTBuilding.glb` / `SuntrustSkyscraper.glb`.
