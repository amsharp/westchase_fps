# WESTCHASE FPS — QUEST DESIGN (v1)

Ten RuneScape-style quests (quest log, one active quest, minimap waypoints)
for the Westchase crime-sim. Each is grounded in the real map + the existing
gameplay loop (cash, guns, robbery, cops, dumpster-diving, the bag) and steals
DNA from beloved Oblivion quests without copying names. Humor, surprise, heart.
Kids can appear but are never harmed.

**Design contracts assumed** (for the code agents, not built here):
- `questLog` state: array of `{id, stage, done[]}`; one `activeQuest`.
- Active quest paints an amber diamond on the minimap at the current beat's
  waypoint; beats advance on their objective type.
- Objective types: `talk / reach / fetch / interact / kill / follow / timed`.
- Coordinates are `(x,z)` in world space, origin = main intersection, matching
  the landmark anchors in CLAUDE.md (RaceTrac `gasRob 60,42`; Dunkin `-116,31`;
  Starbucks `-116,-30`; Publix spawn `-72,-97`, dealer `-72,-106`;
  lake `-255,-150`; red-roof house `-278,-78`; townhouses `-210,-215/-245`).
  New POIs sit near these; treat coords as ~±10 authoring hints.

---

## THE OVERARCHING THREAD — "THE COUNTRYWAY PACT"

*Old-timers at the Dunkin swear that folks who get seriously rich start seeing
lights over the lake.* They're right, and it isn't luck.

Decades ago something **fell out of the sky and sank into the lake**. It did not
die. A handful of residents found it, learned it would quietly *give* — perfect
weather, perfect lawns, a town that stays pleasant and prosperous and **very,
very watched** — in exchange for being fed and kept secret. They formed the
**Countryway Association**: on paper an HOA that fusses about mailbox colors, in
truth a small board that has run Westchase for two generations from the top
floor of the **5-story red-roof house**. Its chairman is **AUGUSTUS THORNE**.
Its enforcement arm is a "problem-solving" service called **The Cleaners**. Its
disavowed street muscle skims newcomers via a roadside-lure crew (the Siren).
The cameras Wendell swears he sees are real. The thing under the lake is why
getting rich summons lights — the Pact notices new money and comes to *assess*.

Every quest drops one tile of this mosaic. By quest 10 the player holds enough
keys, records, and access to descend beneath the fountain and decide what
Westchase becomes: **expose it, burn it, or inherit the chair.**

Threaded payoffs (who/what recurs):
- **DON SHARP** — a striving dad, mid-tier Pact fixer in over his head; appears
  in Q2 (as a "watched" neighbor), Q9 (his youngest's dog), and Q10 (defects,
  helps you in). His sons ALEX/DERIK/DYLAN and DERIK's friend XANDER recur.
- **CHAIRMAN THORNE** — glimpsed in Q1 (a party guest), named in Q3 (the red
  house is his), the vault records in Q4 bear his signature, and he's the Q10
  antagonist.
- **THE CLEANERS** — the note that recruits you in Q8 is signed the same way as
  the "eviction notices" found in Q1 and Q3. The Concierge who runs them sits on
  the board.
- **THE LAKE / THE UFO** — Biscuit the dog digs a fragment near the shore in Q9;
  Wendell photographs "lights over the lake" in Q2; the arcade world in Q6 is a
  *memory the thing stored*; Q10 opens the sub-lake facility and reuses the
  existing UFO/alien asset as the reveal.
- **Secret POIs** literally connect the town underground: the Gains Cave cellar
  (Q7), the manhole room (Q5), the storm drain (Q9) and the red-house lift (Q3)
  all feed the same sub-lake tunnel used in Q10.

---

## SECRET POI REGISTER (assigned + invented)

| POI | Where | Discover | First used | Later reuse |
|-----|-------|----------|-----------|-------------|
| **Gains Cave** (underground cellar behind a building) | trapdoor behind the SW strip mall, behind Dunkin `-132,44` | Vlad shows you (Q7) | Q7 | Q10 tunnel node |
| **Hollow Oak** (hole in a tree) | lone oak in the SE preserve `165,120` | Cleaners note points to it (Q8); Biscuit sniffs it (Q9) | Q8 dead-drop | Q9, Q10 clue |
| **The Manhole Room** (secret room in a manhole) | center-lane manhole on Race Track Rd `20,-4` | Siren victim crawled in (Q5) | Q5 gang stash | Q10 access shaft |
| **Storm Drain** (invented) | box culvert at the lake's SW shore `-238,-176` | dog goes in after his ball (Q9) | Q9 | Q10 wade-in approach |
| **Roof Stash** (invented) | ladder to the SW strip-mall roof `-150,20`; widow's walk atop red house `-278,-70` | EMF meter reveals hatch (Q3); heist lookout (Q4) | Q3 | Q4 sniper/lookout perch |
| **False-Bottom Dumpster** (invented) | Publix back dumpster `-40,-70` (the dumpster-dive litter spot) | dive it in Q8; Sal's cache in Q4 | Q4 tool cache | Q8 Cleaners drop |
| **The Board Room** (invented) | hidden top floor, red-roof house `-278,-78` | Spirit Lantern opens the sealed door (Q3) | Q3 climax | Q10 confrontation |
| **The Sub-Lake Facility** (invented) | beneath the fountain, `-255,-150`, below WATER_Y | descend the lift/shaft with assembled keys (Q10) | Q10 finale | — |

---
---

# QUEST 1 — "A NIGHT TO DISMEMBER"
*(Oblivion DNA: **Whodunit?** — sealed party, guests dying one by one, a hidden
killer. Flipped so the player is the **investigator**, not the assassin.)*

- **id:** `q1_dismember`
- **GIVER / DISCOVERY:** **MISS VIVIAN CRESTWOOD**, hostess of a murder-mystery
  dinner party at a big Westchase townhouse near the lake `-200,-215`. Overheard
  first: pass the lit house at night (after DAY_LEN dusk) and a scream + shatter
  of glass triggers the invite. Vivian meets you at the door: *"Oh thank god, a
  new face. We were playing a little murder-mystery game and now — now it isn't a
  game anymore. Nobody leaves. Nobody. Will you help me before we're all…"*
- **SYNOPSIS:** Seven guests, one hostess, a locked front door, and the lights
  keep going out. Each blackout claims a guest. The player must gather physical
  clues room-by-room, interview survivors before the next blackout, and name the
  killer at the reveal. The killer is one of the guests — a **Cleaner** planted
  to silence a guest who "knew about the board." First seeding of the Pact.

**BEATS**
1. **[talk]** *Front hall, `-200,-215`.* Vivian briefs you; hands you the guest
   list. Ambient guests bicker. One guest is quietly **CHAIRMAN THORNE** (cameo,
   unnamed here) who "steps out to take a call" and vanishes for the night.
2. **[interact]** *Dining room.* Lights cut (scripted **timed blackout**, ~6 s
   of dark + a shriek). When they return, guest **GLORIA** (existing customer
   cast) is slumped over the soup. Search the body/room → find **Clue: Bitter
   Almond Vial** and a torn **Eviction Notice** (same seal as Q3/Q8).
3. **[fetch]** *Kitchen + study + upstairs (3 waypoints).* Collect 3 clues:
   the caterer's gloves, a wet umbrella (someone went outside — but the door's
   locked…), a scratched-out name on the seating chart. **Container trap:** the
   liquor cabinet is rigged — opening it without the Detective's Loupe equipped
   snaps a hidden mousetrap-latch and drops you to 1 blackout of "who did that?!"
   suspicion (a red herring guest aggros verbally).
4. **[follow]** *Second blackout.* You must **follow** the caterer **CHET**
   (reskin) in the dark using footstep audio; he slips to the back door and
   *unlocks it with a key only staff have* — proving the "sealed house" is a lie.
5. **[interact]** *Confront timing.* Present clues at the fireplace reveal. Pick
   the killer from a 3-suspect wheel. Correct = Chet the caterer (planted
   Cleaner). **Ambush surprise:** naming him correctly makes Chet **drop the act
   and draw a blade** — a short melee/gun fight, proximity-aggro. Naming wrong =
   another guest dies and you get one retry.
6. **[talk]** *Aftermath.* Vivian, shaken: *"He kept muttering about a 'board'
   and a 'lease.' Poor Gloria was asking questions she shouldn't have."* She
   gifts you the loupe. Thorne is already gone. Seed planted.

**QUEST NPCs**
- **MISS VIVIAN CRESTWOOD** — *look:* silver bob, emerald evening gown, pearls;
  *voice:* warm theatrical grande-dame, frayed by fear. **NEW mesh.**
- **CHET the caterer** — *look:* white service jacket, slick hair, too-calm;
  *voice:* oily-polite → cold when unmasked. **RESKIN** (staff/waiter repaint).
- **GLORIA (the victim)** — existing customer NPC; dies in beat 2. **EXISTING.**

**REWARD:** **Detective's Loupe** — *CAPABILITY:* equip to highlight
interactables/clues with an amber outline and **reveal hidden container
contents** (shows if a container is a trap/false-bottom before you open). Turns
every later quest's searching legible. *Icon: brass magnifier with a cracked
lens.*

**SECRET POI:** Introduces the **Eviction Notice** motif that later leads to the
False-Bottom Dumpster (Q8) and names the Board Room (Q3). No POI entered yet —
this is the thread's first tile.

**CONNECTIONS:** Thorne cameo (→Q3/Q10); Cleaner + eviction-seal (→Q8); Gloria
"asked about the board" (the core mystery). The Loupe is used to safely open the
trapped/false containers in Q4 and Q8.

---
---

# QUEST 2 — "SOMEONE'S WATCHING"
*(Oblivion DNA: **Paranoia** — a resident sure he's being watched; you tail
people at set hours; tragic-comic, then the twist that he's **right**.)*

- **id:** `q2_watching`
- **GIVER / DISCOVERY:** **WENDELL PIKE**, twitchy man pacing his front lawn in
  the townhouse row `-210,-245`, peering through binoculars at his neighbors.
  Approach and he yanks you behind a hedge: *"Don't look up. Don't LOOK up.
  They put a camera in the birdhouse. My neighbor waters his lawn at 3 and 9 —
  who does that? WHO DOES THAT."*
- **SYNOPSIS:** Wendell wants you to prove his neighbors are watching him. It
  plays as comedy — the "spy" is a meter reader, the "signal device" is a garage
  clicker — until the last tail reveals a **real surveillance van** and **actual
  lights over the lake**, and Wendell, vindicated and terrified, gives you the
  scanner that lets you hear how deep it goes.
- **TIME-OF-DAY hook:** two beats are gated to `setClock` windows (dusk / late
  night) — uses the day/night cycle as a mechanic, like Paranoia's timed tails.

**BEATS**
1. **[talk]** *Wendell's lawn `-210,-245`.* He assigns three neighbors to watch.
   Comedy lines: *"The one with the flamingos. Flamingos are ANTENNAS, friend."*
2. **[follow]** *Daytime tail #1.* Follow a neighbor to the pharmacy `NE`.
   Payoff: he's buying antacids. Wendell over "comms": *"…acid. For melting
   evidence. Write it down."* (It's Tums.)
3. **[follow]** *Dusk tail #2 (timed to dusk).* Tail **DON SHARP** (existing) to
   a payphone. Don makes a nervous call about "the assessment." **Fake-out
   friendly:** if you get too close Don spins, sees you, and *acts* threatening —
   *"You following me, pal?"* — a tense non-combat bark, then he hurries off.
   First real crack: Don is *actually* mixed up in something.
4. **[interact]** *Wendell's "evidence wall."* Back home, use the Loupe (Q1) to
   connect photos with red string. Reveals a pattern: every "watcher" route
   passes the **birdhouse cam** — which turns out to be real.
5. **[reach/timed]** *Late-night stakeout at the lake `-255,-150`.* Wendell's
   final hunch. **Trigger/ambush:** a black **surveillance van** proximity-spawns
   on the shore; approach and two **"utility workers"** (reskin Cleaners) turn
   hostile and give chase — first genuine danger. And overhead: **lights over the
   lake** (scripted glow; ties the UFO rumor). Photograph it (interact) and run.
6. **[talk]** *Return.* Wendell, wrecked and validated: *"I'm not crazy. I'm just
   early. Take this — I built it from the birdhouse cam. Now YOU can hear them
   too."* Then he tapes his windows and won't come out.

**QUEST NPCs**
- **WENDELL PIKE** — *look:* wiry, robe over track pants, tinfoil-lined ballcap,
  binoculars; *voice:* rapid, whispered, tragically sincere. **NEW mesh.**
- **DON SHARP** — the striving dad, first hint he's compromised. **EXISTING.**
- **"THE METER READER" (watcher)** — *look:* utility vest, clipboard, dead-eyed;
  doubles as reskin Cleaner in beat 5. **RESKIN.**

**REWARD:** **Police Scanner** — *CAPABILITY:* a passive earpiece that plays
**cop dispatch chatter** (existing cop bark VO reused) and **marks the nearest
patrol + the next spawn point on the minimap** while you have a wanted level.
Turns the wanted system from surprise into strategy. *Icon: cracked handheld
radio with a bent antenna.*

**SECRET POI:** none entered, but the **lake lights** + **surveillance van**
foreshadow the Storm Drain (Q9) and Sub-Lake Facility (Q10).

**CONNECTIONS:** Don Sharp's "assessment" call → Q9/Q10 defection. Reskin
Cleaners → Q8. Lake lights → Q10. The scanner makes the Cleaners' stealth
takedowns (Q8) and the heist getaway (Q4) far more survivable.

---
---

# QUEST 3 — "WHERE THE RED HOUSE WEEPS"
*(Oblivion DNA: **Where Spirits Have Lease** — a haunted house with a dark
history, revealed room by room, floor by floor. The 5-story red-roof house was
built for this.)*

- **id:** `q3_redhouse`
- **GIVER / DISCOVERY:** **MRS. AGATHA HOLLOWAY**, the house's ancient caretaker,
  sweeping the porch of the red-roof house `-278,-78` at night only. *"Five
  floors. Five families. Not one of them left whole. He says it's just settling.
  Houses don't weep, child. People do — and this house remembers every one."*
  She's too frail to climb; she needs you to "put the house to rest."
- **SYNOPSIS:** Ascend the tallest building in town floor by floor. Each floor
  is a decade and a family that the Countryway Association "assessed" and
  removed. Ghosts (scripted apparitions) replay their last night. The climb ends
  at a **sealed door on the top floor** the Spirit Lantern reveals as the hidden
  **Board Room** — Thorne's. Agatha's own son was the last "eviction."
- **VERTICALITY:** uses the red house's unique height; the **Roof Stash / widow's
  walk** is reachable near the top (ties Q4 lookout).

**BEATS**
1. **[talk]** *Porch `-278,-78`, night.* Agatha gives you the **cold brass
   lantern** (unlit) and warns: *"Light it only when the air goes still. The
   dark up there isn't empty."*
2. **[interact]** *Floor 1 — the parlor.* Furniture sheeted. Loupe (Q1) reveals a
   bricked-up fireplace; interact to hear the first family's argument echo. Find
   **Clue: a 1980s "Association Welcome Packet"** with an eviction seal.
3. **[interact]** *Floor 2 — nursery (kid-safe).* A **child's ghost** plays
   hide-and-seek; you must find him three times (interact on giggles) — gentle,
   never in harm. Reward: he "gives" you the **matchbook** that lights the
   lantern. Reskin pale-child apparition. Heart beat.
4. **[reach]** *Floor 3 — flooded floor (a burst pipe / mirror of the lake).*
   **Trigger:** stepping on the waterlogged rug drops the temperature and the
   lantern must be lit; unlit = a **poltergeist ambush** (objects hurl, minor
   damage, scripted). Lit = the water parts to a path.
5. **[fetch]** *Floor 4 — the study.* Read the caretaker's ledger: names of every
   removed family and the words *"assessed by the board — reclaimed by the
   lake."* Find **Clue: brass elevator key.** **Container trap:** the wall safe
   is Cleaner-rigged (Loupe warns you); disarm or take a jolt.
6. **[interact]** *Floor 5 — the sealed door = the BOARD ROOM.* Hold the lit
   Spirit Lantern to the door; it reveals a hidden panel and a small **cage lift
   / dumbwaiter shaft** going *down* far past the ground floor (→ sub-lake, Q10).
   The room is empty but for a long table and five chairs and Thorne's nameplate.
   **Ambush:** as you photograph it, a **Cleaner** apparition-or-real steps from
   the shadow — is it a ghost or a guard? (deliberately ambiguous fight).
7. **[talk]** *Return to Agatha.* She's calmer, fading: *"My boy asked about the
   lake, same as your friend Gloria. Now you know where they keep their table.
   Finish it, when you're ready."* Grants the lantern permanently.

**QUEST NPCs**
- **MRS. AGATHA HOLLOWAY** — *look:* stooped, black shawl, milky eye, lantern;
  *voice:* grave, gentle, sorrowful. **NEW mesh.**
- **THE GRAY BOY (nursery ghost)** — *look:* desaturated child avatar, faint
  glow; *voice:* soft child giggles (reuse kid VO, pitched). **RESKIN** (kid
  cast, ghost material). Kid-safe, cannot be harmed.
- **THE HISTORIAN (records clerk)** — existing pharmacy/records staff you can
  consult mid-quest for backstory. **EXISTING.**

**REWARD:** **Spirit Lantern** — *CAPABILITY:* a held light that **sees in the
dark, reveals hidden doors/panels and safe-vs-trapped containers**, and
**stuns/parts scripted apparitions**. Unlocks the Board Room lift and any
"sealed" door later (Q10). *Icon: green-flamed brass lantern.*

**SECRET POI:** **The Board Room** (top floor) + the down-shaft (→ Q10). **Roof
Stash / widow's walk** becomes reachable during the climb (→ Q4 lookout perch).

**CONNECTIONS:** Names the board + Thorne; "reclaimed by the lake" is the Q10
thesis; Agatha's son ↔ Gloria (Q1) ↔ Don's fear (Q2). The lantern is a required
key for Q10's descent.

---
---

# QUEST 4 — "THE COUNTRYWAY JOB"
*(Oblivion DNA: **The Ultimate Heist** — a meticulous multi-stage bank job:
casing, keys, an inside man, the vault.)*

- **id:** `q4_heist`
- **GIVER / DISCOVERY:** **SAL "THE MAP" MARINO**, a retired heist planner
  nursing a decaf at Starbucks `-116,-30` who never sits with his back to the
  door. Talk to him after you own at least one gun. *"Kid, I planned jobs before
  your daddy learned to lie. Regions on the corner? I know a way in. But I'm too
  old to run. You run. I'll draw the map."* His real motive: the vault holds
  **Pact records** he wants erased before they name him.
- **SYNOPSIS:** A four-phase bank job on **Regions Bank (NE)**: case the floor,
  gather three keys via three mini-jobs, turn the inside man, then crack the
  vault during a timed window — all while the wanted system breathes down your
  neck. The score isn't just cash; the deposit boxes hold **the Association's
  ledger and a strange etched key** (→Q10).

**BEATS**
1. **[interact]** *Casing — Regions lobby, NE corner.* Enter unarmed. Use the
   Loupe to mark: camera arcs, the teller cage, the manager's office, the vault
   timer. No crime yet. Sal over the scanner (Q2): *"Eyes, not hands. Count the
   cameras. Love the cameras."*
2. **[fetch]** *Three keys, three mini-jobs (3 waypoints):*
   - **Guard's key** — pickpocket/knock the off-duty guard drinking at Dunkin.
   - **Manager's key** — the **False-Bottom Dumpster** behind Publix `-40,-70`
     hides Sal's stashed toolkit; **container trap** (Loupe-flagged) protects it.
   - **Timer key** — from the **Roof Stash** (Q3 widow's walk / strip-mall roof),
     a lookout perch to photograph the vault-timer schedule.
3. **[talk]** *Turn the inside man — **MARCUS**, Regions teller (existing).* He's
   drowning in debt to the dealer. Convince/pay him. *"One withdrawal slip left
   blank, one back door left unlatched. That's all. Then I never saw you."*
   **Fake-out:** press him wrong and he hits the silent alarm early (fail-forward
   into a hot getaway).
4. **[timed]** *The vault window.* With three keys + Marcus's unlatched door,
   crack the vault during the shift change. **Lockpick Set** minigame on the
   cages/boxes. **Ambush:** the timer trips a **proximity spawn of two Cleaners**
   (not cops — quiet, lethal) who guard the *board box* specifically. Take the
   cash boxes freely; the **etched key + ledger** box is the guarded one.
5. **[interact/kill/flee]** *The score.* Grab cash (real payout to your wallet)
   AND the **Association Ledger** + **Etched Lake Key**. Alarms blow → instant
   wanted heat; the Police Scanner (Q2) shows the net closing. Escape.
6. **[talk]** *Payoff — meet Sal.* He burns his own name from the ledger, lets
   you keep the rest: *"The etched one? That don't open a box. That opens a
   door. Under the water. Don't ask me how I know."*

**QUEST NPCs**
- **SAL "THE MAP" MARINO** — *look:* old sharp-dressed man, fedora, cane, ring;
  *voice:* gravelly wiseguy raconteur. **NEW mesh.**
- **MARCUS (inside man)** — Regions teller, existing shop-staff cast; debt
  subplot ties the dealer. **EXISTING.**
- **DUKE the wheelman** — *look:* jumpsuit, aviators, gum; optional getaway
  driver who waits idling. *voice:* laconic gearhead. **RESKIN** (existing
  driver/ped repaint).

**REWARD:** **Lockpick Set** — *CAPABILITY:* silently open **locked containers,
doors, ATMs and lot cars** without gunfire (no auto-2-stars from ATMs; skip the
jimmy timer on locked cars). The core "enabler" tool; every secret-room door and
stash in later quests respects it. *Icon: leather roll of picks + tension wrench.*

**SECRET POI:** **False-Bottom Dumpster** (tool cache) + **Roof Stash** (lookout)
both used here. Vault yields the **Etched Lake Key** — a hard requirement for
Q10.

**CONNECTIONS:** Marcus↔dealer debt (existing dealer cast); Ledger names Thorne
& the board (→Q10); Etched Lake Key "opens a door under the water" (→Q10). The
Scanner (Q2) and Loupe (Q1) are used mechanically here.

---
---

# QUEST 5 — "ROADSIDE ASSISTANCE"
*(Oblivion DNA: **The Siren's Deception** — a crew luring victims with a ruse.
Here: a "broken-down car" bait on Race Track Rd + a Siren at the lakeside.)*

- **id:** `q5_siren`
- **GIVER / DISCOVERY:** overheard, then requested. A frantic pedestrian,
  **the worried spouse** (existing ped), flags you near the RaceTrac `60,42`:
  *"My husband stopped to help a broken-down car on Race Track Road last night
  and never came home. Cops won't look. Please."* The bait works because good
  people stop to help.
- **SYNOPSIS:** A crew fronted by **DESIREE "THE SIREN"** stages breakdowns on
  the diagonal stretch of Race Track Rd; Good Samaritans who pull over get robbed
  (and worse). The player goes undercover as a mark, gets jumped, escapes into
  the crew's **Manhole Room** stash under the road, and dismantles them — only to
  learn the crew is disavowed **Pact street-muscle** skimming newcomers before
  the board "assesses" them.
- **CRIME-SIM fit:** uses driving/carjack, the wanted system, and the road.

**BEATS**
1. **[talk]** *RaceTrac `60,42`.* Take the plea; get a description of the bait
   car (a specific broken-down sedan).
2. **[reach]** *Find the bait — Race Track Rd diagonal `20,-4`.* A car sits with
   hazards on, hood up, **DESIREE** waving for help. Approach on foot to "help."
3. **[interact/ambush]** *The lure springs.* The moment you reach the hood,
   **BRICK** and two goons **proximity-spawn** from the treeline and the trunk —
   classic Siren ambush. You're robbed of some cash (or fight free). Survive/flee.
4. **[interact]** *The Manhole Room `20,-4`.* Escaping, you spot them vanish into
   a **manhole in the center lane**. Pry it (Lockpick, Q4) and drop into the
   **secret room under the road** — their stash: stolen wallets, the missing
   husband's phone, and a corkboard of "marks" that includes **your own name**
   and a note: *"do not touch — flagged for the board."*
5. **[kill/interact]** *Bust the crew.* Confront Desiree + Brick in the stash.
   **Fake-out friendly:** Desiree first plays victim (*"They MAKE me do it —"*)
   then draws when you turn your back. Fight or subdue. Free the husband (found
   tied in the culvert — kid-safe, comic-grim not gory).
6. **[talk]** *Return the husband to his spouse.* Reward handed over. Desiree, if
   spared, mutters the thread: *"You think we're the bad guys? We're the ones
   they let you catch. The real crew doesn't fix cars. They fix people."*

**QUEST NPCs**
- **DESIREE "THE SIREN"** — *look:* red dress, hazard triangle, sweet smile,
  hidden blade; *voice:* honeyed → venomous. **NEW mesh.**
- **BRICK** — *look:* huge, tank top, tire iron, neck tattoo; *voice:* slow,
  menacing, few words. **NEW mesh.**
- **THE RESCUED HUSBAND** — existing ped; grateful, rattled. **EXISTING.**

**REWARD:** **The Bait Car keys + Slim Jim** — *CAPABILITY:* keep Desiree's
tuned muscle car (unique reskinned vehicle — faster, louder) AND gain
**instant hotwire** (skip the break-in jimmy timer on any locked car). *Icon:
a slim-jim tool crossed with a heart-charm keyfob.*

**SECRET POI:** **The Manhole Room** (gang stash) — later reused as a Q10 access
shaft into the sub-lake tunnel. The corkboard names "the board" (thread).

**CONNECTIONS:** "flagged for the board" ↔ Pact; disavowed muscle ↔ The Cleaners
(Q8, the *real* crew); the manhole → Q10. The bait car is a great getaway ride
for the Q4 heist if done first (soft ordering).

---
---

# QUEST 6 — "INSERT COIN TO CONTINUE"
*(Oblivion DNA: **A Brush with Death** — pulled into another 'world.' PSX twist:
a **cursed arcade cabinet / game cartridge**. Uses Xander's gaming angle.)*

- **id:** `q6_arcade`
- **GIVER / DISCOVERY:** **XANDER** (existing — Derik's gamer friend) at the
  arcade cabinets in the strip-mall plaza. *"Bro. BRO. I found a cartridge in the
  claw machine — no label, just says WESTCHASE on it. Derik plugged it in and
  now he won't wake up. His body's here but he's… IN there. You game? You gotta
  go in and get him."*
- **SYNOPSIS:** The player is pulled into an **8-bit/low-poly glitch dimension** —
  a corrupted memory of Westchase rendered wrong (the town's "backup," stored by
  the thing under the lake). Navigate three warped levels, beat the **Arcade
  Warden** (the guardian avatar), and pull **DERIK** out. The reveal: the game
  isn't a game — it's *what the lake keeps*, and it recognizes the player.
- **PSX FLAVOR:** leans fully into the retro render — a deliberately
  low-poly/vaporwave version of the real map.

**BEATS**
1. **[talk]** *Arcade plaza.* Xander explains; Derik's body slumps at the
   cabinet (kid-safe: he's a teen, unharmed, "asleep"). Insert the cartridge.
2. **[reach]** *Level 1 — "Wrong Westchase."* The map, but flat-shaded, foggy,
   NPCs frozen mid-loop repeating one word. Reach the glitching Publix.
   **Trigger:** touching a frozen NPC makes them **aggro as a "corrupted"
   enemy** (proximity + touch trap).
3. **[interact]** *Level 2 — "The Repeating Aisle."* A puzzle floor that loops
   until you interact with objects in the order of a clue from the real world
   (uses the Loupe). Escape the loop.
4. **[kill]** *Level 3 — Boss: THE ARCADE WARDEN.* A giant low-poly guardian
   made of every enemy you've fought, guarding a pixel cage holding Derik.
   Phase fight; the Warden speaks in the **thing's** voice: *"YOU ARE NOT
   ASSESSED. WHY DO YOU PERSIST."* First direct contact with the lake entity.
5. **[interact]** *Free Derik.* Break the cage. Derik: *"There were… doors. Under
   the water. It kept showing me the water."* Grab the dropped **Neon Blaster**.
6. **[talk]** *Back in the real world.* Derik wakes; Xander is stunned. The
   cartridge crumbles to sand — *lake sand.* Xander: *"...we are NOT telling my
   mom." Ties Derik (Sharp family) to the lake vision.*

**QUEST NPCs**
- **XANDER** — laid-back gamer, giver; existing preset cast + voice. **EXISTING.**
- **DERIK SHARP** — trapped teen, Don's son; existing/named Sharp cast.
  **EXISTING** (reskin "asleep" state if needed).
- **THE ARCADE WARDEN** — *look:* towering flat-shaded amalgam guardian, glitch
  textures, single glowing eye; *voice:* distorted, layered, the lake entity.
  **NEW mesh.**

**REWARD:** **Neon Blaster** (unique weapon skin over the pistol/ray-gun) +
*CAPABILITY:* **"8-Bit Reflexes"** — aiming down sights briefly slows time
(bullet-time) with a short cooldown. *Icon: a wireframe/neon raygun.*

**SECRET POI:** none physical, but the arcade world **shows the sub-lake doors**
(Q10 foreshadow) and reveals the entity is a *memory-keeper.* The cartridge =
lake sand ties it materially.

**CONNECTIONS:** Direct line to the lake entity (→Q10); Sharp-family thread
(Derik/Xander/Don); the "doors under the water" refrain matches Sal's line (Q4)
and Agatha's ledger (Q3). 8-Bit Reflexes trivializes the Q10 boss if earned.

---
---

# QUEST 7 — "LEG DAY"
*(Oblivion DNA: **Sheogorath-style absurdism** — a prankster giver, escalating
silly tasks. VLAD the squat-lord, lakeside fitness prophet.)*

- **id:** `q7_legday`
- **GIVER / DISCOVERY:** **VLAD**, an enormous, shirtless, deadly-serious fitness
  guru doing endless squats by the lakeside picnic/BBQ spot `-240,-140`. *"You.
  Skinny. The lake spoke to me during my four-hundredth squat. It said send me a
  CHAMPION. Are you the champion? PROVE the legs. Do NOT skip the legs."*
- **SYNOPSIS:** A comedic chain of escalating dares — steal a rival's protein,
  "carry" a boulder (a gnome), sprint a delivery, win a squat-off — that seem
  random but keep leading you to Vlad's **Gains Cave** (the cellar behind the
  strip mall), which he thinks is a "sacred pain temple" but is actually a
  **Pact tunnel node.** Vlad is a pure red herring who accidentally holds a real
  key: a tunnel that connects to the sub-lake (Q10).
- **TONE:** heart + humor; Vlad is dumb-sweet, never a villain, weirdly wise.

**BEATS**
1. **[talk]** *Lakeside `-240,-140`.* Vlad's challenge. Comedy oath: *"Repeat:
   I will not skip. I will not skip. Good. The lake is proud."*
2. **[fetch]** *"Steal the cardio-boy's protein."* Swipe a shaker from **CHAD**
   (reskin), Vlad's smoothie rival at Starbucks. **Fake-out:** Chad chases you,
   comically slow, "cardio betrays him," gives up wheezing.
3. **[fetch/timed]** *"Carry the boulder."* The "boulder" is a **garden gnome**
   from a townhouse yard; timed waddle-walk back without dropping it (moves you
   slow, absurd). Bystanders react.
4. **[timed]** *"The delivery of destiny."* Sprint a smoothie across town before
   it "loses its gains" (melts) — a timed traversal that teaches the sprint-shoe
   reward's feel.
5. **[interact]** *"Enter the Pain Temple."* Vlad reveals the **Gains Cave**
   trapdoor behind the SW strip mall/Dunkin `-132,44`. **Trigger/ambush:** inside,
   past his weight bench, is a bricked passage with an eviction seal and **two
   real Cleaners** stashing crates — Vlad's "temple" is a Pact node. He's baffled:
   *"...I did NOT put those men there."*
6. **[kill/interact]** *Clear the node.* Deal with the Cleaners; find a **tunnel
   map fragment** pointing under the lake. Vlad, undeterred: *"The lake tests us.
   Squat through the fear."*
7. **[talk]** *Champion crowned.* Vlad gifts his blessed sneakers: *"You did not
   skip. You are the champion. The legs… are yours."*

**QUEST NPCs**
- **VLAD** — *look:* mountainous, oiled, tiny shorts, sweatband, gnome-sized
  dumbbell; *voice:* thunderous, earnest, Eastern-Euro bodybuilder cadence.
  **NEW mesh.**
- **CHAD (the rival)** — *look:* tank top, visor, permanent smoothie; *voice:*
  nasal gym-bro. **RESKIN.**
- **VLAD'S GNOME** ("the boulder") — a **prop/companion** you carry; comic. Not a
  character. **EXISTING prop** (yard gnome).

**REWARD:** **Vlad's Blessed Sneakers (Sprint Shoes)** — *CAPABILITY:*
significantly faster run + a **double-jump / higher jump**. Great for traversal,
escapes, and reaching the Roof Stash. *Icon: glowing chunky cross-trainers.*

**SECRET POI:** **The Gains Cave** (cellar behind a building) — the first tunnel
node the player physically enters; its bricked passage → Q10. **Tunnel Map
Fragment** collected.

**CONNECTIONS:** Gains Cave tunnel ↔ Manhole Room (Q5) ↔ Storm Drain (Q9) ↔
sub-lake (Q10); Cleaners (Q8); eviction seal (Q1/Q3). Sprint Shoes make every
prior chase quest replayable-easy and are near-required for the Q10 descent
timing.

---
---

# QUEST 8 — "THE CLEANERS"
*(Oblivion DNA: **Dark Brotherhood** — a mysterious contact recruits you via a
note after you cross a line. Ties directly to the wanted system.)*

- **id:** `q8_cleaners`
- **GIVER / DISCOVERY:** **triggered by the wanted system.** The first time the
  player reaches **3+ stars and then escapes clean** (or racks a set number of
  kills), they wake/return to find a black card on the pavement: *"You have a
  talent for making problems disappear. We make people disappear. There is a
  difference, and it pays. — The Concierge. Dumpster behind Publix. Midnight."*
  (The card bears the **same seal** as the Q1/Q3 eviction notices.)
- **SYNOPSIS:** The player is recruited into **The Cleaners**, the Pact's
  enforcement arm, run by **THE CONCIERGE** — a board member. Three "contracts"
  escalate from petty to moral gut-punch, each staged via the **False-Bottom
  Dumpster** and the **Hollow Oak** dead-drop. The final contract is to silence
  **someone the player has helped** — the moment the fantasy turns. The player
  can execute it, or **turn on the Cleaners** and take the fight toward the board.
- **CRIME-SIM fit:** rewards stealth over rampage; the anti-wanted tool.

**BEATS**
1. **[interact]** *Midnight, False-Bottom Dumpster `-40,-70`.* Lift the false
   bottom (Loupe/Lockpick) → a phone rings. The Concierge speaks; never seen yet.
   First contract dropped in the **Hollow Oak `165,120`** (the tree hole).
2. **[fetch]** *Hollow Oak dead-drop.* Retrieve the dossier. **Container trap:**
   a rival left a rigged envelope — Loupe flags it, or it dyes you "marked"
   (cops treat you hotter for a bit).
3. **[kill/interact]** *Contract 1 — a "loud" newcomer.* A stealth takedown that
   **doesn't raise stars** if done clean (introduces the reward's mechanic).
   Meet your handler **SILAS** who teaches the ropes.
4. **[follow/kill]** *Contract 2 — a "leak."* Tail and silence someone selling
   Pact secrets. The target's dying words: *"They killed the caretaker's boy…
   they'll kill you too when you know too much."* (↔ Q3 Agatha.)
5. **[interact]** *Contract 3 — the gut-punch.* The dossier names **someone the
   player helped earlier** (e.g., Marcus from Q4, or Wendell from Q2). **Choice
   fork:**
   - **Comply** → grim reward, deeper Pact standing, Q10 "inherit" path opens.
   - **Refuse** → **ambush:** the Concierge sends Cleaners after *you*; you fight
     out and gain the Q10 "expose/burn" allies (Vlad, Sal, Wendell, Don).
6. **[talk]** *Meet THE CONCIERGE at last.* Whichever fork, she reveals herself as
   a **board member** and lets slip the chairman's name and the red-house table:
   *"You've been so useful. Augustus will want to meet you. He's under the lake…
   figuratively. And soon, literally."*

**QUEST NPCs**
- **THE CONCIERGE** — *look:* immaculate charcoal suit, gloves, single lapel pin
  (the seal), never a hair loose; *voice:* silk-over-steel, unfailingly polite.
  **NEW mesh.**
- **SILAS (handler)** — *look:* grey hoodie, hollow eyes, gloves; *voice:* tired,
  quiet, has-seen-too-much. **RESKIN** (existing ped/dealer repaint, dark).
- **THE TARGET** — an **existing** helped-NPC (Marcus/Wendell), reused for the
  moral fork. **EXISTING.**

**REWARD:** **Silenced Pistol** (unique weapon) + *CAPABILITY:* **"Ghost"** —
clean stealth takedowns **don't raise wanted**, and you gain a **fence discount
at the dealer** (Cleaners connection: sell junk/valuables/guns +15%, buy -10%).
*Icon: a matte pistol with an oversized suppressor + a black calling card.*

**SECRET POI:** **False-Bottom Dumpster** (contact point) + **Hollow Oak**
dead-drop (the tree hole). Both reused; the oak also holds a Q10 clue.

**CONNECTIONS:** The dealer-discount ties the existing dealer; the eviction seal
closes the Q1/Q3 loop; "under the lake, literally" is the direct Q10 handoff. The
moral fork **sets the player's Q10 ending flag** (inherit vs expose/burn).

---
---

# QUEST 9 — "WHERE'S BISCUIT?"
*(Original — the heart + kid-safe quest. Oblivion's fetch-with-soul energy; the
dog-whistle companion reward the brief calls for. A gentle breather before the
finale that still drops a real thread tile.)*

- **id:** `q9_biscuit`
- **GIVER / DISCOVERY:** **DYLAN SHARP** (Don's youngest, ~8) crying at the
  Publix lot `-72,-97`, near the player spawn. *"Biscuit chased a squirrel and
  ran toward the water and he didn't come back and Dad's too busy and — will you
  find my dog? He knows his whistle but I lost it."* Kids are off-limits and
  precious; this quest leans all the way into heart.
- **SYNOPSIS:** Track a lost dog from the Publix lot, through a kid's
  **hide-and-seek champion's** knowledge of the town's nooks, down to the
  **Storm Drain** at the lake — where Biscuit has **dug up a strange metal
  fragment** (a piece of the thing / a keycard). Return the dog and, crucially,
  the fragment (→Q10). No combat required; pure exploration + warmth. The kid
  **hide-and-seek champion** knows every secret nook in town (a lovely way to
  teach the POIs).
- **KID-SAFE:** children feature (Dylan, the champion) and are untouchable; the
  dog is never harmed and cannot be harmed.

**BEATS**
1. **[talk]** *Publix lot `-72,-97`.* Dylan's plea; he describes Biscuit's path
   toward the lake. Don Sharp hovers nearby, distracted, guilty (thread).
2. **[talk]** *Find the **HIDE-AND-SEEK CHAMPION** (existing kid cast).* A proud
   little kid who "knows every hiding spot in Westchase." She marks three nooks
   on your map — teaching the Roof Stash, Gains Cave, and Storm Drain as *play
   spots*, innocently. *"I ALWAYS win. I hid in the tree with the hole once for a
   WHOLE HOUR."* (↔ Hollow Oak.)
3. **[follow]** *Follow Biscuit's paw-prints/barks* (audio-tracked) from the lot
   toward the lake shore. Gentle trailing beat.
4. **[reach]** *The **Storm Drain** at the SW shore `-238,-176`.* Biscuit is
   stuck inside, whining, guarding a hole he dug. **Trigger (non-hostile):** a
   startled raccoon/critter bolts out (jump-scare, harmless comedy). Crawl in.
5. **[interact]** *The dig.* Biscuit has unearthed a **glowing metal fragment /
   keycard** half-buried where the drain meets the lakebed — clearly *not from
   here.* Take it (→Q10). Leash Biscuit.
6. **[talk]** *Return Biscuit to Dylan.* Pure joy. Dylan gives you Biscuit's
   spare **dog whistle** as thanks: *"He likes you now! Blow it and he'll come
   help — he's really brave for a little dog."* Don, watching, mutters: *"Where'd
   he even dig that up… by the water again."* (thread barb.)

**QUEST NPCs**
- **DYLAN SHARP** — youngest Sharp son; existing family cast. Heart of the quest.
  **EXISTING.**
- **THE HIDE-AND-SEEK CHAMPION** — a proud, map-savvy kid; existing kid cast +
  child VO. **EXISTING** (name/reskin optional).
- **BISCUIT** — *look:* small scruffy brown mutt, big ears, wagging; a genuine
  **animal mesh**; *voice:* barks/whines (SFX). **NEW mesh** (non-humanoid).

**REWARD:** **Dog Whistle** — *CAPABILITY:* summon **Biscuit as a companion**
who trots at your heel, **fetches nearby dropped cash/items**, **sniffs out
buried cash & secret POIs** (pings like a metal detector), and **harasses
enemies** (non-lethal takedown-assist). The town's best-boy utility pet. *Icon:
a brass dog whistle on a red collar-tag.*

**SECRET POI:** **The Storm Drain** (invented) — entered here, later a Q10
wade-in approach. Biscuit's **fragment/keycard** is a Q10 requirement. The
champion introduces the **Hollow Oak / Roof Stash / Gains Cave** as play-nooks
(soft POI tutorial).

**CONNECTIONS:** Sharp-family core (Dylan/Don ↔ Derik Q6 ↔ Don Q2); the fragment
"by the water" ↔ every lake refrain; Biscuit's sniff makes the Q10 tunnel
navigation and any buried-cash hunts easy.

---
---

# QUEST 10 — "WHAT LIES BENEATH"
*(FINALE — pays off the Countryway Pact. Descend beneath the lake, confront the
board + the thing, and decide what Westchase becomes. Requires keys/clues earned
across the prior nine.)*

- **id:** `q10_beneath`
- **GIVER / DISCOVERY:** **triggered** once the player holds the three keys —
  **Etched Lake Key** (Q4), **Tunnel Map Fragment** (Q7), **Alien Keycard**
  (Q9) — and has met **THE CONCIERGE** (Q8). A final black card (or Don Sharp,
  depending on Q8 fork) summons them: *"The board will see you now. Come to the
  water. Come alone. (You won't be.)"*
- **SYNOPSIS:** Every secret POI converges: the Gains Cave, Manhole Room, and
  Storm Drain all feed one **tunnel** under Race Track Rd to a **Sub-Lake
  Facility** beneath the fountain, where the Pact has fed and hidden the crashed
  entity for two generations. The player confronts **CHAIRMAN AUGUSTUS THORNE**
  and the board, faces the thing (reusing the existing **UFO/alien** asset), and
  chooses the ending set by the Q8 fork + moment-to-moment play.

**BEATS**
1. **[reach]** *The descent.* Enter via any earned POI (Gains Cave / Manhole /
   Storm Drain / red-house lift). Sprint Shoes (Q7) + Spirit Lantern (Q3) ease
   the timed, dark tunnel. Biscuit (Q9) sniffs the safe path.
2. **[interact]** *The three locks.* The facility door needs all three keys
   (Q4/Q7/Q9) — a satisfying "everything mattered" gate.
3. **[interact/kill]** *The facility.* Room-by-room: the feeding chamber, the
   board's records (your face is in them since Q2), and the tank where the
   **thing** rests. **Ambush:** the board's remaining **Cleaners** make a stand;
   the Police Scanner (Q2) and Ghost stealth (Q8) turn the tide.
4. **[talk]** *THORNE.* The chairman, unbothered, offers the chair: *"You've been
   assessed. You passed. Every good thing in this town — the lawns, the calm, the
   money that finds you — it's all this. Sit down. Or drown with the rest."*
   Allies arrive per the Q8 fork: **DON SHARP defects** (redeemed dad), with
   Sal/Vlad/Wendell/Agatha's blessing.
5. **[kill/interact]** *The reckoning — the thing wakes.* The entity (existing
   UFO/alien asset) stirs; the Arcade Warden's voice (Q6) returns: *"YOU ARE
   ASSESSED. NOW ASSESS US."* A climactic set-piece — the 8-Bit Reflexes (Q6)
   and Neon/Silenced weapons shine.
6. **[interact]** *THE CHOICE (ending fork, set by Q8 + a final prompt):*
   - **EXPOSE** — surface the records; Westchase becomes an ordinary town
     (weather turns real, the "luck" ends, the lights over the lake stop). The
     honest ending.
   - **BURN** — destroy the facility + the thing; chaos, a real explosion, the
     Pact ends violently. The crime-sim ending.
   - **INHERIT** — take Thorne's chair; you now *run Westchase* (see reward). The
     dark ending, only if you complied in Q8.
7. **[talk]** *Denouement.* The town reacts to your choice; recurring cast pay
   off their arcs (Dylan gets a real dad in Don; Agatha rests; Xander/Derik never
   tell their mom; Wendell finally sleeps).

**QUEST NPCs**
- **CHAIRMAN AUGUSTUS THORNE** — *look:* tall, patrician, red-and-gold blazer to
  match the red-roof house, HOA lapel pin, absolute calm; *voice:* velvet,
  reasonable, chilling. **NEW mesh.** (The Q1 party cameo pays off.)
- **THE THING / ENTITY** — reuse the existing **UFO + alien (meshyufo)** asset as
  the reveal in its tank/craft. **EXISTING asset.**
- **DON SHARP (redeemed)** — defecting ally at the climax; the Sharp arc lands.
  **EXISTING.**

**REWARD (ending-dependent):**
- **EXPOSE →** *"The Whistleblower"* — permanent **town-wide cop leniency** (one
  fewer star baseline) + all shops greet you as a hero (best prices).
- **BURN →** *"Scorched Earth"* — a unique **RPG/weapon skin** + the town spawns
  more chaos events (harder, wilder sandbox).
- **INHERIT →** **The Board Signet** — *CAPABILITY:* you **run Westchase**: cops
  ignore minor crimes, **free dealer stock tier**, all secret POIs stay open,
  and the "lights over the lake" now answer to *you*. *Icon: a gold signet ring
  with the Countryway seal.*

**SECRET POI:** **The Sub-Lake Facility** (finale) + convergence of **all**
prior POIs into one tunnel. The Board Room (Q3) lift is an alternate entrance.

**CONNECTIONS:** Every quest's key, NPC, and thread pays off here — the loupe's
first eviction notice, Wendell's lights, Agatha's ledger, Sal's etched key,
Desiree's "the real crew," the Warden's voice, Vlad's tunnel, the Concierge's
fork, and Biscuit's fragment. The finale is only reachable by having done the
enabling quests, making the set feel like one story.

---
---

## APPENDIX A — REWARD LEDGER (10 unique)

| Q | Reward | Type | Effect |
|---|--------|------|--------|
| 1 | Detective's Loupe | capability | highlight clues + reveal trapped/false containers |
| 2 | Police Scanner | capability | hear dispatch + see patrols/spawns on minimap |
| 3 | Spirit Lantern | capability | see in dark, reveal hidden doors, part apparitions |
| 4 | Lockpick Set | capability | silent-open locked doors/containers/ATMs/cars |
| 5 | Bait Car + Slim Jim | vehicle + capability | unique fast car + instant hotwire |
| 6 | Neon Blaster + 8-Bit Reflexes | weapon skin + capability | ADS bullet-time |
| 7 | Vlad's Sprint Shoes | capability | faster run + double-jump |
| 8 | Silenced Pistol + "Ghost" | weapon + capability | stealth kills don't raise wanted; dealer discount |
| 9 | Dog Whistle (Biscuit) | capability | summon dog: fetch/sniff-POIs/harass (metal-detector ping) |
| 10 | Board Signet / Whistleblower / Scorched Earth | capability/skin | ending-dependent town-wide perk |

## APPENDIX B — NPC BUDGET MATH

**NEW Meshy characters (counts toward ≤12) — 11 used, 1 headroom:**
1. Vivian Crestwood (Q1) · 2. Wendell Pike (Q2) · 3. Agatha Holloway (Q3) ·
4. Sal Marino (Q4) · 5. Desiree "The Siren" (Q5) · 6. Brick (Q5) ·
7. The Arcade Warden (Q6) · 8. Vlad (Q7) · 9. The Concierge (Q8) ·
10. Biscuit the dog (Q9, non-humanoid) · 11. Chairman Thorne (Q10).

**RESKINS (free):** Chet (Q1), Meter Reader/Cleaner (Q2), Gray Boy ghost (Q3),
Duke wheelman (Q4), Chad (Q7), Silas (Q8).

**EXISTING cast reused (free):** Gloria, Don Sharp, the Historian, Marcus, the
dealer, the rescued husband/spouse, Xander, Derik Sharp, Dylan Sharp, the
hide-and-seek champion, generic cops/peds/kids, and the **UFO/alien** asset.

→ **11/12 NEW meshes.** 3 named quest NPCs per quest satisfied via
NEW+reskin+existing, with existing cast woven through (Sharp family across
Q2/Q6/Q9/Q10; shop staff Marcus/Gloria; dealer; Xander).

## APPENDIX C — 3D PROP BUDGET (≤8) — 8 used

1. Openable trapdoor/hatch (Gains Cave + False-Bottom Dumpster, shared).
2. Openable manhole cover (Manhole Room + Q10 shaft).
3. Cage-lift / dumbwaiter shaft (red-house Board Room + sub-lake, shared).
4. Sub-lake facility interior module kit (Q10).
5. Arcade cabinet portal + glitch-world environment kit (Q6).
6. Bank vault door + safety-deposit boxes (Q4).
7. Hollow-oak dead-drop interactable (Q8/Q9).
8. Seance/evidence-board + murder dinner-table set (Q1, reused in Q3 study).

## APPENDIX D — ITEM ICONS (~30, within 20–40)

Rewards (10): loupe, scanner, lantern, lockpick roll, slim-jim keyfob, neon
blaster, sprint shoes, silenced pistol, dog whistle, board signet.
Quest items (~20): guest list, bitter-almond vial, eviction notice, torn
seating chart, evidence photos+string, binoculars, birdhouse cam, welcome
packet, matchbook, brass elevator key, caretaker's ledger, guard key, manager
key, timer key, Association Ledger, Etched Lake Key, stolen wallet, marks
corkboard note, tunnel map fragment, black calling card, dossier, alien keycard,
lake-sand cartridge.

## APPENDIX E — QUEST GRAPH (soft ordering)

- **Open early (no prereqs):** Q1, Q2, Q5, Q7, Q9.
- **Gated by a tool:** Q3 (better w/ Loupe), Q4 (Loupe+Scanner recommended),
  Q6 (Loupe), Q8 (triggered by wanted; better w/ Scanner).
- **Finale gate:** Q10 requires Etched Lake Key (Q4) + Tunnel Map Fragment (Q7)
  + Alien Keycard (Q9) + having met the Concierge (Q8). Q8's fork sets the Q10
  ending options.
- **Thread spine:** Q1 (seed) → Q2 (it's real) → Q3 (the board named) →
  Q4 (records+key) → Q5 (the muscle) → Q6 (the entity) → Q7 (the tunnel) →
  Q8 (the enforcers + your choice) → Q9 (the fragment + heart) → Q10 (the truth).
