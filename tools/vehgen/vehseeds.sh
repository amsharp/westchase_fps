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
  PROMPT="Retro PS1 / PSX low-poly game model of $DESC. The vehicle is completely generic with NO brand logos, NO badges, NO license plate text. Body paint: saturated medium blue. Windows: simple flat dark gray, no reflections. View: three-quarter front-left view showing the front and the left side, whole vehicle fully in frame, plain white background, flat even lighting with no shadows. Art style: chunky angular low-poly geometry with hard visible triangular facets and blocky silhouette edges (NOT smooth or rounded), crisp low-resolution pixelated painted textures like a 256x256 game texture, painted-on details for door seams, headlights, grille and door handles."
  RESP=$(mktemp)
  curl -sS https://api.openai.com/v1/images/generations \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$(node -e "console.log(JSON.stringify({model:'gpt-image-1',prompt:process.argv[1],size:'1536x1024',quality:'high'}))" "$PROMPT")" > "$RESP"
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
