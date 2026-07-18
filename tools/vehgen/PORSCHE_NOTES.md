# Porsche 964 Carrera 2 — build requirements (user-directed)

Durable spec so nothing is lost across container restarts. Reference: user's own
red 964 C2 coupe photos + a blue 964 with spoiler deployed.

## Assets (Meshy, multi-image; consistent with the GGBot PSX-pack car schema)
- **Body** — wheel-LESS coupe (NOT convertible). Empty dark wheel arches.
  Seeded blue for the runtime hue-swap. Views: front-3/4, rear-3/4, side, front-on.
  - Front: round headlights + ONE combo light per corner = CLEAR fog (inboard) +
    AMBER turn signal (outboard), side by side. NO separate lower fog lights.
  - Rear: BLACK RECESSED VOID slot on the engine deck (spoiler stows into/proud of
    it; grille is on the spoiler, NOT the body). 'Carrera 2' cursive script on the
    lid. Full-width taillight band with 'PORSCHE' lettering.
  - Aero teardrop mirrors, black door handles.
- **Wheels** — Porsche Cup 1 (silver 5 twin-spoke, black tire, centercap badge).
  SEPARATE mesh, 4 instances at true pivots → spin (roll) + steer (front). Views:
  face-on + 3/4.
- **Spoiler** — SEPARATE mesh: wide low BLUE lip + BLACK louvred engine grille on
  top + BLACK ribbed bellows underneath. Views: 3/4, top-down, rear.

## Integration
- Color: hue-swap variants, RED most prevalent.
- Handling: FASTEST top speed in the game + MUCH LESS body roll than other cars.
- **Spoiler deploy animation**: at speed it must ROTATE UP *and* TRANSLATE REARWARD
  simultaneously (4-bar linkage motion / bellows stretch), NOT a single-DOF hinge
  rotate. Reverse on stow. Stows PROUD of the black deck void (not flush).
- Drivable hero car (fast, low roll). Consistent scale/integration with GGBOT_VEHS.

## Pipeline state
- Seeds committed under tools/vehgen/work/seed_PORSCHE*.png (force-added).
- PORSCHEWHEEL.glb generated (first Meshy run); body/spoiler to be (re)generated
  multi-image after user locks the angle set.
- porschegen.js runs the Meshy generation.

## Integration lessons (v1.76.24)
- The Meshy body's nose faces the OPPOSITE way from the seed assumption —
  genporsche.js must run with `--flip`. Symptom when wrong: spoiler/void/
  tail decal render on the front trunk, front axle guess lands mid-door.
- Wheel pivots are MEASURED from the mesh (arch-cutout detection in
  processBody: lifted-bottom-rim x-bins, filtered to wheel-plausible
  width/position; radius = arch rim height * 0.51, track = fender z -
  0.30r). The proportional guess gave misaligned + 60%-undersized wheels.
  Measured: front +0.548, rear -0.5035, r 0.1369 (wheelbase/L = 0.56,
  real 964 = 0.535 — sanity check passed).
- Tyres widened 1.4x on the wheel's local axle axis in buildPorsche.
- Tail decal: lamb() material (MeshBasicMaterial glows vs the shaded
  body), feathered edges, 0.80W x 0.60H of the tail face.
- Live world is WC_REMAP: RaceTrac is at gasRob (85,-4); hero parks at
  (89,4) ry=0 (nose-in east toward the store wall, tail out). (66,50) is
  a ROAD in the remap world — pushOut "collider-free" does not mean
  "not a road".
