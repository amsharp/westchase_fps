#!/bin/bash
# Generate PSX vehicle seed images for every roster.json vehicle without one
# (work/seed_<NAME>.png). Bodies are painted SATURATED MEDIUM BLUE on purpose:
# the game recolors the body hue at runtime for per-car color variations, and
# a saturated hue is easy to mask (silver/gray is not). 3 concurrent.
#   OPENAI_API_KEY=... ./vehseeds.sh
set -uo pipefail
cd "$(dirname "$0")"
[ -n "${OPENAI_API_KEY:-}" ] || { echo "set OPENAI_API_KEY" >&2; exit 1; }
mkdir -p work

gen_one() {
  NAME="$1"; DESC="$2"
  # style-anchored on style_ref_car.png (GGBot PSX car render) — the
  # reference contributes ONLY art style; the description sets the vehicle
  PROMPT="Create this vehicle as a retro PS1 / PSX low-poly game model: $DESC. IMPORTANT: this is a COMPLETELY DIFFERENT vehicle from the one in the attached reference image - keep the described body type and era; from the reference copy ONLY the art style: the same extremely chunky low-poly geometry made of visibly flat angular facets, the same grainy low-resolution pixelated 256x256-style painted texture with painted-on door seams, painted-on headlights, painted-on grille, and simple flat dark windows. The vehicle is completely generic with NO brand logos, NO badges, NO license plate text. Body paint: the SAME bright saturated medium blue as the reference vehicle - do NOT change the paint color, every vehicle in this set is the same bright blue. View: three-quarter front-left view showing the front and the left side, whole vehicle fully in frame, plain white background, flat even lighting with no shadows. It must look like it was ripped straight from a 1997 PlayStation game: blocky, faceted, pixelated, NOT smooth, NOT rounded, NOT modern-render clean."
  RESP=$(mktemp)
  curl -sS https://api.openai.com/v1/images/edits \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -F "model=gpt-image-1" \
    -F "image[]=@style_ref_car.png" \
    -F "prompt=$PROMPT" \
    -F "size=1536x1024" \
    -F "quality=high" > "$RESP"
  node -e "
const r=JSON.parse(require('fs').readFileSync('$RESP','utf8'));
if(!r.data){console.error('API error $NAME:',JSON.stringify(r).slice(0,300));process.exit(1);}
require('fs').writeFileSync('work/seed_$NAME.png',Buffer.from(r.data[0].b64_json,'base64'));
"
  rm -f "$RESP"
}

node -e "
const r=require('./roster.json');
for(const n in r.vehicles)console.log(n+'\t'+r.vehicles[n]);
" | while IFS=$'\t' read -r NAME DESC; do
  [ -f "work/seed_$NAME.png" ] && continue
  while [ "$(jobs -r | wc -l)" -ge 3 ]; do wait -n; done
  ( gen_one "$NAME" "$DESC" && echo "ok $NAME" || echo "FAIL $NAME" ) &
done
wait
echo VEHSEEDSDONE
