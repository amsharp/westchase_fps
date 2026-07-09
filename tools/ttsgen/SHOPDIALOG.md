# SHOPDIALOG — shop-interior dialogue pack (for shop-life integration #65)

Rich, role-based shop dialogue: staff talk consistent with their business,
banter between coworkers, staff↔customer exchanges, product questions, and the
player treated as a customer. **PER-ROLE packs**, not per-character — one voice
covers every staffer of a role, so adding more staff of the same role needs no
new audio.

```
shop_lines.json ──shopvoicegen.js──▶ work/shop/<ROLE>_<cat>_<i>.wav ──▶ shopvoices1.js
   (catalog + _voices)   (Fish TTS → psxify 8kHz)      (state.json resume)   window.SHOP_VOICES
```

Nothing here is wired into game.js/index.html yet — this is data + a hook guide.

## Files

- **`shop_lines.json`** — the catalog. Top-level keys are ROLE packs; each pack
  has role-specific categories, each category an array of lines. `_voices`
  holds the voice assignment (resolved by the generator). Emotion markers
  (`(angry)` etc.) start a line and are documentation only — `psxify.speakable()`
  strips one leading marker before TTS.
- **`shopvoicegen.js`** — generator. `FISH_API_KEY=... node shopvoicegen.js
  [--conc 4] [--only ROLE,ROLE]`. Resumable: crunched WAVs cached in
  `work/shop/`, plus `work/shop/state.json` tracks ok/fail so a killed run
  resumes without re-hitting the API. Delete a `.wav` to force a redo.
- **`shopvoices1.js`** (repo root) — `window.SHOP_VOICES = Object.assign(...)`
  chunk, nested `SHOP_VOICES[ROLE][category][i] = <data-url WAV>`. Chunk 1
  declares `window.SHOP_VOICE_CHUNKS`. Order-independent merge, same pattern as
  `npcvoices*.js`. A 2nd chunk (`shopvoices2.js`) only appears if a chunk would
  exceed ~30MB (currently 1 chunk, 7.7MB).

## Catalog — 271 lines / 13 packs / 49 categories

| Pack | Lines | Categories |
|---|---|---|
| CASHIER | 32 | greet, total, smalltalk, bag, receipt, nextinline, answer |
| STOCKER | 20 | grumble, effort, aisle, restock, quip |
| DELI | 8 | call, suggest |
| BUTCHER | 7 | call, suggest |
| BARISTA | 20 | order, chatter, hiss |
| DUNKIN | 15 | order, chatter, quip |
| SUSHI | 12 | call, phrase (some Japanese) |
| TELLER | 15 | greet, transaction, deadpan |
| DOLLAR | 12 | joke, line |
| MANAGER | 15 | pa, pep, escalate |
| STAFF | 40 | chatQ (20), chatA (20) — coworker banter turn-pairs |
| CUSTOMER | 50 | ask (20), checkout (12), excuse (8), kids (6), pricecheck (4) |
| PLAYER | 25 | publix_greet, starbucks_greet, dunkin_greet, sushi_greet, bank_greet, dollar_greet, help, found, loiter, noloiter |

## Voices — 15 refs (5 NEW Fish, 10 REUSED)

Per-role assignment lives in `shop_lines.json._voices`; NEW refs also pinned in
`voices.json` (`SHOP_*`). Resolution: `{ref}` = one voice for the whole pack;
`{refs:[…]}` = round-robin by line index; `{byCat:{cat:{ref|refs}}}` = per
category.

| Pack | Voice | New/Reuse |
|---|---|---|
| CASHIER | Walmart cashier (`ef92…`) — friendly female | **NEW** |
| BUTCHER | Butcher Wally (`8699…`) — deep male | **NEW** |
| BARISTA | Friendly Coffee Enthusiast (`ac97…`) — young female | **NEW** |
| TELLER | professional woman (`0267…`) — deadpan female | **NEW** |
| MANAGER | Manager (`ba24…`) — authoritative male | **NEW** |
| SUSHI | RIKO (`34ae…`) Japanese man | reuse (npc_voices) |
| STOCKER | ped_m (`95ba…`) relaxed young man | reuse |
| DELI | DENISE (`3e5c…`) sassy middle-aged female | reuse |
| DUNKIN | TINA (`c65c…`) bright Filipina | reuse |
| DOLLAR | ped_f (`ff97…`) casual young woman | reuse |
| STAFF chatQ | round-robin cashier / stocker / dollar / deli | reuse |
| STAFF chatA | round-robin manager / butcher / barista / dunkin | reuse (Q≠A so a pair sounds like two people) |
| CUSTOMER | round-robin ped_f, ped_old, GLORIA, SKYLER, BRAD, KEISHA | reuse (no new refs) |
| PLAYER | per-venue: greet uses that venue's staff voice; loiter/noloiter = manager | reuse of the pack voices |

Reused refs sometimes double up (e.g. ped_m = STOCKER and appears nowhere in
CUSTOMER to avoid a same-scene clash; ped_f = DOLLAR + CUSTOMER). Accepted
tradeoff of the reuse-voices directive.

## Integrator guide — where each pack triggers (#65)

Play a line the same way as NPC voices: pick `SHOP_VOICES[ROLE][cat]`, choose a
random index, decode+play through the game AudioContext (mirror `playNpcVoice` /
`playVoice`; add a `playShopVoice(role, cat, gain, cooldownSec)` helper that
falls back silently when `typeof SHOP_VOICES === 'undefined'` or the role/cat is
missing — chunks may not be loaded). The nested index lines up with the JSON so
subtitles can read from `shop_lines.json` if desired.

Map each staffer's `role`/`venue`/`job` (from STAFF.md / `staffchars.js`) to a
pack:

- **Cashier** (`job:'cashier'`): on player approach to a lane → `CASHIER.greet`.
  On a purchase/checkout event → `CASHIER.total` then `CASHIER.bag` then
  `CASHIER.receipt`. Idle behind register → `CASHIER.smalltalk`. When a customer
  NPC finishes → `CASHIER.nextinline`. Answering a `CUSTOMER.ask` → `CASHIER.answer`.
- **Stocker** (`job:'stocker'`/`produce`): shelf loop tick → `STOCKER.grumble` /
  `STOCKER.restock`; box-lift animation → `STOCKER.effort`; player/NPC asks
  directions → `STOCKER.aisle`; idle → `STOCKER.quip`.
- **Bagger** (`job:'bagger'`): no own pack — use `CASHIER.bag`/`smalltalk` and
  `STAFF` banter (baggers are the natural chatQ/chatA partners at a lane).
- **Deli / Butcher** (`job:'deli'`/`'butcher'`): ticket/number system → `.call`;
  player approaches counter → `.suggest`.
- **Barista** (Starbucks): drink-ready event → `BARISTA.order`; taking an order /
  idle → `BARISTA.chatter`; steam/grind animation → `BARISTA.hiss`.
- **Dunkin crew**: order-ready → `DUNKIN.order`; idle/greet → `DUNKIN.chatter`;
  ambient → `DUNKIN.quip`.
- **Sushi chef**: player enters/approaches bar → `SUSHI.call`; prep loop →
  `SUSHI.phrase`.
- **Teller** (Regions): window free → `TELLER.greet`; transaction step →
  `TELLER.transaction`; ambient deadpan → `TELLER.deadpan`.
- **Dollar clerk**: idle/restock → `DOLLAR.line`; price/product remark →
  `DOLLAR.joke`.
- **Manager**: periodic timer (every ~30–60s on the floor) → `MANAGER.pa`
  (store-wide, ignore distance falloff so it reads as a PA); staff nearby →
  `MANAGER.pep`; player misbehaves / post-robbery-attempt → `MANAGER.escalate`.

### Staff↔staff banter (STAFF.chatQ / chatA)

Same mechanism as the sidewalk conversation system: when two staff NPCs are
near each other and idle, pick a shared index `k`, have staffer A play
`SHOP_VOICES.STAFF.chatQ[k]`, then after it finishes staffer B plays
`SHOP_VOICES.STAFF.chatA[k]`. chatQ and chatA are voiced by DIFFERENT role
voices per index, so the exchange sounds like two coworkers. (Indices are
paired but any A reads after any Q if you prefer to shuffle.)

### Customer NPCs (CUSTOMER pack)

Ambient shoppers wandering aisles: `CUSTOMER.ask` (product questions), a staffer
answers with `CASHIER.answer` / `STOCKER.aisle` / `DELI.suggest`; at a register
NPC → `CUSTOMER.checkout` (cashier replies with `CASHIER.total`);
`CUSTOMER.excuse` when a customer NPC crosses the player/another NPC in an aisle;
`CUSTOMER.kids` for child NPCs near candy/cereal; `CUSTOMER.pricecheck` triggers
`MANAGER.pa` (price-check announcement) or `CASHIER.answer`.

### Player-as-customer (PLAYER pack)

On the player entering a venue interior, the nearest staffer plays the matching
`PLAYER.<venue>_greet` (publix / starbucks / dunkin / sushi / bank / dollar).
While the player lingers at a counter → `PLAYER.help`; at checkout →
`PLAYER.found`. Standing idle too long → `PLAYER.loiter`. After a failed/aborted
robbery (reuse the existing rob hooks) → `PLAYER.noloiter` (angry, manager voice)
— pairs naturally with `MANAGER.escalate` and the interior-cop spawn.

## Regenerating / extending

- Add lines to `shop_lines.json` under the right ROLE/category (keep < ~3s).
- New role or new voice: add a `_voices[ROLE]` entry (and pin any NEW ref in
  `voices.json` with a `findvoice.js` search first), then rerun
  `shopvoicegen.js` — only missing WAVs are synthesized.
- `--only ROLE` regenerates one pack. `SHOPVOICESDONE` prints on success with
  per-chunk sizes and a failure list.
- Never call Fish from the game itself; audio ships as the static `shopvoices*.js`.
