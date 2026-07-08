# WESTCHASE — retro FPS

A first-person game whose map is modeled on the real Linebaugh Ave
intersection in Westchase, FL (near Farnell Middle / Bryant Elementary).
The four corners match the satellite view: gas station (SE, robbable),
dollar store + storage + blue-roof strip malls (SW), a bank + pharmacy +
sushi restaurant (NE), and a bank + supermarket + school + townhouses to
the lake (NW). Coffee shop, offices, and the 5-story red-roof house (the
tallest structure in town) sit west along the main road. Outskirt
neighborhoods, a lake, dense impassable oak forest with a fogged backdrop,
and "ROAD CLOSED" barriers at the map edges round it out. Renders at 480p
with low-res procedural textures for a retro-but-realistic look.

## How to play

Just double-click `index.html` — it runs in any modern browser, no install needed.
(Everything is local: Three.js and PeerJS are bundled, all textures are generated in code.)

## Multiplayer

The main menu offers **Singleplayer** (fully offline) or **Host Multiplayer**.
Type a **display name** at the top of the menu first — it floats over your
head in-game with your **health bar** under it, so everyone can see who you
are and how hurt you are (the name is remembered for next time). Hosting
creates a lobby and gives you an **invite link / code** to send to friends
(needs internet — connections go peer-to-peer over WebRTC, with an
automatic relay fallback so two players on the same wifi/router can join
each other too; the game generates fresh relay credentials each session).
Friends open the game and paste the link or code into the JOIN box. You'll
see each other in-world (on foot or driving, with name tags and cyan
minimap dots) and can shoot and punch each other — or steal each other's
wheels: press **E** on a car a friend is driving to **hijack it** and dump
them on the curb. A freshly hijacked car can't be hijacked again for 15
seconds, so make your getaway count. The **host runs the world**:
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
them. (Gas-station interiors themselves stay personal.)

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
loses control the same way. Wrecks respawn after a few seconds.

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
- **Esc** — release mouse / close menus

## Rumors

Old-timers at the Dunkin swear that folks who get *seriously* rich around
here start seeing strange lights over town. They also swear it only ever
happens once — and that whatever falls out of the sky belongs to whoever
gets to it first, not to whoever made it show up. Probably nothing.

## Notes

- The map is finite — a wall rings the city.
- Watch for traffic; cars hurt.
- Getting knocked out costs you 25% of your cash.
- `serve.ps1` is only there so the dev preview can host the game locally;
  the game itself doesn't need it.
