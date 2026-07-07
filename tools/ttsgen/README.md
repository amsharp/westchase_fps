# ttsgen — PS1-crunched character dialogue

Text → Fish Audio TTS → PS1 bitcrush (mono, lowpass, 11025 Hz, 8-bit) →
`voicelines.js` at repo root (data-URL WAVs, loaded before game.js, optional
at runtime — the game guards with `typeof VOICE_LINES`).

```
manifest.json ──mkvoicepack.js──▶ work/<id>_raw.wav + work/<id>.wav ──▶ voicelines.js
                 (Fish Audio API)        (psxify.js crunch)
```

## Recipe

```bash
cd tools/ttsgen
# 1. Pick / verify a voice for the character (pin it in voices.json!)
FISH_API_KEY=... node findvoice.js "grumpy old trucker"

# 2. Add lines to manifest.json:  "line_id": {"text": "...", "voice": "<reference_id>"}
#    Voice CONSISTENCY RULE: one character = one reference_id, registered in
#    voices.json. Never mix voices for the same character.

# 3. Generate (only missing lines are synthesized; delete work/<id>.wav to redo one)
FISH_API_KEY=... node mkvoicepack.js

# 4. Audition work/<id>.wav (send to the user — you can't listen), then wire
#    triggers in game.js via playVoice('line_id', gain, cooldownSeconds).
```

## Fish Audio API notes

- `POST https://api.fish.audio/v1/tts` `{text, reference_id, format:'wav'}` →
  16-bit 44.1kHz WAV. No reference_id = default voice (don't ship that).
- Voice discovery: `GET /model?title=<query>&language=en` (findvoice.js).
  The catalog includes community voices (there's even a GTA-style angry cop).
- Fish also supports creating custom voices from reference audio
  (`POST /model` with audio samples) if the catalog lacks a fit — that mints
  a new reference_id; pin it in voices.json like any other.
- Keys come from the user as `FISH_API_KEY`; never commit.

## The PS1 crunch (psxify.js)

Mono mixdown → 2× single-pole lowpass at 0.4×rate → decimate to 11025 Hz by
averaging → normalize → 8-bit unsigned WAV. ~11 KB/s of dialogue; keep lines
under ~3 s. Standalone: `node psxify.js in.wav out.wav [rate]` — drop the
rate to 8000 for extra-crusty radio chatter.

## Game integration (already wired, see game.js)

`playVoice(id, gain, cooldownSec)` decodes + caches the data-URL through the
game's WebAudio context. Current triggers: dealer shop open / no-cash /
purchase, clerk greet / rob / panic, cop barks in copShoot (freeze/stop at
wanted 2-3, "open fire" at 4+). Every new line needs: manifest entry →
regenerate pack → playVoice call at the trigger site → bump GAME_VERSION.
