# Child NPCs (offline gen) — roster, voices, integrator notes for task #72

Eight base child characters + sixteen texture variants (**24 kid looks**) plus a
racially-consistent kid voice pack. Generated OFFLINE, same skinned pipeline as
`meshychars.js`/`staffchars.js`. **Nothing is wired into the game yet** — this is
data + notes for the #72 integrator. **Kids are COMBAT-EXEMPT** (see below).

## Deliverables

- **`kidchars.js`** (repo root) — load after `three.min.js`, before `game.js`.
  Self-contained (kids embed their own clips; no `MESHY_SHARED_CLIPS` need).
  - `var KID_CHARS = [...]` — 8 full skinned kids, meshychars schema plus kid
    fields: `{n, tex, h, skel, geo, clips, role:'kid', race, sex, age}`.
  - `var KID_VARIANTS = [...]` — 16 texture-only reskins `{base, n, race, tex}`.
    Clone the `base` KID_CHARS entry's geo/skel/clips, swap the material `map`.
- **`kidvoices1.js`** (repo root, `window.KID_VOICES`) — 122 PSX-crunched clips,
  keyed by voice PERSONA (not by look). Optional at runtime (`typeof KID_VOICES`).
- Contact sheet: `tools/chargen/aigen/kids_contact24.png` (all 24 looks, in-mesh,
  posed mid-walk).

## Roster — 8 base kids (KID_CHARS)

`h` = target in-game height in game units (geometry is baked to this via genskin
`--height`; see Scale below). `race` = STARTING ethnicity for parent matching.

| Name | Sex | Age | Race | h | Look |
|---|---|---|---|---|---|
| LEO    | boy  | 7  | white       | 1.18 | spiky brown hair, green T-rex tee, denim shorts, red light-up sneakers |
| MAYA   | girl | 9  | black       | 1.30 | short box braids, denim overalls over yellow tee, white sneakers |
| SOFIA  | girl | 6  | latino      | 1.10 | dark bob, pink rainbow-unicorn dress, sandals |
| JAYDEN | boy  | 11 | black       | 1.42 | fade, orange basketball jersey #4, black shorts, high-tops |
| EMMA   | girl | 8  | white       | 1.24 | blonde ponytail, teal butterfly tee, purple shorts, pink light-ups |
| KAI    | boy  | 10 | east_asian  | 1.36 | bowl cut, blue/white striped rocket tee, cargo shorts, blue sneakers |
| PRIYA  | girl | 7  | south_asian | 1.16 | long dark hair + headband, red star tee, floral leggings, sandals |
| NOAH   | boy  | 5  | white       | 1.05 | red cap, curly hair, denim overalls + truck tee, small sneakers |

## Variants — 16 reskins (KID_VARIANTS), with race for #72 parent matching

Texture-only; body/rig identical to `base`.

| Variant | Base | Race | Change |
|---|---|---|---|
| LEO_COCO       | LEO    | black       | dark skin, black hair, blue dino tee |
| LEO_SUN        | LEO    | latino      | tan skin, red tee |
| MAYA_HAZEL     | MAYA   | latino      | light-tan skin, brown hair, green tee |
| MAYA_INK       | MAYA   | black       | teal overalls, orange tee |
| SOFIA_SKY      | SOFIA  | white       | fair skin, blonde, light-blue dress |
| SOFIA_COCOA    | SOFIA  | black       | dark skin, green dress |
| JAYDEN_AZURE   | JAYDEN | latino      | tan skin, brown hair, blue jersey |
| JAYDEN_CRIMSON | JAYDEN | black       | crimson jersey |
| EMMA_JADE      | EMMA   | east_asian  | warm-light skin, black hair, pink tee |
| EMMA_UMBER     | EMMA   | south_asian | medium-dark skin, black hair, orange tee |
| KAI_OLIVE      | KAI    | latino      | tan skin, green-striped tee |
| KAI_ASH        | KAI    | white       | fair skin, light-brown hair, red-striped tee |
| PRIYA_JADE     | PRIYA  | east_asian  | warm-light skin, black hair, purple tee |
| PRIYA_LINEN    | PRIYA  | white       | fair skin, brown hair, yellow tee |
| NOAH_PINE      | NOAH   | black       | dark skin, black curls, dark-green overalls |
| NOAH_CLAY      | NOAH   | latino      | tan skin, yellow tee |

**Race distribution across all 24 looks:** white 6, black 7, latino 6,
east_asian 3, south_asian 2. Every look carries a `race` field so #72 can spawn a
kid whose ethnicity matches a nearby parent NPC.

**Weakest variants (accepted):** MAYA_HAZEL / MAYA_INK / LEO_COCO / LEO_SUN show
some gpt-image-1 recolor blotching on limbs (skin-tone reskins over scattered UV
islands — clothing-only recolors came out cleaner). Readable at gameplay
distance; combat-exempt background NPCs. Re-roll via `kidreskins.sh` if desired.

## Scale (important — how kids stay short)

`genskin.js` normally bakes every mesh to 1.78 units; kids were baked with
`--height <h>` so the WHOLE rig (geometry + clip root-Y bob + FK stride) is
consistent at the kid's real height. **Build a kid at `g.scale = 1.0`** — do NOT
apply the adult `0.92 + build*0.045` civ build-scale from `buildMeshySkinned`, or
the kid comes out ~8% short and its stride desyncs. Easiest path for #72: copy
`buildMeshySkinned`, drop the final `g.scale.set(sc,sc,sc)` line (leave 1.0), and
read the roster from `KID_CHARS`. The blob shadow radius (0.42) is adult-sized;
scale it by `h/1.78` for a tighter kid shadow.

## Voices — `kidvoices1.js` / `window.KID_VOICES`

Lines are keyed by **persona**, not by look (many looks share a persona). Map a
look → persona with `tools/chargen`/`tools/ttsgen/kid_voices.json` `lookMap`
(also inlined below). Play like the NPC pack: pick a random clip from
`KID_VOICES[persona][category]`.

**Personas (Fish refs pinned in `tools/ttsgen/kid_voices.json`):**
`KID_BOY_BRIGHT`, `KID_BOY_HYPER`, `KID_BOY_SOFT`, `KID_GIRL_BRIGHT`,
`KID_GIRL_SWEET`, `KID_GIRL_LATINA`, `KID_GIRL_INDIAN`, plus parent voices
`PARENT_DAD/MOM/GRAN/MOM2/POP` (existing adult refs) with a `tokid` category.

**Look → persona map** (sex-consistent; race-matched where the catalog has a
distinct child voice):
- Boys: LEO, LEO_SUN, JAYDEN_AZURE, KAI, KAI_OLIVE, KAI_ASH → `KID_BOY_BRIGHT`;
  LEO_COCO, JAYDEN, JAYDEN_CRIMSON → `KID_BOY_HYPER`;
  NOAH, NOAH_PINE, NOAH_CLAY → `KID_BOY_SOFT`.
- Girls: MAYA, MAYA_INK, EMMA, EMMA_JADE → `KID_GIRL_BRIGHT`;
  SOFIA_SKY, SOFIA_COCOA, PRIYA_JADE, PRIYA_LINEN → `KID_GIRL_SWEET`;
  SOFIA, MAYA_HAZEL → `KID_GIRL_LATINA`;
  PRIYA, EMMA_UMBER → `KID_GIRL_INDIAN`.

**Racial-consistency audit note:** the Fish catalog only ships race-distinct
CHILD voices for **South-Asian** (Indian-accent girl → `KID_GIRL_INDIAN`) and
**Latina girl** (`KID_GIRL_LATINA`). There are NO African-American or East-Asian
child voices, so Black/Asian looks use general American kid voices — the same
honest outcome as the adult NPC audit, bounded by what exists. If race-perfect kid
voices are wanted later, mint custom Fish voices (`POST /model`) and repin.

**Dialogue categories & counts** (122 clips total): `chatter` 28, `parent` 21
(kid whining at parent), `play` 21 (squeals/laughs), game callouts `tag` 14 /
`hide` 14 / `rlgl` 14 (Red-Light-Green-Light), and `tokid` 10 (parent-to-kid on
adult voices). Callouts are the hook for the mini-games below.

## Integrator notes for #72

- **Combat exemption:** kids carry `role:'kid'`. In the damage/wanted paths, treat
  `role==='kid'` like a no-op target: bullets/melee/cars must NOT hurt them and
  killing must be impossible (skip ragdoll, skip civ-kill wanted credit). Easiest:
  early-return in `dmgNpc`/ragdoll/`goBerserk`-contact when `n.userData.role==='kid'`
  (or a `n.kid` flag). They should still be pushed by `pushOut` collision so they
  don't clip through the player/world.
- **Parent pairing:** on spawn, pick a parent adult NPC and spawn 1–2 kids whose
  `race` matches the parent; store `kid.parent = adultNpc`. Kids follow the parent.
- **Follow behavior:** target = parent position + small jitter; keep a **follow
  distance of ~2–4 units** (`h`-scaled), walk (`clips.walk`) when > ~3 u from the
  parent, run (`clips.run`, `spd>2.2`) when > ~8 u (parent got ahead), idle/loiter
  when close. Reuse `animPerson`'s gait-by-distance/stride path unchanged — kid
  entries carry per-clip `st` so feet plant correctly on little legs.
- **Playground anims to reuse:** only walk + run were generated (Meshy's free
  clips). For **idle**, hold `meshyPose(sk,'walk',0)` (the natural stance the
  builder already sets) or nudge the cycle slowly for a fidget. For game-callout
  gestures there is no bespoke clip — pair a callout VOICE line with a simple
  procedural arm raise (rotate `userData.limbs.armR` a few frames) if you want a
  point/wave. Ragdoll is wired (`userData.limbs` → real bones) but should stay
  UNUSED for kids given the combat exemption.
- **Mini-game state machine (optional flavor):** cluster 2–4 kids in a play zone
  (e.g. Farnell school yard, a Publix lot corner) and run a tiny FSM:
  - **Tag:** one kid = "it"; it chases nearest kid; on proximity, swap "it",
    play a `tag` callout. Others flee.
  - **Hide-and-seek:** one seeker counts (play `hide[0]` "…ready or not…"), others
    scatter to props; seeker walks to each, plays "Found you!".
  - **Red-Light-Green-Light:** a caller kid faces away and alternates `rlgl`
    "Green light!"/"Red light!"; others walk on green, freeze on red.
  These only need position targets + the existing walk/run gait + the voice
  callouts already in `KID_VOICES`. Kids drop back to follow-parent when the
  player leaves the zone.
- **Voice triggers:** ambient `chatter`/`play` on a loose timer while wandering;
  `parent` when near their parent; game callouts driven by the FSM above; parent
  NPCs occasionally fire a `PARENT_*` `tokid` line at their kid. Gate with a
  per-kid cooldown like `playNpcVoice`.

## Regenerating / extending

- Roster + heights: `tools/chargen/kid_roster.json` (`.kids[NAME] = {sex,age,race,h,seed}`).
- Seeds: `kidseeds.sh` (child-tuned proportions via `kidseedgen.sh`; younger =
  fewer heads-tall). Review `aigen/kid_seeds.png`, delete adult-looking seeds,
  re-run. **Give long hair / backpacks a wide berth** — Meshy's auto-rig weights
  long pigtails/ponytails/bags to arm bones and they fling out mid-stride (SOFIA,
  MAYA, KAI all needed a seed or re-rig fix). Keep hair close to the head and arms
  in a WIDE clean T-pose.
- Meshy gen+rig+genskin: `MESHY_API_KEY=... node kidwave.js [--only NAME] [--conc N]`
  (resumable via `work/kidskins_data.json` + `work/kidstate.json`; bakes at each
  kid's `h`, embeds own clips). Cheap re-rig of a good mesh with bad weights:
  `node rerig.js NAME --height H --from remesh`.
  - Heads-up: `charpipe.js` still runs the legacy rigid `gensplit.js` as its last
    step and it "fails" its sanity check on kid meshes — harmless. The rigged GLB
    is already saved, so a second `kidwave.js --only NAME` run skips charpipe and
    finishes via genskin.
- Variants: `kid_reskins_manifest.json` → `kidreskins.sh` (gpt-image-1 layout-
  preserving recolors). Verify with `kidsheet.js` (renders all looks in-mesh).
- Contact sheet: `node kidsheet.js aigen/kids_contact24.png 0.28` (one chromium,
  PORT 8205; builds each look exactly like the game and poses it mid-walk).
- Voices: `kid_voices.json` (personas + lookMap) + `kid_lines.json` (silly script)
  → `FISH_API_KEY=... node tools/ttsgen/kidvoicegen.js` → `kidvoices1.js`.

## Costs

Meshy: ~500 credits (8 kids × ~35 base + remesh fallbacks + KAI regen + SOFIA/MAYA
regen + KAI re-rig). Balance after: ~1234. gpt-image-1: 8 seeds (+3 retries) +
16 reskins (+3 retries). Fish: 122 clips.
