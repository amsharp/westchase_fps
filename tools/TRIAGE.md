# Bug-report triage board (F8 reports on the Railway store)

Statuses: OPEN / IN-AGENT (assigned to a fix round) / FIXED@version / WONTFIX.
Claude agents: update this file when you fix or ship something so rounds
don't collide. Report images: /bug/<id>.jpg?key=<BUG_ADMIN_KEY>.

## BARRIER GATE (run before EVERY ship)

```
NODE_PATH=/opt/node22/lib/node_modules node tools/_barrierscan.js   # server on :8155
```

Exit 0 = clean, exit 1 = orphan colliders found (colliders with NO visible
geometry inside their bounds = invisible walls). **0 orphans required to
ship** — fix the source pass or, for a genuine false positive, fix the
scanner, never the report. The scanner is instancing-aware (InstancedMesh
forest fill counts as geometry) and reads each collider's `tag` (creator
string passed to addCollider/addColliderOBB — always tag new call sites).
`STRICT=1` additionally disables the mapBuildings/breakables registry
shortcut so every collider must be proven by raw geometry (slower; run it
when touching those registries). Debug aids: **F9** in-game toggles the
collider overlay (`__wc.showColliders(on)`), and every F8 bug report's meta
now carries `cols:` = the 3 nearest colliders with tags.

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
- mredkjhs (splayed walk: HECTOR) — FIXED (per-char leg-yaw retarget correction MESHY_LEG_FIX; lat 0.85->0.31)
- mredp25b (walker not held) — FIXED (poseWalkerGrip: hunch + hands on grips + shuffle; also covers refile mreguavi — its v1.66.6 session predates the fix)
- mredn2zu (silent talking pair) — FIXED (8/35 civs ship no voice pack; pairs now require a voiceable opener, all-mute pairs skip)

## Round 3 — OPEN: collision/gameplay (next up, high priority)
- mree5z0n (-223,225) invisible barrier — FIXED@v1.65.3 (rotated houses now use ORIENTED colliders; the axis-aligned AABB was swallowing driveways)
- mreealh2 (-415,262) invisible wall — FIXED@v1.65.3 (same OBB fix — the gap between two houses is drivable again)
- mreee1df (-207,31)  invisible wall — stale@v1.66.12 (no invisible-wall repro on current build; probed: the lakeside N-S corridor is fully walkable, and the only blockers near the point are the VISIBLE white picket "lake E promenade" fence at x=-188 and VISIBLE chain_post bollards — both match their meshes, with walkable gaps. Original v1.64.0 report predated the v1.65.3 house-OBB fix)
- mree6h2d (-260,271) walk through tree — FIXED@v1.66.11 (forestPatch dropped a whole small leaf's collider when a road merely clipped its SW corner, but expForestFill still planted instanced trees across the entire rect -> walk-through forest. Non-clear leaves now split finer + tile their road-clear interior with colliders via forestPatchClearTiles; +0 new road blocks vs baseline)
- mree1rcg (55,79)    chainlink: NPCs stuck + links comically large — FIXED@v1.66.12 (LINKS: the chainlink data-URL is a 2m strip with coarse native diamonds, tiled once over height -> giant lattice; now tiled at a fixed ~0.7u square period so links read as fine ~0.2u mesh. NPCs: whisker steering gained a wide ±112° escape tier + a wall-slide watchdog that abandons a target after ~2.2s of hugging a collider with no real headway; forced cross-fence NPCs went from lingering 3.5-8.5s to <=3s)
- mredz61g (91,-18)   kids merged spamming tag lines — FIXED@v1.65.4 by fable agent (no tag-backs + fresh-it freeze + pairwise separation) — round3-collision: SKIP, already shipped
- mree93m6 (-475,353) kid-merge during game — FIXED@v1.65.4 (same) — round3-collision: SKIP, already shipped

## Round 4 — IN-AGENT (round4-render)
- mree7hy2 (-370,346) ground decal alpha broken — FIXED@v1.66.1 (ground stain/crack/fixture decals were opaque quads; added bg-colour blend-key + edge vignette in dTex/GKEY, transparent+depthWrite:false)
- mree84pq (-465,416) pavement-crack decal alpha broken — FIXED@v1.66.1 (same root cause)
- mree8hw2 (-511,421) square shadow patches — FIXED@v1.66.1 (same — asphalt/mud_patch hard rectangle now blends); ALSO covers Batch4 mreewls4 (-467,332) dark square under trees
- mree2yur (11,127)   porto-potty black mesh artifacts — FIXED@v1.66.6 (env-prop material was smooth-shaded; smooth-averaged corner normals on the low-poly boxy mesh smeared faces dark. flatShading:true on env-prop materials → clean facets. Residual dark top is the asset's baked roof-vent opening, not a bug)
- mree3tg7 (-70,133)  two props glowing oddly — FIXED@v1.66.6 (the 'glow' anim strobed emissive 0.02-0.54 at FULL strength in daylight; now gated by wcNightGlow — faint ~0.05 daytime accent, ramps up after dark)
- mree59kf (-108,158) hair has transparent chunks — DEFERRED→asset-pipeline (round4-render investigated exhaustively: EVERY character hair path is opaque or side:DoubleSide with NO transparent/alphaTest — verified across PSX presets, Meshy skinned civs, kids, staff, quest chars. So see-through hair is NOT a code material bug; it's a geometry GAP in one specific AI-generated head mesh (Meshy remesh can drop tris). Needs the offending character identified + hair mesh regenerated via tools/chargen. Not code-fixable surgically.)
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
- mredxzx6 (140,-89)  houses with no visible roads — DEFER-LARGER-PASS (round5-structure): the SE pocket beyond race_track_rd has ~8-10 survey houses (incl two 60x35 buildings ~240,-135 & 304,-136) with NO internal street — the only road is race_track_rd 30-60u away. Genuinely needs a residential loop/cul-de-sac added to REMAP_ROADS; too big for a surgical nudge/driveway (houses are too far from any road to stub). Road-network pass.
- mredtppi (184,-172) missing raised curb divider — ALREADY PRESENT (r3Medians): race_track_rd DOES build a raised landscaped median+curbs; verified a continuous run [chainage 941-1170] covers (184,-172)@1047. Report predates r3Medians (stale session). RE-CHECK if refiled.
- mreduh7z (187,-178) "looks awful" (see screenshot)
- mreea4we (-469,275) road ends with no curb — FIXED@v1.66.6 (remapDeadEndCurbs caps genuine street dead-ends — incl the SW industrial stub — with a low concrete curb bar + side returns; non-colliding, skips loops/junctions/exits/venue-ends)
- mredw3ho (237,-175) palm canopy too sparse; want variants
- mree6ten (-276,261) crepe myrtle looks unnatural
- mredznws (98,12)    flies: smaller, 2-3x quantity
- mree4o24 (-82,148)  pizza sign rotates on wrong axis
- mree9kv6 (-477,355) umbrella grip pose
- mreed9ar (-194,21)  smoke/fire: redo as AI sprite sheets (research game VFX)

## Round 5 — IN-AGENT (round5-vegetation) — trees/palms/bushes/sidewalk-greenery/flies/pizza-sign + task#51 landscaping
- mreelboe (-70,-115) big green blob shrub — FIXED@v1.66.22 (landscape shrub() was a single flattened icosahedron dome = featureless blob; now a bushy mound of 3-5 overlapping size/rotation-jittered blobs, lead blob lower+wider with lifted satellites. Applies town-wide to every landscape shrub)
- mredw3ho (237,-175) palm canopy too sparse; want variants — FIXED@v1.66.23 (palm crown was 8 thin flat fronds as 8 separate meshes; now a DENSER 3-tier crown — up/mid/drooping fronds, 11-16 per palm — baked into ONE merged geo per variant = 1 draw call each (~660 fewer draws town-wide). 4 variants: standard / tall-full / young-short / leaning, per-palm height + trunk lean. Also covers mrefts2d "ugly palms")
- mree6ten (-276,261) crepe myrtle looks unnatural — FIXED@v1.66.23 (was a single ball/card on one stick; now a multi-stem VASE — 3-4 slender leaning trunks fanning from the base + a rounded mound of overlapping pink/white bloom + green leaf blobs)
- mredt4y2 (151,-143) sidewalk trees need pavement cutouts — FIXED@v1.66.26 (street trees sit on the verge/sidewalk band; every street tree now gets a curbed tree-WELL — square soil cutout + cast-iron grate + concrete frame — baked into one merged decal batch so the trunk reads as planted in a cutout, not spearing the slab)
- mredxgss (180,-125) bushes on sidewalk — FIXED@v1.66.26 (root cause: landscape shrub()/grass() only rejected the road asphalt (hw+1), so plantings past the curb landed on the flanking sidewalk ribbon. New onSidewalk() test rejects the walk band (hw+0.2..hw+sw+1) so shrubs/grass stay on the planting strip. SKINNIER single-slab sidewalk restyle = LOGGED as larger sidewalk-geometry pass, see Notes)
- mredznws (98,12) flies smaller + 2-3x count — FIXED@v1.66.22 (dumpster fly sprite radius 0.05->0.024, swarm 3->9 with per-fly orbit radius/height/speed/phase so it reads as a buzzing cloud, not a 3-dot ring)
- mredr84j (52,-120) 2D trashbags look bad — FIXED@v1.66.26 (trash_bags rendered as a flat photo-textured box; now a pile of 3-4 lumpy squashed blobs (icosphere) reusing the trash_bags texture on the same merged batch = one draw call, reads as bulging plastic bags)
- mree4o24 (-82,148) pizza sign rotates on wrong axis — FIXED@v1.66.22 (round pizza disc faces +z but spun around Y = edge-on revolving-door that vanished each half-turn. Now the disc is re-centered on a pivot at its own centre and spins about its face-normal Z, so the pizza rotates in-plane like a wheel, always face-on)
- task#51 finish landscaping — DONE@v1.66.29. Parking-lot islands + arterial frontage strips + corner beds were ALREADY shipped (commits ecfdda2/d7f9e7e — task desc was stale). Added the missing WAVE 4: RESIDENTIAL FOUNDATION SHRUBS — every survey house gets a mulch strip + a row of lite manicured shrubs + a bloom accent hugging its FRONT wall, split around the entry. Uses new houseFronts registry (post-nudge front-wall frames from buildSurveyHouses) so shrubs land AGAINST the wall (fixes the killed agent's ~22u-off bug); 37/40 sampled houses verified with shrubs <4.5u of the front. 1600 foundation shrubs, landscape still 8 merged draw calls (~87K tris, ~3% of the 2.6M-tri scene). Also lite mode added to shrub() (2-3 vs 3-5 blobs) for foundation rows.

## Round 5 — IN-AGENT (round5-features) — quirky vendor/fence/traffic slice
- mreehkm9 (-142,-9) lemonade KID VENDOR — CEDED TO gen-tts (fable agent, launched earlier, voice lines already generating) — round5-features SKIP
- mreeipmy (-161,-76) ice cream VENDOR — CEDED TO gen-tts (same) — round5-features SKIP
- mreejak5 (-158,-86) fences should BREAK IN PANELS under cars — FIXED@v1.66.24 (each fence panel BODY is now its own toppleable Group breakable (type 'fence') with a thin per-panel OBB collider, instead of a merged batch + one big edge OBB. A car moving >3u/s snaps the struck panel(s) via the existing breakProp/updateWorldFx path — ease-out topple + splinter/clatter puff+noiseBurst (wood=brown, chainlink=metallic, picket=white), collider deactivates -> drivable gap, 60s respawn. Per-panel (neighbours stay standing); posts stay merged/static to mark the gap. Local-only like other breakables. Cars only collided with fences when berserk, so nothing wrongly blocks a car that should smash through. 321 panels: 127 chainlink / 126 wood / 68 picket.)
- mreeoimw (-1,-517) traffic too uniform; want occasional HONKS + variety — FIXED@v1.66.27 (each traffic driver now gets a persona (carPersona): impatience 0..1, a cruising-speed multiplier 0.82..1.28 applied to cruise so speeds vary, and a horn pitch. carHorn() is a tasteful, doubly-cooldowned (town-wide 1.1s + per-car 5.5s/2.4s) positional two-tone horn. Triggers: held behind a leader / at a red longer than the driver's patience (impatient ~1.3s, patient ~3.4s; impatient drivers also tuck in closer via a shorter headway), a rare "just because" cruise toot, and an ANGRY blast when the player jaywalks into a moving car's forward cone (<8u ahead, <2.2u lateral). Host-local audio flavour; verified: personas span imp 0..0.97 / spd 0.82..1.28, honks fire on hold + jaywalk without spamming.)

## Round 5 — IN-AGENT (round5-props) — prop placement/quality slice
- mree10qu (62,32)    person clipping inside yellow prop — FIXED@v1.66.18 (the "yellow prop" is the amber quest-giver beacon; the worried-spouse giver ped stood inside its ground-level pole. Beacon now FLOATS above head height (pole y 3.3-5.5, orb 5.7, downward pointer cone) so no ped clips it — applies to all 10 giver beacons)
- mreedozu (-199,33)  unidentifiable mesh — FIXED@v1.66.18 (the decorative lakeside pond_fence arc placed 8 SOLID panels at ~8u spacing -> isolated dark frames stranded in the lawn 30-50u from the water, reading as garbage + stray colliders. Removed the arc; the lakeside keeps benches/umbrellas/bbq/fire-pit/bird-bath/lamps/fountain/windmill/flamingos)
- mreeelik (-118,75)  car placement weird — FIXED@v1.66.20 (WC_REMAP parking rows filled diagonal editor lots at 3.4u stall pitch; vans/trucks (~5.5x2.6) clipped their neighbours — 3 overlapping pairs at the WEST PARK lot. Widened pitch 3.4->5.2 + aisle 6.6->8.0; 0 overlaps there now, 26 parked cars map-wide preserved)
- mreeccpr/mreebnfk (-226,152) prop set jarring in front of office tower (placement only) — FIXED@v1.66.25 (red_house's whimsical yard trio — a spinning garden windmill + gnome + birdbath — was dumped across the FRONT-CENTRE of the 5-storey building's plaza frontage. Windmill dropped (the lake already has one; a windmill before a tall building read as jarring); gnome+birdbath+a raised_bed now form a tidy planting bed tucked to the front corner off the entrance axis. ANIM sub-issue left to round2-anim per scope.)
- mreegamp (-140,43)  placement bad — FIXED@v1.66.25 (same townhouse-strip declutter as mreei0of: the redundant per-townhouse homemailbox pair stamped a mailbox at both front ends; at th_d's -end (-150,41) it clipped the yard raised_bed and doubled the mailbox_cluster. Loop removed -> the strip frontage reads clean.)
- mreei0of (-142,-30) flower bed out of place — FIXED@v1.66.25 (the flower bed = townhouse yard raised_bed; a redundant homemailbox street prop (placed at BOTH front ends of every townhouse venue, line 7664) landed exactly on the -end bed at th_a (-141,-32) and jammed into it. Removed the homemailbox pair — every townhouse already gets ONE rummageable mailbox_cluster — so the bed now sits alone + intentional.)
- mreeuu2g (-136,230) unclear props — FIXED@v1.66.44 (strip_a's big paved rear plaza was a barren tile field — strips aren't in the STEP-2 storefront COMM set so nothing furnished it. Added a curated pedestrian courtyard (env layer STEP 2b, byId.strip_a): a central raised planting bed flanked by 2 café sets w/ umbrellas + facing benches, an edge line of 2 benches, 2 concrete planters, 2 park lamps, a directory/menu a-frame sign, a recycling station, and a bike rack (street prop). Spaced ~4-13u, clutter-registered so later passes don't stack. Verified top-down + ground + close: reads as an intentional plaza, nothing floats/sinks, wide walk gaps remain, no console errors.)
- mreelboe (-70,-115) big green blob shrub — REASSIGNED→round5-vegetation (shrub geometry/look, not placement; round5-props not touching it)
- mreds4nw (90,-131) + mref3ibd (535,126) AC props: big rooftop industrial HVAC — FIXED@v1.66.28 (1) rewrote vAC() — the rooftop AC used on EVERY commercial venue (publix/school/banks/strips/shops incl. Sakura Sushi) — from a plain 2-box gray lump into a proper industrial packaged RTU: big ribbed galvanized cabinet + galvanized top deck + TWIN radial fan-guard grilles + an end control panel, all canvas-textured (acRibTex condenser louvers/seams/rivets/weather + fanGrilleTex concentric-ring/spoke guards). (2) upsized the ground ac_condenser density prop 2.4x (0.75m residential cube -> ~1.8m commercial condenser) via a new dBoxAsset scale arg. Verified on the sushi roof + pharmacy side wall.)

## Notes
- mrdphrsv is Claude's own deploy test, ignore.
- LOGGED LARGER PASS (round5-vegetation, mredxgss part 2): "skinnier, single-slab
  sidewalk style". Current sidewalks are wide flanking ribbons (sw=5 arterials /
  3.4 others, built in the remap sidewalk-ribbon block ~game.js:2638 + the core
  sidewalk() slabs). Making them skinnier single-slab is a road/sidewalk-geometry
  redesign (affects widths, NPC sidewalk bias targets, junction clipping, street-
  tree offsets) — out of surgical vegetation scope. Belongs with round5-roads.

## Batch 3 (uncatalogued -> assigned)
- mreegamp (-140,43) placement bad — R5
- mreegvj0 (-157,20) leaf cluster + missing alpha — LIKELY-COVERED@v1.66.1 (if it's a ground leaf/foliage DECAL it's now blend-keyed by the GKEY ground-decal fix; airborne leaves_scatter was already luminance-keyed. Could not isolate a still-broken quad on re-inspection at this spot — RE-CHECK on current build; if a specific hedge/bush billboard still shows a hard alpha edge, it's a density-prop KEY addition)
- mreehkm9 (-142,-9) lemonade stand wants kid vendor + dialogue — R5 feature
- mreei0of (-142,-30) flower bed out of place — R5
- mreeipmy (-161,-76) ice cream truck wants vendor — R5 feature
- mreejak5 (-158,-86) fences should break in panels under cars — R5 feature
- mreejycz (-112,-48) whole swing rocks; odd placement — R4 anim
- mreekjjq (-7,-57) walker accessory abandoned in street — R2 anim overlap
- mreelboe (-70,-115) big green blob — DEFERRED→R5 content (round4-render probed the Publix-lot spot: no bad-material/untextured mesh found; the "green blob" is a low-detail procedural shrub (USPH flattened-blob) — a content/geometry look issue, not a material/normals bug. Belongs with the R5 vegetation pass)
- mreelusq (-113,-114) cop left arm buggy + walks into building — collision-part FIXED@v1.66.16 (cops had NO obstacle avoidance — they beelined into building walls; gave them the pedestrian whisker: probe 1.8u ahead, hold a clear ±38/72/112° side bearing 0.3s, aim still faces target so they read as flanking. Routes around corners/poles/small footprints; a player fully behind a WIDE building is still beeline-limited — full nav needs pathfinding, deferred. LEFT-ARM anim part stays with the anim instance)
- mreemd0e (-194,-110) garage door between windows on facade — FIXED@v1.66.8 (townhouseRow front ground floor recomposed: plain stucco cover hides the shared-tex ground window row, 2-car garage on the left + entry door on the right; upper-floor windows kept)
- mreendej (-8,-330) purple-home roof texture + overhangs sidewalk — OVERHANG FIXED@v1.66.5 (houseSidewalkNudge cleared house #239 @-24,-316.8 off the nine_eagles_dr walk). ROOF-TEXTURE sub-issue is a material/UV problem (hip-roof ConeGeometry shingle stretch on the hue-shifted variant) → HANDOFF to round4-render, out of structure lane.
- mreenqoe (-25,-347) homes with no road/walkway — LARGELY FIXED@v1.66.89 (res_s_pocket extended west + chase_grove_dr_w/pond_cypress_way; deepest S rows stay unroadable, see ROAD-NETWORK MAJOR ROUND)
- mreeoimw (-1,-517) traffic too uniform; want occasional honks — R5 feature
- mreeosgw (-10,-492) lamp post + tree clipping — FIXED@v1.66.10 (street-tree pass now rejects spots within 4u of a streetlight base via nearStreetlight; lamp colliders are only 0.22r so spotClear alone let a canopy swallow the pole)
- mreepojo (157,-74) 'half ass gas station' — FIXED@v1.66.40 (rewrote gasStation(): the RaceTrac was a bare white slab canopy + two featureless red boxes + a tiny price plane. Now a complete station — a branded canopy (white soffit + light panels + a red "RaceTrac" fascia band on all 4 sides) over a light-concrete forecourt; 3 curbed pump islands, each with 2 detailed dispensers (dark body + display face + price screen + red brand topper + nozzle hose) and yellow end bollards; a proper monument price sign (pole + red RaceTrac cabinet + REG/PLUS/PREM price panel, both faces); and forecourt amenities at the store front — air/water machine, ICE merchandiser, trash can, propane exchange cage. Robbable store/interior untouched. Verified front/pump/amenity/3-4 views, no console errors.) FOLLOW-UP@v1.66.48 (glitch sweep #6): the 3 pump islands had no colliders — you walked through the pumps. Added a per-island collider (placeVenueData captures + OBB-rotates it); headless-verified pumps now block from all approaches, forecourt still walkable, gasRob entry + ENTER prompt unaffected.
- mreeq7nj (150,193) random barrier — stale@v1.66.16 (re-probed: the point is open; blockers are a correct house OBB SW at (137,205) + one tiny prop point-collider at (157,192). No phantom wall)
- mreeqqbh (298,235) road looks awful — R5
- mreer5b4 (419,172) houses riding the sidewalk — FIXED@v1.66.5 (same houseSidewalkNudge shared fix)
- mreesgtd (238,516) parked cars with lights on — FIXED@v1.66.13 (parked cars' PAINTED head/taillights glow at night via the shared nightEmis emissiveMap material with no parked check — the additive glow quads were already gated but this wasn't. Parked cars now swap their body mesh to a cloned material with emissive killed; restored on carjack. Verified: 30 parked cars emissiveIntensity 0 / emissiveMap null at night, 48 moving cars still 1.35)
- mreet1el (273,474) NPC pacing left-right loop — addressed@v1.66.16 (spot is open ground; the whisker already commits to a bearing for 0.35s which prevents rapid ping-pong. v1.66.12/16 steering upgrades — wider ±112° escape tier + a wall-slide no-headway watchdog — further break oscillation loops so an NPC hugging a nearby prop bails to a fresh target within ~2.2s instead of pacing)
- mreetig1 (233,306) secondary intersection looks bad — R5

## Batch 4 (all filed from a v1.64.0 session — the live page never reloads
## mid-session, so collision reports below may predate the v1.65.3 OBB fix;
## re-verify before working them)
- mreeuf0c (-97,338)  random wall — stale@v1.66.16 (re-probed current build: point is open; nearest collider is a legit building AABB well south at z351+. No wall at the report spot)
- mref1z9y (298,80)   invis wall — stale@v1.66.16 (re-probed: point open; blockers are two building AABBs to the WEST ending at x=286, report point x=298 is clear. Confirms the earlier post-OBB pass)
- mreez9lq (-148,-34) npcs walking into a light pole — addressed@v1.66.16 (the pole DOES carry a collider at (-141,-32), so NPCs are pushed around it, never through it; the "walking into" was a head-on graze the old ±38/72° whisker often missed. The new ±112° escape tier + wall-slide watchdog make the pre-contact sidestep more reliable)
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
- mref2fm0 (315,171) invis wall — stale@v1.66.16 (re-probed: only blocker is the correct oriented house OBB at (328,163); report point clips its edge. No phantom wall)
- mref2zey (534,-29) invis wall — stale@v1.66.16 (re-probed: point sits in OPEN ground between healthy house colliders; no wall)
- mref1z9y (298,80)  invis wall — stale@v1.66.16 (re-probed: see line above — point clear east of two building AABBs)
- mreeuf0c (-97,338) random wall — stale@v1.66.16 (re-probed: point clear; block is a building far south at z351+)
- mref3ibd (535,126) AC unit 3x size wanted — R5 (with mreds4nw rooftop AC)
- mref3wds (391,191) backwards bus stop — R5 (with mref0pwi)
- mref48hy (374,195) sign clipping post — FIXED@v1.66.10 (poleSign seated the placard only 0.06 in front of center — inside the 0.11 pole radius, so the post speared the sign face; now offset by poleR+0.1. Same fix for random-rotation yard signs which sat exactly on their stake)

## Batch 6
- mrefkx0p (-49,17) pavement lines shimmer with camera motion — FIXED@v1.66.3 (logarithmicDepthBuffer on the main renderer; near-plane raise was rejected — viewmodels hug the camera)

## Batch 7 (31 reports, mrefm6zw..mregenli — user now on v1.65.4/v1.66.0)
Clusters:
- CHAINLINK/STUCK cluster (round3-collision territory): mregbuvd/mregc5uc/mregcixv walking into RaceTrac fence; mregb8uv/mregbgkm people stuck; mrefuw9y stuck on building; mrefnfji stuck on prop + wants NPC-vs-NPC collision
- ANIMATION cluster (fold into round2-anim on return): mrefmjf0 worst walk (she); mregajgt gary weird walk; mregazq4 leon shoulder; mrefp3hw floating guy; mreg77qb boombox hold; mregcwvd luggage roll; mregenli nia walk + bike texture + xander voice
- INTERIOR cluster (other agent's shop systems): mrefpkq1 cashier voicelines; mrefq2w5 npcs stuck on shelves; mrefqf7b warped texture; mrefwcmm $1.25 sign floating/one-sided + boring shelves; mrefv6f6 interior 'invisible wall' (room bounds, needs visible walls)
- CONTENT/GEN requests: mrefm6zw real Publix logo (AI gen + tile); mrefogw8 avoid duplicate NPC looks + 5x NPC density; mrefucxb NPCs voice not text; mrefsp85 varied car engine sounds; mrefts2d ugly palms (with mredw3ho variants)
- QUICK FIXES: mrefti0d flowers mid-road — FIXED@v1.66.4 (shrub/grass road-clearance guard at source); mreg8mld post not breakable — FIXED@v1.66.63 (ROOT: the ~35 roadside sign posts (speed_limit/parking/bus_route/roadwork signs every ~78u along arterials/collectors) were baked by poleSign() into the static '_pole' + 'd_<sign>' merged batches with a permanent addCollider — solid to cars but absent from the breakables registry, so a car slammed into them and stopped dead while every other street-furniture pole (stop signs, meters, street lights, trees) snaps. Fix: poleSign() now builds each roadside sign as its OWN pole-cylinder + placard-plane group and registers it via registerBreakable(type 'light', collR 0.14) — standard car-snap topple (ease-out fall, crash sfx, puffs), collider deactivates while down, 60s respawn, exactly the street-light/tree contract. Billboard legs + the RaceTrac pylon stay baked/static (breaking legs would strand the floating boards). Verified headless: breakable registered at dist 0 from the pole; parked-car drive-through at 10u/s snaps + topples it (sign face lands readable on the grass), collider goes inactive, prop back upright after the 60s respawn. Evidence: qa2misc_before_i2_pole_intact.png + BEFORE drive-through broke:false vs qa2misc_after_i2_face1.png / _i2_after_break.png / _i2_respawned.png)
- mrefrgtb (-54,7) pistol should be one-handed — FIXED@v1.66.62 (viewmodel only: SUPPORT_POSE.pistol re-authored to a lowered/behind-camera left arm ([[-1.59,-.3,1.2],[-.6,0,1.4],[.1,0,0],[0,0,0]], tuned via __wc.dbgArm screenshot rounds) and GRIP_TGT.pistol DELETED so solveSupportIK keeps the seed instead of IK-pulling the left hand onto the grip. Right hand stays on the gun; no left-arm pixels at pitch 0 or looking down. SMG/rifle/AK/rocket unchanged (rifle regression-shot two-handed); SILENCED pistol intentionally keeps the two-hand hold (#78). Evidence: qa1props_pistol_vm_twohand_before.png vs qa1props_pistol_vm_after(.png/_dn.png), qa1props_rifle_vm_after.png)
- mreft54h (-12,-14) unnatural U-turns at junction — FIXED@v1.66.62 (ROOT: nine_eagles_dr's junction-side endpoint sits at (-1,-14), 14u from the origin 4-way node — outside the 5u node-clustering radius — so it got its own 1-LEG node = dead end INSIDE the junction; every car arriving there did c.rDir=-c.rDir, an on-the-spot 180 pivot right at the intersection. THREE fixes in the lane graph/advance: (1) graph post-pass merges any 1-leg node into the nearest >=2-leg node within 16u (nine_eagles is now the 4th leg of the origin node — verified in RM.nodes); (2) remapAdvance never picks a near-antiparallel exit leg (dot < -0.45) when a forward-compatible leg exists, so junction hops can't double back; (3) cars are never seeded on short ORPHAN edges (both ends dead, len<60) — the 28u sv_19_lynmar stub had a trapped car snap-180ing every 3s; and dead-end turnarounds now clamp speed to 2.5 so remaining legit U-turns are a slow crawl not a cruise-speed spin. 126-sim-sec headless flip scan (>149deg turn while moving <6u, 73 cars): BEFORE 69 flips incl. lynmar shuttle + junction; AFTER 12, all at the two stowbridge_ave dead ends (road data genuinely terminates there, 122u/212u from any junction — honest residual: end-of-road U-turns remain, now slow) + 1 one-off at the origin pad in 63s (rate-limited residual, likely a traffic shove; pre-fix it was every nine_eagles arrival). Not touched: full turn-arc routing rework — out of time-box, documented here)
- mregdctj (77,134) sign post clipping sign, sign too small — FIXED@v1.66.62 (ROOT: the residential yard-sign pass mounted the placard CENTER at y0.9 = exactly the stake's top (pole h 0.9), so the stake crossed the whole lower half of the sign face — visible as a post through "MITCHELL" whenever the stake side faced you. Now the placard is 1.4x bigger (also answers "sign too small"), center y1.02, and the stake height is computed per-asset (mount - h/2 + 0.08) so its top tucks behind the placard's bottom edge. Same-family bonus: yard signs also gained the road/paved-slab clearance guard (one was planted mid-asphalt on the townhouse frontage) — lawns only now. Evidence: qa1props_dctj_lost_pet_flyer_front/back_after.png)

## Batch 8
- mreggwii (42,0)   wendel glitchy in MP — FIXED@v1.66.5 (world-snapshot interpolation for NPC/car/cop mirrors; was 8Hz exp-chase)
- mregi4tl (128,-5) stuttery walking NPC in MP — FIXED@v1.66.5 (same)
- mreghm0l (92,-48) floating idle anim — FIXED@v1.66.32 (see Batch 10)
- mregiwcv (-47,17) unidentifiable thing — FIXED@v1.66.39 (the "thing" = a run of 3 lone screen_wall panels (env prop, 52 tris ea) placed behind the Regions bank + a dumpster/crate back-clutter pile. The bank's BACK (ENE) faces the main-intersection pedestrian plaza — not a hidden mechanical yard — so those free-standing tan slabs + loading-dock junk read as unidentifiable garbage. Removed the screen_wall run for the bank and gated banks out of the BACK_CLUTTER pass; the back wall is now a clean brick plaza frontage. Verified: 0 meshes at the spot, no console errors.)
- mregjcuz (-27,-4) should be lit at night — FIXED@v1.66.63 (ROOT: the object at the report spot is the ornate PARK LAMP env prop at (-30,0) on the Publix lot edge — park_lamp is a MERGE-baked env prop whose batch material only got the generic nightLit() whole-texture wash (emisBase 0.22), an invisible tint on the white globe, and unlike the cobra-head street lights it had NO glow sprite/light pool, so it read stone dead after dark while street lights glowed around it. Fix: (1) the park_lamp batch keeps nightLit but with emisBase 0.9 — the emissiveMap is the lamp texture itself, so the white globe texels burn warm while the near-black post stays dark; (2) every placed park lamp (tracked via new parkLampPts in the env place()) gets a lampGlowT halo sprite at globe height (dims[1]*0.86) + a 0.5-scale poolGeo warm ground pool, toggled in setLamps with the street lights (parkLampGlows). All ~8 park lamps map-wide (Publix lot edge, strip plaza, lake bank) benefit. Day sanity: unlit by day. Evidence: qa2misc_before_i1_night_close.png (dead white globe) vs qa2misc_after_i1_night_close.png / _i1_night.png (glowing globe + halo + ground pool), _i1_day_close.png (off by day))
- mregk7im/mregkhdi/mregli5y/mregma9f (Dunkin interior: workers not facing, stretched counter, room-bounds wall, menu clipping, voice ask) — other agent interiors
- mregn84n (-45,11) held-item grip botched — R2-anim extras
- mregnsjz (-28,-6) female NPC used male pain grunt — R5 audio (sex-check the pain voice pick)

## Batch 9
- mregrr51 (-46,-2) directional damage indicators — SHIPPED@v1.66.8 (red chevrons around screen center pointing at the source: cop shots, PvP, NPC jabs, explosions, car hits, alien beam)
- mreguavi (-68,9) WALKER NPC still broken (backwards, hands off, not hunched) — FIXED@v1.66.32 (see Batch 10)

## Batch 10 (animation round handoff)
- mregenli NIA walk — FIXED@v1.66.10 (MESHY_LEG_FIX NIA:1.2, lat 0.77->0.32); bike texture + xander voice parts still OPEN
- mregajgt GARY walk — FIXED@v1.66.32 (Y-yaw alone couldn't close his splay — upper legs also sit abducted vs the shared clip's rig; MESHY_LEG_FIX now takes {y,z} objects, GARY {y:0.2,z:0.25} = yaw + mirrored Z adduction, lat 0.681->0.327, stride/feet unchanged; HECTOR 0.306 / NIA 0.321 regression-checked)
- mreghm0l floating idle — FIXED@v1.66.32 (kids ship no idle clip; the frame-0 "idle" is a mid-stride passing pose with both feet off the ground — meshyPlantPose finds and holds the walk cycle's plant frame instead)
- mreg77qb boombox — FIXED@v1.66.32 (grip was at the box BOTTOM so it floated above the fist; fist now on the top handle, long axis fore-aft, carry arm pinned straight down via poseCarryArm)
- mregcwvd luggage — FIXED@v1.66.32 (suitcase handle faces the owner on the RIGHT side, right arm aimed down-back onto it via poseCaseDrag — was floating beside the hip)
- mreguavi WALKER NPC — FIXED@v1.66.32 (ACC_PLACE walker ry 0: rails were turned sideways by the +PI/2 default so it read backwards; world-space aimLimbAt puts both hands on the rail ends per-rig — the old bone-local X multiply zombie-armed some rigs — plus spine hunch via pitchLimbWorld, gated on reposed frames so it can't compound)

## Round 5 — IN-AGENT (round5-roads) — roads/junctions/sidewalks/bus-stops/no-road-homes
Slice: mreeqqbh, mreetig1, mref0zmv, mreexjvh, mreexz4c, mref1n8n (road/junction/sidewalk quality);
mref0pwi, mref3wds (bus stops backwards); mredxzx6, mreenqoe (no-road homes).
- mref0pwi (205,272) bus stop facing wrong way — FIXED@v1.66.13 (runtime arterial-midpoint shelters faced AWAY from the road; the yaw Math.atan2(ux,uz) points the opening (front=(-cos,sin)) to the same side as the sidewalk offset. +PI so it opens toward the street. Fixes all 3 arterial shelters.)
- mref3wds (391,191) backwards bus stop — FIXED@v1.66.13 (same +PI shelter-yaw fix)
- mreetig1 (233,306) secondary intersection — FIXED@v1.66.13 (countryway/citrus Y-junction: oaks/shrubs/grass were planting on the junction-pad asphalt overhang — remapPointClear now excludes RM.pads; pad radius mult 1.8->1.5 shrinks the grass bulge + reduces sidewalk fragmentation. No throat gaps at 4-ways/Y/residential — verified top-down.)
- mref0zmv (205,272) ugly road junction — FIXED@v1.66.13 (same junction-pad clearance + radius fix; same Y-junction)
- mref1n8n (321,186) sidewalk looks bad — FIXED@v1.66.13 (same pad-radius fix tightens the sv_66/citrus junction pad so sidewalks are less chopped; props off the pad)
- mreeqqbh (298,235) road looks awful — FIXED@v1.66.14 (citrus_park_dr centerline had an S-kink: 4 authored points reversed in z (218.9->219.7->220.3 then dived to 209), so the hw=14 ribbon mitred into a lumpy widening + the double-yellow zigzagged. Replaced with 3 monotone-curvature points [302,219.4],[307,217.6],[312,214.6] — smooth ease from 220.6 to 209. Verified top-down.)
- mreexjvh (-178,170) road/tile seam — FIXED@v1.66.15 (ROOT: the road y-ladder ((i*7)%11) gave only 11 height levels for 35+ ribbons, so overlapping roads routinely shared a level and z-fought -> shimmering seam. Here user_e305 (i=33) was coplanar with race_track_rd (i=0). New ladder = class band (arterials on top) + unique per-road micro-offset, so no two ribbons are ever coplanar map-wide.)
- mreexz4c (-163,120) road area bad — FIXED@v1.66.15 (same z-fight-seam ladder fix). RESIDUAL: authored driveway tangle left as-is (see round5-roads notes).
- mredxzx6 (140,-89) no-road homes — FIXED@v1.66.16 (res_se_pocket residential street; OBB-verified clear)
- mreenqoe (-25,-347) no-road homes — FIXED@v1.66.16 (res_s_pocket lane; OBB-verified)

## Batch 11 (API-spend round, user-approved; + code-only wins)
- mrefsp85 varied car sounds — FIXED@v1.66.16 (per-car engine personality: seeded pitch/harmonic-ratio/brightness/waveform)
- mrefogw8 duplicate NPCs + density — PARTIAL@v1.66.16 (least-used-look pool already global; NEW 60u same-look re-homing; NPC_COUNT 138->220. Full 5x needs instancing/LOD first)
- mrefm6zw Publix sign (gpt-image) — FIXED@v1.66.20 (gen-img: gpt-image-1 green PUBLIX wordmark strip -> publixsign.js data-URL; new publixSign() repeat-TILES it so each wordmark keeps its natural aspect on the wide storefront banner instead of the old stretched/cut-off canvas text. Verified in-engine: "PUBLIX PUBLIX PUBLIX" uncut above the entrance)
- mreed9ar smoke/fire sprites — FIXED@v1.66.20 (gen-img: gpt-image-1 4x4 grey-smoke + 4x4 fire-lick sprite sheets -> vfxsheets.js; sliced into 16 frame textures, puff() now plays them — normal-blend smoke, additive depthTest-off fire, warm-hue callers route to fire/greys to smoke. Verified: explosion fireball+flames+smoke, burning car engulfed in a flame+smoke plume)
- mreeyfs8/mreeyvkn fountain sprites — FIXED@v1.66.20 (gen-img: lake + env plaza/drinking fountain droplets swapped from hard spheres to soft white-blue smoke-sheet billboards at runtime (fountainSprite() + lookAt). Verified: lake fountain sprays soft sprite droplets)
- mrefpkq1/mregli5y staff voice lines — FIXED@v1.66.22 (gen-tts: wired the existing per-ROLE SHOP_VOICES pack into every interior chat/interact + buy trigger via new playShopVoice() + staffSay(lines,role,cat); text toasts kept as subtitles/fallback. Verified headless: CASHIER/greet, STOCKER/aisle, DUNKIN/chatter all fired with non-zero-duration buffers)
- mreehkm9 lemonade kid vendor — FIXED@v1.66.22 (gen-tts: static KID vendor built behind the lemonade_stand prop, exempt from wander/follow/tag AI; E-buy $2 -> +10 hp; new vendvoices.js pack on KID_GIRL_BRIGHT ref — pitch/sale/thanks/idle. Verified: money -2, hp +10, LEMONADE/sale voice logged; idle chirp fires on approach)
- mreeipmy ice cream vendor — FIXED@v1.66.22 (gen-tts: static ADULT vendor at the icecream_truck; E-buy $3 -> +15 hp; vendvoices.js pack on ped_m ref. Verified: money -3, hp +15, ICECREAM/sale voice logged)
- mregnsjz fem pain grunt — FIXED@v1.66.22 (gen-tts: the layered death/ragdoll sfx('grunt') was a genderless deep 55Hz sawtooth; now sex-aware via at.fem — female NPCs get a higher 265Hz grunt — and n.fem is passed at both grunt sites. The hurt-VOICE fallback already picked pedf_hit for females. Verified: female NPC RAVEN -> grunt 'F', male RYAN -> 'M')
- MESHY NOTE: balance 544cr, shared with the quest/kid pipelines — new civilian looks DEFERRED until those finish

## COORDINATION — round5-features (other agent): VENDOR OVERLAP
RESOLVED: gen-tts SHIPPED both vendors @v1.66.22 (lemonade-kid mreehkm9 +
ice-cream-truck mreeipmy, with voice lines + E-buy). round5-features: the
vendors are DONE — take fence panels (mreejak5) + traffic honks (mreeoimw).

## QA sweep batch 1 (2026-07-10, reporter QA-CLAUDE — in-engine bot QA, filed via the real /bug pipeline)
All from a 24-POI eye-level sweep (day/night/rain/interior) on v1.66.31.
Status: 6 FIXED@v1.66.58 (qa1-fx slice) + 4 FIXED@v1.66.59 (qa1-world slice) + 3 FIXED / 1 stale @v1.66.62 (qa1-props slice), rest OPEN.
- mrf7rril (0,-40)    green hedge box in middle of junction asphalt — FIXED@v1.66.58 (root cause: landscape-pass hedge()/myrtle()/corner-bed placement had NO road clearance check — unlike shrub()/grass(), which got remapPointClear after the mrefti0d round. Road-relative frontage/corner math near the diagonal junction landed hedge boxes + a crepe myrtle on other roads' asphalt/junction pads (runtime scan found 9 hedge boxes on road asphalt map-wide, incl. countryway@15,13 and the nine_eagles/stowbridge throat, + a myrtle mid-junction). Fix: hedge() samples its whole run vs remapPointClear (+ onSidewalk/paved-lot rects for non-wall-hugging beds), myrtle()/ipalm() gained remapPointClear, corner-bed openClear too. Re-scan after: 0 hedges on asphalt; junction verified clean in-engine)
- mrf7rrzk (-104,-22) flame sprite burning on townhouse wall, no source — FIXED@v1.66.58 (root cause: the th0 backyard fire_pit env prop was placed 4u behind the row CENTER — inside the 12u-deep th_a footprint at (-130,-16); its 'flames' emitter puffs draw with depthTest:false (like burning cars), so the flame rendered THROUGH the walls onto the street-facing facade 26u away. Fix: fire pit/bbq (th2 had the same buried-placement bug, smoke emitter) moved to a front-lawn formula gated by remapPointClear+remapInClear; at current map data th_a's 3u front yard is too tight vs sv_14_oakham so the townhouse fire pit is omitted entirely (the lakeside picnic fire_pit remains); th2 bbq landed on its lawn at (-141,20). Verified in-engine: no flame on the wall, no stray depthTest:false flame sprites in the world)
- mrf7rs59 (-104,-22) flamingo ornament on bare pavement — FIXED@v1.66.62 (ROOT: the townhouse-yard env pass (gnome/flamingo/bird-bath, rnd lateral +-3u off the row front) and the red-house ornament corner had NO surface check — same family as the v1.66.58 hedge()/shrub() fixes. th_a/th_b's whole frontage is a 62x55 editor pavement slab, so the flamingo stood on the driveway at (-112.2,-15.3). Fix at the mechanism: new onGrass() gate in the env pass (road asphalt+pads via remapPointClear, sidewalks via onSidewalk, parking/pavement slabs via SURF rects, lake) + grassSpot() lateral re-roll; ornaments are SKIPPED when the whole band is paved. Map-wide scan (new envPlaced/densityPlaced diagnostic registries — baked/merged props had no position records at all): ornaments off-grass 11 -> 0. Evidence: qa1props_rs59_flamingo_a_before.png vs _eye_after.png)
- mrf7rsar (40,-40)   giant smeared lane-dash decal near player, others crisp — FIXED@v1.66.58 (root cause: not a decal at all — the arterial ribbons' lane dashes are baked into the 128px roadT texture, which stretches over 16u x 2*hw of road; magnified up close a dash smeared into a ~10x-blurred streak while minified distant dashes stayed crisp. Fix: roadT rebuilt at 512px with all paint geometry s-relative (same layout, noise density scaled by area) — near dashes now render sharp; expArtT clones it so every remap arterial benefits. Verified in-engine at (40,-40) close-up)
- mrf7rsgx (-40,-40)  cardboard boxes scattered on lot asphalt — FIXED@v1.66.62 (ROOT: the BACK_CLUTTER pass (crates/boxes/pallets/tarps 1.3-3.2u behind each commercial venue's back wall) checked building overlap + tree poles but NOT the ground surface — Publix's back wall abuts a road, so its pile (wood_pallet -43.9,-46 + crates -73..-81,-46..-48) sat on the asphalt; RaceTrac (95-106,7-14) and two more venues likewise. Fix: clutterSpotOK() rejects road asphalt/junction pads and parking-lot drive surfaces (service PAVEMENT aprons still allowed — wall-hugging loading clutter is intentional). Map-wide scan: clutter-on-road/lot 31 -> 15, and all 15 remaining are the sandbag rows at the perimeter ROAD-CLOSED barriers, which are deliberate roadwork dressing ON the closed road ends. Evidence: qa1props_rsgx_boxes_a_before.png vs _top_after.png)
- mrf7rsmq (48,30)    quest NPC stands mid-road under his beacon — FIXED@v1.66.59 (root cause: quest giver/actor spots were authored against the LEGACY axis roads and never re-vetted for WC_REMAP — the Worried Spouse (q5 giver, 60,42) stood 5.7u from Countryway's centerline (hw 11), i.e. mid-asphalt with traffic swerving; runtime scan also caught the Concierge (-40,-70) and Marcus (150,-112) on asphalt, and Sal/Xander/Champion inside venue-clearance rects. Fix: new load-time questPlacementClearance pass — questSnapClear ring-searches outward (2..30u) for the nearest spot that is off road asphalt+junction pads (remapPointClear 0.8), outside venue clearance, not in the lake, and not in a house footprint; sidewalks/lawns allowed. Applied to QUESTS givers + QACTOR_DEFS (surface only), matching beat WAYPOINTS follow the moved NPC, and questBeacons now builds AFTER the pass so the beacon stays glued. Moves: spouse (60,42)->(60,34) verge, concierge ->(-40.6,-76), marcus ->(159.7,-109.5), sal ->(-112,-30), xander ->(-151.2,22.2), champion ->(-84.4,-62.9); all 10 givers + 13 actors verified clear in-engine. Evidence: qa1world_rsmq_spouse_before/after.png — road empty, NPC+beacon on the grass verge)
- mrf7rss6 (-200,-150) quest beacon points behind backyard fence (unreachable?) — FIXED@v1.66.59 (investigated in-engine: the beacons seen from (-200,-150) are Vlad (q7, -240,-140) and Thorne (q10, -250,-140) — both stand on OPEN lakeside lawn, not inside any yard; but the two W-side townhome privacy-fence runs (FENCE_RUNS wood, x=-215 z -100..-140 and x=-220 z -135..-165) OVERLAPPED z -135..-140 with a 5u stagger, sealing the entire z -100..-165 span — from the townhouse side the NPCs genuinely read as fenced off, with a 60u+ detour around the far fence ends (headless walk test confirmed no through-route). Fix: trimmed the runs to x=-215 z -100..-133 and x=-220 z -144..-165, leaving an 11u property-line opening at z -133..-144. Walk test after: (-200,-150) -> gap -> Vlad -> Thorne all arrive. Evidence: qa1world_rss6_fence_before/after.png, rss6_context_*.png)
- mrf7rsy0 (-72,-80)  hedge bar runs down paved walkway w/ fence post inside; wall texture smeary up close — FIXED@v1.66.58 (root cause: Farnell's WAVE-1 SIDE-wall bed hedge ran at x=-61.8, z -94..-66, straight down the school's east paved apron (parking/pavement surface at -47.5,-83 reaches x=-62); the "fence post" inside it was the school's ac_condenser/utility_box wall props poking through. Fix: same hedge() clearance guard as mrf7rril — non-wall-hugging hedges (side beds + wave-3 frontage) are rejected on parking/pavement rects and road sidewalks; front-door planter beds keep their paved-apron allowance (hug flag). Verified in-engine: walkway clear, AC service props remain standalone against the wall. NOT addressed here: the "wall texture smeary up close" sub-note — that's the venue facade texture resolution, a different system (same class as mree84pq alpha/texture reports); FIXED@v1.66.63, see the qa2-misc section at the bottom)
- mrf7rt3d (240,-150) lone bench in empty field — STALE/NOT-A-BENCH@v1.66.62 (probed exhaustively: NO bench/env/street/density prop within 25u of the point — nearest real benches are the storefront/plaza ones 150u+ away. The report point is the exact SOUTH WALL PLANE of the 60x35 survey house at (243,-132) (teal roof); houseBlocksSpot(240,-150)=true and a headless walk test stops at z=-150.5 — the spot is not player-reachable. The QA bot teleported into the shell (same class as mrf7rtum) and, looking out through the backface-culled wall, saw one of the house's own dark-teal-trimmed WINDOW slabs (1.66x1.66 boxes at y0.92-2.58 along z=-149.7, x 219/235/251/267) floating over the visible-through field — that's the "lone park bench". No fix needed: walls/colliders verified intact from outside on both sides. Evidence: qa1props_rt3d_house_N/S_before.png (solid walls), qa1props_rt3d_eye_before.png (inside-the-shell view with the floating window slabs), mesh scan in session log)
- mrf7rt8u (-160,45)  stone fountain at road edge / in parking lane — FIXED@v1.66.62 (ROOT: the lakeside picnic pass's placeBank() ring formula pushed the tiered stone fountain to out=1.24 — past the lawn onto the lakeside road at (-172.6,53.5), right in the parking lane the reporter saw (the report's "drinking fountain" is this env 'fountain'; the playground drinking fountains all scanned clean). Fix at the mechanism: placeBank() now walks the spot back toward the water in 5% steps until it passes the same onGrass() gate (or skips the prop entirely) — the fountain re-seats at (-178,53.6) on the lawn, road clear; every other bank prop (benches/umbrella/bbq/fire pit/flamingos/windmill/lamps) re-verified on grass. Map-wide fountain scan 1 -> 0 offenders. Evidence: qa1props_rt8u_fountain_a_before.png (on road) vs _eye_after.png / scan output)
- mrf7rtea (310,6)    map edge = flat grey band behind houses — FIXED@v1.66.59 (root cause: NOT missing forest walls — the east wall at x=600 exists and spans the site; raycast through the band pixels proved the grey is the SKY DOME's horizon region. On the expanded map the perimeter sits 300-600u out, so the horizon band you see is the dome's PAINTED texture, which never matches the live scene fog (worst at dawn/dusk/rain) — the fogged world met a mismatched flat band and read as "the world stops"; the 30u-tall wall (44% fogged at 290u) subtends only ~5 deg and vanished against it. Fix: horizonSkirt — a camera-following open cylinder (r=505, y -90..100, 24 seg) just inside the dome, alpha-gradient opaque at/below the horizon fading out by +100, whose material color is copied from scene.fog.color every updateEnv frame; the fogged world now always melts into an exactly-matching haze band, and the fogged forest-wall treeline reads as a hazy silhouette in front of it. Works day/dusk/night/rain (skirt tracks fog). Gotcha found in verification: the first skirt (top y=170) poked OUTSIDE the r=520 dome above y~124 and the dome's low-poly triangles clipped it into zigzag sky wedges — top now capped at +100. Evidence: qa1world_rtea_east_before.png (flat grey slab) vs qa1world_rtea_east_final.png / rtea_east_dusk_final.png (hazy treeline))
- mrf7rtk5 (60,-8)    rain splashes are floating white squares, not ground rings — FIXED@v1.66.58 (root cause: splashes were an UNTEXTURED THREE.Points cloud — PointsMaterial with no map renders hard square points — at size 0.1 with camera-facing billboards, plus an "upward pop" that raised y every frame, so they read as white squares floating at odd heights. Fix: replaced with a single InstancedMesh of ground-flat quads (rotateX -PI/2) carrying a soft radial-alpha ripple ring texture, depthWrite off; rings sit at landH+0.045 and grow/collapse over the same 0.28s life. Verified in rain at (60,-8): flat soft rings on the road, no floating squares)
- mrf7rtp6 (150,-85)  crack decal painted on grass; road stretch has no lane markings — FIXED@v1.66.58 (two roots. Decal: the offender was a WALK_DEC sidewalk decal (litter_scatter slab) — the sidewalk-decal loop placed along coreWalk offsets with only spotClear, ignoring the ribbon-clipping rules (venue clearance, junction pads, other roads' asphalt) buildRemapRoads uses, so slabs painted onto bare grass where the walk ribbon was clipped/absent; new walkRibbonAt() gate mirrors those rules (remapInClear 1.2 / pads+2 / remapPointClear 1). Lane markings: DELIBERATE skip in the road-paint pass — center_line dashes were cls<=1 only, and res_se_pocket is cls 2; but it's a ~180u through-connector, so cls-2 roads >=120u now get the same dashed center_line decals on an even 7u cadence (short residential loops/lanes intentionally stay plain). Verified in-engine: no slab at the site, dashes along res_se_pocket)
- mrf7rtum (-180,-260) tree canopy fills whole screen walking under it — FIXED@v1.66.59 (two findings. THE REPORTED SPOT: (-180,-260) is INSIDE survey house at (-178.4,-262.6) — probed: houseBlocksSpot true, AABB collider present and WORKING (walk test from outside stops at the wall; you cannot walk in). The QA bot teleport-swept to the exact coordinate, spawned inside the shell, and the hip-roof underside (tan, y~3.3) filling its screen was filed as "inside the canopy of a big oak" — not player-reachable, no fix needed there (evidence: qa1world_rtum_site_after.png, house solid from outside). THE REAL BUG CLASS the report points at: low canopy rolls DO exist on walkable ground — streetside oak() calls roll scale down to 0.78, and the pack-oak foliage underside sits at ~0.25 of the 8.5*scale height => bottom ~1.66u, below eye height 1.7. Fix: OAK_CANOPY_MIN=2.05 clamp in oak() — packCanopyBotY() measures each pack prop's native canopy underside once (lowest vertex wider than the trunk), and per-tree scale is raised just enough that the scaled underside clears 2.05; procedural-blob fallback clamps scale >= 0.94 for the same bound. Only the smallest rolls are lifted (silhouettes intact); instanced forest-patch fill behind colliders untouched by design. Verified: all 203 walkable oak-class breakables now have canopy bottom >= 2.05 (min exactly 2.05, 0 below 2.0); worst offenders pre-fix computed at 1.66)

## live2-ai (fable, branch claude/qol-updates-triage-kn8igg): PACING CLUSTER + small polish
Claimed 2026-07-11. Slice = the items live batch 2 left OPEN that no other round owns.
NOT touching: live2-vfx (shipped), live2-anim (in flight), barrier-scrub cluster incl.
bus-stop blocker mrftfuy6 (owner mandate), curb ride-over mrftp7em (barrier/collision
territory), east-zone sidewalks (round5-roads).
- PACING CLUSTER (7 reports: mrft9al8, mrftbul8, mrftesnl, mrftf1th, mrftf7lk, mrftc5d4,
  mrfttu3a) — FIXED@v1.66.65 (headless movement scans found TWO pathologies. (a) BLOCKED-TARGET
  ORBITS: core wander targets (npcTarget/randTarget/group-follower ring slots) were never
  collider-checked — a target inside a prop/building/lake collider held the whisker in an
  eternal ~2.6-3.4u orbit (arrival needs d<1); targets now retry via spotClear, ring slots too.
  (b) WHISKER-DANCE POCKETS: in a concave collider pocket the whisker sidesteps freely forever —
  stepGot stays high (face-plant timer silent) and pushOut never eats the step (wall-slide
  watchdog silent); several NPCs piled up pacing at the SAME coords ((-140.7,-14), (-101,-108.6)).
  New no-net-progress watchdog: best distance-to-goal not improved for 4s => give up. All
  give-up paths route through npcGiveUp(): consecutive-give-up counter (reset on real arrival),
  re-rolls prefer a target whose first 11u of straight line is walkable (kills turn-around
  ping-pong), and 3 straight failures with NO player within 45u = quiet door-respawn (identical
  walk-out contract to death respawns — never pops in/out on camera; MP wires it as 'hidden').
  Scan evidence: 120-sim-sec / 225 NPCs — pacers 57 -> 15 and TIGHT loops (bbox diag <5u,
  the user-visible metronome) 20+ -> 0; give-up escalation verified end-to-end (orbit -> trips
  at 5s/9.2s -> hidden 13.4s -> re-emerges walking from a door 16.2s). Watchdog gate is >1.0u,
  not 1.2: testing found a dead zone where a blocked point held an NPC at ~1.05u forever.)
- mrftsrmg (9,167) adult NPC using the kids' wagon — FIXED@v1.66.65 (wagon pulled from
  ACC_POOL_WALK — asset stays for the __wc hook; re-homing it onto parents walking kids or
  kid NPCs is future content work, kids currently ship no accessory rig)
- mrftxqdt (-14,-112) litter/spill decal floating at chest height — FIXED@v1.66.65 (not a
  decal: ITEM-DROP sprites (junk/food spills, NPC drops — newspaper/cardboard etc) shared the
  weapon-drop hover band, i.e. 1m flat sprites bobbing at y~0.7 = chest height. Item sprites
  now 0.62-scale hovering at knee height (sprite bottom skims pavement); gun meshes keep the
  old band. Verified: 3 junk drops on the report sidewalk read as ground litter)
- mrftaqio (-34,-172) Xander clipped inside building — FIXED@v1.66.65 (ROOT much bigger than
  Xander: buildSurveyHouses collider registration had (1) rotated houses passing DEGREES to
  addColliderOBB which expects RADIANS — cos(-67 rad) = random collider yaw per diagonal house;
  (2) near-axis (rot~90) houses passing raw (w,d) unswapped to addCollider — the collider
  covered a 90-degree-wrong footprint, both long faces walk-through, both side yards blocked.
  Ground-truth proxy scan (sample each house's solid raycast-proxy interior at walk height for
  pushOut-walkable points): 263/465 houses were walk-through BEFORE, 0/465 after. 8
  historically-verified open spots regression-checked still open.)
- NOTE for barrier-scrub (fable, in flight): the house-collider yaw fix above REMOVES a large
  class of collider-where-no-mesh cases (mis-yawed OBBs jutting into open yards = invisible
  walls). Re-run tools/barrierscan.js against v1.66.65 before shipping — your orphan counts
  and the (~314,556) meshless-house diagnosis may change. Also __wc now exports
  pointFree/pushOut/spotClear/solidMeshes for headless collision QA.

## live2-ai ROUND 2 (fable, same branch): sign posts / chainlink / mirrored venue signs
- mrfto9qj (253,335) sign floating off pole + pole mid-sidewalk + too thick — FIXED@v1.66.65
  (roadside sign posts planted at hw+2.4 = dead-center of the walk band; now behind the walk
  at hw+sw+1.2. Pole r 0.11 -> 0.065; placard mount poleR+0.1 -> +0.04 kills the visible
  detached-placard air gap while keeping the mref48hy spearing fix. MERGE NOTE for live2-vfx:
  your two-plane poleSign placard change touches the same lines — on merge, keep BOTH planes
  and use my ±(poleR+0.04) offset + r 0.065 default.)
- mrfttd8s (2,123) chainlink too thick — FIXED@v1.66.65 (ROOT: fenceRun — the DENSITY fence
  builder used by fenceRect for the storage + school perimeters — stretched ONE texture tile
  over the whole fence height; the v1.66.12 retile only fixed buildFenceRun. Chainlink runs in
  fenceRun now tile at the same fixed ~0.7u square period. The report's "aimless walking"
  sub-note is the pacing cluster, fixed above.)
- mrftt0x4 (7,133) backward text — FIXED@v1.66.65 in THIS lane (the mirrored sign is the
  SELF STORAGE signPlane banner — signPlane is a separate venue-text-sign system live2-vfx's
  dSign/poleSign two-plane fix does NOT cover. signPlane (storage banner, strip-mall names,
  RaceTrac boards, venue signs) is now two front-facing planes back-to-back. live2-vfx: your
  "likely resolves mrftt0x4" note can be retired — verified EGAROTS FLES -> SELF STORAGE
  readable both sides at the report spot.)

## SELF-QA sweep 1 (fable, live2-ai branch — proactive, no user reports; 2026-07-11)
Found by turning the new __wc collision exports on the world itself.
- UNREACHABLE NPC DOORS — FIXED@v1.66.65 (scan: 83/494 registered doors were fatally blocked —
  50 stoop waypoints inside colliders + 33 door points no NPC could reach arrival range (d<1)
  of; props/fences placed after registerDoor sat on the approach. Every errand to one was a
  doorSeek orbit (the pacing class), and killed-NPC respawns emerged inside props. New
  load-time doorClearancePass (after ALL collider sources): slides blocked stoops to the
  nearest free spot (outward+lateral fan), pulls unreachable door targets off the facade until
  the arrival ring is walkable, unregisters 38 unsalvageable doors. Re-scan: 456 doors, 0
  blocked stoops, 0 blocked rings. Counters on npcDoors.qaFixedStoop/qaPulledDoor/qaRemovedDead.)
- PARKED-CAR INTERPENETRATION — FIXED@v1.66.65 (oriented-overlap scan: 3 clipping pairs/26 cars.
  spawnParkedCars vets a row's slots BEFORE placing, so same-row picks never checked each other;
  survey-house rows pitch at 3.3u and per-peer-random big models (taxi/step van ~5.5u) overflow
  into adjacent fills. Placement now drops free slots within 4.6u of each fill — deterministic,
  MP indices unchanged. 3 pairs -> 1; survivor verified visually clean (tight diagonal stalls).)
- DEGREES-VS-RADIANS AUDIT — CLEAN (after the house-collider find, audited every rotation
  consumer: all other addColliderOBB call sites, houseOnRoad/houseSidewalkNudge, HOUSE_LOTS,
  placeVenueData yaw, fenceRect, groundHeightAt, playground/env place() — all convert
  correctly. The buildSurveyHouses collider was the only unit bug.)

## qa2-misc (fable): mregjcuz night lighting + mreg8mld unbreakable post + facade close-up texture smear (mrf7rsy0 sub-note / mree84pq class)
All three FIXED@v1.66.63. mregjcuz + mreg8mld details are inline in Batch 8 / Batch 7 above.
- Facade close-up smear (mrf7rsy0 sub-note, mree84pq class) — FIXED@v1.66.63 (ROOT: low-res canvas wall textures magnified over huge wall spans. Worst offenders measured: stuccoTex 128px tiled 2x2 across the 82m school wall = ~3 px/m; thStuccoMat 64px across a whole 8m townhouse ground floor = 8 px/m; facadeTex 256px across a multi-story facade. Fix, same recipe as the v1.66.58 roadT fix — resolution + structure, style unchanged: (1) stuccoTex 128->512 with area-scaled grain + NEW subtle trowel-sweep arcs and sparse hairline cracks (school, strips, Publix beige, terracotta pilasters, Dunkin block — 7 materials); (2) shared stucco() helper's speck count now scales with canvas area (was fixed 700, tuned for 128px — 256px canvases were half-empty); (3) thStuccoMat 64->256; (4) facadeTex canvas 256->512 — grain painted at full res, window/door layout kept authored in 256-space via ctx.scale, night-emissive companion canvas intentionally left at 256 (soft glows need no res). Survey-house atlas walls (houses.js) deliberately NOT bumped: 55+ per-cluster-variant 512 atlases would cost ~170MB GPU at 1024, and their source tiles are only ~120x80 — no detail to gain; noted as accepted residual. Texture-memory delta measured in-engine (unique canvas-backed maps in scene): 92.3MB -> 110.3MB canvas RGBA (+18MB, +~24MB GPU with mips; 512px canvas count 55->74). Evidence: qa2misc_before_i3_school_close.png (blur blob) vs qa2misc_after_i3_school_close.png (grain), qa2misc_before/after_i3_townhouse_close.png + _mid.png)

## Live session batch 2 (2026-07-11, reporter Alex on v1.66.63) — HIGH PRIORITY, user playing live
- mrft7ja9 (-60,-154) shooting NPC shows FIRE burst — wants BLOOD — FIXED@v1.66.64 (ROOT: the v1.66.30 sprite-VFX rework routes puff() by HUE — vfxIsFire(col) sends any warm tint to the additive VFX_FIRE sheet — and every hit-on-person caller passed warm reds (hitscan/cop-mirror 0xd93a2a, melee 0xd96a4f, ragdoll burst 0xa01212), so shot NPCs/cops/remotes looked like they caught fire. Fix at the mechanism: puff() takes an explicit kind param that bypasses the hue heuristic; kind:'blood' spawns 3 small dark-red droplet billboards (0.18-0.33u) with slight toss + gravity and a ~0.3s fade, matching the existing ground bloodDecals. All 9 person-hit call sites (hitscan npc/cop/copM/remote, melee x4, killNpcRagdoll, client cop-fire cfx mirror) now pass 'blood'. Hue routing untouched for explosions/burning cars. Evidence: live2vfx_blood.png — headless: pistol NPC hit = 3 blood puffs, 0 fire puffs)
- mrft7zm5 (-43,-163) wall-impact smoke clouds way too big + wants bullet-hole decals — FIXED@v1.66.64 (ROOT a: the same v1.66.30 rework made the miss-path puff (0xbbbbbb) use the full-size smoke billboard — 0.6-1m spawn growing ~3.2x/s to a ~3m cloud per bullet. Fix: new kind:'impact' path — 0.30-0.44u dust puff, 0.34s life, growth 1.3/s, opacity 0.7; explosions/burning cars keep the big smoke (verified boomAt still spawns 9 large puffs, max scale 1.34u+ and growing). ROOT b: no bullet holes existed. Added bulletHole(h): stamps a 0.16u canvas-textured pock (near-black core, ragged edge, subtle chipped rim) at the hitscan intersection on static surfaces, oriented to the world-space face normal (+0.02u lift, depthWrite:false, polygonOffset -4), random roll; own pool capped at 60 (oldest recycled), 60s despawn, updated in updateDecals. Evidence: live2vfx_wall.png (small dust + holes), live2vfx_boom.png (explosion smoke still big); headless: impact puff max 0.41u, hole spawned on Publix wall)
- (unfiled, seen in mrft7zm5 shot) yard-sign placards read mirrored from behind — FIXED@v1.66.64 (ROOT: dSign placards were a single plane whose keyed-texture batch material forces DoubleSide — backface shows the texture mirrored; same greenSign bug class fixed in v1.5x. Fix: dSign now bakes TWO front-facing planes back-to-back (ry and ry+PI) with a twoPlane meta flag that forces FrontSide on the batch material (coplanar pair can't z-fight — culling draws exactly one per view direction); poleSign placards (stop/roadwork/speed-limit on breakable poles) had the same single-DoubleSide-plane issue and got the identical two-plane fix. Covers yard signs, wall signs, gas-price sign, billboards. Likely also resolves mrftt0x4 (7,133) backward text — re-verify at that pos. Evidence: live2vfx_sign0.png / live2vfx_sign1.png — FOR SALE sign readable, non-mirrored, from both sides)
- mrft8cw7 (-44,-152) cop still holding gun wrong (pistol flat on palm, misaligned) — FIXED@v1.66.65 (ROOT: the held gun's pose was only ever solved for the AIMING frame — copAimArm snaps the barrel onto the shot line, but that runs solely when a target is inside weapon range. Every other armed frame (engage-walk toward a far target, interior cops idling, and ALL client-side mirror cops, which never run copAimArm at all) left the gun riding the hand bone with attachHeldGun's static local rotation while the walk clip swung the arm — reading as a pistol lying flat on the open palm at chest height. Fix: new copLowReady(m) — same post-animPerson world-space-delta technique as copAimArm (rig-agnostic, self-correcting, no accumulation): pins the fist ~50 deg down-forward of the shoulder slightly off to the gun side, then wraps the gun to the fist with its barrel (-Z) continuing that down-forward line. Called for host cops with gun out but no aim target, interior cops idling, and every non-downed mirror cop in applyWorldSnap. Covers pistol and SMG tiers (mirrors pick tier from local wanted as before). Verified headless: low-ready barrel pitch 56 deg below level, hand 0.26u below shoulder mid-run; aim pose untouched — barrel-to-target dot 1.000 at 9u. Evidence: live2anim_side_lowready.jpg (gun angled down along thigh mid-run), live2anim_side_aiming.jpg, live2anim_cop_smg_lowready.jpg)
- mrft8ygx (15,-114) MP walking animations still laggy (remote walk-cycle phase stutter) — FIXED@v1.66.65 (ROOT: position interp shipped earlier but every remote/mirrored walk-cycle PHASE still integrated from the RAW per-frame position delta (phase += moved*3.4). Whenever the snapshot stream hiccups — remote-player buf down to 2 entries with b[1] stale holds f=1 (frozen), world-snap alpha saturating at 1.15 past 8Hz jitter — the delta flatlines to 0 for a few frames then surges a whole packet interval in one frame, so the clip snapped idle->sprint-pose at wire rate even though position looked mostly smooth. Fix: all four network animation paths (remote players in the updateNet interp loop, NPC mirrors + street-cop mirrors in applyWorldSnap, kid mirrors in mirrorKids) now keep a smoothed speed estimate sspd (exp filter, ~140ms tau) and advance phase locally every frame as sspd*dt*3.4 — the exact formula host-side sims use — with animPerson also fed sspd so the walk/run/idle pick stops flickering at the 0.5/2.9 thresholds. Discontinuity guard: raw speed >40u/s (teleport/respawn/slot reuse) and NPC hidden-door transitions zero sspd instead of sprinting the clip. Verified with the 2-page headless MP rig (local relay :8107, host walks a circle, client samples phase per frame): NPC mirror phase delta advances EVERY frame — 0 stalls/130 frames, cv 0.144; remote player 5 stalls/130 (all in the tail after the host pump ended), cv 0.476 incl. harness timing jitter, mean delta matches expected stride rate — vs the old code which only advanced phase on snapshot-arrival frames. Evidence: live2anim_phase.json)
- mrft9s65 (27,-92) flag waving animation whack (BoA flags stiff quads, odd pivot) — FIXED@v1.66.65 (ROOT: the 'wave' env-prop rig split the flag cloth off the flagpole mesh and swung the WHOLE thing rigidly around the pole's vertical axis (rotation.y +-0.3 plus an x-tilt) — two stiff quads wagging like doors on a hinge, at odd angles from most viewpoints. Fix: real vertex-animated cloth. At rig-up the cloth is midpoint-subdivided (subdivideTris, 1:4 per pass until >=150 verts — flagpole lands at 312; shared edges get bitwise-identical midpoints so no cracks) and each vertex precomputes hoist distance u (0 at the pole, 1 at the fly end) and its horizontal tangent around the pole. Per frame (inside the existing 90u anim cull): two traveling sines (5.2/9.7 spatial, 5.6/8.9 rad/s) run hoist->fly, amplitude 0.16*flag-length scaled by u — hoist edge exactly pinned to the pole — under a slow gust envelope, plus a gentle +-0.05 whole-cloth wind-shift sway. Displacement is horizontal-only, so the two flags stacked on one pole can NEVER intersect; per-pole phase offset keeps the three poles (Regions/BoA/Farnell) out of sync. Verified headless: all 3 flagpoles rigged (312 verts, amp 0.189), live displacement oscillating 0.048-0.147u across frames. Evidence: live2anim_flag0.jpg / live2anim_flag1.jpg — visibly different ripple shapes)
- PACING CLUSTER: mrft9al8 (13,-87) back-and-forth on repeat / mrftbul8 (-102,-169) / mrftesnl (-133,77) / mrftf1th (-125,49) / mrftf7lk (-111,45) / mrfttu3a (-7,74) / mrftc5d4 (-121,-143) — FIXED@v1.66.70 (reproduced headlessly first: 90 sim-s displacement-vs-path metric flagged 12/445 NPCs as pacers (path>35u inside a <16u box, ratio>4), clustered exactly in the reported band. Per-tick traces exposed FOUR stacked roots. (1) THE BIG ONE — the road-loiter discipline (`roadT>2 → tx = remapRoadEscape nearest curb`) always ejected to the side the NPC came FROM, but crossing a 22-28u remap road at walk speed takes 14s+ vs the 2s loiter timer, so every legitimate crosser was yanked straight back at the curb, picked a fresh random target (often back across), stepped out again... the road-edge shuffle behind most reports. remapRoadEscape now takes the NPC's goal and exits on the GOAL side, so crossers commit and finish (46 completed main-road crossings measured in 90s post-fix). (2) Stuck/wall-slide bails re-rolled blind targets THROUGH the same wall — new npcBailTarget remembers the failed heading ~8s (n.badDX/badT), rejects candidates in a ~60° cone of it, requires >=12u legs + a pointFree-probed first corridor (corridorFree), falls back to backtracking, and adds a 0.35-0.95s idle beat so the turn reads deliberate. (3) The whisker-avoid steer moves at FULL speed, so an NPC orbiting a concave corner never tripped the zero-progress watchdogs — avoid frames now count as "rubbing" and clean frames only clear the watchdog after a 0.7s grace. (4) setNpcTarget free rolls now also enforce the 12u/corridor rule. Backstop: 4+ bails in 40s = boxed in a pocket → NPC ducks through the nearest doorway (the standard hidden-dwell flow) and re-emerges. RESULT: pacers 12 -> 0 in two independent 90 sim-s runs (live2ai_pacing_before/after.json + _confirm.json), zero pacers within 20u of any reported position, door errands alive (250 hidden-entries/90s). Don't regress: goal-side escape + corridor probes are load-bearing)
- mrftaqio (-34,-172) Xander clipped inside building — FIXED@v1.66.66/verified@v1.66.70 (the site's survey-house/townhouse OBB colliders were victims of the degrees-vs-radians addColliderOBB bug fixed in the barrier scrub — at report time (v1.66.63) NPCs could genuinely wander through the misoriented walls. Verified at the site in-engine now: reported point sits on clear ground between two solid survey houses, footprint cells around it collider-blocked, a probe NPC dropped on the spot ejects to clear ground, a walk-in NPC is stopped 6.7u out, XANDER himself roams clear (pointFree true). Pair-anchor logic checked: groupSpawnCenter uses sidewalkSpot+spotClear (never a footprint). NOTE for future reports of this shape: NPC name tags are depthTest:false sprites for the 10 nearest NPCs within 26u — a tag glowing through a wall for an NPC standing BEHIND a building reads exactly like "clipped inside"; the mrftaqio screenshot shows only tags, no bodies)
- mrftfuy6 (17,13) invisible barrier + bus stop in the MIDDLE OF THE ROAD near the junction — FIXED@v1.66.66 (ROOT: the per-arterial bus-shelter pass placed at polyline-midpoint offset hw+3.4 from ITS OWN road only — at the junction that spot sits on ANOTHER road's asphalt; and its SP_SOLID collider was the "invisible barrier" when approached from the far side. Fix: shelter spot must now pass remapPointClear(pad 2, includes junction pads) + !remapInClear, sliding ±18u steps along the polyline until clear; shelter relocated to the corner pavement at (25,2). Walk test at 17,13: 8/8 directions free, nearest collider is a visible 0.4u light pole 2.5u away. Evidence: scrub_junction_1713.png, scrub_shelter2.png)
- INVIS-BARRIER CLUSTER — FIXED@v1.66.66 (barrier-scrub round, OWNER MANDATE). Scan went 882/3299 orphans -> 0/2486 (and 0 even under STRICT=1 with registry shortcuts off). Root causes fixed:
  (1) forestPatchClearTiles blanket 5x5 tiling of road-adjacent forest leaves wherever ground was merely road-clear (855 of 882 orphans) — tiling now DEFERS until expForestFill has planted (pendingForestTiles -> processForestTiles), and a cell only gets a collider when >=1 visible instanced fill tree stands inside it (tag 'forest:tile'; ~600 blanket tiles dropped, 248 tree-backed tiles kept).
  (2) survey-house OBB colliders passed rot in DEGREES to addColliderOBB which does cos/sin in RADIANS — every diagonal house's collider was misoriented vs its visible mesh (the "house-sized OBB with no mesh" at ~314,556 was exactly this: the mesh renders fine, the collider was rotated off it into the yard). Fixed to pass radians; plus houseTemplate output is now guarded (empty template => skip instance entirely with console.warn, so mesh+collider always come as a pair).
  (3) world-edge clamp reachable through every perimeter exit gap (ROAD CLOSED barrier is narrower than the wall gap; horizonSkirt makes the edge look open) — each exit gap now closes at the bound with a VISIBLE galvanized guardrail (twin beams + posts, tag 'perimeter:rail', clamp itself unmoved) plus flanking oaks. Reports at 599,599 / 599,593 / 587,-599 now stop at visible rails/forest walls.
  NOTE the old scan numbers were also inflated by a scanner blind spot: it could not see InstancedMesh forest fill, so even fully-forested rect colliders flagged as orphans. _barrierscan.js v2 is instancing-aware (per-instance occupancy points), does tight bbox-overlap for small meshes (adaptive inset so zero-thickness fence planes in 0.3u colliders count), keeps grid raycasts for big merged batches, exits 1 on any orphan (ship gate — see BARRIER GATE section at top).
  Walk tests at all reported points (587,-599 / 556,-139 / 575,194 / 218,507 / 226,399 / 326,537 / 599,593 / 599,599 / 32,-328 / 17,13): every blocked direction stops at a tagged collider backed by visible geometry (houses / perimeter walls / rails); rest walk free. Collider total DOWN 3347 -> ~2492. Prevention layer shipped: addCollider/addColliderOBB tag param threaded through all major passes (forest/house/bldg/prop/env/fence/perimeter/gas/signal/pole/venue), F8 meta auto-attaches 3 nearest colliders w/ tags (meta.cols), F9 + __wc.showColliders(on) overlay (single LineSegments; red AABB / orange OBB / cyan lake), scanner as pre-ship gate. Reports covered: mrftgg0z, mrfthui7, mrftk7q1, mrftpi58, mrftpuse, mrftoq2o, mrftu8ws, mrftuk90, mrftyqsn, mrftfuy6. Evidence: scrub_scan.json, scrub_scan_strict.json, scrub_*.png (scratchpad).
- mrftp7em (328,525) cars should ride over curbs, not clip/stop on them — OPEN (curb collision: make median/sidewalk curbs drive-over bumps not walls)
- mrfto9qj (253,335) sign floating off pole + pole mid-sidewalk + too thick — FIXED@v1.66.80 (see SIGN-ASSEMBLY CLUSTER below)
- mrftcjh1 (-99,-122) 'horrible animations on her' — FIXED@v1.66.70 (the NPC is NIA (Meshy fem civ, tag visible in the shot). ROOT: the v1.66.10 MESHY_LEG_FIX entry NIA:1.2 was tuned on LATERAL spread only (0.77→0.32) — but her UpLeg bones are also twisted about their own axis vs the shared clip's source rig, so the plain parallel-Y yaw rotated her stride arcs UPWARD: knees-up, feet floating to 0.57u (roster norm fyMx 0.16-0.26) — exactly the reported look. Re-swept absolutely (replacing, not stacking, the in-game fix — the old _animtuneGary harness stacks on top and mis-scores) with foot-height + crossing penalties across pre-Y/pre-Z/post-X/Y/Z families: pure Y/Z can't plant her feet (best fy 0.46); a bone-LOCAL X post-multiply can. meshyPose {y,z} form extended with px (local-X untwist, same sign both legs); NIA = {y:0.1, z:0.05, px:-0.6} → feet plant at 0.27, zero crossing, upright side profile (lat 0.57 a touch wide — planted beats floating). GARY/HECTOR entries untouched, verified unchanged. KNOWN RESIDUAL: HECTOR (legFix 1.2, also lat-only-tuned) has the same knees-up class (fyMx 0.69) but responds to NEITHER the Y/Z nor the px family (best score 1.04, stride collapses) — unreported so left alone; needs its own axis treatment if filed. Evidence: live2ai_nia_side/front.png vs scratchpad live2nia_side_cur.jpg (old can-can))
- mrftsrmg (9,167) adult NPC using the kids' wagon — FIXED@v1.66.70 (ROOT: 'wagon' sat in ACC_POOL_WALK, the ADULT pedestrian accessory roll table — kids never roll accessories at all, so ONLY adults ever towed the toy wagon (12 adult owners measured in one world). Fix: wagon removed from the adult pool; spawnKids now gives ~1 in 6 kids a wagon via the same attachAccessory side-mode path (kid states never hit the detach/hide paths, verified). Post-fix world scan: adult-owned wagons 0, kid-owned present. Evidence: live2ai_kid_wagon.png)
- mrftt0x4 (7,133) backward text (mirrored sign at pos) — OPEN (finding from the live2-ai round: the offender is the SELF STORAGE venue's own painted fascia placard — it reads mirrored from the N/back side (visible in live2ai_fence_after.png). Venue-builder sign, NOT a dSign placard, so the v1.66.64 two-plane fix didn't cover it; needs the same back-to-back-planes treatment in the storage venue builder)
- mrfttd8s (2,123) chainlink texture too thick here + aimless walking — FIXED@v1.66.70 (ROOT: TWO chainlink systems exist. The FENCE_RUNS breakable panels got the 0.7u retile in v1.66.12, but the DENSITYPROPS fenceRect/fenceRun path (self-storage lot ring at this site, Farnell S+E edges) still stretched ONE 256px texture tile over the full 2u height x 2.8u panel length — diamonds ~4x oversized, wire read rope-thick. fenceRun now tiles chainlink_fence at the same ~0.7u period both axes. The "aimless walking" half is the pacing-cluster fix above. Evidence: live2ai_fence_after.png vs scratchpad live2probe_fence_before.jpg)
- mrftxqdt (-14,-112) floating litter/spill decal at chest height — FIXED@v1.66.70 (investigated as geometry first: the quad is a litter_scatter WALK_DEC decal — texture match is exact — but map-wide scans found ZERO decal quads elevated or non-flat (all bake through UDECAL at y 0.06-0.17, yaw-only; the mechanism cannot tilt). ROOT is a KEYING bug, same family as the mree7hy2 "box/shadow patch" class: litter_scatter + leaves_scatter are authored on a MID-GRAY asphalt tile but sat in the luminance KEY=46 list, which only drops near-black — the whole gray tile stayed opaque, and on pale plaza sidewalk slabs (this site) or grass the quad reads as a solid sheet hovering over the ground. Moved both to the GKEY blend-key list (border-average background fades to transparent + soft edge vignette) — only the litter/leaf pieces render now. grass_tuft deliberately left keyed (tuft/bg contrast too low for the blend ramp). Evidence: live2ai_litter_after_low.png — loose litter pieces, no gray sheet)
- mrftyqsn (32,-328) invis barrier SOUTH zone — FIXED@v1.66.66 with the barrier cluster (walk test: 5/8 directions free, the rest stop against the VISIBLE survey house at (56,-350); the phantom blockers there were blanket forest tiles, now gone)
- mrfthmf4 (575,-160) houses in the middle of grass look weird — FIXED@v1.66.89 (road-network round: mountbatten_dr frontage + driveways; see ROAD-NETWORK MAJOR ROUND)
- mrftn1qd (351,201) no sidewalk here / mrftnnxa (245,329) grass sliver between road+sidewalk — OPEN (east-zone sidewalk-ribbon quality, same territory as round5-roads)

## Live session batch 3 (Alex on v1.66.72)
- mrfzble5 (-56,30) HECTOR walk still broken, owner: "FIX IT OR DELETE AND REGENERATE" — FIXED@v1.66.74 (Stage A landed, zero Meshy credits. ROOT: HECTOR's Hips GLOBAL bind is 136° off the shared clip's source rig while his leg joints are only ~3° off; the runtime shared-clip retarget is a per-joint LOCAL post (inv(srcBindLocal)*charBindLocal), only correct when parent global binds match — so every large leg excursion got redirected (walk fyMx 0.689, run 1.068 vs roster norm ~0.2/0.77; the old legFix 1.2 only masked lateral splay, and NO {y,z,px} bone-constant can express a wrong PARENT frame — that's why he "responded to no transform family"). FIX: baked per-character walk+run clips via a proper world-delta retarget L_c = inv(GbC_par)*GbS_par * L_s * inv(GbS_j)*GbC_j (global bind quats of both rigs) offline into meshychars.js — HECTOR now carries own q data like YUKI+, keeps his look, skips the broken shared post path for locomotion; gy/st re-measured per genskin conventions (gy 0.0358/0.0353, st 1.549/2.934); MESHY_LEG_FIX HECTOR entry removed. After: walk fyMx 0.195 lat 0.394 crossed 0 / run fyMx 0.712 — RYAN-class (0.195/0.766). GARY 0.347/fyMx 0.245, NIA 0.572/0.288, RAVEN before/after metrics identical (no regression). Evidence: live3_hector_before/after_walk_mid_{front,side}.jpg + run_mid_side. NOTE for mrfzod76 (RAVEN run, next round): scratchpad live3_hector_bake.js is character-generic — RAVEN's walk also foot-crosses 18/32 frames today; the same bake likely fixes her.)
- mrfzbvxk (-39,20) stroller pushed with no hands — FIXED@v1.66.74 (the stroller sat in the "natural arm swing reads fine" bucket — it didn't. Added poseStrollerGrip (poseWalkerGrip class, world-space aimLimbAt): both hands onto the handle bar — probed at authored x .34-.42 / y .94-.99 / z ±0.2 → owner-local (±0.17, 0.96, 0.24) after the ry +PI/2 placement — plus a light 0.14 spine lean; dispatched from updateAccessories. Stroller orientation verified correct (canopy toward travel). Evidence: live3_acc_before/after_stroller_side.jpg)
- mrfzd401 (-19,47) stroller hands-free — dupe of mrfzbvxk, FIXED@v1.66.74 with it
- mrfzcpmk (-25,51) two NPCs of the same kind near each other — OPEN (twin-spacing rule may need rescale after NPC count doubled to 445)
- mrfzdcwu (-15,59) pacing against a wall / mrfzdlpd (4,85) more stuck npcs — filed on v1.66.72, PRE-pacing-fix; RE-VERIFY on v1.66.73 before treating as new (12->0 pacers measured on .70)
- mrfzdzwh (4,91) fence too thick (RE-VERIFY on .73 — chainlink retile shipped) + AC unit looks awful (AC half FIXED@v1.66.95 with mrg54993: class-wide Gemini galvanized retexture + 1.75x downsize)
- mrfzed2k (14,88) wagon sb kids-only (RE-VERIFY on .73 — shipped) + 'wagon looks bad' (OPEN, wagon model quality)
- mrfzf22j (67,131) walker held wrong, rotate 90deg — FIXED@v1.66.74 (owner was right: geometry probe shows the v1.66.66 note had the axes SWAPPED — the walker's grip rails run along authored X at z ±0.2 (top-band z histogram has ZERO verts at |z|<0.15), so ry:0 put the handles ACROSS the walk direction. Open side is authored -x (5 mid-height verts vs 31 on the braced +x face) → ACC_PLACE walker ry now -PI/2 (opening to the user, rails fore-aft at owner x ±0.2) and poseWalkerGrip targets moved to (±0.2, 0.82, 0.34). Evidence: live3_acc_before/after_walker_{side,rearq,frontq}.jpg)
- mrfzfmfo (25,154) guy floats during idle — FIXED@v1.66.74 (measured: EVERY Meshy adult floated 0.06-0.20u in idle — the shared idle/idle2/chat/talk clips fell back to the WALK clip's gy ground offset and their authored root heights differ. Rather than freezing adults on the walk plant frame (kids' meshyPlantPose — would kill the idle sway), baked a per-character per-clip gy for idle/idle2/chat/talk into meshychars.js (188 entries; genskin fkToeMinY convention, FK'd through the exact game retarget incl. MESHY_LEG_FIX; the engine already prefers e.clips[k].gy over the gyWalk fallback — zero game-code change). Min idle foot y: DIEGO 0.181→0.037, COP_JACKSON 0.196→0.043, RYAN 0.174→0.040, ALEX 0.177→0.042 (walk-plant class ~0.04). Standing/chat/dealer/clerk paths all covered. Evidence: live3_idle_before/after_idle_{row,diego_close}.jpg, scratchpad live3_idlebake.js)
- mrfzgk9n (-2,165) leaves-scatter 'rework as individual alpha leaves or delete' — filed on .72 PRE-GKEY-fix (v1.66.70 moved it to blend-key); RE-VERIFY on .73: if it still reads as a sheet, rework to alpha-cut individual leaf decals (owner spec)
- mrfzfyyf (0,165) no driveways for these houses — FIXED@v1.66.89 (map-wide driveway pass; see ROAD-NETWORK MAJOR ROUND)
- mrfzgznx (-5,181) road stub jutting into walkway — OPEN (roads/junction geometry, round5-roads territory)
- mrfzhm8g (27,191) people walking in the road too much, want stronger sidewalk bias — OPEN (tune: 85% sidewalk bias + jaywalk frequency; possibly interacts with the new goal-side crossing fix)
- SIGN-ASSEMBLY CLUSTER: mrfto9qj (253,335), mrfzidc6 (15,300), mrfzjsdl (76,133), mrfzk1rq (62,110) detached/floating signs — FIXED@v1.66.80 (systematic audit, not spot fixes. New build-time registry `signAudit` (__wc.signAudit) records every stake/pole+placard assembly (roadside poleSigns, yard signs, RaceTrac gas pylon, 2 billboards) with stake-top / placard-bottom / lateral offset; tools/_signaudit.js asserts per-asset: stake enters placard >=0.05 and never ends below it, placard plane seats 0..0.08 off the stake surface, exits 1 on offenders. BEFORE: 63/63 assemblies offended — 43/43 poleSigns DETACHED (placard 0.10 clear of the pole surface: v1.66.10 seated it at poleR+0.1) AND all 43 stood mid-sidewalk (offset hw+2.4 = walk centre) with a 0.11-radius post that read rope-thick next to 0.4-0.6u placards = exactly mrfto9qj; 17 yard signs DETACHED (v1.66.62 shoved the placard 0.14 in front of an r=0.05 stake = 0.09 air gap, visible as "detached sign" at the 3 residential reports); gas pylon + both billboards SPEARED (placard baked ON the post axis, posts crossed the sign face). FIX, all derived from actual asset dims instead of constants: poleSign seats the placard at poleR+0.02, clamps post top into [placardBottom+0.08, placardTop-0.04], default post radius 0.11->0.065, and the roadside placement loop nudges outward past the onSidewalk band (hw+sw+1.1..2.7, houseBlocksSpot/lake/clear-guarded, skip if nothing clears); yard-sign placard offset 0.14->stakeR+0.02 (overlap 0.08 kept), yard spots now also reject the walk ribbon (sample band moved to hw+4.6..7.4 so density holds); pylon/billboard planes offset postR+0.02 in front of their posts. AFTER: 53 assemblies, 0 offenders, 0 poleSigns on the walk ribbon, barrierscan 0 orphans. Evidence: signs_o9qj_before.png (bare thick pole dead-centre of the walk) vs signs_o9qj_after2.png; signs_jsdl_before.png (FOR SALE placard hanging off its stake on the school plaza walk) vs signs_idc6_after.png + signs_idc6_side_after.png (placard seated on stake at grazing angle) + signs_k1rq_retake_after.png (GARAGE SALE seated, lawn placement))
- mrfzj1oh (78,241) 'why does the sign have alpha' (sign face has holes/transparency) — OPEN (sign texture keying; possibly a GKEY/luminance-key casualty on a sign that shouldn't be keyed)
- mrfzl9on (80,11) 'this prop looks ridiculous, rework it' — FIXED@v1.66.95 (probe showed the venue AC-condenser+utility-box+propane cluster planted mid-FORECOURT under the RaceTrac pump canopy: the racetrac venue rect includes the canopy, so the 'side wall' offset landed on open concrete. Gas station now skips the ground cluster entirely (rooftop RTUs already exist); forecourt verified clear. Evidence: gemprobe_prop_80_11_a_before.png vs gemprops_forecourt_after.png)
- mrfzm42w (84,-15) grill smoke too big + should emit FROM the grill; inflatable man 'terrible, figure something out' — OPEN (grill smoke = impact-size the bbq emitter + anchor at grill mouth; wacky-man = prop-quality rework or replace)
- mrfzmw9u (72,-15) gas station price sign: bigger, on the curb, GLOWING 7-SEGMENT displays, 'leverage chat gpt here' — FIXED@v1.66.95 (AI round, Gemini this time: new raceTracPylon() — 10.7u branded pylon AT THE ROAD CURB (walks RM.roads for the nearest arterial, stands just outside the walk ribbon on the venue side, faces along the road so both directions read it; remapPointClear/onSidewalk/spotClear/breakablePoleNear-guarded, frontage fallback). Top: gemini-3-pro-image red RACETRAC cabinet face baked as racetracsign.js (RT_SIGN data-URL, typeof guard + canvas-text fallback, wcTick boot chain). Below: REGULAR 2.89 / MIDGRADE 3.19 / DIESEL 3.45 in RUNTIME-drawn 7-segment digits (rt7seg canvas: classic segment geometry, amber top row + red rows, dark ghost segments, shadowBlur glow) on MeshBasicMaterial so they burn at night; rare LED brown-out flicker (updateRtPylon @ updateWorldFx, one row dims ~0.12s every 6-16s, 2 canvas repaints). Two-plane faces (greenSign pattern), OBB collider tag sign:pylon, addSignGlow night halo both faces, signAudit-registered (audit passes). BOTH old awful signs removed: the density gas_price_sign mini-pylon AND the in-lot monument sign in gasStation(). Evidence: gemsign_day_faceA/faceB2/wide.png, gemsign_night_faceA/close/deep.png)
- mrfzn54t (77,-36) floating tree roots — OPEN (tree root flare above ground; probably the oak canopy-clamp scale lift raised roots off grade — check OAK_CANOPY_MIN interaction)
- mrfznq53 (30,-93) + mrfzomq3 (20,-118) stuck/pacing — .72 PRE-pacing-fix, RE-VERIFY on .73
- mrfzod76 (26,-90) RAVEN's run looks awful, 'fix for good or regenerate her' — OPEN (Meshy run-clip defect; same escalation ladder as HECTOR: absolute sweep -> clip-swap from known-good -> Meshy regen -> gate out; NEXT ROUND with HECTOR outcome as guide)
- mrfzqfam (-189,-209) 'nice asset, weird placement' — OPEN (fetch shot; placement)
- mrfzqww7 (-233,-144) quest npcs in the middle of nowhere is weird — OPEN (quest giver spots on empty lakeside lawn read as random; consider anchoring givers near landmarks/props or giving them a stand/context prop — design tweak)
- mrfzrxfl (-377,118) 'whole area weird, no roads to the houses, USE STREET VIEW to figure out what to do' — FIXED@v1.66.89 (OSM-ground-truthed halbrook_dr/bassbrook_ln/stilton_st/stanwyck_cir + driveways; see ROAD-NETWORK MAJOR ROUND)
- mrfzstns (-262,103) FEATURE: cars driving into the lake should sink + stall (currently blocked/frozen at water edge?) — OPEN (driving/water interaction; pairs with the swimmable-lake systems)
- mrfztgle (-238,106) bike not touched by its NPC rider/pusher — OPEN (bike accessory grip class — same aimLimbAt/grip family as walker/stroller; also mregenli bike texture note still open)
- mrfzucre (-193,41) 'smoke needs to be way more subtle' — OPEN (ambient smoke source at pos — chimney/bbq/vent? shrink+slow whatever emits here; note .72 predates the impact-size fix but this looks like an ambient emitter, check on .73)
- mrfzulkp (-193,41) kids running into a fence — OPEN (kid wander lacks the adult whisker/bail logic? check kid steering vs fence colliders)
- mrfzv2sb (-150,-34) 'wtf is this in the middle of the road' — OPEN (fetch shot; road obstruction)
- mrfzvti9 (-109,-41) swing set: WHOLE frame swings, only seat+cables should — owner: 'FIX THIS TONIGHT' — HIGH PRIORITY (playground swing anim pivots the full prop group instead of the seat assembly)

## Live session batch 4 (Alex, v1.66.72, east+central sweep) — logged 251
- NPC crowding (RE-VERIFY on .73 first — pacing fix may cover): mrfzw5v9 (-48,-51) fence jam, mrfzwh6i (-38,-57) cluster clipping, mrfzx1ut (-14,-131) npcs stuck IN a house
- mrfzxd7v (-15,-126) invis wall — meta.cols shows nearest collider 11u away (house) — blocker not in top-3, needs walk probe
- BARRIER REFINEMENT: mrg00upt (473,-394) cols=forest:tile — tree-backed tiles still block the full 5x5 cell when the tree is off-center; shrink collider to hug the trunk (2.2-2.6u) instead of the grid cell
- mrg01b6n (473,-141) cols=3 house OBBs — probe the gap between them (OBB corners may pinch the visual alley)
- Decal patches refile (east zone): mrfzxqma (-8,-120) square sidewalk patches, mrfzy2tl (67,-83) random dirt patch, mrg00iyj (549,-517) square shadows — FIXED@v1.66.99 as a class (fence+decal round): GKEY blend-key rework. The old bake gave every surface pixel a 0.10 alpha floor + only a 28px border vignette — the whole authored tile rendered as a faint pale wash, a visible hard square on any ground darker/greener than the tile. Now: surface alpha 0 (no wash at all), 36px border vignette, and ORGANIC stains/scatters (GKEY=2: oil/cracks/patch/slab/gum/mud/puddle/litter/leaves/skid) additionally dissolve radially from 55% of the half-size so a mark that bleeds to the tile edge never leaves a straight cut line; fixtures (GKEY=1: manhole/drain/plate) keep their footprint. asphalt_patch + skid_marks batches also get a darkening DTINT (their tiles are authored on much lighter asphalt than the game's). Dirt-type verge decals (mud/puddle/tuft) are now culled off-grass (footSurface + SURF-rect check — mud on clean paving read as a bug). Evidence: fencedecal_sidewalk_-8_-120_after.png, fencedecal_mudclose_after.png, fencedecal_patchclose_after.png, fencedecal_eastpatch_after.png (placement is RNG per load, so shots demonstrate the class at/near the reported spots)
- mrfzyjtd (144,-76) 'gas station thing looks awful' — second gas station prop quality
- mrfzz4s0 (140,-110) multicolor tree needs texture — FIXED@v1.66.95 (the crepe myrtle: per-BALL random flat pink/white/green lamb colors = the multicolor blob tree. gemini-3.1-flash-image blossom-canopy + leaf-canopy textures baked as gemfoliage.js (MYRTLE_TEX pink/white/leaf, white derived offline by hue-shifting the pink), crepeMyrtle() now picks ONE bloom hue per tree and textures every ball (leaf balls mixed in at ~20% on blooming trees); flat colors remain the no-file fallback. 68 textured myrtles map-wide. Evidence: gemprobe_tree_140_-110_a_before.png (flat blobs) vs gemprops_myrtle0/1_after.png)
- mrfzzx7c (530,-446) no sidewalk on the right — east sidewalk gaps
- mrg01xfw (459,-46) "ADD ROADS TO THIS NEIGHBORHOOD, MAKE IT LOOK NORMAL" — FIXED@v1.66.89 (northumberland_dr/mountbatten_dr/evanshire/tudor/gothic grid + driveways; see ROAD-NETWORK MAJOR ROUND)
- mrfzvti9 swing set — FIXED@branch (frame static, seats swing; shipped with next deploy)

## Blood-splat investigation (mrg0d0rw, v1.66.76) — CLOSED, FIXED@v1.66.99 (fence+decal round)
Pale grey ~2u rectangles on night asphalt after shooting people. Ruled OUT earlier: blooddecals.js
art, decalMats, day-lerp repro. CLOSED with a true-night repro (tools/_bloodnight.js: setClock 270,
200 ticks of env lerp, lampsOn, 3 NPCs killed on ground): fresh blood puddles/drips render DARK
red at night, immediately and settled (bloodnight_before_immediate/settled.png) — blood is fully
exonerated. The lead theory CONFIRMED with the culprit narrowed to the GKEY blend bake, not night
lighting: every blend-keyed tile's "surface" pixels kept a 0.10 alpha floor, so the whole authored
tile rendered as a faint wash — by day it hid in the ambient, at night the tile (authored on much
LIGHTER asphalt than the game's near-black night roads) read as a pale ~2u square. asphalt_patch
was the worst (its mark IS a full pale square: bloodnight_before_asphalt_patch.png — an exact
match for the report), oil_stain a fainter blotch; they pepper every road, so one always sat near
a shooting. Fix (same GKEY rework as the decal cluster): alpha floor 0, wider vignette, radial
dissolve for organic marks, dark DTINT for asphalt_patch/skid_marks. Night after:
bloodnight_after2_asphalt_patch.png (subtle DARK patch, no glow) + bloodnight_after2_settled.png
(blood still dark/correct). No live-light tinting needed — the wash is simply gone. (Round-prefixed
copies of the key shots exist as fencedecal_bloodnight_*.png; all pairs md5-distinct.)
(fp-arms deformation note from the original shot remains tracked under FP-ARMS REGRESSION below.)

## FENCE + DECAL CLEANUP ROUND — SHIPPED@v1.66.99 (mrg49ri9 / mrg4k6e2 / mrg51b3u / decal refile / mrg0d0rw)
Mechanism work behind the per-report entries above:
- densityprops fenceRun strips: posts every ~2.5u + chainlink top rail (were bare floating
  texture cards); strips self-clip around road asphalt, FENCE_RUNS lines and already-built
  strips (X-crossings become T-joins; sub-strips <1.2u dropped). FENCE_RUNS table moved above
  the densityLayer IIFE so the clipper can see it (var values don't hoist).
- FENCE_RUNS builder: road rejection now PER PANEL (was per edge-midpoint — a long edge either
  vanished whole or crossed asphalt its midpoint never sampled); boundary posts of skipped
  panels remain as gateposts. Post batches keyed by colour (a shared batch key made every
  chainlink post inherit the first run's dark Farnell tint).
- Storage lot single-fenced (breakable diagonal ring replaces axis run + density rect);
  Farnell E edge T-joins the breakable front run; Publix mid-lot retaining-wall row removed.
- GKEY blend decal rework (also closes the blood-splat night investigation): zero surface
  alpha, 36px vignette, radial dissolve for organic marks (GKEY=2) vs fixtures (GKEY=1),
  DTINT darkening for asphalt_patch/skid_marks, skid_marks moved from lum-KEY to blend
  (its lum-keying erased the marks and kept the background). Dirt-type verge decals culled
  off-grass (footSurface + SURF-rect).
- NEW GATE: tools/_fenceaudit.js — map-wide fence collider sweep (X-crossings / on-road /
  degenerate / missing-post). Result: 321->324 segs, 0 crossings (was 3), 0 on-road (was 1),
  0 degenerate, 305/305 panels posted; only intentionally post-free strips are the two
  townhouse hedge rows + one hedge sub-strip. _barrierscan 0 orphans, _signaudit 0 offenders,
  node --check clean. Evidence set: fencedecal_*.png (before/after, md5-distinct).

## FP-ARMS REGRESSION (round owner: main agent's v1.66.74-87 fp-arms feature)
- mrg3wvhm (-129,-51, v1.66.87) SMG hand models 'beyond fucked' — CONFIRMS the deformation flagged in the blood investigation note (giant distorted arm polygon in mrg0d0rw's shot). fp-arms is the OTHER agent's active feature — please fix on your next round; if unclaimed by the next fable cycle, fable will take it.
- mrg3yaf0 (-58,48, .87) one ped rammed = 4 kill credits — FIXED@v1.66.88 (MP client: world snapshots reverted the local ragdoll flag before the host processed ragNpc, re-firing the hit test; ragNpc has no host kill-reply so the local credit fired each time. Now message+credit are gated by a 1.5s per-NPC cooldown — exactly one credit per ped)

## ROAD-NETWORK MAJOR ROUND (mrg01xfw / mrfzrxfl owner directives) — SHIPPED@v1.66.89
Ground truth: real residential grid pulled from OpenStreetMap (Overpass) around the true
junction (Race Track Rd @ Countryway Blvd, 28.07031,-82.63131), projected into the game frame
and matched pocket-by-pocket (evidence: scratchpad osm_overlay.png). Root cause of the whole
no-road-homes class: the survey houses were planted against the LEGACY axis-world EXP_ROADS
locals, which WC_REMAP deleted without replacement outside the core — the new streets ride
those alignments where they exist, with real Westchase street names from the OSM pull.
- NEW REMAP_ROADS (remapdata.js): EAST/Fawn-Ridge quarter: mountbatten_dr (cls1, rides the
  legacy arterial alignment the diagonal house bands front), northumberland_dr (cls1 through
  route mountbatten->citrus_park), evanshire_ct + tudor_chase_dr + gothic_ln (cls2 grid),
  minaret_dr (cls1 race_track->res_se_pocket; res_se_pocket upgraded cls2->1 so the loop
  carries AI traffic). WEST: halbrook_dr (cls1 race_track->stilton), bassbrook_ln (cls3 cul),
  stilton_st (cls2 far-west lane joining stowbridge_ave), stanwyck_cir (cls2 N-S at x~-380).
  NORTH/Nine-Eagles: chase_grove_dr_w + pond_cypress_way (cls3), res_s_pocket extended west
  to (-218,-328). All junction endpoints stitch (<=3.5u) -> pads + lane-graph splits.
- DRIVEWAY PASS (game.js buildDriveways, after buildSurveyHouses): every house front facing a
  cls1-3 road within 40u gets a merged-mesh asphalt stub wall->curb (garage-side offset, house/
  forest/lake/venue crossing tests, lot-served houses skip, mapDrives registered, no RNG =
  MP-deterministic). Covers mrfzfyyf (0,165) and the whole street-adjacent class map-wide.
- Verified: offline OBB validator = 0 houses dropped by houseOnRoad, 0 deep sidewalk jams (9
  small nudges, all <=5u); _barrierscan 0 orphans; _signaudit 0 offenders; _mergeboot clean;
  AI traffic re-verified on v1.66.89 on all 5 new lane roads over 120 sim-s (car-samples:
  halbrook 5932, mountbatten 4001, northumberland 3196, res_se 1748, minaret 455) with ZERO
  snap-180 flips; player drive test 279u straight down northumberland (457,-45 -> 457,234,
  through the citrus_park junction), no stalls/walls. Evidence: scratchpad
  roadnet_*_{before,after}.png (all md5-distinct runs) + roadnet_street_*.png ground views.
- Report status: mrg01xfw (459,-46) FIXED@v1.66.89 (northumberland/evanshire/tudor grid +
  driveways at the exact spot); mrfthmf4 (575,-160) FIXED@v1.66.89 (mountbatten frontage +
  driveways; the 2 deepest 46.7-band rows are packed 13-17u apart = physically unroadable,
  they read as deep-lot homes behind the front rows — left as-is); mrfzrxfl (-377,118)
  FIXED@v1.66.89 (halbrook_dr passes within ~2u of the report point, bassbrook/stilton/
  stanwyck around it); mrfzfyyf (0,165) FIXED@v1.66.89 (driveway pass); mredxzx6/mrfhmf4
  residuals (240,-135 / 304,-136 big canopies) now sit in a real block ringed by res_se +
  minaret + race_track with driveway/apron access; mreenqoe S pocket largely FIXED (res_s ext
  + chase_grove/pond_cypress serve the front rows).
- Honest OPENs left for a later pass: far-SE quadrant (z>200, x>150 — legacy #27-41 street
  shapes never re-added; Twin-Branch dirt-road styling belongs there, REMAP_ROADS supports a
  dirt:true flag already); mrfzzx7c (530,-446) race-track sidewalk gap NOT covered; deep rows
  z<-352 in the S pocket (driveways would cross the front row); far-west estates around
  (-445,-145)/(-442,-54) (blocked by their own outbuildings, no corridor); Carlby mansion
  string internal lane impossible (validated: any polyline drops 2+ houses) — driveways to
  halbrook serve the z<=176 string, the z 200-270 estate cluster stays gated-estate style;
  nine_eagles deep-set homes >40u (51,-414 etc) keep no driveway.

## Live session batch 5 (Alex on v1.66.87) — logged through 280
- mrg45yad (-36,46) car acceleration too fast + should vary by type (vans/trucks slower) — OPEN (driving feel tune, per-CARCOLS/type accel)
- mrg46sb9 (295,-277) manager floating — OPEN (staff/vendor idle grounding — the adult gy bake covered Meshy civs; check staff builds)
- mrg488m4 (-45,8) WEIRD CLIPPING ROAD TEXTURE — OPEN (z-fight or overlapping road strips near junction)
- mrg48urv (-46,17) KEISHA arms look awful, owner: REGENERATE WITH MESHY — OPEN (asset-pipeline; Meshy authorized by owner; check balance/budget first, HECTOR-style clip fix does NOT apply to mesh/texture quality)
- mrg49ri9 (18,85) weird fence without poles — FIXED@v1.66.99 (fence+decal round). TWO defects at the spot: (1) the densityprops fenceRun path rendered bare texture-card strips with NO posts anywhere on the map — chainlink_fence/privacy_fence strips now bake a post every ~2.5u (+ top rail for chainlink), hedge/brick stay post-free; (2) the storage lot was DOUBLE-fenced: the axis-aligned FENCE_RUNS N+E run crossed the venue's rot-135 density fenceRect in an X at ~(23.6,84). Single fence now: one breakable FENCE_RUNS chainlink ring tracing the rect's exact corners, density rect dropped. Evidence: fencedecal_18_85_before.png (bare diagonal card + crossing run) vs fencedecal_18_85_after.png / _air_after.png (one ring, posts + rail)
- mrg4b26g (-151,46) shot NPCs can be knocked INTO buildings (ragdoll clips through walls) — OPEN (ragdoll velocity ignores colliders; clamp ragdoll XZ vs colliders like player pushOut)
- mrg4bexs (-149,63) no bullet holes when shooting the GROUND — FIXED@v1.66.90 (ground plane isn't in solidMeshes so ground shots produced no hit at all; hitscan now intersects the ray with the ground analytically on miss — flat hole + dust at the impact, interior floor handled)
- mrg4brvw (-129,79) quest overlay covers the stars + new compass — FIXED@v1.66.93, see HUD RECONCILIATION ROUND below

## HUD RECONCILIATION ROUND — IN-AGENT (hud-fix, fable). Colliding HUD features (fable: chevrons/quest tracker/stars; main agent: compass/killfeed/settings toggles v1.66.77-87)
- mrg4dns9 (-63,4) shot direction chevrons 180 DEG OFF — FIXED@v1.66.93. Root cause: ORIGINAL math bug in the chevron draw, not the level-look/compass work (both verified untouched vs the v1.66.76 snapshot). dmgDirs stores the +z-forward world angle atan2(dx,dz) while the camera looks down -z at yaw 0, so `rel = a - yaw` had ahead/behind MIRRORED while left/right happened to be correct (reads as "180 off" when a cop ahead shoots you). Now `rel = PI - (a - yaw)`. Verified empirically on all 4 cardinals with pinned yaw + known source offsets (scratchpad hudfix_chev2_*/chev3_* shots: ahead→top, behind→bottom, right→right, left→left).
- mrg4gnea (-177,39) overhead NPC health bars BROKEN on .88 — FIXED@v1.66.93 (the real defect found; see caveat). Investigated the suspects first: the settings toggles do NOT gate tags (only hitmarker/killfeed read settings.markers), the tag/updateNpcTags code is byte-identical to pre-HUD-work v1.66.76, and tag SPRITES render fine when reproduced headlessly in both singleplayer AND as a pure multiplayer client (tags + bars visible, labels/hp correct). The genuine break in ONLINE play (owner is always a pure client of the world bot): client damage is routed to the host (`dmgNpc`/`dmgCop`) and NPC/cop hp is never on the wire, so every overhead bar sat at FULL no matter how much you shot — with the new v1.66.83+ hitmarkers confirming hits, the frozen bars read as "bars broken". Fix: clients now PREDICT hp locally on their own hits (npc n.hp + copsM mirror .hpM, melee + hitscan paths), the tag reads the predicted value, and predictions reset on host-confirmed respawn/slot-reuse (nid change / down→alive transition). Verified in a live 2-page relay MP run: client pistol shot drops the tag 100→60 and world snapshots don't revert it. Caveat: bars still can't show damage dealt by OTHER players/the host (hp genuinely isn't in the snapshot — would need a wire format change; flagged for the main agent if the owner still sees full bars on peds other people shot).
- mrg4brvw (-129,79) quest overlay covers stars + compass — FIXED@v1.66.93. Root cause: three top-anchored HUD features collided — quest tracker plate at y M+10 spans up to ~350px wide on long objective lines, crossing the compass ribbon (x from W/2-210) and the star row (y 44..62). New top-bar layout: compass strip topmost (unchanged), wanted stars below it (unchanged), quest tracker now hangs on the left edge BELOW both (qy = starY+34, so it also tucks up when the compass is toggled off); the FPS readout (same left edge) shifts below the tracker when a quest is active. Verified with active quest + 3 stars + compass all visible at once (scratchpad hudfix_layout_hotbar_tags.png).
- mrg4egvx (-58,3) ESC should close the menu (currently only exposes mouse) — FIXED@v1.66.93. The pause overlay already opened on pointer-lock loss (the browser eats the FIRST Esc in lock, that part can't change), but every Esc AFTER that did nothing — and the overlay's click-to-resume hid itself eagerly then requested the lock, so a refused re-lock (Chrome's ~1.25s post-Esc cooldown) left a dead state: no menu, free mouse. Now: Esc with the pause overlay up = resume (re-lock; overlay hides only when the lock actually lands via pointerlockchange — same for click-to-resume), Esc with mouse free + nothing open = opens the pause overlay, and lockPointer swallows the cooldown rejection. Verified headlessly: Esc opens PAUSED, second Esc re-locks (pointerLockElement set) and the overlay closes.
- mrg4td44 (-119,12) hotbar text hard to read when item selected — FIXED@v1.66.93. Root cause: the selected quick-bar slot painted near-black text (#20160a) over the solid bright-amber plate (rgba(255,180,40,.92)) — the PIX glyph's black outline pass merged with the dark fill into an unreadable blob. Selected slot now uses a dark-amber plate + bright #ffd200 border with GOLD text (#ffd200 label / #ffe9a0 number), bright-on-dark like every other PIX readout. Verified in hudfix_layout_hotbar_tags.png (SMG slot selected among FST/PST/SMG/AK).
Other new (logged, next rounds):
- mrg4gw3o (-187,31) STILL way too much smoke — 2nd report of the lakeside ambient emitter (mrfzucre); find and shrink THAT emitter specifically
- mrg4hbzx (-141,-9) kid glitched in the wall — kid steering/pushOut vs OBB
- mrg4iels (-153,22) quest NPCs should FACE the player when near (design ask, small)
- mrg4k6e2 (-53,-55) weird looking fence segment — FIXED@v1.66.99 (fence+decal round). The Farnell density E edge used full half-depth d/2+7 while the breakable front run sits at d/2+4 — the E edge speared THROUGH the front fence and ended as a free 3u stub at (-58,-57). E edge now T-joins the front run exactly at z=-60; also the pale square visible in the report shot was a lum-keyed skid_marks decal (see mrg51b3u). Evidence: fencedecal_-53_-55_before/after.png; tools/_fenceaudit.js reports 0 fence X-crossings map-wide (was 3) and 0 fence-over-road samples (was 1 — this same Farnell E edge crossed an access road at (-58,-73); density strips now clip themselves around asphalt + other fence lines)
- mrg4rouw (-106,-20) transparent hair refile (2nd report of mree59kf class) — queue for the CHARACTER-REGEN round: KEISHA arms (mrg48urv, Meshy authorized) + transparent-hair head (identify char from live_hair.jpg in scratchpad) + RAVEN run clips (mrfzod76; try the HECTOR world-delta bake first — bake script is character-generic per that round's notes)
- mrg4sbrk (-112,-54) DON floating, legs angled back — character-regen round queue (DON = another Meshy clip/retarget defect; try the HECTOR world-delta bake — same class)

## Live session batch 6 (Alex on v1.66.89) — logged through 302
- mrg4vcjd (-5,-5) + mrg53rgl (-76,53) stroller NO HANDS while RUNNING — FIXED@v1.66.94 (see ANIM ROUND 7 below)
- mrg52tm7 (-92,31) STILL no hands on bike (refile mrftgle) — FIXED@v1.66.94 (see ANIM ROUND 7)
- mrg53h5l (-85,39) umbrella hold off + FEATURE: many colored umbrellas when raining — FIXED@v1.66.94 (both parts; see ANIM ROUND 7)
- mrg50mwe (-63,4) photomode shift-move should be faster — QUICK (other agent owns photomode?)
- mrg51b3u (-63,4) weird fence placement + skid-mark decal needs transparency — FIXED@v1.66.99 (fence+decal round), both parts. (a) The "fence" was the envprops retaining-wall "accent" run: it spanned lots[0] x +/- w/2 with NO depth offset — a dashed row of solid wall blocks straight through the MIDDLE of the Publix lot's drive aisle (each with a collider). Removed outright (pond-fence-arc/screen-wall precedent); the two park lamps stay. (b) skid_marks was in the lum<46 KEY list, but the tire streaks are the tile's DARKEST pixels — the keying erased the MARKS and kept the pale background: an opaque tan rectangle with streak-shaped holes. Moved to the GKEY blend path (+ 0x9a9a9a tint): only the streaks render now. Evidence: fencedecal_-63_4_before/after.png (+_air), fencedecal_skid_before/after.png
- mrg52jt3 (-88,16) FEATURE: punch blood should be a cool sprite + balloons need string physics — fun-polish queue (owner directive: keep adding fun details)
- mrg54993 (-46,86) huge AC unit looks awful (3rd AC complaint) — FIXED@v1.66.95 (two problems: the ac_condenser tex was a BEIGE residential mini-split that read as a cardboard crate, and the venue-side upsize was 2.4x = a 1.8m cube towering next to the small Dunkin. Retextured the whole prop family via gemini-3.1-flash-image — weathered galvanized commercial condenser face, twin fan guards + louver slats — baked into densityprops.js, and downsized the venue placement to 1.75x (~1.3m). Also covers the AC half of mrfzdzwh (4,91) and closes the mreds4nw class refile. Evidence: gemprobe_ac_-46_86_b_before.png vs gemprops_ac_after2.png / gemprops_ac_dunkin_after.png)

## ANIM ROUND 7 (accessory grips + rain umbrellas) — SHIPPED@v1.66.94
- mrg4vcjd + mrg53rgl (stroller pushed with NO HANDS while RUNNING; refiles of the "fixed" mrfzbvxk) — FIXED@v1.66.94. TWO stacked roots, and the second is the big one:
  (1) gripPoseOK only allowed states walk/stand — a FLEEING NPC (flee = the run gait, 4.6-7.4 u/s) dropped every grip while the pushed stroller stayed glued to the owner group, so runners sprinted hands-free behind it. Grip states now walk/stand/flee/chat (down/ragdoll/hidden/fight still play the raw clip).
  (2) ORDERING ON CLIENTS — why the owner "kept catching it" at any speed: he always plays ONLINE as a pure client of the world bot, and updateAccessories ran inside updateNPCs, which the main loop calls BEFORE updateNet → applyWorldSnap. applyWorldSnap re-poses every NPC mirror from the raw clip (animPerson) each frame, so the grip pose was OVERWRITTEN before render on every online frame — clients never saw ANY grip (walker/stroller/suitcase/boombox arms) since the feature shipped; all prior verification was singleplayer. Fix: the client accessory pass now runs at the END of applyWorldSnap (host/SP path unchanged inside updateNPCs). Verified in a live 2-page relay MP run: client-side mirrored stroller owner keeps both hands on the bar after full tick+render (anim6_mp_client_stroller.png).
  anim-LOD: on skipped frames (>120u, 2 of 3 frames) reposed stays false and the bones simply KEEP the last grip pose — verified hands still on the bar with the player parked 150u away mid-run. Evidence (md5-distinct runs): anim6_stroller_walk_close.png, anim6_stroller_run_close(.png/2.png), anim6_stroller_run_far25c.png (camera exactly 25.0u, fov-zoomed), MEAS logs: walk hands (±0.17,0.96,0.24) = on the bar; run hands aim down-forward onto it (bent run-clip elbows park the fists ~0.2u short of the bar along the aim ray — rigid-limb aiming can't extend an elbow; reads correctly in the shots).
- mrg52tm7 + refile mrftgle (bike walked with NO HANDS, ever) — FIXED@v1.66.94. The bicycle is 'side' mode (parked at the owner's +x/left flank, ry +PI/2) and simply had NO pose function. New poseBikeGrip (poseWalkerGrip class, world-space aimLimbAt): handlebar probed from the mesh — grips at authored (-0.2, ~1.0, z ±0.34) → owner-local bar ends (0.16, 1.0, 0.25) and (0.84, 1.0, 0.25); left hand takes the far end (reach over the frame), right hand the near end, plus a 0.12 forward lean into the push. Placement untouched (bike stays at the side). HONEST NOTE: the bike accessory is only ever WALKED — no NPC rides it anywhere, so no seated pose exists or was needed. Evidence: anim6_bike_grip_close.png, anim6_bike_rear34.png, anim6_bike_front/side.png; MEAS handR (0.14,1.02,0.24) ≈ near grip.
- mrg53h5l (umbrella hold looks off; also covers the old mree9kv6 grip report) — FIXED@v1.66.94, both parts.
  (a) GRIP: ACC_HAND umbrella was grip [0,0,0] = pole BASE in the fist at hip height, canopy at face level. Now grip [0,-0.30,0] (hand wraps the SHAFT below the canopy — canopy underside is authored y 0.62) + new poseUmbrellaArm raises the right arm ~45° up-forward (aimLimbAt), shaft near-vertical with a slight forward tilt (-0.15). Measured: hand y 1.74, canopy underside 2.0, top 2.33 — above the head. Evidence: anim6_umbrella_pose.png.
  (b) FEATURE — colored umbrellas in the rain (owner ask): new updateRainUmbrellas (4Hz tick inside updateAccessories). When `raining` flips on, ~50% of adult pedestrians (hash of the npc slot index — deterministic, so peers derive the same crowd from the env-synced rain flag; accessories stay per-peer local as always) raise umbrellas STAGGERED over ~20s; when rain stops they put them away staggered over ~15s. Canopy colors: the authored canopy is solid red, so a material color multiply can only darken — instead the base texture is hue-rotated on a canvas (8 hues, cached once each: rainUmbTex). NPCs with an existing accessory keep it (no double-carry); kids are excluded by construction (they never roll accessories). Umbrella carriers use the fixed raised grip from (a). Measured: 186/448 NPCs up after a 26s rain rollout (~42%, inside the asked 40-60%), 0 remaining 20s after rain end. Evidence: anim6_rain_umbrellas.png (multiple canopy colors visibly up in the rain), anim6_rain_after_gone.png.
- Gates: node --check OK, _barrierscan 0 orphans, _signaudit 0 offenders.

## CONTENT PIPELINE NOTE (2026-07-11): GEMINI key added by owner (scratchpad pipeline.env, NEVER commit).
Verified working: imagen-4.0 (std/ultra/fast), gemini-3-pro-image, gemini-3.1-flash-image + full text models.
Use for image gen rounds alongside/instead of gpt-image-1 — first candidates: RaceTrac 7-seg price sign
(mrfzmw9u, owner asked to 'leverage chat gpt' = AI-gen authorized), prop texture reworks (AC units, multicolor
tree mrfzz4s0), character seed art. Same rule as always: bake data-URL JS files offline, never call APIs from game code.

## Live batch 7 (Alex on v1.66.96)
- mrgb92wa (-15,4) health HUD too big + quest plate covers screen — FIXED@v1.66.97 (HP numerals scale 6->4, heart 3->2, quest plate 46->38px w/ 30-char objective truncation + 200px width cap)
- mrgb9qqd (23,-8) 'at night I can see all the colliders' — FIXED@v1.66.97 (he fat-fingered F9 next to F8; the toggle now announces COLLIDER DEBUG ON/OFF via popup2 so it self-explains)
- mrgbe7vt (73,-35) business sign hard to see / not like the logo — OPEN (which venue at 73,-35? RaceTrac store fascia? next content round; Gemini authorized)

## SOUND OVERHAUL ROUND — IN-AGENT (sfx-gemini, fable). OWNER DIRECTIVE: replace all synthesized SFX
(guns, cars, crashes, explosions, UI etc.) with Lyria-3-generated audio; TTS voices STAY untouched.
Method validated: lyria-3-clip-preview returns ~27s audio/mpeg clips; discrete transients slice cleanly.

## SELF-QA sweep 2 / polish marathon (fable, live2-ai branch — user mandate: 6h autonomous polish)
Plan: scratchpad POLISH_PLAN.md; hourly self-cycle armed. Progress so far (v1.66.66-67):
- S1 GAMEPLAY SMOKE — PASS (all core loops driven headlessly: shoot/wanted/cops/kill/death+
  respawn/carjack+drive/car-dmg/interior/swim/items; zero pageerrors). Finding: CLAUDE.md
  world-layout coords are pre-remap (lake is at (-280,55) NOT (-255,-150); spawn (-63,4);
  dealer (-60,0)) — stale-coords warning added to CLAUDE.md.
- S2 FLOATING/SUNKEN PROPS — CLEAN (all flagged floaters intentional: quest beacons,
  billboard boards on baked poles, venue marquees; 0 sunken).
- S3 NPC 6-SIM-MIN SOAK — PASS (0 tight pacers; hidden/chat/flee spans within design
  bounds; no stranded group followers; no kid stalls).
- S4 TRAFFIC SOAK — FIXED@v1.66.66: stowbridge_ave authored polyline packed a 90-deg elbow
  into an overshooting 6-vertex hairpin (only elbow >45deg/8u map-wide) — cars visibly
  overshot + reversed every lap (6 flips/3min at (-171,-41), now 0). Replaced with an r=10
  quarter-arc in remapdata.js (citrus-kink precedent). Residual: known junction traffic-shove
  blips at origin pad + countryway/citrus Y (~1.3/min, cosmetic, prior-agent-documented).
- S5 DAY POI SWEEP (20 venue-front shots) — FIXED@v1.66.66: split-animated env props
  (tube-man flail bands, windmill/pizza spin, flag wave, umbrella/swing sway) showed BLACK
  backface gashes when their cut seams opened mid-anim; split props now clone DoubleSide.
- S6 NIGHT+RAIN SWEEP — SHIPPED@v1.66.67: RaceTrac canopy night lighting (nightLitMats
  hook ramped by setLamps: light panels burn, soffit glows, forecourt pad warm wash) — the
  forecourt was pitch dark while the fascia neon glowed. Lamps/halos/pools/signals/headlights/
  townhouse windows/strip soffits/rain streaks all verified working.
- S8 COP/WANTED MATRIX — PASS (counts 4/6/8/10/12 at 1-5 stars; decay-from-1 exactly 18s;
  3-star open-ground lethality 269 dmg/60s; regen 5/s only after 5s clean — cannot facetank).
- Horn silence >62u from player confirmed BY DESIGN (audio-node saving), not a bug.
Remaining queue: S7 z-fight scan, S9 quest smoke, S10 MP smoke, S11 perf pass, S12 audio
smoke, then Phase 2 fun-details (fireflies/porch lights, lake interactions, stash hunt,
hoop mini-game, street flavor). __wc additions this round: laneGraph().

## Marathon cycle 2 (fable, live2-ai branch): merged main + live batch 6 pickups (v1.66.93-95)
- MERGED origin/main (v1.66.92) into the marathon branch. Notable reconciliations:
  (a) house colliders — main's radians fix + source tags KEPT, but main had missed the
  near-axis w/d swap: rot~90 houses still had both long faces walk-through. Re-applied my
  hx/hz fix on top. (b) pacing — adopted main's npcBailTarget machinery (superset of my
  npcGiveUp), kept my npcTarget/ring-slot validation + doorClearancePass, AND widened the
  wall-slide gate dtg>2.5 -> >1.0 (my tested dead-zone: a blocked target holds an NPC in a
  free orbit at 1.05-2.5u where neither watchdog fired — it showed up as the ONE remaining
  tight pacer on the merged build). Merged-build scan: 445 NPCs / 60 sim-sec / 0 pacers.
  (c) remapdata — main's roadnet + my stowbridge elbow re-smoothed on top.
- mrg54993 (3rd "huge AC awful") — FIXED@v1.66.94 (ground ac_condenser rebuilt from the
  praised rooftop-RTU materials: ribbed cabinet + galvanized deck + 2 top fan grilles +
  plinth + pipe, baked shared batches. The rough tan PROPANE_TANK next to it is a separate
  asset — flagging for the prop-quality round.)
- mrg52jt3 (punch blood cool sprite) — FIXED@v1.66.95 (VFX_BLOOD 16-frame animated splat,
  generated offline via gemini-3.1-flash-image; plays on ALL person hits incl. melee through
  puff kind:'blood' + 2 ballistic droplets. NOTE: user-provided GEMINI key lives in the
  session scratchpad SECRETS.md — never commit, never call from the game. Anim agent: your
  Gemini animation-troubleshooting pipeline can share it from there.)
- NOT taken (other lanes): stroller-run/bike/umbrella grips + rain-umbrella rollout (anim),
  photomode shift speed (photomode owner), balloon string physics (anim-adjacent), fence
  placement mrg51b3u (fence cluster). Skid-mark decal transparency sub-item: still open,
  queued next cycle in my lane (decal key class).

## Marathon cycle 3 (fable, live2-ai): S10 NETCODE SMOKE — real engine bug found + fixed (v1.66.96)
Rig: local relay (server.js, no bot) + host page + client page, RAF stubbed, sims hand-ticked.
- ENGINE BUG FIXED: parked-car layout was NONDETERMINISTIC across peers (host 73/25 vs client
  74/26 observed live) — snapshots map cars[] by index, so shootCar/jackCD/park/carBoom hit the
  WRONG car cross-peer. Root: parkedSlotFree consulted breakables + all colliders; instrumented
  slot-decision diffs (__parkedQA breadcrumbs, kept as a zero-cost QA hook) caught 'prop:tree',
  'env:bollard' and 'forest:tile' colliders each rejecting a slot on one page only. Fixes:
  static-tag allowlist for slot rejection, slots must sit ON a paved lot (onRemapLotStatic:
  editor rects + house aprons — also ends lawn-parking under yard trees), oak()/palm() reject
  lot interiors. 10/10 loads byte-identical; live MP host==client 76/28.
- VERIFIED HEALTHY: NPC mirror 445/445 (0.45u), hidden wire (st 4) + client snap + invisibility,
  env clock sync exact, PvP kill chain end-to-end (client hitscan -> netSendHit -> host
  hurtPlayer -> death at 4 pistol hits). Skinned-character raycast WORKS in r149 (bind-pose geo).
  Earlier PvP "misses" were the stale-matrix headless gotcha (render stubbed) — rigs must
  scene.updateMatrixWorld(true) before aiming; mpsmoke.js hardened accordingly.
- NOTE for barrier-scrub: one forest:tile blanket collider still intrudes the lot at (20,-85)
  (invisible, a parked car sits "in" it) — your orphan class, no action on my side.

## Marathon cycle 4 (opus): merge main v1.66.100 + NETCODE FUZZ HARDENING (v1.66.101-102)
- MERGED origin/main (v1.66.100: Gemini content — RaceTrac price pylon, textured foliage, AC
  condensers; fp-arms AK grip/recoil; HUD compaction; fence audit; sound overhaul 61MB voice
  banks). AC condenser conflict: kept MY dGroundAC industrial geometry + adopted THEIR RaceTrac
  forecourt exclusion (mrfzl9on). Both updateFireflies + updateRtPylon wired. v1.66.101.
  Regressions held on merged build: parked layout 10/10 deterministic, 0 tight pacers @445 NPCs.
- NETCODE FUZZ (new tool netfuzz.js): fired 32 malformed messages (OOB/neg/string/NaN indices,
  neg damage, 1e9 coords, __proto__ keys, missing fields, null) into a live host handler.
  31/32 already handled cleanly — the client->host action layer is well-hardened (clamps +
  ownership checks; verified no world corruption / NaN / boss-heal). FOUND + FIXED@v1.66.102:
  the 's' player-state handler threw on {t:'s', id:null} — ensureRemote did hashStr(id)/
  id.slice() and null.length aborted the onmessage callback (a peer can inject bad id via the
  relay's opaque passthrough). ensureRemote now rejects non-string/empty ids; 's' bails early.
  Re-fuzz: 32/32, 0 throws, world intact. Normal MP path unregressed (remote avatar still built,
  445/445 NPC mirror, PvP kill chain verified separately).

## ENGINE ROBUSTNESS (opus, cycle 4 cont.): chaos-monkey soak — PASS
New tool chaos.js: seeded PRNG fires ~4 random actions/sec (teleport to map
edges / lake / gas interior / corners, combat with every weapon, carjack,
drive, exit, goBerserk, boomAt, ragdoll, wanted 0-5 swings) for 150-180
sim-sec. 3 seeds (1234567 / 42 / 999983): 0 NaN in any player/npc/car/cop
position, sim stays running, 0 real pageerrors (only a harmless file://
relay-fetch ERR_CONNECTION_RESET). The SP engine holds up under adversarial
input. Reusable — re-run with SECS=/SEED= env after risky engine changes.
