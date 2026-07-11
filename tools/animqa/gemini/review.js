// tools/animqa/gemini/review.js — send a gameplay clip to Gemini for multimodal
// (video + audio) animation review. Returns structured JSON findings.
//
// Run:  GEMINI_API_KEY=... node review.js <clip.webm> <scenario> [model]
// Models: gemini-3-pro-preview (default, best judge) | gemini-3-flash-preview (cheap iteration)
// Out: prints JSON verdict; also saves alongside the clip as <clip>.review.json
const fs = require('fs'); const path = require('path'); const https = require('https');
const CLIP = process.argv[2]; const SCEN = process.argv[3] || 'weapon';
const MODEL = process.argv[4] || 'gemini-3-pro-preview';
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY env required (never commit it)'); process.exit(2); }
if (!CLIP || !fs.existsSync(CLIP)) { console.error('clip not found:', CLIP); process.exit(2); }

// SPEC landmarks are included for weapon reviews so Gemini judges against the
// same measured contract as the rest of the pipeline (tools/animqa/ref/SPEC.md).
let spec = '';
try { spec = fs.readFileSync(path.join(__dirname, '../ref/SPEC.md'), 'utf8'); } catch (e) {}

const RUBRICS = {
  weapon: `You are a AAA first-person-shooter animation director reviewing a first-person weapon viewmodel clip from a retro-styled (PS1-fidelity) browser FPS. The clip shows: idle hold (0-2.5s), firing (2.5-4.5s), walking (4.5-7s), a look-around sweep (7-9s), idle again.
Judge HARSHLY against how classic FPS games (Counter-Strike, Half-Life) frame a held weapon:
1. COMPOSITION: weapon anchored lower-right, muzzle BELOW the crosshair pointing downrange, gun never crossing above ~52% screen height, stock implied at the shoulder off-frame.
2. HANDS/ARMS: support hand visibly GRIPPING the foregrip (closed fingers wrapping, not open/splayed), forearm entering from the bottom edge (near-vertical), right arm mostly out of frame, no huge bare-arm masses.
3. MOTION: idle sway/breathing present but subtle; walk bob natural; the look-sweep should lag the camera slightly; NO jitter, popping, mesh stretching, limbs detaching, or parts swimming against each other.
4. FIRING: visible recoil kick that recovers; muzzle flash AT the muzzle tip; audio gunshot SYNCED to the visual shot (flag any audio/visual desync, missing or doubled shots).
5. AUDIO: footsteps during the walking phase in sync with steps; no crackling/clipping.
${spec ? 'MEASURED SPEC (screen-percent landmarks, x right / y down):\n' + spec : ''}`,
  npc: `You are a AAA animation director reviewing third-person NPC animation in a retro-styled (PS1-fidelity) browser FPS street scene. Judge pedestrians' walk/run/idle cycles: foot-sliding/skating vs planted feet, arm-leg phase, T-posing, popping/snapping between poses, mesh stretching or limb detachment, characters clipping through each other or props, frozen NPCs, and (audio) footsteps/voices roughly matching what's visible.`,
  drive: `You are reviewing a third-person driving clip from a retro browser FPS. Judge: wheel spin + steering visually matching motion, suspension response, no mesh breakage, camera smoothness, engine audio pitch tracking speed, no popping.`
};
const rubric = RUBRICS[SCEN] || RUBRICS.weapon;

const prompt = rubric + `
Watch the whole clip (video AND audio). Then reply with PURE JSON only (no markdown fences):
{
 "verdict": "PASS" | "FAIL",
 "score": 0-10,
 "issues": [ { "t": "<mm:ss in clip>", "subject": "<what element>", "problem": "<specific defect>", "severity": "high|med|low", "fix_hint": "<concrete suggestion>" } ],
 "praise": [ "<things that already look right>" ]
}
Order issues by severity. Be specific about WHERE on screen and WHEN. If audio is silent or missing, report that as an issue.`;

const body = JSON.stringify({
  contents: [{ parts: [
    { inline_data: { mime_type: 'video/webm', data: fs.readFileSync(CLIP).toString('base64') } },
    { text: prompt }
  ] }],
  generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
});

function call(attempt) {
  const req = https.request({
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/${MODEL}:generateContent`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY, 'Content-Length': Buffer.byteLength(body) }
  }, res => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      if (res.statusCode >= 500 || res.statusCode === 429) {
        if (attempt < 4) { console.error('retry', res.statusCode); return setTimeout(() => call(attempt + 1), 3000 * attempt); }
      }
      try {
        const j = JSON.parse(data);
        if (j.error) { console.error('API ERROR', j.error.code, j.error.message); process.exit(1); }
        let text = j.candidates[0].content.parts.map(p => p.text || '').join('');
        text = text.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
        const out = JSON.parse(text);
        fs.writeFileSync(CLIP + '.review.json', JSON.stringify(out, null, 2));
        console.log(JSON.stringify(out, null, 2));
        console.log('\n[usage]', JSON.stringify(j.usageMetadata || {}));
      } catch (e) { console.error('PARSE FAIL raw:', data.slice(0, 2000)); process.exit(1); }
    });
  });
  req.on('error', e => { if (attempt < 4) setTimeout(() => call(attempt + 1), 3000 * attempt); else { console.error(e); process.exit(1); } });
  req.setTimeout(180000, () => req.destroy(new Error('timeout')));
  req.write(body); req.end();
}
call(1);
