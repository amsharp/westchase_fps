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

## The gas station

Press **E** at the RaceTrac door to walk inside (a real interior with
snack aisles, drink fridges, a coffee maker, and a clerk at the register).
Talk to the clerk with **E**:

- **Buy a snack — $20.** Equip it from your TAB inventory and left-click
  to eat it for +50 hp. One bite, one bag.
- **Rob the register** — only works with a gun in your hands ($100–$300,
  instant 2 stars). Try it bare-knuckled and the clerk hits the panic
  button: police storm the store to kill you.

After a robbery (successful or botched), leaving locks the store for
**3 minutes** — for everyone. In multiplayer one robbery closes the store
server-wide until the lockout expires.

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
There are cobra-head streetlights, wood
utility poles trailing sagging lines down the main road, sabal-palm
clusters on every corner, and proper road paint — stop bars, ladder
crosswalks, and left-turn arrows in the pockets.

## Street furniture

The town is dressed with over a hundred AI-generated props — dumpsters,
benches, bus shelters, planters, shopping carts, signs, cones and jersey
barriers around a roadwork site, mailboxes by the townhouses, picnic
tables by the lake. The big stuff is solid (and stops bullets); poles,
signs, cones, cans, and carts snap and scatter if you drive through them.
Some of it does more than sit there:

- **Vending machines** ($2, press E) drop a soda out the front — pick it
  up, equip it from TAB, and drink it for +25 hp.
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
- **Buy** from the hot-dog cart, ice-cream truck, food truck or a kid's
  lemonade stand — a few bucks for a quick heal.
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
- **Tab** — inventory: equip or unequip weapons (you must unequip to punch)
- **Enter** — open text chat (multiplayer), **Esc** to cancel
- **Hold V** — push-to-talk voice chat (multiplayer)
- **F8** — report a bug (grabs a screenshot + your note, sent for triage)
- **Esc** — release mouse / close menus

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
