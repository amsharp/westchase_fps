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
whoever earned them. (Gas-station interiors and weapon drops stay personal.)

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

## The loop

You spawn **with no gun**. Punch pedestrians (they drop cash), pick up the
green bills, then find the **gold $ on the minimap** — that's the dealer at
Westchase Guns & Ammo. He sells three guns:

| Weapon | Price | Notes |
|--------|-------|-------|
| Pistol | $150  | semi-auto, reliable |
| SMG (TEC-9) | $400 | full-auto, sprays |
| Rifle  | $600  | one shot, one nap — right-click to scope |
| AK-47  | $1000 | full-auto, long range, accurate |
| Rocket launcher | $2000 | 5s reload; the blast doesn't care whose side you're on |

Die and you drop every gun you own — run back within 2 minutes to grab
them off the pavement. Picking up a gun you already own sells it for half
its price.

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
**3 minutes**.

## Wanted system

Crimes earn GTA-style stars (max 5, shown top-center):

- Robbing the register at gunpoint → instantly 2 stars.
- Every 5 civilian knockouts → +1 star.
- Downing a cop → +1 star.

At 1 star, patrolling officers only open fire if you get close. At 2+,
every cop in town hunts you down, and more spawn per star. Below 4 stars
they carry short-range pistols; at 4–5 stars they roll full-auto SMGs that
reach much further. Lay low (no crimes, no cops within sight) and the
stars tick back down. Getting knocked out clears your wanted level.

## Traffic & driving

Cars hum with engine noise as they pass. Don't stand in the road — getting
run over ragdolls pedestrians sky-high with a blood splatter (and hurts
you too). Shoot a moving car for ~3 seconds and it loses control, floors
it, and explodes on whatever it hits — killing anything nearby, you
included. Wrecks respawn after a few seconds.

Press **E** next to a passing car to carjack it — the driver bails and
runs off screaming (and yes, that's a crime). Driving is third-person:
WASD to drive, **E** to get out. You can't shoot from the driver's seat,
but the car itself is the weapon — mow down pedestrians and cops, and
ram traffic to send it spinning out of control like you'd shot it up.
Trees and street lights snap and topple if you plow through them, in a
shower of leaves or sparks — they grow back about a minute later.

Your stolen ride isn't bulletproof: police fire chews through it. When
it catches **fire you have ~5 seconds to bail** before it explodes.

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

## Notes

- The map is finite — a wall rings the city.
- Watch for traffic; cars hurt.
- Getting knocked out costs you 25% of your cash.
- `serve.ps1` is only there so the dev preview can host the game locally;
  the game itself doesn't need it.
