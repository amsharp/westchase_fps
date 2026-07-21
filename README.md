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
pressing PLAY ONLINE and your progress — cash, guns, snacks,
and your look — is saved to the server under that name+PIN
and comes back on any browser or device. First sign-in creates the account;
leave the PIN blank to play as a guest — but even guests keep their progress
**locally on this browser** now (cash, guns, and snacks are
mirrored to local storage and restored on your next visit, so offline
singleplayer no longer resets every reload; your look and settings
already persisted). A PIN is what makes that progress follow you to *other*
devices. Progress autosaves every few seconds while you play. Add an
**email** and you can recover a
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
these too — including a few oddballs you'll spot around town: a creepy
harlequin clown, someone in a blue wolf fursuit, and a hooded cult
figure.

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

Your own feet make noise too: footsteps play in time with your stride and
change with the ground underfoot — a dull thud on asphalt, a harder click
on the sidewalk, a soft scuff on grass, a wet splash through the lake
shallows, and a hollow tap indoors. They speed up when you sprint.

Engines got real too: every car runs a layered synth with gears — revs
climb as it accelerates, drop on each upshift, and settle to a low
idle rumble at a stop. Your own stolen ride is louder and richer, and
answers the throttle. Brakes talk back: a soft chirp when you ease to a
low-speed stop, and **tyres screech** when you stand on the brakes at speed
or the back end breaks loose in a slide. Every car shares the same beefier
horn now, too.

Cars **drive** with real weight now. They build speed gradually — a
strong pull off the line that tapers as you climb toward a **high top
speed** — and they **carry their momentum**: lift off the gas and the car
coasts for a long time instead of stopping dead. Steering gets a little
**heavier the faster you go**, so it's less twitchy at speed. The body
**leans into corners** (a hard right throws it left), and if you take a
corner too fast and **hold it too long** the tyres let go: the slide
builds until the back end steps out and the car **spins out**. Ease off or
scrub speed to catch it. Cars also **climb** ramps and kerbs. Hit a real
**ramp** with a run-up and the car **launches along the ramp's angle** and
sails through the air, keeping its momentum until it lands — the faster
you're going, the further it flies. Little **kerbs and sidewalk edges** only
give a small hop now (they used to fling you skyward). And crashing
**into a solid wall at speed hurts** — hit a building fast enough and it's a
fatal, fiery wreck. **Wooden jump ramps** are scattered along the roads — big
right-triangle kickers built from real planks, in a mix of sizes (little ones
for a quick pop, big ones for serious air). Each sits on a straightaway with
room to build speed into it and open road to land on: line one up, floor it,
and fly.

Everything now **rides on top of the ground** instead of sinking into
it: people, police, and vehicles sit on whichever layer is under them —
grass, road, sidewalk, parking lot, or ramp — so feet and tyres meet the
surface instead of clipping through the raised road and kerb. Drive a car
up onto a **kerb** and it steps up onto the sidewalk; you can walk (and
jump) up ramps and raised layers on foot too.

Collision is **2.5D** now: solid props have a real top, so if you can
**jump high enough you land on top of them** — hop up onto a dumpster,
bench, or barrier and stand there — while they still wall you off at
ground level. Your jump is a little higher to make that reachable. Low
kerbs and steps you just walk straight up.

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
string. Wheeled things (a bike, a rolling suitcase) get walked alongside —
hands on the handlebar — and the little red **toy wagon** belongs to the kids:
you'll only ever see a child towing one. Each prop rolls a colour/style
variant so no two look alike. And when the rain rolls in, watch the sidewalks:
about **half the adults raise umbrellas** in different canopy colours over the
first half-minute of a shower, and fold them away again once it clears.

Like the kids, the **dogs and stroller babies are off-limits** — they're
decorations riding along with their owner, never targets, so bullets, fists,
cars and blasts can't touch them. If an owner is killed the leash drops and
the dog slips away, a pushed stroller is just left standing where it was, and
a carried item falls from the hand. (All of this is local colour — it isn't
streamed over the network, so it stays smooth without adding traffic.)

## The loop

You spawn **with no gun**. Punch pedestrians (they drop cash) — just walk
near the green bills and you scoop them up automatically — then find the
**gold $ on the minimap** — that's the dealer at
Westchase Guns & Ammo. He sells three guns:

| Weapon | Price | Notes |
|--------|-------|-------|
| Pistol | $150  | semi-auto, reliable |
| SMG (TEC-9) | $400 | full-auto; first shots fly true, then it sprays — feather the trigger |
| Shotgun | $500 | pump-action cone of pellets, brutal up close and weak far off — a **point-blank shot to the head takes it clean off** in a spray of blood |
| Axe    | *found* | not for sale — see **The cabin in the woods** below. A solid melee hit **cleaves a body clean in half down the middle**; the two halves topple opposite ways onto the ground in a mess of blood. **Hold right-click to aim, then left-click to hurl it** — it spins through a gravity arc and bisects whoever it hits, then sticks in the ground where it lands for you to go pick back up |
| Rifle  | $600  | one shot, one nap — right-click to scope |
| AK-47  | $1000 | full-auto, long range, accurate |
| Rocket launcher | $2000 | one rocket per load, 5s hand-reload (R); the blast doesn't care whose side you're on |

Each weapon carries its own **crosshair**: a tight cross-and-dot for the
pistol, a wider spread for the SMG and AK (it blooms open as you spray), a
fine cross for the scoped rifle (which vanishes at the scope), corner
brackets for the rocket launcher, and a boxed reticle for alien tech.

### Ammo &amp; reloading

Every firearm now runs on **ammunition** and has to be **reloaded by hand
with R**. There are four kinds of ammo, and guns that fire the same round
**share one pool**:

| Ammo | Guns | Mag | Reload | Price |
|------|------|-----|--------|-------|
| Pistol bullets | Pistol (15), SMG (30) | — | 1.5s / 2s | $25 / 30 rds |
| Rifle bullets | Rifle (10), AK-47 (30) | — | 3s | $50 / 30 rds |
| Shotgun shells | Shotgun (6) | — | 5s | $25 / 12 rds |
| Rockets | Rocket launcher (1) | — | 5s | $200 / 1 rd |

Buy a gun and it comes **loaded plus a spare** — two magazines' worth. When
that runs dry, top up your **reserve** at the dealer (there's an **AMMO**
section under the guns in his shop) and hit **R** to slap in a fresh mag.
The HUD shows your **loaded / reserve** count above the weapon name; it goes
amber when the mag's running low and red when it's empty. Empty the mag and
the trigger just clicks — reload. The **rocket launcher** plays its full
load-a-shell animation; every other gun simply **drops off-screen and swings
back up** once the fresh mag is seated. Reloading mid-fire is safe but you
can't shoot until it finishes, and switching weapons cancels it. The
**alien energy guns** (ray gun and the quest rewards) never need ammo. Your
loaded mags and reserve **carry over between sessions** (saved alongside your
money and guns) — but die and you drop your guns, and the ammo goes with
them.

### The cabin in the woods

The **axe isn't sold** anymore. Way out in the **far northwest**, past the
lake and the school, there's a long grassy corridor between two big stands of
forest — and tucked into it, ringed by trees, sits a little **pallet-wood
cabin** with a corrugated-metal barrel roof. A single **axe spins on the
ground** at its door. Walk into it and it's yours. You can only ever hold
**one** — the cabin's axe won't reappear until you've lost the one you have
(drop everything when you die, and a fresh one is waiting back at the cabin).
It's a hike from town, so bring a car. Throw it and the same rule holds — the
thrown axe becomes the one you have to retrieve, so no free cabin refill until
it's truly gone.

Bullets land where they hit: people bleed a quick dark-red spray, walls
and props kick out a small burst of dust and keep a **bullet hole** at the
impact point for a minute — pock a facade up all you like, the newest 60
holes stick around.

Land a hit and a **hitmarker** flicks out from the reticle with a crisp
tick — white when you connect, **red when you drop the target**. Recent
takedowns stack up as a small **kill feed** under the money counter
(pedestrians, officers, and wrecked vehicles each get their own colour),
fading out after a few seconds.

Die and you drop every gun you own — run back within 2 minutes to grab
them off the pavement. Picking up a gun you already own sells it for half
its price. In multiplayer the pavement is shared: anyone can scoop up your
dropped arsenal before you get back, so dying near your killer is a
donation.

Grab a wad of loose cash and a green **"+$" floats up from the spot** it
was lying and fades — a little hit of feedback anchored to the world, not
just a number ticking up in the corner.

## Inventory & hotbar

Open your **inventory** with **Tab**. It's a **7×3 grid** holding everything
you own — your fists, every gun you've bought or picked up, and your snacks —
with room to spare for the food and drink items coming later.

Below the grid, detached, is your **hotbar**: **7 slots** you fill from the
inventory for quick access in the field.

- **Click an item** in the grid to drop it into the next open hotbar slot, or
  **drag it** onto a specific slot.
- **Click a hotbar slot** to clear it.
- In the field the hotbar sits at the **bottom-center of the screen**. Roll the
  **scroll wheel** to cycle through it, or press **1–7** to jump straight to a
  slot. The item you land on is equipped.

Guns you buy or pick up, and snacks you buy, are added to your hotbar
automatically as long as there's an open slot.

## The gas station

Press **E** at the RaceTrac door to walk inside (a real interior with
snack aisles, drink fridges, a coffee maker, and a clerk at the register).
Talk to the clerk with **E**:

- **Buy a snack — $20.** Add it to your hotbar, equip it, and left-click to
  eat it for +50 hp.
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
- **Bank of America** (its BofA branch): a teller line behind glass, a working
  **vault**, an ATM lobby and velvet-rope queues. **Use the ATM** to check your
  balance, **see a teller** — or pull the biggest job in town (below).

Each has its own themed staff and props. Like the others, these interiors are
personal (never shared in multiplayer).

## The bank heist

The BofA vault is real, and you can crack it two ways:

- **The code** — walk up to a teller **with a gun drawn** and *demand the vault
  code*. They'll cough up a random 4-digit code. Punch it into the **keypad**
  beside the vault door.
- **The rocket** — if you're carrying the **rocket launcher**, just aim it at
  the vault door and fire. It blows straight open.

The moment the vault cracks you're at **4 stars**, and a **30-second timer**
starts. When it hits zero the **cops storm the lobby** — two every ten seconds —
so work fast. Inside are **3–7 stacks of cash and gold bars**; stand on one and
**hold E for 5 seconds** to haul it out ($500 a stack).

Here's the catch: the loot isn't yours yet. It sits up top as **COLLECTED $N**
until you **shake the heat completely** — only when your wanted stars fully clear
does the stolen money get laundered into your spendable cash. **Die before you
launder it and it's gone** — the collected loot drops with you.

After a successful heist the **vault goes on a 10-minute lockdown** for
*everyone* in town — no code, no rocket, no re-crack until it resets. And the
heat sticks around longer now: stars burn off more slowly, so shaking a
4-star heist takes real effort.

## The shops are alive

Every one of the six interiors now bustles with **fellow shoppers**. They
wander in through the door, browse the aisles and cases, then **line up
single-file at a checkout** — picking the shortest lane when there's more
than one (Publix has four, the bank two). The front shopper is rung up (a
quick beat and a register **ka-ching**), the line shuffles forward, and they
head out the door; a fresh trickle of customers replaces them, so a store is
never empty and never overcrowded. Browsing shoppers will **stop a staffer to
ask a question** ("which aisle is that in?" — the staffer answers back), and
idle staff **trade shop-talk** between themselves, all in their real voices.
Walk up and press **E** on a customer for a bit of banter of your own.

And they're only human — **draw a weapon inside and the whole store panics**,
dropping everything to bolt for the door. (Kids who wander in are always
off-limits.) All of this is personal and local, like the interiors themselves.

## Wanted system

Crimes earn GTA-style stars (max 5, shown in the top-left corner), and each star costs
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

Cars rumble with a plain engine note as they pass — and the pitch bends as
they close in and blow by, like the real thing. Don't stand in the road —
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

**The hero car: a red Porsche 964 Carrera 2** sits parked at the
RaceTrac, nose-in by the store. It's the fastest thing in town by a wide
margin, corners nearly flat, and rides on proper Cup 1 wheels. Above
~40 km/h its **Carrera spoiler deploys** — rising and sliding rearward
on its linkage exactly like the real auto-spoiler — and tucks back into
the black slot in the engine lid when you slow down. PORSCHE script on
the taillight band, *Carrera 2* on the rear panel. Steal it like any
parked car (E to break in).

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
WASD to drive, **E** to get out (the controls all live in the pause-menu
**CONTROLS** tab — the driving view itself stays clean, no on-screen speedo
or button prompts). Tap **R** to flip on the
**car radio** and cycle its stations — **Electronic, Rap, Chill, Rock**, or
off. Each station plays a set of tracks on a loop; the music is yours alone
(other cars stay quiet), and it cuts out the moment you step out, wreck, or
die. Every car remembers **its own** radio: hop out and back into the same
ride and it's right where you left it, same station and song. But **jack a
fresh car** and you inherit whatever the last driver had going — often the
radio's off, and when it's on you drop in **partway through** a random song,
like they'd been listening the whole time. The
engine note dies with it too — step out or get wasted and the idle goes
silent. You can't shoot from the driver's seat,
but the car itself is the weapon — mow down pedestrians and cops, and
ram traffic to send it spinning out of control like you'd shot it up.
**Bail out at speed and the car keeps rolling** — it coasts on down its
path driverless, flattening anyone in the way and **exploding** on the first
solid thing it hits if it's still moving fast. Jump out going fast enough
and your character **tuck-and-rolls** out along the car's heading — the view
swings to third person, tumbles you across the pavement, then zooms back into
your head and hands you control — so you can line a car up on a target, leap
clear, and let it fly. (Ease out slowly instead and it just coasts to a stop.)
Trees and street lights snap and topple if you plow through them, in a
shower of leaves or sparks — they grow back about a minute later. Fences
break the same way, one panel at a time: plow a car through a picket,
chainlink or wood-privacy fence and the panels you hit clatter flat in a
puff of splinters, leaving a driveable gap while the rest stays standing
(they mend after about a minute too).

Your stolen ride isn't bulletproof: police fire chews through it. When
it catches **fire you have ~5 seconds to bail** before it explodes.

Drive into the **lake** and the engine floods and stalls — the car sinks
to the bottom with a splash and settles on the bed, so **get out (E)**
before it goes under; you'll surface into the swimmable water while the
sunken wreck stays put until it's towed.

Cars have some life to them: bodies bounce on their suspension (slam a
curb or a wall and feel it), the front wheels visibly steer, and after
dark every car projects real headlight pools onto the asphalt.

## Flying (Learjet)

Press **K** to spawn a **Learjet 35** on the ground in front of you and
drop straight into the pilot's seat. Flying is third-person, chase-cam,
and deliberately arcade — forgiving and fun, not a study sim:

- **W / S** — throttle up / down (you need speed for lift).
- **A / D** — rudder: yaw left / right.
- **Mouse** — the yoke: push the mouse **DOWN to climb** and up to descend
  (yoke-style, intentionally inverted from the on-foot look), and **left /
  right to roll**. Bank into a turn and the plane carves around.
- **E** — get out (and, once parked, **[E] near the plane climbs back in**).

The turbines **spool up as you feed in throttle** and settle to a steady
whine at cruise, so you can fly by ear as much as by the speed readout.

Hold the runway with the throttle open; once you're past takeoff speed and
pull the nose up, the jet **rotates and lifts off**. Below takeoff speed
there's not enough lift and you'll just sink back down — so build speed
first. The **landing gear retracts** on its own once you're well clear of
the ground and **drops back down** as you come in to land. Set it down
gently, wheels-down and slow, and it's a clean landing; come in too fast,
too steep, or slam a building and the jet **crashes** — a fireball, ten
tumbling chunks of wreckage, and a scorched patch burned into the ground
(the debris and scorch clear after about a minute). Crash while you're in
the cockpit and you die with it.

Don't try to **bail out** to cheat a doomed plane: stepping out up high or
at speed throws you clear and the fall does the rest. Falling from any real
height now hurts — a big drop is lethal — so a safe exit means slow and low.
The plane is a **local, single-player toy** for now; it isn't shared in
multiplayer.

## Streetcars on rails

The city's got a **streetcar** — a yellow-and-maroon trolley that trundles
along its own **rail line**, recreating the real town's rail streetcars.
Rails are drawn in the map editor just like roads (the **Streetcar Rail**
class), and a **station platform** prop drops beside the track wherever you
want a stop. Then it runs itself:

- **One tram per line.** It spawns at a station, **crawls slowly** along the
  rails to the station at the other end, **waits** there a few seconds, and
  **reverses** back — endlessly. The rails can **curve**, and the tram leans
  through the bends, following the track exactly.
- **You can't ride it** — it's part of the world, not a vehicle.
- **Stay off the tracks.** Anything at ground level in its path gets flattened:
  it **kills NPCs, cops, and you**, and **wrecks any car** it catches. The
  collision is **ground-level only**, though — fly a plane over it or drive
  across on a **highway overpass** and it passes harmlessly beneath you.
- **Only a rocket stops it.** Bullets and cars bounce off; a **rocket** blows
  it apart in a fireball. It's gone for a little while, then a fresh tram
  **respawns at a station** and the line runs again.

There's a **test line with two stations** out in the open field southwest of
town (around x −140, z 520) to see it in action.

## The monorail

High overhead there's an **elevated monorail** — a concrete guideway up on
piers (no ramps, no ground connection; it's a world fixture) with steel rails
on top, drawn in the editor with the **Monorail** road class. A **two-car
train** rides it:

- The **two cars are linked** but each follows the rail at its own point, so
  the pair **articulates through curves** like a real train — they angle apart
  on a bend and line back up on the straights.
- **No stations** — it simply runs to the end of the guideway, **reverses**,
  and heads back.
- Its collision lives **up at guideway height**, so it **never touches the
  ground** — walk, drive, or fight right underneath it and nothing happens.
  (Only something up at its level — say, a stray plane clipping the deck —
  would get hit.) It's not rideable.

The **test guideway** is a curved (L-shaped) line in the open field east of
town (around x 500, z 380).

## Trees

The oaks and bushes are real PS1-style assets — flat textured branch
cards with alpha cutouts, from the free "retro nature pack" by
**ElegantCrow** — and the median crepe myrtles bloom pink off the same
leaves. They still snap like twigs if you drive through them.

The town is landscaped like real Florida suburbia. **Sabal palms** now
carry full three-tier canopies — a dozen-plus fronds arcing up, out and
drooping — in four variants (tall, standard, young and wind-leaned) so no
two are identical. **Crepe myrtles** grow as proper multi-stem vases,
several slender trunks fanning up into a rounded pink-and-white bloom.
Every commercial front has a foundation bed (low hedge, mulch strip,
shrubs and fountain grass split around the door), the bigger parking lots
have curbed landscape islands with a palm and a shrub ring, and now **every
house** gets its own foundation planting hugging the front wall. Street
trees sit in curbed **tree wells** — a soil cutout with a cast-iron grate
— instead of poking straight through the sidewalk, and low shrubs keep to
the planting strip rather than the walk.

The main intersection is dressed like the real one: galvanized mast-arm
**traffic signals that actually cycle** — and now **traffic obeys them**:
cars slow and queue bumper-to-bumper at a red, wait out the cycle, and
pull away on green. They also keep a safe following gap on the open road
and tap the brakes for a beat at the smaller uncontrolled intersections.
Drivers aren't clones anymore — they cruise at different speeds, and the
impatient ones tuck in closer and **lean on the horn** when they've been
stuck behind someone or sitting at a red too long. Step into a moving
car's path and you'll get an angry blast, too (tasteful cooldowns keep it
from turning into a horn symphony).
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
wacky-waving **tube man** and a hot-dog cart out at the RaceTrac; a tall
branded **RaceTrac price pylon** at the curb whose fuel prices glow in real
7-segment LED digits after dark (and occasionally flicker); flamingos,
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
roads and parking lots switch on automatically, each casting a soft warm
pool of light on the asphalt below — and the ornate park lamps (Publix lot
edge, the strip-mall plaza, the lakeside path) light their globes right
along with them. After dark the town reads as lived-in:
windows glow warm in a scattered, inhabited pattern across the buildings,
and the storefront and venue signs (RaceTrac, Publix, Dollar Tree and the
rest) pick up a warm neon backglow. All of it is gated to night and fades
away by morning. Rain rolls in at random —
grey skies by day, pitch black at night — and now comes in different
strengths, from a light drizzle to a heavy downpour, each with matching
rain density, sound, and haze. Overcast spells drift through on their own,
softening the sky, and once a heavier rain clears on a bright day you might
catch a faint rainbow arc over the intersection.

The town also has its own soundscape that shifts with the clock: gentle
birdsong and a soft suburban hum by day, a cicada/cricket shimmer at night,
plus the occasional far-off dog bark, passing car, or fluttering bird — all
kept low and sparse so it stays background ambience. Everything runs under
the same quiet noise bed as before, and the SFX volume slider controls it.

## Controls

- **WASD** — move, **Shift** — run, **Space** — jump, **Mouse** — look
- **Left click** — punch / shoot
- **R** — **reload** the equipped gun from your reserve (while driving, R cycles the car radio)
- **Scroll wheel** — quick-swap to your next / previous weapon
- **1 – 0** — jump straight to a weapon by number (its slot in your owned list —
  1 is fists; keys for weapons you don't own are ignored). A **quick-bar** along
  the bottom of the screen shows those slots with their number keys and lights up
  the one you're holding (toggle it in Settings)
- **`[` / `]`** — zoom the minimap out / in (WIDE / NORMAL / CLOSE); **Ctrl+scroll**
  does the same. Your choice is remembered between sessions.
- **M** — drop a personal **waypoint** at whatever you're looking at (or click the
  minimap while a menu is open). A cyan world beacon, an on-screen marker with
  live distance, and a minimap blip guide you there; it clears when you arrive
  or when you press **M** again.
- **E** — talk to the dealer (when close)
- **P** — **photo mode**: the HUD and your gun vanish and the world freezes so
  you can line up a shot. Fly the camera with **WASD**, climb / descend with
  **Space / C**, hold **Shift** to move faster, mouse to aim. **P** or **Esc**
  drops you back where you were — nothing in the world moves while you're framing,
  so it's safe to pop into mid-firefight.
- **H** — on foot, open the in-game **controls / help overlay**; while driving,
  honk the horn (also reachable from the pause screen's **CONTROLS** button)
- **Tab** — inventory: equip/unequip weapons + your 6×4 item grid (click an
  item to use it, right-click or **Q** to drop one)
- **K** — spawn the **Learjet** in front of you and hop in as pilot (see
  **Flying**)
- **Enter** — open text chat (multiplayer), **Esc** to cancel
- **Hold V** — push-to-talk voice chat (multiplayer)
- **F8** — report a bug (grabs a screenshot + your note, sent for triage —
  the report auto-attaches the nearest collision boxes so "invisible wall"
  reports pinpoint their culprit)
- **F9** — toggle the collision debug overlay (outlines every barrier: red
  boxes, orange rotated boxes, cyan water edges)
- **Esc** — release mouse / close menus

## Minimap

The bordered map in the top-right is fixed-north (an **N** sits at the top edge)
and your marker is a **heading arrow** that turns as you look around. Named
venues show as colour-coded blips with short labels — **RT** RaceTrac, **PUB**
Publix, **DD** Dunkin, **SB** Starbucks, **BK** banks, **RX** pharmacy, **SU**
sushi, **SCH** the school, **DT** Dollar Tree — plus the **LAKE** and a crosshair
on the main intersection. Live blips overlay the map: cars (amber), pedestrians
(white), cops (blue), other players (green), cash (green), dropped weapons
(magenta), and your personal waypoint (blinking cyan). Zoom with **`[` / `]`**
(or Ctrl+scroll): the WIDE level shows the whole town, and NORMAL / CLOSE scale in
and follow you for detail work.

## Settings

Hit **SETTINGS** on the main menu — or open it from the pause screen mid-game —
to tune the game to your taste. Everything applies live and saves automatically
(stored in your browser), so it's the way you left it next time:

- **Mouse sensitivity** and **Invert Look Y** — dial in your aim.
- **Field of view** — 70–100°, wider if you like more on screen. Sprinting
  eases the view a few degrees wider for a sense of speed, then settles back.
- **Master / SFX / Voice volume** — three sliders. Master scales everything;
  SFX covers world and UI sounds; Voice controls the characters' dialogue.
- **Draw distance** — Low / Medium / High. Higher pushes the fog back for a
  longer view; Low trims the render detail for smoother performance on slower
  machines.
- **CRT filter** — the scanline-and-vignette TV look, on or off.
- **Crosshair** — show or hide the aiming reticle.
- **Minimap** — show or hide the corner map.
- **Hit markers** — show or hide the hit ticks and the kill feed.
- **Weapon bar** — show or hide the bottom-center quick-bar of owned-weapon
  slots (each tagged with its number key, the equipped one lit).
- **Reset to defaults** — puts everything back the way it shipped.

## Rumors

Old-timers at the Dunkin swear that folks who get *seriously* rich around
here start seeing strange lights over town. They also swear it only ever
happens once — and that whatever falls out of the sky belongs to whoever
gets to it first, not to whoever made it show up. Probably nothing.

The same regulars will tell you the town keeps a few smaller secrets, too.
Somebody's been tucking little **gold glints** away in the parts of town
nobody looks twice at — round the *backs* of the big stores, down a service
alley, out where the tree line closes in, along the far shore. Walk close
enough to one and it's yours. Nobody's ever found them all in one afternoon.

And if you're the sort who remembers *old* secrets — the kind you'd punch
into a controller, up and down and left and right, a couple of letters to
finish — well. Try it standing still sometime and see what falls out of the
air. Every so often, if you're just wandering, you might also catch a stray
knot of **party balloons** that got away from somebody, drifting up over the
rooftops and gone. Wave if you see them.

And once in a great while — no gun, just your **bare fists** — a punch comes
out *wrong*. Your hands snap forward, cupped, and a roaring blue-white **energy
beam** tears out of them for five seconds. Sweep it across the street and
whatever it touches — people, cops, cars — is simply gone. You can't switch
weapons while it's firing; when it fades your hands drop back to fists like
nothing happened. Keep throwing hands and you'll see it eventually.

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
- The outer residential pockets now have their own street networks,
  ground-truthed against the real Westchase layout (OpenStreetMap around
  Race Track Rd @ Countryway Blvd): east of Race Track Rd, the Fawn
  Ridge-style quarter gets **Mountbatten Dr** (a collector riding the old
  survey alignment), **Northumberland Dr** (through-route down to Citrus
  Park Dr), and the **Evanshire / Tudor Chase / Gothic Ln** local grid;
  west of Race Track, **Halbrook Dr** loops from the arterial through the
  estate cluster down to **Stilton St** (the long far-west lane) with
  **Stanwyck Cir** and **Bassbrook Ln** branching off; **Minaret Dr** ties
  the SE pocket street back to Race Track; and **Chase Grove /
  Pond Cypress** side lanes serve the homes west of Nine Eagles. AI
  traffic drives the new collectors, streetlights and power poles line
  them, and nearly every outer house now gets a paved **driveway** stub
  from its front wall to the nearest local street (long straight drives
  for the deep Florida lots).
- The map is finite — a wall rings the city.
- Watch for traffic; cars hurt.
- Getting knocked out costs you 10% of your cash (capped at $500). Half of what
  you lose spills onto the pavement as cash you (or your killer) can grab within
  2 minutes before it despawns; the other half is gone. Your guns drop too.
- `serve.ps1` is only there so the dev preview can host the game locally;
  the game itself doesn't need it.
