# WESTCHASE — retro FPS

A first-person game whose map is modeled on the real Linebaugh Ave
intersection in Westchase, FL (near Farnell Middle / Bryant Elementary).
The four corners match the satellite view: gas station (SE, robbable),
dollar store + storage + blue-roof strip malls (SW), a bank + pharmacy +
sushi restaurant (NE), and a bank + supermarket + school + townhouses to
the lake (NW). Coffee shop, offices, and the 5-story red-roof house (the
tallest structure in town) sit west along the main road. Outskirt
neighborhoods, a lake, dense impassable oak forest with a fogged backdrop,
and "ROAD CLOSED" barriers at the map edges round it out. The two main
roads are divided like the real ones — curbed grass medians planted with
palms and crepe myrtles run down Race Track Rd and Countryway Blvd — and
the main intersection is fully signalized to match the satellite view:
mast-arm traffic lights with street-name signs on every approach (traffic
actually stops on red), twin-bar crosswalks, stop bars, left-turn arrows,
and palm clusters on the corners. Renders at 480p with low-res procedural
textures for a retro-but-realistic look.

## How to play

Just double-click `index.html` — it runs in any modern browser, no install needed.
(Everything is local: Three.js is bundled, all textures are generated in code.)

## Multiplayer

The main menu offers **Singleplayer** (fully offline) or **PLAY ONLINE**.
Type a **display name** at the top of the menu first — it floats over your
head in-game as a **bright-green name + health bar**, so everyone can see who
you are and how hurt you are (the name is remembered for next time). Real
players always read green; nearby **NPCs and cops get their own tags in a
muted colour** (grey for civilians, steel-blue for police) so you can tell
humans from AI at a glance. Press **PLAY ONLINE** and you're in — everyone
shares **one persistent town** on the dedicated Railway server. No host
codes, no lobbies, no invite links: the home screen shows how many players
are in town right now, and whoever's there is who you'll meet. (Under the
hood the first player in quietly runs the world sim, and if they leave the
server hands the world to the longest-connected player, so the town doesn't
reset when someone quits.) You'll see each other in-world (on foot
or driving, with name tags and green minimap dots) and can shoot and punch
each other — **downing another player pays a bounty and heats you up** — or
steal each other's wheels: press **E** on a car a friend is driving to
**hijack it** and dump them on the curb. A freshly hijacked car can't be
hijacked again for 15 seconds, so make your getaway count.

**Keep your progress.** Type a **PIN (4-8 digits)** under your name before
pressing PLAY ONLINE and your progress — cash, guns, snacks, your item bag,
your look, and your quest log — is saved to the server under that name+PIN
and comes back on any browser or device. First sign-in creates the account;
leave the PIN blank to play as a guest (nothing saved). Progress autosaves
every few seconds while you play. Add an **email** and you can recover a
forgotten PIN: a 6-digit code is mailed on sign-up to verify the address,
and the **forgot PIN?** link on the menu emails a reset code that lets you
pick a new PIN on the spot.

**Talk to your crew.** Press **ENTER** to open text chat (a fading on-screen
log shows who said what, with join/leave notices); press **ESC** to cancel.
**Hold V to talk** over voice — push-to-talk mic streamed through the relay,
with a "talking" pop on the speaker's tag. (Voice needs the game served over
https/localhost, since browsers block microphone access on `file://`.)

The town is simulated in one place — the **world host runs it all**:
traffic, pedestrians, street cops, dropped cash, stolen/parked/exploding
cars, and the time of day and weather are all simulated on the host and
streamed to everyone, so all players share one synced city. Combat against
the world is host-authoritative — kill credit, stars, and cash come back to
whoever earned them. More things are shared than not: **dropped guns land on
a shared pavement** — kill another player and you can walk over and steal
everything they were carrying — and **robbery lockouts are server-wide**, so
if someone knocks over the gas station, it's closed for all of you. Rare
events (see Rumors) are shared too: everyone sees them, anyone can profit
from them, and they only happen once per session no matter who triggers
them. You also **hear the same town everyone else does**: when the host's
pedestrians chat on the sidewalk, scream, flee a gunshot, dodge a car, or a
cop barks a warning, that voice is streamed to every player and played at the
right spot on their side — a joined player is no longer stuck in a silent
world. (Gas-station interiors, and the voices inside them, stay personal.)

## Your character

Hit **CHARACTER** on the main menu to build your look: skin, build, hair
(7 styles), eyes, mouth, facial details, glasses, shirts (plain / stripes /
graphic tees / v-neck / hoodie / tank), shorts or pants, shoes, hats (cap,
beanie, cowboy), and gear (purse, backpack, gold chain). The preview
window renders at PS1 resolution and your look is saved locally and shown
to other players in multiplayer. Pedestrians and cops are generated from
the same system, so everyone in town is unique.

The character model is based on "Simple Character PSX" by **JashiPSX**
(https://jashi-psx.itch.io) — the real 762-triangle mesh was adapted for
this game and all texturing is repainted procedurally at runtime. The
**PRESET** option offers three fully hand-off AI-painted characters
(JESS, MARCUS, SPIKE) with complete painterly PSX textures — faces,
clothes, shoes — pre-generated offline and embedded in the game (no
network needed), plus a growing roster of fully AI-generated 3D
characters (unique meshes and outfits, graphic tees and all) built
offline through an image-to-3D pipeline. Some pedestrians wear all of
these too.

## Sound with a place in the world

Every voice, gunshot, scream, crash, and explosion now comes from
somewhere: sounds pan to where their source is, fade with distance
(yells and gunfire carry about twice as far as small talk), and
doppler-shift when you or the source are moving. Voices stick to the
person speaking — a pedestrian yelling as they run past you pans and
fades with them, not with where they stood when they started. Wounded
pedestrians leave a trail of blood drips that slows and clots; kills
leave real blood pools on the pavement. Only the ambient bed — wind,
rain — is everywhere at once.

Engines got real too: every car runs a layered synth with gears — revs
climb as it accelerates, drop on each upshift, and settle to a low
idle rumble at a stop. Your own stolen ride is louder and richer, and
answers the throttle.

## The town talks (and swings back)

Everyone with a name has a voice: the dealer greets you (and remembers
you), the clerk chats you up or panics at the sight of a gun, cops bark
warnings before they shoot, and pedestrians yelp when you bump them —
low-bitrate 8 kHz radio-crackle voices, like a PS1 game that shipped with
a full dub. Pedestrians also live their own lives: they stop to stand
around, pair up for sidewalk conversations, stagger when you shove them —
and sometimes a punch is answered with fists. Take the hint and back off,
or drop them for the cash like always.

Eavesdrop on those sidewalk pairs and you'll hear actual back-and-forth:
one opens with a question ("Did you see those lights over the lake?"),
the other reacts and pries ("No WAY. And then what?"), turns alternating
every few seconds — and now and then somebody launches into a long
Tampa-flavored story while their friend waits it out. Conversations cut
off mid-word if a speaker gets punched, shot, run at by a car, or spooked
by an explosion. (The voice pack ships as several `npcvoicesN.js` chunks;
only the first loads up front, the rest stream in right after boot.)

## Families in town

The sidewalks now have **kids** — a couple dozen of them, each walking with
a grown-up. Every child is paired to an adult whose look roughly matches
their own (so families read as families), holding a hand-hold distance of a
few steps; when a kid dawdles to gawk at something and the parent gets
ahead, they break into a little **catch-up run** to close the gap. They have
their own short child voices, and you'll catch real **family back-and-forth**:
a kid whines up at their grown-up ("can we get ice cream, PLEASE?") and a
beat later the parent answers in their own voice — plus loose, silly chatter
as they wander. Like the sidewalk conversations, an exchange cuts off the
moment chaos scares them.

Wander a family up to one of the **playgrounds** (Farnell Middle School and
the townhouse lawn) and the kid breaks off to play while the parent stops to
watch: they climb the **slide** and whoosh down, pump on the **swings**, or
scramble over the **climber** — squealing the whole time — then rejoin the
grown-up after a while. Gunfire or a blast clears the playground instantly.

When a few kids end up together in an open spot, they'll start a **game**
while the parents idle nearby: **tag** (one kid is "it" and chases the rest,
yelling "Tag! You're it!" and swapping roles on a touch), **hide-and-seek**
(the seeker counts while the others scatter behind trees and fences, then
gets hunted down one "Found you!" at a time), or **red-light-green-light** (a
caller out front shouts "GREEN LIGHT!" and the line creeps forward, freezing
on "RED LIGHT!" — dawdle and you get sent back to the start). Each game runs
a half-minute or so, then everyone drifts back to their grown-up — and any
gunfire, explosion, or speeding car scatters the whole group at once.

**Kids are off-limits.** Bullets, fists, explosions and cars all pass
through them harmlessly — you cannot hurt, ragdoll, or kill a child, and
they earn you nothing. Like everyone else, though, they're not fearless:
gunfire and blasts send them fleeing, and they scramble out of the path of a
speeding car. (They ride the same shared-world stream as the adults, so
every player in town sees the same families.)

## The Sharps (and Xander's gaming buddy)

Some of the townsfolk who know each other travel as a **group**. The **Sharp
family** — father **Don** and a rotating two or three of his grown sons
**Dylan, Derik and Alex** — walk the sidewalks together as a loose cluster,
the boys keeping a natural few-steps' spacing around their dad and closing
the gap whenever they drift too far. Every so often the family stops for a
huddle and you'll catch **Don checking in on each son** in his own gravelly
voice ("Derik, did you eat today? You're skin and bones.") with the son
firing back ("I ate a whole pizza, Dad."), plus **brother ribbing** ("You
still owe me twenty bucks."). Stroll up to one of them and they'll name-drop
the crew — Don brags "that's my boy right there," a son nods to "my old man,
Don Sharp." Every line shows as a readable bubble over the speaker's head.

Off on his own beat, **Xander** — a laid-back gamer who "paused his game to
be out here" — hangs with his buddy **Derik**, and the two trade **gaming
banter** ("Hit Diamond last night, no big deal." / "Diamond? You got
carried.").

The Sharps and Xander are **ordinary people**, not bosses — a stray bullet or
a car will drop them like anyone else. When that happens (or a gunfight kicks
off nearby), the group breaks up cleanly: the conversation cuts out, the
survivors pick a new leader or go their separate ways, and nobody's left
trailing a body. No chatting mid-firefight.

## Out for a walk

About one pedestrian in six is **out doing something** — walking a **dog** on
a leash (it trots along a step behind on a taut line, catches up when they get
ahead, and never stretches off across the block), pushing a **stroller** or a
mobility **walker** out front, or carrying a **handheld** — an umbrella held
overhead, a cane, a coffee cup, shopping bags, a skateboard, a balloon on a
string. Wheeled things (a bike, a rolling suitcase, a kid's wagon) get walked
alongside. Each prop rolls a colour/style variant so no two look alike.

Like the kids, the **dogs and stroller babies are off-limits** — they're
decorations riding along with their owner, never targets, so bullets, fists,
cars and blasts can't touch them. If an owner is killed the leash drops and
the dog slips away, a pushed stroller is just left standing where it was, and
a carried item falls from the hand. (All of this is local colour — it isn't
streamed over the network, so it stays smooth without adding traffic.)

## The loop

You spawn **with no gun**. Punch pedestrians (they drop cash), pick up the
green bills, then find the **gold $ on the minimap** — that's the dealer at
Westchase Guns & Ammo. He sells three guns:

| Weapon | Price | Notes |
|--------|-------|-------|
| Pistol | $150  | semi-auto, reliable |
| SMG (TEC-9) | $400 | full-auto; first shots fly true, then it sprays — feather the trigger |
| Rifle  | $600  | one shot, one nap — right-click to scope |
| AK-47  | $1000 | full-auto, long range, accurate |
| Rocket launcher | $2000 | 5s reload; the blast doesn't care whose side you're on |

Die and you drop every gun you own — run back within 2 minutes to grab
them off the pavement. Picking up a gun you already own sells it for half
its price. In multiplayer the pavement is shared: anyone can scoop up your
dropped arsenal before you get back, so dying near your killer is a
donation.

## Quests & the quest log

Westchase has **stories to work through**. Quest-givers stand around town
under a soft **amber beacon** — walk up and press **E** to hear them out and
take the job. You can only actively track **one quest at a time**.

Open the **quest log with J**. On the left is every quest you've found
(available, in-progress, or completed); click one to read its summary and
its **objective checklist** on the right. Hit **SET ACTIVE** to track a
quest — its current objective then shows in the **top-left HUD tracker**, and
an **amber diamond marks the next waypoint on your minimap** (with an arrow
pointing the way if it's far off).

Objectives come in a few flavors — **talk** to someone, **reach** a spot,
**find** an item, **search/interact** with a place, take out a **target**,
**escort** someone, or beat a **timer**. Some quests send you into hidden
places the town keeps quiet — a cellar hatch behind the Dunkin, a manhole in
the road, a hollow oak, a storm drain, the top floor of the red house, and
somewhere under the lake. Press **E** at a hatch to drop in, **E** again to
climb out. Finish a quest and you keep the **reward**: a new item in your bag
and/or a lasting **capability**. Your progress is saved between sessions.

### The Countryway Pact — 10 quests

An old rumor at the Dunkin says people who get rich start seeing lights over
the lake. They're right. Ten linked quests slowly uncover why — the secret
HOA board that's run Westchase for two generations, and the thing they feed
beneath the fountain. Each drops one tile of the story and grants a tool:

1. **A Night to Dismember** *(Vivian, lakeside townhouse)* — a murder-mystery
   dinner turns real. Name the killer. → **Detective's Loupe**.
2. **Someone's Watching** *(Wendell, townhouse row)* — tail the "watchers,"
   stake out the lake at night. He's not as crazy as he sounds. → **Police
   Scanner** (rings the nearest patrol on your minimap while wanted).
3. **Where the Red House Weeps** *(Agatha, the red house at night)* — climb
   the 5-story house to the sealed Board Room. → **Spirit Lantern**.
4. **The Countryway Job** *(Sal, Starbucks — needs a gun)* — a four-phase bank
   heist on Regions. → **Lockpick Set** (skip car break-in timers) + the
   **Etched Lake Key**.
5. **Roadside Assistance** *(the worried spouse, RaceTrac)* — bust the Siren's
   roadside-lure crew from their manhole stash. → **Bait Car keys** (instant
   hotwire).
6. **Insert Coin to Continue** *(Xander, the arcade)* — dive into a cursed
   cartridge to pull Derik out of an 8-bit glitch world. → **Neon Blaster**.
7. **Leg Day** *(Vlad, lakeside)* — absurd fitness dares that lead to the
   Gains Cave, a Pact tunnel node. → **Sprint Shoes** (faster run + double
   jump) + the **Tunnel Map Fragment**.
8. **The Cleaners** *(the Concierge)* — recruited into the Pact's enforcers;
   three contracts, then a choice. → **Silenced Pistol + "Ghost."**
9. **Where's Biscuit?** *(Dylan, Publix lot)* — find a lost dog down at the
   storm drain, where he's dug up something not from here. No combat, all
   heart. → **Dog Whistle** + the **Alien Keycard**.
10. **What Lies Beneath** *(the finale)* — with the Etched Lake Key, Tunnel
    Fragment, and Alien Keycard — and having met the Concierge — descend under
    the lake, face the board and the thing, and decide what Westchase becomes.

Quests 1, 2, 5, 7 and 9 open early with no prerequisites; the finale only
unlocks once you're holding all three keys.

### Earned capabilities — how to use them

Each reward is a real, usable power once you finish its quest:

- **Detective's Loupe** (Q1) — press **L** to toggle. Nearby quest clues and
  interactable props glow amber, and rigged/false-bottom containers get a trap
  warning before you open them.
- **Police Scanner** (Q2) — passive: rings the nearest patrol on your minimap
  whenever you're wanted.
- **Spirit Lantern** (Q3) — press **G** to toggle a green dark-vision light that
  follows you, lights the sealed rooms, and pushes scripted apparitions back.
- **Lockpick Set** (Q4) / **Bait Car + Slim Jim** (Q5) — silent openings and
  instant hotwiring; no jimmy timer on locked cars.
- **Neon Blaster + 8-Bit Reflexes** (Q6) — a ray-tech blaster in your inventory
  (**Tab** to equip); **hold right-mouse to aim** and time slows on a drainable
  meter (recharges when you let go).
- **Sprint Shoes** (Q7) — faster run + a double jump.
- **Silenced Pistol + "Ghost"** (Q8) — a suppressed pistol (**Tab** to equip);
  clean kills with it **don't raise your wanted level**, and the dealer gives you
  a Cleaners fence discount (buy −10%, sell +15%).
- **Dog Whistle → Biscuit** (Q9) — press **B** to whistle Biscuit to your side;
  he heels, catches up when you run, and noses dropped cash toward you. Press
  **B** again to send him home. He can't be harmed.

**The finale, three ways.** At the end of *What Lies Beneath* you choose an
ending — press **[1] EXPOSE**, **[2] BURN**, or **[3] INHERIT**:

- **Expose (The Whistleblower)** — the Pact ends honestly; cops run a star
  cooler town-wide.
- **Burn (Scorched Earth)** — you blow the facility; you keep the Rocket
  Launcher and the town runs wilder.
- **Inherit (The Board Signet)** — you take the chair: cops ignore minor crimes,
  the dealer's whole stock is yours, and every secret door stays open.

## Items & your bag

Beyond guns, the world is full of **loose items** — food, drinks, medkits,
junk, jewelry, tools and oddball novelties. Open your bag with **Tab** and
you'll find a **6×4 grid** below your weapons. Items **stack** (but only
reasonably: junk piles deep, food and drinks eight to a slot, medkits four,
valuables just two, tools one).

- **Click an item** to use it. Food, drinks and medkits restore health;
  novelties do their own quirky thing (shake the Magic 8-Ball, scratch a
  lottery ticket, set off a firework).
- **Right-click** an item — or hover it and press **Q** — to **drop one** on
  the ground. Walk back over it to pick it up again (it despawns after two
  minutes).
- **Junk and valuables sell** at the gun dealer — his shop grows a
  *Sell junk & valuables* section listing everything he'll buy.

Where do items come from? **Snacks and sodas** you buy now go straight into
your bag (the gas-station burger heals, the vending sodas quench). **Knocked-out
pedestrians** sometimes drop an item along with their cash, and there's
**litter to scavenge around the dumpsters** out back of the strip malls and
Publix — mostly junk, but keep an eye out for a dropped wallet or phone. Your
bag is yours alone — in multiplayer, items you knock loose aren't shared yet.

### Dumpster diving & scavenging

Press **E** on any **dumpster** to roll up your sleeves and dig in. A short
rummage (head down in the bin, trash flying) turns up… something — usually
junk, often food (gross, but hey, it heals — *still warm?*), sometimes a
tossed-out wallet or phone, and once in a blue moon a **gold watch, chain or
cash wad** somebody threw away. Every so often a **startled rat** shoots out,
or a **grumpy sleeper** erupts to shove you off his bed. Each dumpster needs
~90 seconds to refill (the buzzing flies tell you it's ready again).

The whole town is scavengeable, in fact: **newspaper boxes** hand out today's
paper, **kick over a trash can or wheelie bin** (E) to spill its junk, the
**claw machine** grabs a real toy for your bag, the **mailboxes** at the
townhouses hold junk mail (and, rarely, a mis-delivered package — pocket it,
but not while a cop's watching), and you can **rummage the bushes** for the odd
lost trinket (mind the birds). All of it drops straight into your bag; a full
bag spills the overflow at your feet.

## The gas station

Press **E** at the RaceTrac door to walk inside (a real interior with
snack aisles, drink fridges, a coffee maker, and a clerk at the register).
Talk to the clerk with **E**:

- **Buy a hot burger — $20.** It goes into your TAB bag — click it there to
  eat it for +30 hp.
- **Rob the register** — only works with a gun in your hands ($100–$300,
  instant 2 stars). Try it bare-knuckled and the clerk hits the panic
  button: police storm the store to kill you.

After a robbery (successful or botched), leaving locks the store for
**3 minutes** — for everyone. In multiplayer one robbery closes the store
server-wide until the lockout expires.

## The Publix

Press **E** at the **Publix** storefront (NW corner, across the lot from your
spawn) to walk inside a full grocery interior: stocked gondola aisles with
end-caps, a glowing dairy-and-frozen cooler wall, a colorful produce section,
a deli counter, and a row of checkout lanes with conveyor belts and registers.
Green-aproned Publix staff — a cashier, a bagger, a stocker, a deli worker and
the manager — hold their posts. Walk the aisles, **E** to chat with the staff
(they **answer out loud** now — every role has its own voice, and the shop
tills, baristas, tellers and sushi chef all talk when you buy or chat), grab a
**free sample** near produce for **+20 hp**, and **E** at the door to leave.
(Like the gas station, interiors are personal — they aren't shared in
multiplayer.)

## More shop interiors

Five more storefronts open the same way — press **E** at the door:

- **Dunkin'** (SW strip): an orange-and-pink counter with a glass donut case,
  coffee machines and a menu board. Order a **coffee ($3)** or **donut ($2)**
  into your bag, or chat with the baristas.
- **Starbucks** (across the main road from Dunkin'): a wood café bar with a
  pastry case, espresso machine and lounge armchairs. Order a **latte ($4)** or
  **croissant ($3)**, or chat.
- **Sakura Sushi** (NE corner): a lacquer sushi bar with a nigiri display,
  sake shelf, booth seating and hanging red lanterns. The chef will make you a
  **sushi platter ($8, +40 hp)** or pour **sake ($4, +16 hp)**.
- **Dollar Tree** (SW corner): packed dollar-store aisles and a checkout. Buy a
  **random cheap item ($1.25)** into your bag, browse, or chat with the cashier.
- **Bank of America** (its BofA branch): a teller line behind glass, a vault
  door, an ATM lobby and velvet-rope queues. **Use the ATM** to check your
  balance or **see a teller**.

Each has its own themed staff and props. Like the others, these interiors are
personal (never shared in multiplayer).

## Wanted system

Crimes earn GTA-style stars (max 5, shown top-center), and each star costs
double the mayhem the last one did:

- Robbing the register at gunpoint → instantly 2 stars.
- Civilian knockouts: 5 kills → 1 star, 10 more → 2 stars, 20 more → 3
  stars, 40 more → 4 stars, 80 more → the full 5.
- Wrecking a car (shooting or ramming it until it loses control) counts
  the same as a knockout.
- Cops: just **hurting** one earns your first star. Downing 3 → 2 stars,
  6 more → 3 stars, 12 more → 4 stars, 24 more → 5.

At 1 star, patrolling officers only open fire if you get close. At 2+,
every cop in town hunts you down, and more spawn per star. Below 4 stars
they carry short-range pistols; at 4–5 stars they roll full-auto SMGs that
reach much further — though cops' aim is only as good as their academy
scores. Lay low (no crimes, no cops within sight) and the stars tick back
down; go fully clean and the tally starts over. Getting knocked out clears
your wanted level.

## Traffic & driving

Cars hum with engine noise as they pass — and the pitch bends as they
close in and blow by, like the real thing. Don't stand in the road —
getting run over ragdolls pedestrians sky-high with a blood splatter (and
hurts you too). Shoot a moving car for ~3 seconds and it loses control,
floors it, and explodes on whatever it hits — killing anything nearby,
you included. Ramming with your own car is gentler physics: the other car
gets punted away spinning and dented; keep hitting it and it eventually
loses control the same way. An exploded car leaves its **burned-out husk**
sitting at the spot — solid enough to lean on — until the replacement car
shows up (a few seconds for traffic, about a minute for lot cars).

The fleet mixes the AI-generated bodies with a handful of classic PSX
shapes: a station wagon, a big 90s sedan, a **yellow cab**, and a step
van that every so often rolls by in **mail-truck livery**.

The parking lots aren't just paint: **Publix, the strip malls, the
banks, the RaceTrac and the school all have parked cars** sitting empty
in their stalls, engines off, lights dark. Press **E** on one to **break
in** — about a second of jimmying the door (glass crunch included), then
you drive off in it. Breaking in doesn't earn a wanted star by itself
(cops only care about chaos they can see), but any bystander who watches
you do it runs off in a panic. Once you're in, it's your stolen ride like
any other: park it wherever, lose it, blow it up — a wrecked lot car gets
"replaced" back in its slot after about a minute.

Press **E** next to a passing car to carjack it — the driver bails and
runs off screaming (and yes, that's a crime). Driving is third-person:
WASD to drive, **E** to get out. You can't shoot from the driver's seat,
but the car itself is the weapon — mow down pedestrians and cops, and
ram traffic to send it spinning out of control like you'd shot it up.
Trees and street lights snap and topple if you plow through them, in a
shower of leaves or sparks — they grow back about a minute later.

Your stolen ride isn't bulletproof: police fire chews through it. When
it catches **fire you have ~5 seconds to bail** before it explodes.

Cars have some life to them: bodies bounce on their suspension (slam a
curb or a wall and feel it), the front wheels visibly steer, and after
dark every car projects real headlight pools onto the asphalt.

## Trees

The oaks and bushes are real PS1-style assets — flat textured branch
cards with alpha cutouts, from the free "retro nature pack" by
**ElegantCrow** — and the median crepe myrtles bloom pink off the same
leaves. They still snap like twigs if you drive through them.

The main intersection is dressed like the real one: galvanized mast-arm
**traffic signals that actually cycle** — and now **traffic obeys them**:
cars slow and queue bumper-to-bumper at a red, wait out the cycle, and
pull away on green. They also keep a safe following gap on the open road
and tap the brakes for a beat at the smaller uncontrolled intersections.
The streets are busy now — roughly triple the old traffic and pedestrian
counts — and walkers who see a car bearing down on them bolt sideways out
of the lane, whether it's an NPC car or one another player is driving.
There are cobra-head streetlights, sabal-palm
clusters on every corner, and proper road paint — stop bars, ladder
crosswalks, and left-turn arrows in the pockets. Wood utility poles now
march down **every arterial and collector** — Race Track Rd, Countryway
Blvd, Citrus Park Dr, Nine Eagles Dr and the rest — set back on the
road-edge line about every 40 metres, crossarms and insulators up top and
a transformer can on every third pole. Two or three power lines sag
crossarm-to-crossarm in a natural catenary droop between them, with the
odd service drop peeling off to a shop's roofline. The runs break cleanly
around the big intersections so nothing crosses the junction at head
height, and — like the trees and streetlights — a pole will snap and
topple if you plow a car into it.

## Street furniture

The town is dressed with over a hundred AI-generated props — dumpsters,
benches, bus shelters, planters, shopping carts, signs, cones and jersey
barriers around a roadwork site, mailboxes by the townhouses, picnic
tables by the lake. The big stuff is solid (and stops bullets); poles,
signs, cones, cans, and carts snap and scatter if you drive through them.
Some of it does more than sit there:

- **Vending machines** ($2, press E) drop a soda out the front — pick it
  up and it lands in your TAB bag; click it there to drink it.
- **Payphones** (E) actually dial — usually a busy signal, sometimes a
  voice on the line.
- **ATMs** are out of service… to your E key. A few rounds will open one
  up for $50–150, once per machine — and it's an instant 2 stars.
- **Parking meters** spill coins when a car snaps them off.
- **Fire hydrants** blow a 30-second geyser when clipped.
- **Newspaper boxes** (E) rattle, and every so often somebody's change
  falls out.

## Parks, plazas & roadside life

On top of the street furniture, the town is scattered with a second pack of
places to hang around. Cafe tables and swaying umbrellas sit out front of
Dunkin', Starbucks and the sushi bar; there's a full **playground** by
Farnell school (climber, slide, swinging swings, a hoop) and a skate ramp in
a cul-de-sac; a **lakeside picnic** spot with a stone fountain, a BBQ and a
crackling fire pit; food trucks and an ice-cream van in the lots; a
wacky-waving **tube man** and a hot-dog cart out at the RaceTrac; flamingos,
gnomes, bird baths and a spinning windmill in the yards; and neon that spins
(barber pole, pizza sign), flags that wave, and arcade/soda screens that glow.

Most of it answers to your E key:

- **Sit** on any bench, bus bench or cafe chair (E again, or just walk, to
  stand back up).
- **Drink** from a park fountain for a small top-up.
- **Buy** from the hot-dog cart, food truck, or now a staffed **lemonade
  stand** (a kid tends it — $2 for **+10 hp**) and the **ice-cream truck**
  (an adult at the window — $3 for **+15 hp**). Both vendors call out their
  wares and thank you for the sale in their own voice.
- **Soda & gumball machines** vend for $2 / $1; the gumball pops out a
  colored ball.
- **Claw machine** ($2) usually teases you, but now and then it coughs up a
  cash prize.
- **Arcade cabinets, jukeboxes and boomboxes** (E) play a little chiptune.
- **Cook** at a grill, **read** the monument/sandwich-board signs, or just
  watch the tube man flail.

## The lake

The lake in the northwest is swimmable: the sandy bed slopes down about
four meters, so you can wade in off the shore and go fully under — the
screen tints blue and everything goes muffled until you come back up. A
stone fountain sprays in the middle. Pedestrians, cops, and cars stay on
dry land, which makes the water a decent (slow) escape route.

## Weather & time

Day fades into properly dark night on a cycle; street lights along the
roads and parking lots switch on automatically. Rain rolls in at random —
grey skies by day, pitch black at night — with rain that lands on roofs
and streets (splashes included) and its own sound. A quiet ambient noise
bed runs under everything.

## Controls

- **WASD** — move, **Shift** — run, **Space** — jump, **Mouse** — look
- **Left click** — punch / shoot
- **Scroll wheel** — quick-swap to your next / previous weapon
- **E** — talk to the dealer (when close)
- **Tab** — inventory: equip/unequip weapons + your 6×4 item grid (click an
  item to use it, right-click or **Q** to drop one)
- **J** — quest log (see your active quest, all beats, and set which quest
  you're tracking)
- **L / G / B** — toggle earned quest gear (Detective's Loupe / Spirit Lantern /
  whistle Biscuit), once you've unlocked them
- **1 / 2 / 3** — pick your ending at the Q10 finale (Expose / Burn / Inherit)
- **Enter** — open text chat (multiplayer), **Esc** to cancel
- **Hold V** — push-to-talk voice chat (multiplayer)
- **F8** — report a bug (grabs a screenshot + your note, sent for triage)
- **Esc** — release mouse / close menus

## Settings

Hit **SETTINGS** on the main menu — or open it from the pause screen mid-game —
to tune the game to your taste. Everything applies live and saves automatically
(stored in your browser), so it's the way you left it next time:

- **Mouse sensitivity** and **Invert Look Y** — dial in your aim.
- **Field of view** — 70–100°, wider if you like more on screen.
- **Master / SFX / Voice volume** — three sliders. Master scales everything;
  SFX covers world and UI sounds; Voice controls the characters' dialogue.
- **Draw distance** — Low / Medium / High. Higher pushes the fog back for a
  longer view; Low trims the render detail for smoother performance on slower
  machines.
- **CRT filter** — the scanline-and-vignette TV look, on or off.
- **Reset to defaults** — puts everything back the way it shipped.

## Rumors

Old-timers at the Dunkin swear that folks who get *seriously* rich around
here start seeing strange lights over town. They also swear it only ever
happens once — and that whatever falls out of the sky belongs to whoever
gets to it first, not to whoever made it show up. Probably nothing.

## Notes

- Some vehicles (station wagon, sedan, taxi, step van, and the burned
  wreck) are from "PSX Style Cars" by **GGBot**
  (https://ggbot.itch.io/psx-style-cars, CC0).
- The map recently grew ~3× in area: the whole square mile around the
  intersection is in — the residential grids southeast and east, the
  Lynmar industrial park, collector roads, retention ponds (wadeable,
  not swimmable), and dense preserve forest out to the new edge.
- The roads now follow the **real satellite geometry**: Race Track Rd
  sweeps through the intersection as a smoothed diagonal, Countryway Blvd
  runs SE and Nine Eagles Dr heads N (a three-leg Y instead of the old
  perpendicular cross), with curved residential streets, sidewalks, and a
  traffic lane graph the cars actually follow. Nearly 500 procedurally
  textured houses fill the neighborhoods. Pedestrians roam the whole map:
  the junction stays busiest, but you'll meet people on the residential
  sidewalks (they stick to their own neighborhood, and jaywalk — no
  crosswalks out there) and the odd soul along a collector or Lynmar.
  The corner landmarks (Publix, RaceTrac, the strip malls, banks, school,
  Dunkin, Starbucks, sushi, pharmacy, townhouses, the red house) sit at
  hand-placed positions/angles fronting the roads, each with its own
  parking lot. The businesses carry real 3D depth — punched-in storefront
  glass bays, terracotta pilasters with brick bases, green metal awning
  bands, parapet caps and rooftop AC units — skinned with reality-matched
  procedural materials: tan-stucco Publix + plaza strips, red-brick banks
  (Regions' cream arched parapet, BoA's gray standing-seam hip roof +
  flagpole), sage-clapboard Starbucks, gray-block Dunkin, tan Dollar
  Tree/sushi, the offices/pharmacy/yoga storefronts, a two-floor
  ribbon-windowed Farnell Middle with a brown entry tower, and self-storage
  rows under gray standing-seam metal gable roofs — instead of the old flat
  painted walls. The whole layout — roads, buildings, and parking/pavement —
  is authored in a built-in map editor (`editor.html`) and imported into
  the game by `tools/mapimport.js` (source of truth: `tools/westchase_map.json`).
- The map is finite — a wall rings the city.
- Watch for traffic; cars hurt.
- Getting knocked out costs you 25% of your cash.
- `serve.ps1` is only there so the dev preview can host the game locally;
  the game itself doesn't need it.
