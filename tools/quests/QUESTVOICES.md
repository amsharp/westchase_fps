# QUESTVOICES.md — quest dialogue pack map (for wave #77)

Pack: `questvoices1.js` (repo root) -> `window.QUEST_VOICES`. Lookup at runtime:
`QUEST_VOICES[npcKey][category][index]` = a data-URL WAV (8kHz PSX-crunched).
Play through the game AudioContext like `playVoice()` (see tools/ttsgen). Load
chunk 1 via <script> in index.html; `window.QUEST_VOICE_CHUNKS` = chunk count
(1 here). Guard `typeof QUEST_VOICES`. Voice registry: `tools/quests/quest_voices.json`.

279 lines across 35 speaker keys. `(tone)` prefixes are acting notes — psxify
strips them before synth; they document intended delivery. Regenerate with
`FISH_API_KEY=... node tools/quests/questvoicegen.js` (resumable).

## `q1_VIVIAN` — Vivian Crestwood (NEW)  
*q1 A Night to Dismember · voice: VIVIAN new ref*

| id | text | trigger / beat |
|---|---|---|
| `q1_VIVIAN.intro[0]` | (scared) Oh thank god, a new face. We were playing a little murder-mystery game, and now it isn't a game anymore. | intro |
| `q1_VIVIAN.intro[1]` | Nobody leaves. Nobody. The door won't open and the lights keep dying. | intro |
| `q1_VIVIAN.intro[2]` | Will you help me, before we are all... before it's too late? | intro |
| `q1_VIVIAN.intro[3]` | Seven guests, one hostess, and someone in this room is not who they say. | intro |
| `q1_VIVIAN.panic[0]` | (scared) The lights! Not again. Stay where you are, don't move! | panic |
| `q1_VIVIAN.panic[1]` | (scared) Gloria? Gloria, answer me. Oh no. Not Gloria. | panic |
| `q1_VIVIAN.panic[2]` | She was only asking questions. Questions about the board. | panic |
| `q1_VIVIAN.panic[3]` | Search her, quickly, before the next blackout takes another of us. | panic |
| `q1_VIVIAN.panic[4]` | (whispering) I heard a key turn. But the door is locked. How is the door locked? | panic |
| `q1_VIVIAN.reveal[0]` | Point to them. Name the one who did this, and be certain. | reveal |
| `q1_VIVIAN.reveal[1]` | (angry) You. It was you all along, hiding behind a serving tray. | reveal |
| `q1_VIVIAN.reveal[2]` | He kept muttering about a board, and a lease. What lease? | reveal |
| `q1_VIVIAN.reveal[3]` | (sighing) Poor Gloria. She asked the wrong people the wrong thing. | reveal |
| `q1_VIVIAN.reveal[4]` | Take this loupe, dear. You see things the rest of us are too frightened to. | reveal |

## `q1_CHET` — Chet the caterer (RESKIN)  
*q1 · voice: ped_m*

| id | text | trigger / beat |
|---|---|---|
| `q1_CHET.oily[0]` | More wine, friend? The evening is only getting started. | oily |
| `q1_CHET.oily[1]` | Terrible business, the lights. I'll see to the fusebox. Do stay seated. | oily |
| `q1_CHET.oily[2]` | I cater. I clean. I make unpleasant things tidy. | oily |
| `q1_CHET.oily[3]` | Miss Gloria hardly touched her soup. A shame. | oily |
| `q1_CHET.oily[4]` | (whispering) Careful whose questions you answer tonight. | oily |
| `q1_CHET.cold[0]` | (angry) You should have enjoyed the party and gone home. | cold |
| `q1_CHET.cold[1]` | The board does not tolerate loose ends. Neither do I. | cold |
| `q1_CHET.cold[2]` | (angry) You want a confession? Come closer and get it. | cold |
| `q1_CHET.cold[3]` | This was never a whodunit. It was a cleanup. | cold |

## `q1_GLORIA` — Gloria — victim (EXISTING)  
*q1 · voice: GLORIA*

| id | text | trigger / beat |
|---|---|---|
| `q1_GLORIA.banter[0]` | I heard the chairman himself is here tonight. Can you imagine? | banter |
| `q1_GLORIA.banter[1]` | I only asked who really runs this town. Is that so wrong? | banter |
| `q1_GLORIA.banter[2]` | This soup tastes bitter. Almonds? | banter |
| `q1_GLORIA.banter[3]` | (scared) The lights. Someone's behind— | banter |
| `q1_GLORIA.banter[4]` | (whispering) Ask about... the board. | banter |

## `q1_GUESTS` — party guests (EXISTING, round-robin)  
*q1 · voice: BRAD/KEISHA/SUMMER/SKYLER*

| id | text | trigger / beat |
|---|---|---|
| `q1_GUESTS.bicker[0]` | I told you we shouldn't have come to this dreadful party. | bicker |
| `q1_GUESTS.bicker[1]` | It was the caterer! No, it was the widow! | bicker |
| `q1_GUESTS.bicker[2]` | Nobody accuse me. I was in the powder room the whole time. | bicker |
| `q1_GUESTS.bicker[3]` | Where did that man in the gold blazer go? He just vanished. | bicker |
| `q1_GUESTS.bicker[4]` | (scared) Another blackout? I can't take another blackout. | bicker |
| `q1_GUESTS.bicker[5]` | Check her hands. Murderers always have tells. | bicker |
| `q1_GUESTS.bicker[6]` | I want to go home. Why won't the door open? | bicker |
| `q1_GUESTS.bicker[7]` | Somebody in this room is lying, and it isn't me. | bicker |

## `q2_WENDELL` — Wendell Pike (NEW)  
*q2 Someone’s Watching · voice: existing WENDELL ref*

| id | text | trigger / beat |
|---|---|---|
| `q2_WENDELL.intro[0]` | (whispering) Don't look up. Don't look up. They put a camera in the birdhouse. | intro |
| `q2_WENDELL.intro[1]` | My neighbor waters his lawn at three and at nine. Who does that? Who does that. | intro |
| `q2_WENDELL.intro[2]` | The one with the flamingos. Flamingos are antennas, friend. Antennas. | intro |
| `q2_WENDELL.intro[3]` | I need you to prove it. Follow them. Watch the watchers. | intro |
| `q2_WENDELL.comms[0]` | (whispering) He's buying antacids. Acid, for melting evidence. Write it down. | comms |
| `q2_WENDELL.comms[1]` | Tail him to the payphone but don't get close. Do not get made. | comms |
| `q2_WENDELL.comms[2]` | See the van? Grey, no plates, always parked just out of frame. | comms |
| `q2_WENDELL.comms[3]` | Connect the photos. Red string. Every route passes the birdhouse. | comms |
| `q2_WENDELL.comms[4]` | (scared) The lake. Tonight. That's where the lights come. I know it. | comms |
| `q2_WENDELL.comms[5]` | (scared) There! Over the water! Tell me you see it too! | comms |
| `q2_WENDELL.comms[6]` | Photograph it and run. Run before the workers turn around. | comms |
| `q2_WENDELL.vindicated[0]` | (sighing) I'm not crazy. I'm just early. | vindicated |
| `q2_WENDELL.vindicated[1]` | I built this from the birdhouse cam. Now you can hear them too. | vindicated |
| `q2_WENDELL.vindicated[2]` | They're always listening. So now, so are we. | vindicated |
| `q2_WENDELL.vindicated[3]` | (whispering) Take the scanner. And tape your windows. Trust me. | vindicated |
| `q2_WENDELL.vindicated[4]` | You believe me now. That's the worst part. You believe me. | vindicated |

## `q2_DON` — Don Sharp (EXISTING)  
*q2 · voice: DON*

| id | text | trigger / beat |
|---|---|---|
| `q2_DON.call[0]` | (whispering) Yeah, it's me. The assessment. I'm handling it. I said I'm handling it. | call |
| `q2_DON.call[1]` | No, nobody's watching me. Why would anybody be watching me? | call |
| `q2_DON.call[2]` | I got kids. I got a family. I do what they ask, that's all. | call |
| `q2_DON.fakeout[0]` | (angry) You following me, pal? You following me? | fakeout |
| `q2_DON.fakeout[1]` | Forget you saw me here. For your sake. | fakeout |

## `q2_METER` — The Meter Reader (RESKIN)  
*q2 · voice: COLT*

| id | text | trigger / beat |
|---|---|---|
| `q2_METER.cover[0]` | Just reading the meter, sir. Routine. Move along. | cover |
| `q2_METER.cover[1]` | City utilities. Nothing to see. Have a nice day. | cover |
| `q2_METER.hostile[0]` | (angry) You're on a list now. You know that? | hostile |
| `q2_METER.hostile[1]` | (angry) The board sends its regards. Run. | hostile |

## `q3_AGATHA` — Agatha Holloway (NEW)  
*q3 Where the Red House Weeps · voice: AGATHA new ref*

| id | text | trigger / beat |
|---|---|---|
| `q3_AGATHA.intro[0]` | Five floors. Five families. Not one of them left whole. | intro |
| `q3_AGATHA.intro[1]` | He says it's just the house settling. Houses don't weep, child. People do. | intro |
| `q3_AGATHA.intro[2]` | This house remembers every one of them. I need you to put it to rest. | intro |
| `q3_AGATHA.intro[3]` | Take the cold lantern. Light it only when the air goes still. | intro |
| `q3_AGATHA.intro[4]` | The dark up there isn't empty. Remember that. | intro |
| `q3_AGATHA.reveals[0]` | The parlor. The first family argued here until the very end. | reveals |
| `q3_AGATHA.reveals[1]` | The nursery. Be gentle with the little one. He only wants to play. | reveals |
| `q3_AGATHA.reveals[2]` | The third floor floods, like the lake reaching up. Keep the flame lit. | reveals |
| `q3_AGATHA.reveals[3]` | The study holds the ledger. Every name they took is written there. | reveals |
| `q3_AGATHA.reveals[4]` | Assessed by the board. Reclaimed by the lake. That's what it says. | reveals |
| `q3_AGATHA.reveals[5]` | The top floor. The sealed door. That is where they keep their table. | reveals |
| `q3_AGATHA.farewell[0]` | (sighing) My boy asked about the lake, same as your friend Gloria. | farewell |
| `q3_AGATHA.farewell[1]` | Now you know where their table sits. Finish it, when you're ready. | farewell |
| `q3_AGATHA.farewell[2]` | (sighing) I can rest a little now. The house is quieter. | farewell |
| `q3_AGATHA.farewell[3]` | Keep the lantern. It opens what they'd rather keep shut. | farewell |
| `q3_AGATHA.farewell[4]` | Go careful, child. The chairman does not forgive the curious. | farewell |

## `q3_GRAYBOY` — The Gray Boy (RESKIN, kid-safe)  
*q3 · voice: DYLAN kid*

| id | text | trigger / beat |
|---|---|---|
| `q3_GRAYBOY.giggles[0]` | (laughing) You can't find me! Come and see! | giggles |
| `q3_GRAYBOY.giggles[1]` | (happy) Found me! Again, again! | giggles |
| `q3_GRAYBOY.giggles[2]` | (whispering) I'm not supposed to talk to the grown-ups. | giggles |
| `q3_GRAYBOY.giggles[3]` | Here. Matches. For the funny green light. | giggles |
| `q3_GRAYBOY.giggles[4]` | (laughing) One, two, three, ready or not! | giggles |

## `q3_HISTORIAN` — The Historian (EXISTING)  
*q3 · voice: ped_old*

| id | text | trigger / beat |
|---|---|---|
| `q3_HISTORIAN.exposition[0]` | That red house? Oldest deed in Westchase. Never once sold. Only inherited. | exposition |
| `q3_HISTORIAN.exposition[1]` | Every family listed at that address is marked the same: relocated. | exposition |
| `q3_HISTORIAN.exposition[2]` | Relocated where, the records don't say. Convenient, isn't it. | exposition |
| `q3_HISTORIAN.exposition[3]` | The Association signs off on every removal. Chairman Thorne, every time. | exposition |
| `q3_HISTORIAN.exposition[4]` | Folks who ask about the top floor tend to stop asking. | exposition |
| `q3_HISTORIAN.exposition[5]` | You didn't hear any of this from me. | exposition |

## `q3_GHOSTS` — ghost echoes (round-robin)  
*q3 · voice: GLORIA/ped_f/SUMMER/DYLAN*

| id | text | trigger / beat |
|---|---|---|
| `q3_GHOSTS.echoes[0]` | (scared) Please, we'll be quiet, we'll be good, don't make us leave. | echoes |
| `q3_GHOSTS.echoes[1]` | You can't just take our home. This is our home. | echoes |
| `q3_GHOSTS.echoes[2]` | The lawn was perfect. We did everything they asked. | echoes |
| `q3_GHOSTS.echoes[3]` | (whispering) The lights are over the lake again, mama. | echoes |
| `q3_GHOSTS.echoes[4]` | Sign it. Sign the packet or they come at night. | echoes |
| `q3_GHOSTS.echoes[5]` | (scared) Not the water. Please, not the water. | echoes |
| `q3_GHOSTS.echoes[6]` | We only wanted to stay. | echoes |
| `q3_GHOSTS.echoes[7]` | Tell them we were here. Tell someone we were here. | echoes |

## `q4_SAL` — Sal Marino (NEW)  
*q4 The Countryway Job · voice: SAL new ref*

| id | text | trigger / beat |
|---|---|---|
| `q4_SAL.recruit[0]` | Kid, I planned jobs before your daddy learned to lie. | recruit |
| `q4_SAL.recruit[1]` | Regions on the corner? I know a way in. But I'm too old to run. You run. | recruit |
| `q4_SAL.recruit[2]` | I'll draw the map. You bring the nerve. | recruit |
| `q4_SAL.recruit[3]` | Three keys, one inside man, one window. Simple, if you don't get greedy. | recruit |
| `q4_SAL.coaching[0]` | Eyes, not hands. Count the cameras. Love the cameras. | coaching |
| `q4_SAL.coaching[1]` | The guard drinks at the Dunkin off-shift. Lift his key, don't spook him. | coaching |
| `q4_SAL.coaching[2]` | My toolkit's in the dumpster behind the Publix. Mind the false bottom. | coaching |
| `q4_SAL.coaching[3]` | The roof's got the timer schedule. Photograph it, don't linger. | coaching |
| `q4_SAL.coaching[4]` | Marcus is drowning in debt. Lean on that, gentle-like. | coaching |
| `q4_SAL.coaching[5]` | When the timer trips, quiet men come. Not cops. Worse. Grab the box and go. | coaching |
| `q4_SAL.payoff[0]` | You got it. The ledger, the cash, all of it. | payoff |
| `q4_SAL.payoff[1]` | Let me just burn my name out of this book. There. Never happened. | payoff |
| `q4_SAL.payoff[2]` | The etched key? That don't open a box. That opens a door. | payoff |
| `q4_SAL.payoff[3]` | Under the water. Don't ask me how I know, kid. | payoff |
| `q4_SAL.payoff[4]` | Now get gone before the heat settles. You did good. | payoff |

## `q4_MARCUS` — Marcus — inside man (EXISTING)  
*q4 · voice: ANDRE*

| id | text | trigger / beat |
|---|---|---|
| `q4_MARCUS.turn[0]` | I can't talk here. The manager's watching. Meet me out back. | turn |
| `q4_MARCUS.turn[1]` | You know what I owe the dealer? More than this job pays in a year. | turn |
| `q4_MARCUS.turn[2]` | One withdrawal slip left blank. One back door left unlatched. That's all. | turn |
| `q4_MARCUS.turn[3]` | Then I never saw you. We clear? | turn |
| `q4_MARCUS.panic[0]` | (nervous) They audit the vault at shift change. You have minutes, not hours. | panic |
| `q4_MARCUS.panic[1]` | (scared) You pushed too hard. I'm hitting the alarm, I'm sorry! | panic |
| `q4_MARCUS.panic[2]` | Just go! Go before they trace it back to me! | panic |

## `q4_DUKE` — Duke the wheelman (RESKIN)  
*q4 · voice: JAMAL*

| id | text | trigger / beat |
|---|---|---|
| `q4_DUKE.banter[0]` | Engine's warm. You're late. | banter |
| `q4_DUKE.banter[1]` | I drive. I don't wait long. | banter |
| `q4_DUKE.banter[2]` | Cops on the scanner. Two blocks. Your call. | banter |
| `q4_DUKE.banter[3]` | Get in or don't. Meter's running. | banter |
| `q4_DUKE.banter[4]` | Nice score. Same time next disaster? | banter |

## `q5_DESIREE` — Desiree the Siren (NEW)  
*q5 Roadside Assistance · voice: DESIREE new ref*

| id | text | trigger / beat |
|---|---|---|
| `q5_DESIREE.lure[0]` | (happy) Oh, thank goodness someone stopped! My car just died out here. | lure |
| `q5_DESIREE.lure[1]` | Could you take a look under the hood? A big strong hero like you? | lure |
| `q5_DESIREE.lure[2]` | It's so dark out here. I feel so much safer already. | lure |
| `q5_DESIREE.fake_victim[0]` | (scared) They make me do this. Please, I'm a victim too. | fake_victim |
| `q5_DESIREE.fake_victim[1]` | (scared) Brick will hurt me if I don't. You have to understand. | fake_victim |
| `q5_DESIREE.fake_victim[2]` | Turn around, just for a second, let me get my things. | fake_victim |
| `q5_DESIREE.venom[0]` | (angry) You really thought I needed help? How sweet. How stupid. | venom |
| `q5_DESIREE.venom[1]` | Every good person who stops, stops for good. | venom |
| `q5_DESIREE.venom[2]` | You think we're the bad guys? We're the ones they let you catch. | venom |
| `q5_DESIREE.venom[3]` | The real crew doesn't fix cars. They fix people. | venom |

## `q5_BRICK` — Brick (NEW)  
*q5 · voice: BRICK new ref*

| id | text | trigger / beat |
|---|---|---|
| `q5_BRICK.menace[0]` | (angry) Wrong car to help, hero. | menace |
| `q5_BRICK.menace[1]` | Hand it over. Wallet. Phone. All of it. | menace |
| `q5_BRICK.menace[2]` | Desiree points. I break. That's the arrangement. | menace |
| `q5_BRICK.menace[3]` | (angry) You should've kept driving. | menace |
| `q5_BRICK.menace[4]` | Boss says you're flagged. Not my problem. | menace |
| `q5_BRICK.menace[5]` | Down in the hole with the rest of 'em. | menace |

## `q5_HUSBAND` — Rescued Husband (EXISTING)  
*q5 · voice: ped_m*

| id | text | trigger / beat |
|---|---|---|
| `q5_HUSBAND.relief[0]` | (scared) Please, don't hurt me. Oh, you're not one of them? | relief |
| `q5_HUSBAND.relief[1]` | They tied me up down here for two days. Two days. | relief |
| `q5_HUSBAND.relief[2]` | My wife, is she okay? Take me to my wife. | relief |
| `q5_HUSBAND.relief[3]` | (happy) I stopped to help someone. I'll never live that down. | relief |

## `q5_SPOUSE` — Worried Spouse — giver (EXISTING)  
*q5 · voice: ped_f*

| id | text | trigger / beat |
|---|---|---|
| `q5_SPOUSE.plea[0]` | (scared) My husband stopped to help a broken-down car and never came home. | plea |
| `q5_SPOUSE.plea[1]` | The cops won't even look. Please, you have to. | plea |
| `q5_SPOUSE.plea[2]` | It was on Race Track Road. A sedan, hazards on, hood up. | plea |
| `q5_SPOUSE.plea[3]` | (happy) You found him! You brought him back! Thank you! | plea |

## `q6_XANDER` — Xander (EXISTING)  
*q6 Insert Coin to Continue · voice: XANDER*

| id | text | trigger / beat |
|---|---|---|
| `q6_XANDER.intro[0]` | (scared) Dude, Derik went into the cabinet and he did not come back out. | intro |
| `q6_XANDER.intro[1]` | I paused my game to be here so you know it's serious. | intro |
| `q6_XANDER.intro[2]` | The screen just swallowed him. Like, pixel by pixel. | intro |
| `q6_XANDER.intro[3]` | There's this cartridge, no label. You gotta play it to get in. | intro |
| `q6_XANDER.intro[4]` | Level one is a Publix that's all wrong. Trust nothing. | intro |
| `q6_XANDER.intro[5]` | The aisle repeats until you walk it in the right order. It's a puzzle, bro. | intro |
| `q6_XANDER.intro[6]` | Whatever the boss is, it talks like the lake. That's not normal, right? | intro |
| `q6_XANDER.relief[0]` | (happy) You got him out! Derik! You absolute legend. | relief |
| `q6_XANDER.relief[1]` | I am never touching an unlabeled cartridge again. Ever. | relief |

## `q6_DERIK` — Derik Sharp (EXISTING)  
*q6 · voice: DERIK*

| id | text | trigger / beat |
|---|---|---|
| `q6_DERIK.trapped[0]` | (whispering) Is someone there? I can't tell what's real in here. | trapped |
| `q6_DERIK.trapped[1]` | I keep seeing lights. Over water. It's so cold. | trapped |
| `q6_DERIK.trapped[2]` | The game's not a game. It remembers things. Bad things. | trapped |
| `q6_DERIK.trapped[3]` | (scared) Don't let it finish loading me. Please. | trapped |
| `q6_DERIK.waking[0]` | (happy) I'm out? I'm out! I dreamed the whole town was underwater. | waking |

## `q6_WARDEN` — The Arcade Warden (NEW)  
*q6 · voice: WARDEN new ref*

| id | text | trigger / beat |
|---|---|---|
| `q6_WARDEN.taunts[0]` | In-sert coin to con-tin-ue. | taunts |
| `q6_WARDEN.taunts[1]` | You are not a player here. You are an entry. | taunts |
| `q6_WARDEN.taunts[2]` | I have your friend's save file. I have his sleep. | taunts |
| `q6_WARDEN.taunts[3]` | This memory is mine. The lake gave it to me to keep. | taunts |
| `q6_WARDEN.taunts[4]` | (angry) You do not belong in this level. | taunts |
| `q6_WARDEN.taunts[5]` | Every door under the water is locked. I am the lock. | taunts |
| `q6_WARDEN.taunts[6]` | Game over. Continue? | taunts |

## `q7_VLAD` — Vlad (NEW mesh)  
*q7 Leg Day · voice: existing VLAD ref*

| id | text | trigger / beat |
|---|---|---|
| `q7_VLAD.oath[0]` | Stop. You have the shoulders of a champion and the cardio of a mouse. | oath |
| `q7_VLAD.oath[1]` | I am Vlad. I do not lift weights. I lift destiny. | oath |
| `q7_VLAD.oath[2]` | Leg day is not a day. Leg day is a way of life, my friend. | oath |
| `q7_VLAD.oath[3]` | Do not kneel, you will skip leg day. Squat instead. | oath |
| `q7_VLAD.dares[0]` | Fetch me my protein. It is somewhere in this town. Somewhere sacred. | dares |
| `q7_VLAD.dares[1]` | Now carry the boulder. It is a gnome. To me it is a boulder. Carry it. | dares |
| `q7_VLAD.dares[2]` | Chad thinks his smoothie is destiny. Chad is wrong. Race him. | dares |
| `q7_VLAD.dares[3]` | Run! Run! The smoothie melts and so does your glory! | dares |
| `q7_VLAD.dares[4]` | You waddle like a champion carrying a very small stone! | dares |
| `q7_VLAD.dares[5]` | The Gains Cave awaits. Behind the building. Behind the pain. | dares |
| `q7_VLAD.dares[6]` | Wait. Those two men. They are not lifting. They are hiding crates. | dares |
| `q7_VLAD.dares[7]` | (angry) Nobody hides crates in my cave. We finish this together. | dares |
| `q7_VLAD.crowning[0]` | You have done it. Your legs are now acceptable. | crowning |
| `q7_VLAD.crowning[1]` | Take my blessed sneakers. They add hops to your soul. | crowning |
| `q7_VLAD.crowning[2]` | Go, champion. Never skip. Never skip leg day. | crowning |

## `q7_CHAD` — Chad (RESKIN)  
*q7 · voice: BRAD*

| id | text | trigger / beat |
|---|---|---|
| `q7_CHAD.trash[0]` | (happy) Bro, you'll never catch me, I've got a smoothie and a head start. | trash |
| `q7_CHAD.trash[1]` | This is my third cardio of the day. You're built for comfort, not speed. | trash |
| `q7_CHAD.trash[2]` | (wheezing) Okay, this is farther than it looks. Worth it though. | trash |
| `q7_CHAD.trash[3]` | Vlad's a nutjob but the man's traps are magnificent. | trash |
| `q7_CHAD.trash[4]` | You carried a gnome across town? Respect. Weird. But respect. | trash |
| `q7_CHAD.trash[5]` | Rematch when my legs stop being on fire. | trash |

## `q7_BYSTANDERS` — bystanders (round-robin)  
*q7 · voice: ped_m/ped_f/ped_old/SKYLER*

| id | text | trigger / beat |
|---|---|---|
| `q7_BYSTANDERS.reactions[0]` | Is that man carrying a lawn gnome? At a full sprint? | reactions |
| `q7_BYSTANDERS.reactions[1]` | Only in this town, I swear. | reactions |
| `q7_BYSTANDERS.reactions[2]` | Go on, champ, don't drop the little guy! | reactions |
| `q7_BYSTANDERS.reactions[3]` | I think those two are running a smoothie race. On purpose. | reactions |
| `q7_BYSTANDERS.reactions[4]` | Westchase gets weirder every single day. | reactions |

## `q8_CONCIERGE` — The Concierge (NEW)  
*q8 The Cleaners · voice: CONCIERGE new ref*

| id | text | trigger / beat |
|---|---|---|
| `q8_CONCIERGE.recruit[0]` | You escaped clean. That is a rare and marketable talent. | recruit |
| `q8_CONCIERGE.recruit[1]` | We are not criminals. We are a service. We solve problems. | recruit |
| `q8_CONCIERGE.recruit[2]` | This black card admits you to a very exclusive employer. | recruit |
| `q8_CONCIERGE.recruit[3]` | Midnight. The dumpster behind the Publix. Come hungry to work. | recruit |
| `q8_CONCIERGE.contracts[0]` | The first contract is a lesson. Clean, quiet, no witnesses. | contracts |
| `q8_CONCIERGE.contracts[1]` | A stealth kill raises no alarm. No stars. This is the Ghost way. | contracts |
| `q8_CONCIERGE.contracts[2]` | The dead-drop is the hollow oak. Take only the envelope meant for you. | contracts |
| `q8_CONCIERGE.contracts[3]` | The second target does not die. He is merely followed. For now. | contracts |
| `q8_CONCIERGE.contracts[4]` | The third name will trouble you. That is rather the point. | contracts |
| `q8_CONCIERGE.reveal[0]` | Yes, I sit on the board. Someone must keep the town tidy. | reveal |
| `q8_CONCIERGE.reveal[1]` | The eviction notices, the party, the red house, all one signature. | reveal |
| `q8_CONCIERGE.reveal[2]` | Refuse me and the next contract has your name on the folder. | reveal |
| `q8_CONCIERGE.reveal[3]` | Under the lake, literally, is where all our loose threads go. | reveal |
| `q8_CONCIERGE.reveal[4]` | Choose well. The chair remembers who was useful. | reveal |

## `q8_SILAS` — Silas — handler (RESKIN)  
*q8 · voice: ped_old*

| id | text | trigger / beat |
|---|---|---|
| `q8_SILAS.tutorial[0]` | (sighing) New blood. Great. Let me show you how not to die. | tutorial |
| `q8_SILAS.tutorial[1]` | Stay behind them. One clean hit. Nobody hears, nobody looks. | tutorial |
| `q8_SILAS.tutorial[2]` | You raise a star, you did it wrong. Ghosts don't leave a trace. | tutorial |
| `q8_SILAS.tutorial[3]` | The oak's got a hole. Envelopes go in, envelopes come out. Don't be curious. | tutorial |
| `q8_SILAS.tutorial[4]` | Some envelopes are rigged. Use the loupe. I've seen guys lose a hand. | tutorial |
| `q8_SILAS.tutorial[5]` | I've done this fifteen years. It doesn't get lighter. | tutorial |
| `q8_SILAS.tutorial[6]` | The Concierge always collects. On the job, or on you. | tutorial |
| `q8_SILAS.tutorial[7]` | (sighing) Do the work. Take the pistol. Try to sleep after. | tutorial |

## `q8_TARGET` — The Target (EXISTING, round-robin)  
*q8 · voice: ANDRE/WENDELL*

| id | text | trigger / beat |
|---|---|---|
| `q8_TARGET.warning[0]` | (scared) You? They sent you? After everything? | warning |
| `q8_TARGET.warning[1]` | The board owns you now. Same as they owned me. | warning |
| `q8_TARGET.warning[2]` | (sighing) Tell my family it was quick. Lie to them. | warning |
| `q8_TARGET.warning[3]` | You don't have to do this. You can still walk away clean. | warning |
| `q8_TARGET.warning[4]` | Under the lake, they'll do to you what you did to me. | warning |

## `q9_DYLAN` — Dylan Sharp — giver (EXISTING)  
*q9 Where’s Biscuit? · voice: DYLAN*

| id | text | trigger / beat |
|---|---|---|
| `q9_DYLAN.plea[0]` | (crying) Have you seen my dog? Biscuit ran off and I can't find him. | plea |
| `q9_DYLAN.plea[1]` | He's brown and scruffy and he has the biggest ears ever. | plea |
| `q9_DYLAN.plea[2]` | Dad's too busy on the phone. He's always on the phone now. | plea |
| `q9_DYLAN.plea[3]` | The hide-and-seek champ knows every hiding spot. Ask her. | plea |
| `q9_DYLAN.plea[4]` | Biscuit likes the water. Maybe he went to the lake? | plea |
| `q9_DYLAN.joy[0]` | (happy) Biscuit! You found him! You found my Biscuit! | joy |
| `q9_DYLAN.joy[1]` | (happy) You're the best. Here, take his whistle. He'll always come for you. | joy |

## `q9_CHAMPION` — Hide-and-Seek Champion (EXISTING)  
*q9 · voice: DERIK kid*

| id | text | trigger / beat |
|---|---|---|
| `q9_CHAMPION.hints[0]` | I'm the hide-and-seek champion. I know every nook in Westchase. | hints |
| `q9_CHAMPION.hints[1]` | There's a hole in the old oak nobody knows about but me. | hints |
| `q9_CHAMPION.hints[2]` | And a way up to the strip-mall roof. And a cellar behind the Dunkin. | hints |
| `q9_CHAMPION.hints[3]` | Follow the paw prints. Biscuit always leaves paw prints. | hints |
| `q9_CHAMPION.hints[4]` | The prints go down to the storm drain by the lake. | hints |
| `q9_CHAMPION.hints[5]` | Don't tell the grown-ups I told you the secret spots. | hints |

## `q9_DON` — Don Sharp (EXISTING)  
*q9 · voice: DON*

| id | text | trigger / beat |
|---|---|---|
| `q9_DON.barbs[0]` | (nervous) Dylan, not now, Daddy's on a call. It's important. | barbs |
| `q9_DON.barbs[1]` | The dog's fine. Everything's fine. It's all being handled. | barbs |
| `q9_DON.barbs[2]` | (sighing) I do this for you kids. You'll understand one day. | barbs |
| `q9_DON.barbs[3]` | Don't go near that lake, son. Promise me you won't. | barbs |

## `q9_BISCUIT` — Biscuit the dog  
*q9 · voice: clerk (stylized barks)*

| id | text | trigger / beat |
|---|---|---|
| `q9_BISCUIT.barks[0]` | (happy) Arf! Arf arf! | barks |
| `q9_BISCUIT.barks[1]` | Rrrruff! | barks |
| `q9_BISCUIT.barks[2]` | (scared) Awoooo. Whimper, whimper. | barks |
| `q9_BISCUIT.barks[3]` | Grrrr. Arf! | barks |
| `q9_BISCUIT.barks[4]` | (happy) Bark bark bark! | barks |

## `q10_THORNE` — Chairman Thorne (NEW)  
*q10 What Lies Beneath · voice: THORNE new ref*

| id | text | trigger / beat |
|---|---|---|
| `q10_THORNE.offer[0]` | So. The curious one, at last, beneath my town. | offer |
| `q10_THORNE.offer[1]` | You've been very busy. Loupe, lantern, ledger, key. Impressive collection. | offer |
| `q10_THORNE.offer[2]` | Sit. We are, all of us, reasonable people down here. | offer |
| `q10_THORNE.offer[3]` | Two generations of perfect weather and perfect lawns. You're welcome. | offer |
| `q10_THORNE.offer[4]` | It asks so little. To be fed. To be kept. To watch. | offer |
| `q10_THORNE.offer[5]` | Gloria asked questions. Agatha's boy asked questions. Do you see a pattern? | offer |
| `q10_THORNE.offer[6]` | I am not offering you a fight. I am offering you a chair. | offer |
| `q10_THORNE.menace[0]` | Run the town. The lights will love you as they've loved me. | menace |
| `q10_THORNE.menace[1]` | (angry) Or expose it, and watch Westchase rot without its keeper. | menace |
| `q10_THORNE.menace[2]` | (angry) Burn it, and drown with everyone you failed to save. | menace |
| `q10_THORNE.menace[3]` | The board always has a seat open. There's always a vacancy. | menace |
| `q10_THORNE.menace[4]` | Choose. The thing under the water is already awake. | menace |
| `q10_THORNE.menace[5]` | Whatever you decide, you are one of us now. You always were. | menace |

## `q10_ENTITY` — The Entity (EXISTING asset)  
*q10 · voice: WARDEN new ref (shared)*

| id | text | trigger / beat |
|---|---|---|
| `q10_ENTITY.assessment[0]` | As-sess-ment com-plete. | assessment |
| `q10_ENTITY.assessment[1]` | New money. New lights. I came to see what you are worth. | assessment |
| `q10_ENTITY.assessment[2]` | You have opened every door. Only the last one remains. | assessment |
| `q10_ENTITY.assessment[3]` | (angry) Feed me or free me. The pact must hold. | assessment |
| `q10_ENTITY.assessment[4]` | The lake keeps everything. It will keep you too. | assessment |

## `q10_DONRED` — Don Sharp, redeemed (EXISTING)  
*q10 · voice: DON*

| id | text | trigger / beat |
|---|---|---|
| `q10_DONRED.defection[0]` | (whispering) Psst. Over here. It's Don. I'm getting you in. | defection |
| `q10_DONRED.defection[1]` | I'm done being their errand boy. My kids deserve better than this town. | defection |
| `q10_DONRED.defection[2]` | I know the tunnels. Gains Cave, the manhole, the storm drain, all one road. | defection |
| `q10_DONRED.defection[3]` | Thorne signs the evictions. I just looked the other way. Too long. | defection |
| `q10_DONRED.defection[4]` | That thing in the tank? It's why I never questioned a paycheck. | defection |
| `q10_DONRED.defection[5]` | Whatever you choose up there, I've got your back down here. | defection |
| `q10_DONRED.defection[6]` | (happy) For Dylan. For all of them. Let's finish it. | defection |
| `q10_DONRED.defection[7]` | If we don't walk out of here, tell my boys their dad did one good thing. | defection |

## `q10_CAST` — returning cast payoff (round-robin)  
*q10 · voice: Vivian/Agatha/Vlad/Wendell/Sal/Dylan/Xander*

| id | text | trigger / beat |
|---|---|---|
| `q10_CAST.payoff[0]` | (happy) You brought the whole thing into the light. Bless you, dear. | payoff |
| `q10_CAST.payoff[1]` | The house can finally rest. My boy can rest. | payoff |
| `q10_CAST.payoff[2]` | You did it without skipping leg day. Legend. | payoff |
| `q10_CAST.payoff[3]` | I told them. I told them all. And you proved it. | payoff |
| `q10_CAST.payoff[4]` | You opened the door under the water. I'll be damned. | payoff |
| `q10_CAST.payoff[5]` | (happy) You found Biscuit and saved the whole town? Best day ever! | payoff |
| `q10_CAST.payoff[6]` | Never touching a cartridge again, but thanks, bro. | payoff |
| `q10_CAST.payoff[7]` | The scanner's quiet tonight. First time in years. | payoff |
| `q10_CAST.payoff[8]` | Prices are fair now. Cops nod instead of chase. Feels strange. | payoff |
| `q10_CAST.payoff[9]` | Whatever you became down there, Westchase remembers. | payoff |


_Total lines: 279._
