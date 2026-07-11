# gemini/ — multimodal (video+audio) animation review loop

Gemini watches real gameplay clips and judges animation + weapon placement +
audio sync; a sweep mode burns a live parameter value into the frame so one
video + one review finds the best value ("which displayed v looks right?").

- `record.js <scenario>` — webm WITH game audio (canvas captureStream + a
  WebAudio connect-tap). Scenarios: ak/smg/rifle/rocket/pistol/punch/npcwalk/run/drive.
- `review.js <clip> <rubric> [model]` — sends the clip to Gemini, returns
  strict-JSON issues (t/subject/problem/severity/fix_hint) + score. Rubrics:
  weapon/npc/drive. Includes ../ref/SPEC.md when present.
- `sweep.js <name> <from> <to> <secs> "<applyExpr(v)>" [setup]` — records a
  parameter sweep with the value overlaid (full-page capture, no audio).

Key: `GEMINI_API_KEY` env var — NEVER commit it.
Cost discipline: iterate on gemini-3-flash-preview (a review ≈ 3k tokens),
final sign-off on gemini-3-pro-preview; log usageMetadata every call.
