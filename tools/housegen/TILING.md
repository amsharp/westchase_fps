# Tiled multi-texture generation — experiment results

**Verdict: WORKS. Use it.** One gpt-image-1 `1024x1024` image can carry a
2x2 grid of four independent game textures, sliced apart programmatically.
Cost per texture drops 4x (one medium-quality 1024px image ≈ $0.042 →
~$0.011/texture; at `quality:low` ≈ $0.011 → ~$0.003/texture) with **no
quality loss that survives the PSX crunch**: each sliced cell is ~470px,
and game textures are downscaled to 256px anyway.

## Experiment (2026-07-08, gpt-image-1, quality medium)

- `exp_tiling.js` generated (a) 4 dedicated 1024px single-texture images
  and (b) one 2x2 tiled image requesting the same 4 textures (beige stucco
  wall w/ door+windows, gray shingle roof, tan siding wall w/ door, red
  barrel-tile roof). All in `work/exp/`.
- `slice.js` cut (b) apart by detecting the black gutters (darkest
  row/column band near each expected grid line, then walking inward past
  any remaining dark pixels + 3px safety inset). Clean cuts, zero gutter
  residue, cells ~470x470.
- `crunch.js` downscaled both variants to 256px + posterize 24 levels
  (the in-game format). Compared side by side: the dedicated singles have
  slightly grainier/more "pixel-art" surface noise; the tiled cells are a
  touch smoother/flatter — **indistinguishable in usefulness at 256px**,
  and arguably the flatter look is closer to real PS1 textures.

## Observations / gotchas

- **Adherence drops slightly per tile.** The tiled wall tile drew ONE
  window instead of the requested two; the "asphalt shingle" tile came out
  more like slate brick. Keep per-tile descriptions SHORT and distinctive;
  don't pack more than ~1 sentence of detail per tile. If a specific tile
  is wrong, you've still only burned 1/4 of an image.
- The model renders the grid reliably when the prompt (pattern below)
  numbers tiles "left-to-right then top-to-bottom" and demands solid black
  gutters + black outer border. Gutters came out ~20px, position within a
  few px of the exact thirds/halves — `slice.js`'s ±8% search window finds
  them every time.
- 2x2 is verified. 3x3 (9 textures, ~325px cells) should still clear the
  256px bar but adherence risk grows; test before relying on it.
- Slicing needs no native deps: playwright chromium + canvas
  (`lib.js#SLICE_FN`), same toolchain the repo already uses.

## Prompt pattern that worked

```
<STYLE SENTENCE — PS1/PSX texture, flat shading, posterized, straight-on,
no perspective, evenly lit.>
The image is a 2x2 GRID of four SEPARATE independent game textures,
divided by solid pure-black gutter lines about 16 pixels thick (also a
black border around the outside edge). Each tile completely fills its
grid cell with its own texture, edge to edge. The four tiles,
left-to-right then top-to-bottom, are:
TILE 1 (top-left): <desc>. TILE 2 (top-right): <desc>.
TILE 3 (bottom-left): <desc>. TILE 4 (bottom-right): <desc>.
Do not blend the tiles; each is a distinct unrelated texture.
```

## Recommendation for other pipelines

Any tool that requests multiple independent square-ish textures per call
(tools/chargen seed variations, tools/vehgen style boards, prop textures)
should batch 4-per-image with this pattern and `slice.js`. Not suitable
when tiles must relate to each other spatially (T-pose character sheets,
UV atlases) or when you need the full 1024px per asset.
