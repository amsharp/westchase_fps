# Westchase character style guide

Every generated character must sit naturally next to the existing roster.
Before accepting ANY seed image, compare it against `style_ref.png` and the
current roster lineup — if it wouldn't pass as a background pedestrian in
the same shot, regenerate the seed. Seeds are free; off-style 3D models
waste Meshy credits and roster slots.

## Proportions (the #1 drift risk)

- **Adult proportions: 6.5–7 heads tall.** The head is ~14% of total
  height. REJECT chibi/toon proportions (big head, short limbs) — image
  models drift toward cute/stylized constantly, especially for heavyset or
  female characters. Say "realistic adult proportions" explicitly in every
  seed prompt and check the result with your own eyes.
- Legs ≈ half of total height. Shoulders ≈ 2 head-widths (male) / slightly
  narrower (female).
- Body diversity is welcome (heavy, thin, short-ish) but stays within adult
  proportions: a heavy character is WIDE, not squashed; a short character
  is ~0.9× height, not 0.6× with a giant head.
- In-game every character is rescaled to ~1.78 units tall — a chibi seed
  therefore becomes a normal-height person with an enormous head. There is
  no downstream fix; the seed must be right.

## Style

- **Chunky low-poly**: hard triangular facets, blocky silhouette edges.
  Not smooth, not rounded, no sculpted musculature.
- **Texture**: crisp low-res texels (like a 256×256 game texture), flat
  even lighting baked in, no directional shading, no gloss.
- **Face**: painted-on features — simple dark eyes/brows, single-line
  mouth. No anime eyes, no lashes, no blush marks.
- **Palette**: saturated but muted 90s colors. One loud element per
  character max (a graphic tee OR a wild shirt pattern, not both).
- **Graphic tees encouraged**: big single-motif chest print (eagle, skull,
  pizza, lightning bolt). Keep the print pixelated/chunky.
- **Every character needs a visual hook** — a graphic tee, a loud pattern,
  distinctive hair, an accessory, SOMETHING. No plain-solid-tee-and-jeans
  characters: the roster carries at most ONE deliberately generic person
  (currently RYAN). If a seed reads as "background extra nobody would
  remember", give it a hook and regenerate.

## Technical (non-negotiable for the pipeline)

- Perfect T-pose: arms straight and horizontal, clear gap between arms and
  torso, legs slightly apart. Arms angled down or touching the body break
  Meshy's auto-rigging (torso gets weighted to an arm bone).
- Front view, full body head-to-feet, plain white background, no shadows.
- Fitted or short sleeves rig better than baggy ones.

## Gate checklist (run for every seed)

1. Head ≈ 1/7 of height? (Measure it — don't eyeball "close enough".)
2. Would it pass as a pedestrian next to `style_ref.png` and the roster?
3. Hard facets + chunky texels (not smooth/painterly)?
4. Strict T-pose with arm/torso gaps?
5. White background, full body in frame?

If any answer is no: regenerate the seed with the failing rule spelled out
verbatim in the prompt. Two characters (DOUG v1 chibi, YUKI v1 rounded)
had to be regenerated because proportions weren't checked — learn from us.
