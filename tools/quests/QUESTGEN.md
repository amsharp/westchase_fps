# QUESTGEN — offline quest-content generation (for wave #77 implementers)

All OFFLINE, build-time. Nothing here is wired into `game.js` / `index.html` —
these are **unwired data files** for the quest-implementation waves. Everything
was produced by the pipelines under `tools/quests/` (which reuse the existing
chargen / itemgen / vehgen / ttsgen tooling). Source of truth for the design:
`QUESTS.md` + `quest_assets.json` (the manifest).

## Deliverables (repo root)

| File | Global | Contents | Size |
|---|---|---|---|
| `questchars.js` | `QUEST_CHARS`, `QUEST_RESKINS` | 10 skinned quest NPCs + BISCUIT (animal) + 6 texture-only reskins | ~1.1 MB |
| `questitems.js` | `QUEST_ITEMS`, `QUEST_ITEM_DEFS` | 36 alpha item icons (64px PNG) + defs | ~100 KB |
| `questprops.js` | `QUEST_PROPS` | 8 static 3D props (ENV_PROPS schema) | ~2.5 MB |
| `questvoices1.js` | `window.QUEST_VOICES` | 279 PSX-crunched dialogue WAVs | ~11 MB |

Load order: `three.min.js` → `meshychars.js` → `kidchars.js` → `questchars.js`
→ (`questitems.js` / `questprops.js` / `questvoices1.js` anywhere before game.js).
Guard each with `typeof QUEST_CHARS` etc.

Meshy spend this pass: **1234 → 544 credits (~690 spent)** — 10 rigged chars
(nearly all hit the remesh+re-rig fallback to reach ~1.5k tris) + 8 props.
Item icons + reskins + voices used OpenAI / Fish only (no Meshy).

---

## 1. Characters — `QUEST_CHARS` (11) + `QUEST_RESKINS` (6)

**Pipeline:** `quest_roster.json` seeds → `questseeds.sh` (gpt-image-1 T-pose,
style-anchored) → review `work/chars_contact2.png` → `quest_charwave.js`
(Meshy image-to-3d lowpoly t-pose → rigging → remesh fallback → genskin with
**own** walk/run clips; per-char checkpointed + resumable) →
`buildquestchars.js`.

Build a skinned entry exactly like a `MESHY_CHARS` entry
(`getMeshySkin`/`buildMeshySkinned`) — same `{n, tex, h, skel, geo, clips}`
schema; `clips.walk`/`clips.run` are the character's **own** Meshy clips.

| QUEST_CHARS | quest | look |
|---|---|---|
| VIVIAN | q1 | silver bob, emerald gown, pearls, opera gloves |
| WENDELL | q2 | maroon robe over tank/track pants, tinfoil cap, binoculars |
| AGATHA | q3 | stooped, black shawl, milky eye, mourning dress |
| SAL | q4 | pinstripe 3-piece, grey fedora, pinky ring |
| DESIREE | q5 | slinky red cocktail dress, red heels |
| BRICK | q5 | huge bald bruiser, white tank, cargo pants, neck tattoo |
| WARDEN | q6 | towering neon-glitch amalgam, single cyan eye (also the q10 Entity look) |
| VLAD | q7 | oiled bodybuilder, tiny blue briefs, red sweatband |
| CONCIERGE | q8 | flawless charcoal 3-piece, gloves, gold lapel pin |
| THORNE | q10 | red-and-gold blazer, silver hair, HOA pin |
| **BISCUIT** | q9 | `kind:'animal'` — **reuse `accessprops.js` `dog` mesh** (chocolate / black-&-tan variant), procedural trot, no skeleton. Summoned by the Dog Whistle. |

> Name note: quest **VLAD** and **WENDELL** are DISTINCT new meshes from the
> same-named `MESHY_CHARS` NPCs. The quest system should reference `QUEST_CHARS`
> by this array, not by global name.

**`QUEST_RESKINS`** (texture-only; clone `base` geo/skel/clips, swap the map).
Generated with `tools/chargen/reskin.js` (layout-preserving gpt-image-1 recolor —
Meshy-free; verified UV-island layout preserved in `work/reskin_check.png`):

| n | base (array) | quest | recolor |
|---|---|---|---|
| CHET | CONCIERGE (QUEST_CHARS) | q1 | charcoal suit → white waiter jacket |
| METER_READER | DIEGO (MESHY_CHARS) | q2 | coveralls → grey + orange hi-vis vest |
| DUKE | DIEGO (MESHY_CHARS) | q4 | coveralls → tan mechanic jumpsuit |
| CHAD | TYRELL (MESHY_CHARS) | q7 | windbreaker → turquoise athletic top |
| SILAS | ALEX (MESHY_CHARS) | q8 | yellow hoodie → washed grey hoodie |
| GRAY_BOY | LEO (KID_CHARS) | q3 | full desaturate → pale ghost (kid-safe) |

Regenerate: seeds `questseeds.sh`; wave `MESHY_API_KEY=… node quest_charwave.js`;
reskins `node ../chargen/reskin.js work/reskin/<BASE>.jpg work/reskin/<out>.jpg
"<instr>" low` (bases extracted from the char data files into `work/reskin/`).

---

## 2. Item icons — `QUEST_ITEMS` (36) + `QUEST_ITEM_DEFS`

**Pipeline:** `quest_items.js` (4 grids × 9) → `genquestitems.js`
(gpt-image-1 3×3 grids → slice + key → 64px alpha PNG). Grid 0 came back as the
intended magenta-gutter format; grids 1–3 came back **transparent** — the
processor auto-detects per grid (magenta-key vs even-slice + alpha-key, keeping
components centred in the cell so multi-part items survive and neighbour bleed
is dropped). Acceptance sheet: `work/items_contact.png` (gray + dark).

`QUEST_ITEM_DEFS` rows: `{id, name, quest, use, notes}`.
`use`: `reward` (capability/weapon), `clue`, `key` (q10 door keys etc), `tool`,
`thread` (Pact story tile), `entry` (triggers/enters a quest).

36 icons cover every manifest item. The three heist keys (`guard_key`,
`manager_key`, `timer_key`) each got a distinct icon; a few flavor items
(`neon_blaster` lost some of its neon glow to the posterize/alpha-harden — still
reads as a blaster). Regenerate one grid: `node genquestitems.js gen --only=N`
then `proc`.

---

## 3. Static 3D props — `QUEST_PROPS` (8)

**Pipeline:** `quest_props.json` seeds → `questpropseeds.sh` (gpt-image-1 single
object, white bg) → review `work/props_contact.png` → `questpropgen.js` (Meshy
image-to-3d lowpoly, **no rigging**, checkpointed) → `genquestprops.js`.

ENV_PROPS schema `{n, cat, tex, q, tris, p, u, dims, solid, notes}` — build like
`getStreetProp()`: decode `p/q` + `u` (loader applies `1-v`), **non-indexed**,
`computeVertexNormals`, NearestFilter map. `solid` → AABB collider from `dims`
(true metres). Front authored toward −x (yaw 0); reposition/animate per quest.

| n | dims (m) | tris | use |
|---|---|---|---|
| trapdoor | 1.2×0.31×1.2 | 1667 | shared: Gains Cave hatch (q7), false-bottom dumpster (q4/q8), roof hatch (q3) |
| manhole_cover | 0.9×0.15×0.9 | 4244 | q5 Race Track Rd → Manhole Room shaft (q10) |
| cage_lift | 1.29×2.4×1.17 | 7444 | q3 board-room lift + shaft down to sub-lake (q10 shared) |
| facility_module | 4.0×3.4×1.75 | 2842 | q10 sub-lake facility interior kit (tile it) |
| arcade_portal | 0.87×2.0×1.11 | 3253 | q6 arcade entry portal / glitch set piece |
| vault_door | 2.59×2.6×1.31 | 5126 | q4 Regions vault door |
| hollow_oak | 3.4×3.5×2.07 | 27622 | q8 Hollow Oak dead-drop; Biscuit sniffs it (q9) |
| seance_table | 2.2×1.34×1.57 | 10597 | q1 murder-mystery dinner set piece |

> `hollow_oak` (27k) and `seance_table` (10.6k) are high-tri (Meshy didn't
> honour the 1200 target without a re-rig on the no-rig path) — fine as one-off
> static set pieces; decimate later if desired.

---

## 4. Dialogue voice pack — `window.QUEST_VOICES` (279 lines)

**Pipeline:** `quest_lines.json` (NPCKEY → category → lines) + `quest_voices.json`
(voice registry) → `questvoicegen.js` (Fish Audio S1 TTS → psxify 8 kHz crunch →
chunk-merged `questvoices1.js`; resumable per line). Full line→beat map:
**`QUESTVOICES.md`**.

Lookup: `QUEST_VOICES[npcKey][category][index]` → data-URL WAV. Play via the game
AudioContext like `playVoice()`. `window.QUEST_VOICE_CHUNKS` = chunk count (1).

- **8 NEW Fish refs** minted for the main new NPCs (VIVIAN, AGATHA, SAL, DESIREE,
  BRICK, WARDEN, CONCIERGE, THORNE).
- Quest **Vlad / Wendell** REUSE the existing VLAD / WENDELL game voices.
- Sharps / Xander / Marcus / Gloria / reskin & ambient NPCs REUSE existing refs.
- **Biscuit** = stylized bark/whimper onomatopoeia (non-verbal), crunched.

Every `(tone)` prefix is an acting note; `psxify.speakable()` strips it before
synthesis. Regenerate: `FISH_API_KEY=… node questvoicegen.js` (delete a
`work/voices/*.wav` to redo one line).

---

## Regeneration quick-reference

```bash
cd tools/quests
OPENAI_API_KEY=… ./questseeds.sh          # char seeds  (review work/chars_contact2.png)
OPENAI_API_KEY=… ./questpropseeds.sh      # prop seeds  (review work/props_contact.png)
OPENAI_API_KEY=… node genquestitems.js    # item icons  (review work/items_contact.png)
MESHY_API_KEY=…  node quest_charwave.js    # chars: gen+rig+skin (resumable)
MESHY_API_KEY=…  node questpropgen.js      # props: gen (resumable)
                 node genquestprops.js     # -> questprops.js
                 node buildquestchars.js   # -> questchars.js (+ reskins)
FISH_API_KEY=…   node questvoicegen.js     # -> questvoices1.js
```

Intermediates live under `tools/quests/work/` (gitignored); waves resume from
what's already there. Contact sheets are the acceptance gates — view them before
trusting a batch.
