# Bug-report triage board (F8 reports on the Railway store)

Statuses: OPEN / IN-AGENT (assigned to a fix round) / FIXED@version / WONTFIX.
Claude agents: update this file when you fix or ship something so rounds
don't collide. Report images: /bug/<id>.jpg?key=<BUG_ADMIN_KEY>.

## Round 1 — SHIPPED v1.64.1
- mredmh10 (Don walks into garden bed) — FIXED@v1.64.1 (whisker on door errands)
- mredohyy (npc stuck at Publix)       — FIXED@v1.64.1 (same)
- mredqpxe (npcs running into props)   — FIXED@v1.64.1 (same)
- mredmh10b (nameplates in SP)         — FIXED@v1.64.1

## Round 2 — IN-AGENT (placement rules)
- mredltkw (arcade mid-sidewalk + odd pedestal box) — IN-AGENT
- mredo5nx (gumball cluster)                        — IN-AGENT
- mrednis0 (cars through Publix lot wall)           — IN-AGENT
- mredpkae (tree in building)                       — IN-AGENT
- mredq7g0 (striped boards clip column)             — IN-AGENT

## Round 2 — IN-AGENT (animation)
- mredkjhs (splayed walk stride)     — IN-AGENT
- mredp25b (walker not held)         — IN-AGENT
- mredn2zu (silent talking pair)     — IN-AGENT

## Round 3 — OPEN: collision/gameplay (next up, high priority)
- mree5z0n (-223,225) invisible barrier — FIXED@v1.65.3 (rotated houses now use ORIENTED colliders; the axis-aligned AABB was swallowing driveways)
- mreealh2 (-415,262) invisible wall — FIXED@v1.65.3 (same OBB fix — the gap between two houses is drivable again)
- mreee1df (-207,31)  invisible wall — IN-AGENT (round3-collision)
- mree6h2d (-260,271) walk through tree — IN-AGENT (round3-collision)
- mree1rcg (55,79)    chainlink: NPCs stuck + links comically large — IN-AGENT (round3-collision)
- mredz61g (91,-18)   kids merged into each other spamming tag lines — IN-AGENT (round3-collision)
- mree93m6 (-475,353) another kid-merge during a game — IN-AGENT (round3-collision)

## Round 4 — OPEN: rendering/materials
- mree7hy2 (-370,346) ground decal alpha broken
- mree84pq (-465,416) pavement-crack decal alpha broken
- mree8hw2 (-511,421) square shadow patches
- mree2yur (11,127)   porto-potty black mesh artifacts
- mree3tg7 (-70,133)  two props glowing oddly
- mree59kf (-108,158) hair has transparent chunks
- mree0ii7 (79,1)     claw machine flashing red (+ prop jumble)

## Round 5 — OPEN: placement/content (larger passes)
- mredr84j (52,-120)  2D trashbags look bad
- mreds4nw (90,-131)  AC prop ugly; businesses want big rooftop industrial AC
- mredt4y2 (151,-143) sidewalk trees need pavement cutouts
- mredxgss (180,-125) bushes on sidewalk; sidewalk style: skinnier, single-slab
- mree10qu (62,32)    person clipping inside yellow prop
- mreeccpr/mreebnfk (-226,152) prop set jarring in front of office tower (+anim)
- mreedozu (-199,33)  unidentifiable mesh
- mreeelik (-118,75)  car placement weird
- mredwjpp (213,-160) house clips sidewalk
- mredxzx6 (140,-89)  houses with no visible roads
- mredtppi (184,-172) missing raised curb divider
- mreduh7z (187,-178) "looks awful" (see screenshot)
- mreea4we (-469,275) road ends with no curb
- mredw3ho (237,-175) palm canopy too sparse; want variants
- mree6ten (-276,261) crepe myrtle looks unnatural
- mredznws (98,12)    flies: smaller, 2-3x quantity
- mree4o24 (-82,148)  pizza sign rotates on wrong axis
- mree9kv6 (-477,355) umbrella grip pose
- mreed9ar (-194,21)  smoke/fire: redo as AI sprite sheets (research game VFX)

## Notes
- mrdphrsv is Claude's own deploy test, ignore.
