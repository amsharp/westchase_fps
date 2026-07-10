#!/bin/bash
# gpt-image-1 seeds for the 8 static quest props (work/props/seed_<n>.png).
# Single object, plain white background, PS1 low-poly look (for Meshy img-to-3d).
set -uo pipefail
cd "$(dirname "$0")"
HERE="$(pwd)"
[ -n "${OPENAI_API_KEY:-}" ] || { echo "set OPENAI_API_KEY" >&2; exit 1; }
mkdir -p work/props
STYLE="Retro PS1 / PSX low-poly 3D game asset, chunky angular geometry with visible facets, crisp low-resolution posterized texture, a SINGLE object centered on a plain pure-white background, flat even studio lighting, no shadow, three-quarter view. The object: "
node -e "
const r=require('./quest_props.json').props;
for(const n in r)console.log(n+'\t'+r[n].seed);
" | while IFS=$'\t' read -r NAME DESC; do
  [ -f "$HERE/work/props/seed_$NAME.png" ] && continue
  while [ "$(jobs -r | wc -l)" -ge 3 ]; do wait -n; done
  (
    RESP=$(mktemp)
    BODY=$(S="$STYLE" D="$DESC" node -e "console.log(JSON.stringify({model:'gpt-image-1',prompt:process.env.S+process.env.D,size:'1024x1024',quality:'medium',output_format:'png',n:1}))")
    curl -sS https://api.openai.com/v1/images/generations \
      -H "Authorization: Bearer $OPENAI_API_KEY" -H "Content-Type: application/json" \
      -d "$BODY" > "$RESP"
    node -e "
      const r=JSON.parse(require('fs').readFileSync('$RESP','utf8'));
      if(!r.data){console.error('$NAME API error:',JSON.stringify(r).slice(0,300));process.exit(1);}
      require('fs').writeFileSync('$HERE/work/props/seed_$NAME.png',Buffer.from(r.data[0].b64_json,'base64'));
    " && echo "ok $NAME" || echo "FAIL $NAME"
    rm -f "$RESP"
  ) &
done
wait
echo PROPSEEDSDONE
