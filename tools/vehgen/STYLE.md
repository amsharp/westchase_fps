# Vehicle style guide (PS1-grounded)

Every budget below is grounded in measured source material, not vibes.
Re-measure if you swap reference packs.

## Polycount — measured PS1-style source material

GGBot "PSX Style Cars" pack (vendored in the session scratchpad,
`assets/PSX_Style_Cars_by_GGBot_August2023`, measured from the OBJs):

| asset  | tris |
|--------|------|
| Car 01 | 438 |
| Car 02 | 312 |  <- style_ref_car.png is this one
| Car 03 | 448 |
| Car 04 | 476 |
| Car 05 | 454 |
| Car 06 | 304 |
| Car 07 | 457 |
| Car 08 | 376 |
| Wheel  | 28 (separate mesh, 4 per car) |
| Shadow | 2 (textured quad) |

Mean body ≈ **408 tris**. Published-era anchors agree: Gran Turismo 1/2
race about 300 quads-ish polys per car; Driver/GTA-era street cars are
200–500 tris. Retro nature pack trees (in-game now): 354–366 tris.

**Budget: target 450 tris per vehicle, accept up to 720 (1.6x), remesh
past that.** `vehpipe.js` defaults to `--polycount 450`. Total per car
with wheels stays under ~600 — comparable to one PSX character (ours run
~1600 tris, which is already the Tekken-3 "hero model" tier of the era;
vehicles must NOT outweigh characters).

## Texture

GGBot cars: **128x128** PNG per car (whole car atlased into one page,
palette-look, hard pixel edges). PS1 VRAM pages topped out at 256x256
with 4/8-bit CLUTs. Meshy returns big textures — downscale to 128px
(NearestNeighbor) at conversion time; the game samples with
NearestFilter either way.

## Aesthetic (what makes it read as PS1)

- Flat angular facets; the silhouette shows straight polygon edges,
  especially on wheel arches (polygonal, not round).
- Painted-on detail: door seams, handles, grilles, badges-shaped-blobs,
  headlights, taillights all live in the TEXTURE, not the geometry.
- Windows are flat dark fills (slight blue/gray), no reflections, no
  transparency.
- Wheels read as dark discs with a painted hub; visible polygon rim is
  fine (the era's wheels were 8-12 sided).
- Bodies ship SATURATED MEDIUM BLUE (seed convention) — the game
  hue-shifts the body mask at runtime for the 5-per-model color
  variations, so blue must stay saturated and even.
- No brand marks. Body types read as early-2000s silhouettes.

## Seed workflow

`vehseeds.sh` style-anchors gpt-image-1 on `style_ref_car.png` (a render
of GGBot Car 02 — regenerate with the scratchpad's carstyleref.js).
Review seeds BEFORE Meshy (image review is free): reject any seed that
looks smooth/modern-render clean, has logos, or drifts off medium blue.
