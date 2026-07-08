#!/bin/bash
# Like seedgen.sh, but for real-person likenesses: takes a PHOTO of the person
# as a second reference so the generated PSX character actually looks like
# them (face, hair, facial hair, glasses, outfit), while style_ref.png still
# anchors the art style and body proportions.
#
#   OPENAI_API_KEY=... ./likeseed.sh work/seed_DON.png work/ref_DON.png \
#     "a man in his late 50s with short graying hair, sunglasses, ..."
#
# Same seed gate as seedgen.sh applies: eyeball the result BEFORE spending
# Meshy credits — regenerate until the pose is a clean T-pose, the style is
# chunky low-poly, AND the person is recognizable.
set -euo pipefail
cd "$(dirname "$0")"
OUT="$1"; PHOTO="$2"; DESC="$3"
[ -n "${OPENAI_API_KEY:-}" ] || { echo "set OPENAI_API_KEY" >&2; exit 1; }
build_prompt() {
  echo "Create a retro PS1 / PSX low-poly game character model of the person shown in the SECOND attached image: $1. IMPORTANT: the character must be clearly recognizable as that person - copy their face shape, hairstyle and hair color, facial hair, eyewear, build, and their exact outfit from the photo. From the FIRST attached image copy ONLY the art style and the body proportions, NOT the person. Pose and framing: standing in a perfect T-pose, arms straight out horizontally with a clear gap between arms and torso, facing the camera, full body head to feet, plain white background, flat even lighting with no shadows. Proportions: realistic ADULT proportions like the first reference - 6.5 to 7 heads tall, small head (about 14 percent of total height), legs about half the total height; absolutely NO chibi, NO toon, NO oversized head, NO cute stylization. Art style: chunky angular low-poly geometry with hard visible triangular facets and blocky silhouette edges (NOT smooth or rounded), crisp low-resolution pixelated textures like a 256x256 game texture, painted-on simple face with plain small eyes (no anime eyes)."
}
RESP=$(mktemp)
curl -sS https://api.openai.com/v1/images/edits \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F "model=gpt-image-1" \
  -F "image[]=@style_ref.png" \
  -F "image[]=@$PHOTO" \
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
