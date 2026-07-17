# Replacing a first-person gun with a user-supplied GLB

For hand-made gun models (GLB + embedded texture) that swap into MESHY_GUNS
(decoded by getGunMesh; framed per-gun in game.js viewmodels).

1. Parse GLB -> world-space soup + base-color texture:
   `node gun_glb_parse.js in.glb raw.json`
   (applies node transforms, resolves baseColorTexture via material 0)

2. Reorient + quantize into a MESHY_GUNS entry. Models authored length-along-Z
   (up +Y, thin X) need a -90° yaw so the muzzle lands on -X (repo convention:
   muzzle -x, up +y, left side +z). Check which Z end is the muzzle first; flip
   with `flipz` if the muzzle comes out backwards, or use +90.
   `node gun_glb_conv.js raw.json entry.json <name> -90`
   -> dims[0] becomes the X length; getGunMesh scales by len/dims[0].

3. Recompress the texture to a small JPEG (chromium canvas; cap ~512px, q0.85)
   and splice the entry line into meshyguns.js (each gun is one line
   `{"n":"<name>",...},`). Then in game.js retune the viewmodel's
   getGunMesh(name, len) + mg.position for the new proportions.

4. Verify in-game (screenshot) — the muzzle points down-range, size matches the
   other guns, and WEAPONS.<w>.flashAt = meshyMuzzleAt(mg) puts the flash on the
   barrel tip. ak47 (len 1.12) and tec9 (len 0.46) were done this way.
