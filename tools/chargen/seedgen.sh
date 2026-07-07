#!/bin/bash
# Generate a PSX T-pose character seed image with gpt-image-1, style-anchored
# on style_ref.png (JashiPSX-style painted character).
#
#   OPENAI_API_KEY=sk-... ./seedgen.sh out.png "a young Black woman with an afro, wearing a bright pink t-shirt with a yellow lightning bolt graphic, ripped denim shorts, white high-tops"
#
# Review the output image BEFORE sending it to Meshy — image review is free,
# Meshy generations are not. Regenerate until the pose is a clean T-pose and
# the style is chunky/low-poly.
set -euo pipefail
cd "$(dirname "$0")"
OUT="$1"; DESC="$2"
[ -n "${OPENAI_API_KEY:-}" ] || { echo "set OPENAI_API_KEY" >&2; exit 1; }
# Prompt rules mirror STYLE.md — update both together. The character
# description leads; the reference contributes ONLY art style + proportions
# (earlier phrasing made the model clone the reference person outright).
build_prompt() {
  echo "Create this character as a retro PS1 / PSX low-poly game model: $1. IMPORTANT: this is a COMPLETELY DIFFERENT person from the one in the attached reference image - keep their described identity, outfit, build and hair; from the reference copy ONLY the art style and the body proportions. Pose and framing: standing in a perfect T-pose, arms straight out horizontally with a clear gap between arms and torso, facing the camera, full body head to feet, plain white background, flat even lighting with no shadows. Proportions: realistic ADULT proportions like the reference - 6.5 to 7 heads tall, small head (about 14 percent of total height), legs about half the total height; absolutely NO chibi, NO toon, NO oversized head, NO cute stylization. Art style: chunky angular low-poly geometry with hard visible triangular facets and blocky silhouette edges (NOT smooth or rounded), crisp low-resolution pixelated textures like a 256x256 game texture, painted-on simple face with plain small eyes (no anime eyes)."
}
RESP=$(mktemp)
curl -sS https://api.openai.com/v1/images/edits \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F "model=gpt-image-1" \
  -F "image[]=@style_ref.png" \
  -F "prompt=$(build_prompt "$DESC")" \
  -F "size=1024x1536" \
  -F "quality=high" > "$RESP"
node -e "
const r=JSON.parse(require('fs').readFileSync('$RESP','utf8'));
if(!r.data){console.error('API error:',JSON.stringify(r).slice(0,400));process.exit(1);}
require('fs').writeFileSync('$OUT',Buffer.from(r.data[0].b64_json,'base64'));
console.log('saved $OUT');
"
rm -f "$RESP"
