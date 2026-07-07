# chargen — AI character generation pipeline

Turns a one-line character description into a fully integrated in-game
character: unique low-poly mesh, PSX-crunched texture, walking/ragdoll
animation via the game's existing rigid-part system.

```
description ──seedgen.sh──▶ seed.png ──charpipe.js──▶ rigged GLB + split data
                (gpt-image-1)            (Meshy API)         │
                                                             ▼
game ◀──merge_meshychars.js── work/meshychars_data.json ◀──gensplit.js
```

## Prerequisites

- Node 18+ (uses global `fetch`), `curl`.
- Playwright + Chromium for the texture encode and previews
  (`require('playwright')`, or the Claude sandbox path
  `/opt/pw-browsers/chromium` — scripts try both).
- **API keys from the user — never commit them:**
  - `OPENAI_API_KEY` (gpt-image-1 seeds)
  - `MESHY_API_KEY` (image-to-3D + rigging; check balance:
    `curl -H "Authorization: Bearer $MESHY_API_KEY" https://api.meshy.ai/openapi/v1/balance`)

## Recipe (one character, ~35 Meshy credits)

```bash
cd tools/chargen

# 1. Seed image (free to retry — ALWAYS eyeball it before step 2).
OPENAI_API_KEY=... ./seedgen.sh work/seed_cowgirl.png \
  "a woman with a blonde ponytail wearing a denim jacket over a white tee \
   with a cactus graphic, brown boots and a cowboy hat"

# 2. Generate + rig + split (~5 min; polls Meshy).
MESHY_API_KEY=... node charpipe.js DOLLY work/seed_cowgirl.png

# 3. Preview the rigged model in the game's own three.js.
node glbview.js work/DOLLY_rigged.glb work/DOLLY_preview.png 1.8

# 4. Merge into the game + verify.
node merge_meshychars.js work/meshychars_data.json
```

After merging: bump `GAME_VERSION` in game.js, run the character test suite,
and take an in-game screenshot (character presets appear automatically in the
creator's PRESET row; NPCs start wearing them too).

## Quality gates (do not skip)

1. **Seed gate** (free): T-pose clean? Chunky low-poly, not smooth? Graphic
   readable? White background? If not — regenerate the seed, don't burn
   Meshy credits.
2. **Model gate**: `glbview.js` — silhouette, texture front AND back, face.
   Meshy web workspace offers free redos on a task if it came out bad.
3. **In-game gate**: build with `preset` pointing at the new character, pose
   the limbs (`userData.limbs`), screenshot. Watch for: height vs existing
   characters (~1.78 units), pivot correctness mid-stride, texture bleed.

## Parameters that matter

- `--polycount` (default 1600): crowd-safe. `should_remesh:true` is REQUIRED
  or Meshy ignores the target entirely (returns ~9.5k tris) — and even with
  it, the in-task remesh frequently doesn't hold (observed 4k–15k on a 1600
  target). charpipe measures the rigged GLB and automatically falls back to
  a standalone remesh + re-rig (+10 credits) when >1.6× over budget.
- `pose_mode:'t-pose'` keeps arms horizontal so the game's ±1.42 rad arm
  drop works, and rigging requires a T-pose-ish input anyway.
- `--height` feeds Meshy rigging; the split rescales to 1.78 game units
  regardless.
- Texture is downsampled 4K→256px + posterized in gensplit — that's where
  the PSX look comes back; don't skip it.

## Known issues / gotchas

- **UV flip**: gensplit stores RAW glb v; the game's loader applies `1-v`.
  If a character's texture looks scrambled, this is the first suspect.
- **Occlusion bleed**: surfaces hidden in the T-pose (inner thighs under a
  shirt hem) get neighbor-color texture bleed from Meshy; visible when legs
  swing. Unsolved; acceptable at gameplay distance.
- **Meshy bone names** are Mixamo-style (`LeftArm`, `RightUpLeg`, `Spine02`,
  `neck`…). `gensplit.js#partOfJoint` maps them to the game's six parts;
  if Meshy ever renames bones, fix it there.
- Rigging returns FREE walking/running GLB clips (URLs saved to
  `work/<NAME>_anims.json`, expire after a while — download promptly if
  needed). A future skinned-playback path can use them; `skinframe.js`
  CPU-skins any animated GLB at time t to verify a clip offline.
- Meshy tasks show up in the web workspace where the account owner can redo
  them for free; retrieve a redo by its task id via the API.

## Game integration contract (already wired, see game.js)

`meshychars.js` at repo root: `var MESHY_CHARS = [{n, tex, parts}]`.
`buildCharacter` dispatches `cfg.preset > PSX_SKINS.length` to
`buildMeshyChar`; the entry's parts use the PSX_MESH quantization (pos mm
Int16 relative to per-part pivot `pv`, uv ×8192 Uint16, indexed tris).
Contract requirements for any new generator: six parts named
head/torso/armL/armR/legL/legR, feet at y=0, ~1.78 units tall, facing +z,
arms authored in T-pose.
