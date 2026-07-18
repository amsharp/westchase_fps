# cabin — forest cabin asset (ships as repo-root `cabin.js` = CABIN_DATA)

The pallet-wood shed at the NW forest corridor (`CABIN` in game.js). Meshy
image-to-3d, embedded whole (no rigging) like the vehicle/gun props.

Regenerate (needs OPENAI_API_KEY + MESHY_API_KEY from the user, never commit):

```
# 1. Seed image (free; eyeball before spending Meshy credits)
OPENAI_API_KEY=... node seed.js seed.png

# 2. Image-to-3d GLB (reuse the vehicle pipeline; ~30 credits)
MESHY_API_KEY=... node ../vehgen/vehpipe.js CABIN seed.png --polycount 1000 --workdir work
#   NOTE: Meshy's remesh to <1k tris HOLED the walls — keep the raw ~21k-tri
#   preview GLB instead (fetch model_urls.glb of the image-to-3d task id).

# 3. GLB -> world-space soup + tex
node ../vehgen/gun_glb_parse.js work/CABIN_orig.glb raw.json

# 4. bottom-at-y=0, center X/Z, quantize, 256px tex -> repo-root cabin.js.
#    Last arg = Y rotation deg (180 puts the door on +Z, the driving approach).
node cabin_conv.js raw.json ../../cabin.js CABIN_DATA 180
```

Preview any stage with a standalone three.js render of raw.json (see the
session scratchpad `cabin/preview2.js`). Bump GAME_VERSION after integrating.
