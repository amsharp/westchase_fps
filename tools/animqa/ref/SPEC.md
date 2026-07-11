# FP weapon-composition SPEC (screen-percent landmarks)

Coordinates are percentages of the frame: **x = 0 left … 100 right**,
**y = 0 top … 100 bottom** (so larger y = lower on screen). Center crosshair is
(50, 50). These are the target landmarks a held long-gun (AK / rifle / SMG)
should hit in the first-person view, measured from Counter-Strike / Half-Life
reference holds (see ../ref/cs_ak_hold.jpg).

| landmark            | target x | target y | tolerance |
|---------------------|----------|----------|-----------|
| muzzle tip          | 55       | 57       | ±4        |
| support hand        | 58–63    | 62–70    | —         |
| stock exits frame   | 78–95    | 100 (bottom edge) | — |

Rules the reviewer should enforce:
- The muzzle points **downrange, at or just BELOW the center crosshair** — never
  up toward/above center. Nothing of the weapon crosses above ~52% screen height.
- The weapon body sits **anchored in the lower-right**; the receiver fills the
  lower-right quadrant, the barrel runs roughly horizontal (a slight upward lean
  toward the muzzle is fine, but the muzzle stays at/below center).
- The support (left) hand **wraps the foregrip/handguard** with fingers curled
  over it; the forearm enters near-vertically from the bottom edge and does not
  sprawl across the lower third as a large bare mass.
- Idle: subtle breathing sway. Turning: the weapon lags the camera slightly.
- Firing: a visible recoil kick that recovers; muzzle flash at the muzzle tip.

Note: this is a retro / PS1-fidelity game — low-poly meshes and low-res
procedural textures are intentional and must NOT be reported as defects.
