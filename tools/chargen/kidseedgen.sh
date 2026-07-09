#!/bin/bash
# Generate a CHILD PSX T-pose seed with gpt-image-1, style-anchored on
# style_ref.png. Unlike seedgen.sh (adult 6.5-7 heads), this forces believable
# CHILD proportions: bigger head ratio, shorter limbs, small body — a real kid,
# NOT a shrunken adult and NOT an extreme chibi. Review before Meshy (free).
#   OPENAI_API_KEY=... ./kidseedgen.sh out.png "a 7-year-old boy ..." <ageHeadsHint>
set -euo pipefail
cd "$(dirname "$0")"
OUT="$1"; DESC="$2"; HEADS="${3:-5.5}"
[ -n "${OPENAI_API_KEY:-}" ] || { echo "set OPENAI_API_KEY" >&2; exit 1; }
build_prompt() {
  echo "Create this CHILD character as a retro PS1 / PSX low-poly game model: $1. IMPORTANT: this is a COMPLETELY DIFFERENT person from the one in the attached reference image - keep the described child's identity, outfit and hair; from the reference copy ONLY the chunky low-poly art style, NOT the adult body or proportions. Pose and framing: standing in a perfect T-pose, arms straight out horizontally with a clear gap between arms and torso, facing the camera, full body head to feet, plain white background, flat even lighting with no shadows. CHILD PROPORTIONS ARE CRITICAL: this is a real young child about $HEADS heads tall (NOT the adult 7 heads), with a noticeably LARGER head relative to the body (about 18 to 20 percent of total height), SHORTER arms and legs, a small slim child's body, chubbier cheeks and a rounder child face. It must clearly read as a little KID, not a small adult - but do NOT make an extreme bobblehead chibi with a giant head and stubby limbs; keep it a believable real child. Art style: chunky angular low-poly geometry with hard visible triangular facets and blocky silhouette edges (NOT smooth or rounded), crisp low-resolution pixelated textures like a 256x256 game texture, painted-on simple childlike face with plain small eyes (no anime eyes)."
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
