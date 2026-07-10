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
- mredltkw (arcade mid-sidewalk) — FIXED@v1.65.6 (it was the quest-6 portal; moved flush to the townhouse wall)
- mredo5nx (gumball cluster) — FIXED@v1.65.6 (shared clutter-spacing registry across density+env storefront passes)
- mrednis0 (cars through lot wall) — FIXED@v1.65.6 (wall moved to pedestrian frontage, split around the entrance)
- mredpkae (tree in building) — FIXED@v1.65.6 (canopy-margin building clearance in oak()/palm())
- mredq7g0 (boards clip column) — FIXED@v1.65.6 (BACK_CLUTTER placed with clearance+spacing+retries)

## Round 2 — IN-AGENT (animation)
- mredkjhs (splayed walk stride)     — IN-AGENT
- mredp25b (walker not held)         — IN-AGENT
- mredn2zu (silent talking pair)     — IN-AGENT

## Round 3 — OPEN: collision/gameplay (next up, high priority)
- mree5z0n (-223,225) invisible barrier — FIXED@v1.65.3 (rotated houses now use ORIENTED colliders; the axis-aligned AABB was swallowing driveways)
- mreealh2 (-415,262) invisible wall — FIXED@v1.65.3 (same OBB fix — the gap between two houses is drivable again)
- mreee1df (-207,31)  invisible wall — IN-AGENT (round3-collision); note: likely the lakeside chain-post row (visible but thin), OBB fix may already help
- mree6h2d (-260,271) walk through tree — IN-AGENT (round3-collision)
- mree1rcg (55,79)    chainlink: NPCs stuck + links comically large — IN-AGENT (round3-collision)
- mredz61g (91,-18)   kids merged spamming tag lines — FIXED@v1.65.4 by fable agent (no tag-backs + fresh-it freeze + pairwise separation) — round3-collision: SKIP, already shipped
- mree93m6 (-475,353) kid-merge during game — FIXED@v1.65.4 (same) — round3-collision: SKIP, already shipped

## Round 4 — IN-AGENT (round4-render)
- mree7hy2 (-370,346) ground decal alpha broken — FIXED@v1.66.1 (ground stain/crack/fixture decals were opaque quads; added bg-colour blend-key + edge vignette in dTex/GKEY, transparent+depthWrite:false)
- mree84pq (-465,416) pavement-crack decal alpha broken — FIXED@v1.66.1 (same root cause)
- mree8hw2 (-511,421) square shadow patches — FIXED@v1.66.1 (same — asphalt/mud_patch hard rectangle now blends); ALSO covers Batch4 mreewls4 (-467,332) dark square under trees
- mree2yur (11,127)   porto-potty black mesh artifacts — FIXED@v1.66.6 (env-prop material was smooth-shaded; smooth-averaged corner normals on the low-poly boxy mesh smeared faces dark. flatShading:true on env-prop materials → clean facets. Residual dark top is the asset's baked roof-vent opening, not a bug)
- mree3tg7 (-70,133)  two props glowing oddly — FIXED@v1.66.6 (the 'glow' anim strobed emissive 0.02-0.54 at FULL strength in daylight; now gated by wcNightGlow — faint ~0.05 daytime accent, ramps up after dark)
- mree59kf (-108,158) hair has transparent chunks — IN-AGENT (round4-render)
- mree0ii7 (79,1)     claw machine flashing red — FIXED@v1.66.6 (same glow-gating fix; the red 'flash' was the soda_machine's emissive strobing in daylight next to the claw. NOTE: the "prop jumble"/clustering at this cluster is a PLACEMENT issue — Round-2/5 territory, not touched here)

## Round 5 — OPEN: placement/content (larger passes)
- mredr84j (52,-120)  2D trashbags look bad
- mreds4nw (90,-131)  AC prop ugly; businesses want big rooftop industrial AC
- mredt4y2 (151,-143) sidewalk trees need pavement cutouts
- mredxgss (180,-125) bushes on sidewalk; sidewalk style: skinnier, single-slab
- mree10qu (62,32)    person clipping inside yellow prop
- mreeccpr/mreebnfk (-226,152) prop set jarring in front of office tower (+anim)
- mreedozu (-199,33)  unidentifiable mesh
- mreeelik (-118,75)  car placement weird
- mredwjpp (213,-160) house clips sidewalk — FIXED@v1.66.5 (survey houses now nudged clear of the sidewalk ribbon: houseSidewalkNudge pushes any footprint intruding the walk band outward; 30 instances, ~4.5u max)
- mredxzx6 (140,-89)  houses with no visible roads — IN-AGENT (round5-structure)
- mredtppi (184,-172) missing raised curb divider — IN-AGENT (round5-structure)
- mreduh7z (187,-178) "looks awful" (see screenshot)
- mreea4we (-469,275) road ends with no curb — FIXED@v1.66.6 (remapDeadEndCurbs caps genuine street dead-ends — incl the SW industrial stub — with a low concrete curb bar + side returns; non-colliding, skips loops/junctions/exits/venue-ends)
- mredw3ho (237,-175) palm canopy too sparse; want variants
- mree6ten (-276,261) crepe myrtle looks unnatural
- mredznws (98,12)    flies: smaller, 2-3x quantity
- mree4o24 (-82,148)  pizza sign rotates on wrong axis
- mree9kv6 (-477,355) umbrella grip pose
- mreed9ar (-194,21)  smoke/fire: redo as AI sprite sheets (research game VFX)

## Notes
- mrdphrsv is Claude's own deploy test, ignore.

## Batch 3 (uncatalogued -> assigned)
- mreegamp (-140,43) placement bad — R5
- mreegvj0 (-157,20) leaf cluster + missing alpha — IN-AGENT (round4-render)
- mreehkm9 (-142,-9) lemonade stand wants kid vendor + dialogue — R5 feature
- mreei0of (-142,-30) flower bed out of place — R5
- mreeipmy (-161,-76) ice cream truck wants vendor — R5 feature
- mreejak5 (-158,-86) fences should break in panels under cars — R5 feature
- mreejycz (-112,-48) whole swing rocks; odd placement — R4 anim
- mreekjjq (-7,-57) walker accessory abandoned in street — R2 anim overlap
- mreelboe (-70,-115) big green blob — IN-AGENT (round4-render)
- mreelusq (-113,-114) cop left arm buggy + walks into building — R3
- mreemd0e (-194,-110) garage door between windows on facade — R5 — IN-AGENT (round5-structure)
- mreendej (-8,-330) purple-home roof texture + overhangs sidewalk — R5 — IN-AGENT (round5-structure)
- mreenqoe (-25,-347) homes with no road/walkway — R5 (same class as mredxzx6) — IN-AGENT (round5-structure)
- mreeoimw (-1,-517) traffic too uniform; want occasional honks — R5 feature
- mreeosgw (-10,-492) lamp post + tree clipping — R5 — IN-AGENT (round5-structure)
- mreepojo (157,-74) 'half ass gas station' — R5
- mreeq7nj (150,193) random barrier — R3 (re-probe post-OBB fix)
- mreeqqbh (298,235) road looks awful — R5
- mreer5b4 (419,172) houses riding the sidewalk — FIXED@v1.66.5 (same houseSidewalkNudge shared fix)
- mreesgtd (238,516) parked cars with lights on — IN-AGENT (round4-render)
- mreet1el (273,474) NPC pacing left-right loop — R3 (check whisker ping-pong)
- mreetig1 (233,306) secondary intersection looks bad — R5

## Batch 4 (all filed from a v1.64.0 session — the live page never reloads
## mid-session, so collision reports below may predate the v1.65.3 OBB fix;
## re-verify before working them)
- mreeuf0c (-97,338)  random wall — R3 re-check post-OBB
- mref1z9y (298,80)   invis wall — R3 re-check post-OBB
- mreez9lq (-148,-34) npcs walking into a light pole — R3 re-check post-whisker (thin-pole probe gap?)
- mreeuu2g (-136,230) unclear props — R5
- mreewls4 (-467,332) dark square under trees — FIXED@v1.66.1 (round4-render; same ground-decal blend-key fix as mree8hw2)
- mreexjvh (-178,170) road/tile seam bad — R5 roads
- mreexz4c (-163,120) road area bad — R5 roads
- mreeyfs8 (-167,56)  fountain droplets -> sprite VFX — R5 VFX (with mreed9ar smoke/fire)
- mreeyvkn (-157,36)  same, AI sprite VFX — R5 VFX
- mref0pwi (205,272)  bus stop facing wrong way — R5
- mref0zmv (205,272)  ugly road junction — R5 roads
- mref1n8n (321,186)  sidewalk looks bad — R5

## Batch 5 (east-side sweep)
- mref269d (287,85)  invis wall at forest patch edge — FIXED@v1.65.5 (edge tree line 13u->8u spacing, tight inset, corner trees)
- mref2fm0 (315,171) invis wall — probed post-OBB: 10% edge block from a correct house OBB; likely stale v1.64.0 session. RE-CHECK if refiled
- mref2zey (534,-29) invis wall — probed post-OBB: healthy house colliders. RE-CHECK if refiled
- mref1z9y (298,80)  invis wall — probed: pond collider is player-passable (lake flag). RE-CHECK if refiled
- mreeuf0c (-97,338) random wall — same class, RE-CHECK on current build
- mref3ibd (535,126) AC unit 3x size wanted — R5 (with mreds4nw rooftop AC)
- mref3wds (391,191) backwards bus stop — R5 (with mref0pwi)
- mref48hy (374,195) sign clipping post — R5 — IN-AGENT (round5-structure)

## Batch 6
- mrefkx0p (-49,17) pavement lines shimmer with camera motion — FIXED@v1.66.3 (logarithmicDepthBuffer on the main renderer; near-plane raise was rejected — viewmodels hug the camera)

## Batch 7 (31 reports, mrefm6zw..mregenli — user now on v1.65.4/v1.66.0)
Clusters:
- CHAINLINK/STUCK cluster (round3-collision territory): mregbuvd/mregc5uc/mregcixv walking into RaceTrac fence; mregb8uv/mregbgkm people stuck; mrefuw9y stuck on building; mrefnfji stuck on prop + wants NPC-vs-NPC collision
- ANIMATION cluster (fold into round2-anim on return): mrefmjf0 worst walk (she); mregajgt gary weird walk; mregazq4 leon shoulder; mrefp3hw floating guy; mreg77qb boombox hold; mregcwvd luggage roll; mregenli nia walk + bike texture + xander voice
- INTERIOR cluster (other agent's shop systems): mrefpkq1 cashier voicelines; mrefq2w5 npcs stuck on shelves; mrefqf7b warped texture; mrefwcmm $1.25 sign floating/one-sided + boring shelves; mrefv6f6 interior 'invisible wall' (room bounds, needs visible walls)
- CONTENT/GEN requests: mrefm6zw real Publix logo (AI gen + tile); mrefogw8 avoid duplicate NPC looks + 5x NPC density; mrefucxb NPCs voice not text; mrefsp85 varied car engine sounds; mrefts2d ugly palms (with mredw3ho variants)
- QUICK FIXES: mrefti0d flowers mid-road — FIXED@v1.66.4 (shrub/grass road-clearance guard at source); mreg8mld post not breakable; mrefrgtb pistol should be one-handed (viewmodel); mreft54h unnatural U-turns at junction; mregdctj sign post clipping
