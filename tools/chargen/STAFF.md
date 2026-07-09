# Shop-interior staff + reskins (offline gen for the shop-interiors phase)

Twenty new uniformed staff NPCs plus texture-only reskin variants, generated
OFFLINE (gpt-image-1 seeds -> Meshy image-to-3D -> rigging -> `genskin.js`,
same skinned schema as `meshychars.js`). **Nothing here is wired into the game
yet** — this is data + notes for the integrator.

## Deliverables

- **`staffchars.js`** (repo root):
  - `var STAFF_CHARS = [...]` — 15 full skinned characters (meshychars format:
    `{n, tex, skel, geo, clips, role, venue, job}`). `clips` use the shared
    set (`{shared:1}`), so **staffchars.js must load AFTER meshychars.js**,
    which defines `MESHY_SHARED_CLIPS`.
  - `var CHAR_RESKINS = [...]` — texture-only variants
    `{base, n, tex, role, venue?, job?}`. The integrator clones the `base`
    character's geometry/skeleton/clips and swaps only the `map`. `base` names
    either a `STAFF_CHARS` entry (Publix team-fills) or a `MESHY_CHARS` entry
    (civilian variants).
- Contact sheets in `tools/chargen/aigen/`: `staff_seeds.png` (seed review),
  `team_reskins.png`, `civ_reskins.png`, `staff_final.png` (in-mesh renders).

## Roster — 20 staff (uniforms consistent per business)

Uniform rule enforced across every business so its team reads instantly:

| Business | Uniform |
|---|---|
| Publix | forest-green polo + green/white apron + white oval name tag |
| Starbucks | black/white top + GREEN apron (round white logo) |
| Dunkin | orange-and-brown polo + brown visor + name tag |
| Sakura Sushi | white double-breasted chef coat + headband + navy waist apron |
| Regions Bank | business casual (button-down/blouse + tie/cardigan + badge, no apron) |
| Dollar Tree | bright-green vest over a casual tee + name tag |

### Full Meshy generations (15) — in `STAFF_CHARS`

| Name | Venue | Role | Look |
|---|---|---|---|
| CASHIER_ROSA | Publix | cashier | Latina 40s, low bun, green polo + apron |
| CASHIER_MIKE | Publix | cashier | white man 20s, sandy hair, green polo + apron, khakis |
| STOCKER_CARL | Publix | stocker | white man 30s, backwards cap, green polo + black utility apron |
| BAGGER_JADE | Publix | bagger | Black teen girl, braids ponytail, green polo + apron |
| DELI_ANNA | Publix | deli | white woman 40s, hairnet, long white deli apron |
| BUTCHER_HANK | Publix | butcher | heavyset white man 50s, white butcher coat + bloodied apron + paper cap |
| MANAGER_GREG | Publix | manager | white man 40s, white shirt + maroon tie + manager badge (no apron) |
| BARISTA_CHLOE | Starbucks | barista | white woman 20s, beanie, black tee + green apron |
| BARISTA_OMARI | Starbucks | barista | Black man 20s, fade, black polo + green apron |
| DUNKIN_ASH | Dunkin | crew | white woman, blonde ponytail, orange/brown polo + brown visor |
| DUNKIN_RAJ | Dunkin | crew | Indian man 20s, orange/brown polo + brown visor |
| SUSHI_KENJI | Sakura Sushi | chef | Japanese man 40s, headband, white chef coat + navy apron |
| TELLER_BRENDA | Regions Bank | teller | white woman 40s, blouse + grey cardigan + skirt + badge |
| TELLER_MARCUS | Regions Bank | teller | Black man 30s, glasses, white shirt + navy tie + badge |
| DOLLAR_PAM | Dollar Tree | clerk | white woman 30s, ponytail, green vest over black tee |

### Publix team-fill reskins (5) — in `CHAR_RESKINS`, complete the 20

Same green Publix uniform as their base, varied by skin/hair (free — no Meshy
credits). Body/build is shared with the base character.

| Name | Base | Role | Variation |
|---|---|---|---|
| CASHIER_GWEN | CASHIER_ROSA | cashier | Black woman 50s, short grey hair, glasses |
| STOCKER_LUPE | CASHIER_ROSA | stocker | Latina 30s, high ponytail |
| BAGGER_TYLER | CASHIER_MIKE | bagger | white teen boy, shaggy brown hair |
| STOCKER_DEE | CASHIER_MIKE | stocker | Black man 20s, short twists |
| PRODUCE_SAM | CASHIER_MIKE | produce | East-Asian man 20s |

## Bonus civilian reskins (8) — extra variety, in `CHAR_RESKINS`

Recolors of existing `MESHY_CHARS` civilians (role `civ`); do NOT count toward
the 20. Body unchanged, garment recolored.

| Name | Base | Variation |
|---|---|---|
| OMAR_NAVY | OMAR | white polo -> navy polo |
| ALEX_MAROON | ALEX | yellow hoodie -> maroon hoodie |
| RIKO_TEAL | RIKO | koi hoodie recolored teal |
| VLAD_RED | VLAD | black tracksuit -> crimson tracksuit |
| TYRELL_ORANGE | TYRELL | windbreaker -> orange/grey |
| DIEGO_TAN | DIEGO | navy coveralls -> tan coveralls |
| PATTY_PINK | PATTY | teal diner dress -> pink |
| DON_GREEN | DON | blue tee -> green tee |

## Integrator notes

- **Load order**: `three.min.js` -> `meshychars.js` -> `staffchars.js` ->
  `game.js`. staffchars.js references `MESHY_SHARED_CLIPS` and `MESHY_CHARS`.
- **Building a staff char** is identical to a `MESHY_CHARS` entry — feed the
  entry to the same skinned builder (`getMeshySkin`/`buildMeshySkinned`).
  `clips.walk/run` carry `{shared:1}` so they resolve against
  `MESHY_SHARED_CLIPS` by bone name (all rigs share the 24-bone skeleton).
- **Building a reskin**: look up `base` in `STAFF_CHARS` ∪ `MESHY_CHARS`, build
  it, then replace the material's `map` with a texture from the reskin's `tex`
  data-URL (NearestFilter, no mipmaps, matching the existing loader). Geometry,
  skeleton and clips come entirely from the base.
- **Placement**: `venue` + `job` fields drive where each staffer stands. Publix
  gets the 8 green-polo staff (3 cashiers, 2 baggers, 3 stockers) + deli +
  butcher + produce + manager = 12; the others go to their named venues.
- Staff are **not** civilians to be shot for wanted stars in the same way — the
  integrator should decide whether interior staff are passive (like CLERK) or
  count as civ kills. They carry `role:'staff'` to make that easy to branch on.

## Expected staff behaviors (for the shop-interiors phase)

- **Cashier**: idle behind a checkout lane, faces the register, occasional
  scan/bag gesture; greet the player on approach.
- **Bagger**: stands at the bag end of a lane, bagging loop; idle chatter.
- **Stocker**: walks a shelf aisle, periodic stock/reach loop, then moves on.
- **Deli / Butcher / Produce**: stand behind their counter, service-idle,
  greet + "what can I get you" on approach.
- **Manager**: roams the floor slowly, supervises, no apron; can be the
  "talk-to" NPC for store events.
- **Barista / Dunkin crew**: behind the counter, drink-making loop, call-out.
- **Sushi chef**: behind the sushi bar, prep loop.
- **Bank teller**: seated/standing at a wicket, transaction idle.
- **Dollar Tree clerk**: register idle + restock loop.

## Dialogue (separate upcoming task — reuse existing voice packs)

Each character carries a `role` (and staff carry `venue`+`job`) so dialogue can
be **role-specific**: cashiers greet + total-up lines, stockers "aisle 5" /
apologetic lines, managers store-announcement + escalation lines, baristas
order call-outs, tellers transaction lines, etc. NO new Fish Audio voices were
generated in this task — the integrator should reuse existing voice packs
(pin one `reference_id` per character in `tools/ttsgen/voices.json`), mapping a
fitting existing voice to each new staffer. Customer-interaction scripting
(checkout, ordering, greetings) is out of scope here and comes with the
shop-interiors gameplay task.

## Regenerating / extending

- Roster prompts: `tools/chargen/staff_roster.json` (`.staff` = seed
  descriptions, `.venue` = [venue, job]).
- `staffseeds.sh` -> seeds (review `aigen/staff_seeds.png`) -> `staffwave.js`
  (`--only NAME,... --conc N`, Meshy gen+rig+genskin, resumable, writes
  `work/staffskins_data.json`).
- Reskins: `reskin.js <inAtlas.jpg> <out.jpg> "<recolor instruction>" [low]`
  (gpt-image-1 edit, layout-preserving), verify with
  `glbview_tex.js <base_walk.glb> <out.png> 1.8 <newtex.jpg>`. Manifest:
  `reskins_manifest.json`.
- Assemble: `node buildstaffjs.js` (reads wave output + manifest -> staffchars.js).
