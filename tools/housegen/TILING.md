# Tiled multi-texture generation — experiment results

**Verdict: use a 3x3 grid (9 textures per image) at 1536x1024 `quality:medium`.**
That is the density sweet spot: the grid geometry stays reliable, per-tile
adherence is on par with 2x2, every sliced cell still exceeds the 256px game
target, and cost lands at ~**$0.007-0.008 per usable texture**. 4x4 collapses
structurally, `quality:low` collapses grid discipline, 4x2 is unreliable.
2x2 remains fine when you only need 4 textures.

## Density experiment (2026-07-08, `exp_density.js`, work/exp2/)

Same 16 short house-material tile descriptions reused across configs (tile N
identical everywhere), one sentence per tile. Raw grids + sliced cells +
256px-crunched cells in `work/exp2/`; `montage_density.png` compares the
crunched output against the verified 2x2 baseline.

| config | grid drawn correctly? | tiles needing retry | cost / usable texture |
|---|---|---|---|
| 2x2 1024 med (baseline, exp_tiling) | yes | ~1 / 4 | $0.042/3 ≈ $0.014 |
| **3x3 1536 med** | **yes, 2/2 runs** | run A: 2/9, run B: 0/9 (≈11%) | **$0.063/8 ≈ $0.008** |
| 3x3 1024 med | yes | 1.5/9 | $0.042/7.5 ≈ $0.006 |
| 3x3 1024 **low** | **NO** — cells merged, irregular sizes | n/a | unusable |
| 4x4 1536 med | **NO** — drew a 5x3 grid (15 tiles), dropped/duplicated | n/a | unusable |
| 4x4 1024 med | **NO** — drew a 3x4 grid (12 tiles), one cell held 2 textures | n/a | unusable |
| 4x2 1536 med | 1 of 2 runs collapsed to ~3x3 | run A: 2/8; run B: structural | unreliable |

The production run (3 house clusters × 9 reference-driven tiles through
genfacade.js) then hit **27/27 usable tiles, zero retries** — short
distinctive per-tile sentences plus reference photos adhere better than the
abstract experiment tiles.

### Failure modes observed

- **Structural collapse is the density ceiling, not blur.** At 16 tiles the
  model redraws the grid shape it prefers (squarer cells: 5x3 on a 3:2
  canvas, 3x4 on square), so index-based slicing dies. Same for strongly
  non-square cells: 4x2 portrait cells (384x512) drifted back to ~3x3 once
  in two runs. 3x3 on 1536x1024 (512x341 cells, ≈3:2) never misdrew.
- **`quality:low` degrades layout discipline, not just texture detail**:
  the 3x3 low run merged neighbouring tiles into little house scenes and
  drew heavy sun shading. Low is only trustworthy at 2x2.
- **Per-tile content misses stay roughly constant per tile** (~10%) from
  2x2 to 3x3; a miss only burns 1/9 of an image at 3x3. Known weak tiles:
  a "roof" tile described casually gets an eave/siding strip painted under
  it (demand a "seamless MATERIAL SWATCH ... covering the ENTIRE tile"),
  and any swatch description containing the word "gable" makes the model
  draw a literal gable triangle scene ("vertical board-and-batten siding"
  works, "gable siding" does not).
- Quality after slicing + 256px PSX crunch is **indistinguishable between
  2x2 and 3x3 sources** (see montage_density.png): a 3x3@1536 cell is
  ~485x315 native, still above the 256px bar. 3x3@1024 (~320px cells) also
  survives the crunch and is the budget pick if $0.02/cluster matters.

## Slicing

`slice.js` logic (lib.js `SLICE_FN`) cuts by detecting the darkest
row/column bands near expected grid lines (±8% search window), walks inward
past residue, 3px inset. Works unchanged for 2x2 and 3x3; gutters come out
~16-20px within a few px of exact thirds. It canNOT rescue the collapsed
4x4/low grids (cells aren't on the grid lines at all).

## Prompt pattern that worked (3x3)

```
<STYLE SENTENCE — PS1/PSX texture set, flat shading, posterized,
straight-on, no perspective, evenly lit.>
The image is a 3x3 GRID of nine SEPARATE game textures,
divided by solid pure-black gutter lines about 16 pixels thick, with a
black border around the outside edge. Each tile completely fills its grid
cell edge to edge. The nine tiles, left-to-right then top-to-bottom:
TILE 1 (top row, left): <one short sentence>. ... TILE 9 (bottom row,
right): <one short sentence>.
Do not blend the tiles; each is a distinct texture.
```

Keep each tile description to ONE short, visually distinctive sentence;
number tiles and name the row/column. Reference photos (images/edits
endpoint) improve adherence further.

## Recommendation for other pipelines

Any tool that needs up to 9 independent square-ish textures per call
(tools/chargen seed variations, prop/vehicle texture sets) should batch
3x3-per-image with this pattern and `SLICE_FN`. Use 2x2 when you need only
4 or want `quality:low`. Do not exceed 9 tiles per image, do not use low
quality above 2x2, and avoid strongly non-square cells. Not suitable when
tiles must relate spatially (T-pose sheets, UV atlases) or when an asset
needs the full 1024px.
