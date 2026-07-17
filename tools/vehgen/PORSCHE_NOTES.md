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
