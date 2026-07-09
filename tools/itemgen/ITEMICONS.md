# Item icon generation — pickup sprites with alpha

Offline, build-time pipeline that produces **45 PS1-style inventory item icons**
as 64px transparent-alpha PNG data-URLs, plus a suggested item-definition table,
for the planned Minecraft-style grid inventory / dumpster-dive systems.

**Output (do NOT commit yet — integration is a later phase):**
`../../itemicons.js` — `var ITEM_ICONS = { id: <alpha PNG data-url>, … }` and
`var ITEM_DEFS = [ {id,name,cat,stackMax,use,hp,value,rarity}, … ]`.

## Run

```bash
export OPENAI_API_KEY=…            # from scratchpad SECRETS.md, NEVER commit
node genicons.js all              # generate all 5 grids, then process
node genicons.js gen --only=2     # (re)generate one grid only
node genicons.js proc             # re-slice/key existing work/gridN.png -> icons
node contactsheet.js              # render work/contact.png (gray + dark panels)
```

`items.js` is the catalog: 5 grids × 9 = 45 items, each with a one-sentence
cell prompt `p` plus its def fields. Edit there to add/tune items.

## The technique (what actually worked)

Icons need **alpha**, but the tiling hack (TILING.md) relies on a reliable grid.
Two lessons from failed attempts drove the final approach:

1. **`background:transparent` is unusable for a multi-item grid.** gpt-image-1
   ignored it and composed a *scene*: items scattered in an irregular 4/4/2
   layout (one item even duplicated) over an opaque olive **gradient**. No grid
   to slice, and a gradient can't be chroma-keyed with one color. Abandoned.

2. **Black gutters + a solid MAGENTA cell fill is the winner.** Prompt a 3×3
   grid with ~18px pure-black gutter lines (per TILING.md — this enforces the
   grid so `SLICE_FN` cuts reliably) and fill every cell with **flat bright
   magenta (#FF00FF)**, item centered with a thick dark outline. Then:
   - `SLICE_FN` (housegen/lib.js) cuts the 9 cells on the black gutters.
   - **Global magenta-family key** → alpha. Keying the whole magenta family
     (high R&B, low G, R≈B) removes the fill *and* the purple outline fringe
     *and* enclosed background holes (a ring/chain center a border flood-fill
     would miss). No item here is magenta; pink donut frosting is safe because
     its green channel is too high to match.
   - **Near-black edge strip** (outer ~6%, lum<80) knocks off gutter residue.
   - **Largest-connected-component keep** — the important one. The grid model
     often adds an extra narrow 4th column (an extra gutter line + empty magenta
     strip), so a sliced right-edge cell contains a thin black bar detached from
     the item. Keep only the biggest blob; spare a secondary component only if
     it is *chunky* (min bbox side > 10% of cell) and *not* near-black. This
     kills gutter bars even when, on a small/thin item (40oz, syringe), the bar
     rivals the item by pixel count — an area-ratio threshold alone fails there.
   - Alpha-bbox trim → center on 64px → **posterize** RGB to 6 levels →
     **harden alpha** (a>110 ⇒ 255 else 0) for crisp pixel edges with no
     chroma halo.

All image ops run in ONE headless chromium via `withChromium` (swiftshader).

### Pitfalls that bit us (in order)
- Requesting transparency made the model abandon the grid entirely. Use magenta.
- `(KEY_FN)()` where the function-source string ended in `};` → `SyntaxError`.
  The stringified arrow function must end in `}`, no trailing semicolon.
- Enclosed magenta (ring/chain hole) survives a border flood-fill → use a
  **global** key, not a flood-fill, since items never contain magenta.
- Trimming to the "densest row/column" seeds on the full-height black gutter
  line (a thin line has the tallest column) and **deletes the item**. Use 2D
  connected components by area instead.
- An area-ratio component threshold (keep ≥25% of largest) keeps a thick gutter
  bar when the item is small/thin. Keep only the largest + chunky-non-dark ones.

## The catalog (45 items, 7 categories)

food 8, drink 6, med 4, junk 6, valuable 6, tool 5, quirky 10.

`use` semantics for the inventory phase: `eat`/`drink`/`med` restore `hp`;
`sell` sells for `$value`; `junk` sells low; `tool` has a gameplay function;
`fun` is flavor/collectible. `rarity` 1 (common) … 5 (rare). `stackMax` is the
grid stack size (food/drink 8, med 4, junk 16-ish→used 16 for trash, valuables
2, tools 1-4, quirky 4-8).

Regenerate a single grid if any icon reads poorly at 64px; the contact sheet
(`work/contact.png`, mid-gray #808080 + dark #1a1a1a panels) is the acceptance
check that alpha reads on both light and dark GUI backgrounds.
