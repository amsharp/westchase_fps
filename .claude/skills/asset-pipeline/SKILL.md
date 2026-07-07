---
name: asset-pipeline
description: Generate new AI characters (and other 3D assets) for Westchase FPS via the gpt-image-1 + Meshy pipeline in tools/chargen. Use when asked to add characters, NPCs, player models, or similar game assets.
---

# Westchase FPS asset generation

The repo ships a proven character pipeline in `tools/chargen/` — **read
`tools/chargen/README.md` first**; it is the source of truth for commands,
parameters, quality gates, and known gotchas.

## The short version

1. Get `OPENAI_API_KEY` and `MESHY_API_KEY` from the user (never commit keys,
   never ship them to the client — the game must stay fully offline).
2. `seedgen.sh` makes a T-pose PSX seed image (style-anchored on
   `style_ref.png`). **Always review the seed image before spending Meshy
   credits** — seeds are cheap, Meshy tasks cost ~35 credits per character.
3. `charpipe.js NAME seed.png` runs Meshy image-to-3D (lowpoly, t-pose,
   remeshed to ~1600 tris) + rigging, downloads the rigged GLB, and splits it
   into the game's six rigid parts (`gensplit.js`).
4. `glbview.js` renders any GLB in the game's own three.js for review;
   `merge_meshychars.js` integrates entries into `meshychars.js`.
5. Verify in-game (characters auto-appear as creator presets and on NPCs),
   bump `GAME_VERSION`, run the character test suite, screenshot, then commit.

## Hard constraints (from CLAUDE.md — do not violate)

- The game runs as plain files (file://). No runtime loaders, no CDN, no
  network dependencies — all assets must be converted offline and embedded
  as data (quantized base64 + data-URL textures).
- ES5-style JS in anything the game loads.
- Never call AI APIs from the game itself; generation is build-time only.
- Bump `GAME_VERSION` with every game change; update README.md for player-
  facing changes; don't merge staging work to main without user approval.

## Extending beyond characters

For static props/vehicles: the same Meshy image-to-3D flow works — skip
rigging/splitting and embed whole meshes instead (see `glbview.js#parseGLB`
for the node-transform-correct GLB parsing; naive parsers that ignore node
transforms produce clipped/misassembled models). Keep polycounts PSX-low
(hundreds of tris for props) and textures ≤256px, posterized.
