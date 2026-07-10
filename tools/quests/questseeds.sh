#!/bin/bash
# Generate gpt-image-1 T-pose seeds for every quest_roster.json char lacking one
# (work/chars/seed_<NAME>.png). Reuses chargen/seedgen.sh (style-anchored PSX
# T-pose). 3 concurrent. Review the contact sheet, delete bad seeds, re-run.
set -uo pipefail
cd "$(dirname "$0")"
HERE="$(pwd)"
[ -n "${OPENAI_API_KEY:-}" ] || { echo "set OPENAI_API_KEY" >&2; exit 1; }
mkdir -p work/chars
node -e "
const r=require('./quest_roster.json').chars;
const T='. Show ONE single figure only, from the front, centered, no second view. Both arms must be PERFECTLY STRAIGHT and HORIZONTAL at exact shoulder height like a capital letter T, with a clear gap between arms and body';
for(const n in r)console.log(n+'\t'+r[n].seed+T);
" | while IFS=$'\t' read -r NAME DESC; do
  [ -f "$HERE/work/chars/seed_$NAME.png" ] && continue
  while [ "$(jobs -r | wc -l)" -ge 3 ]; do wait -n; done
  (
    ../chargen/seedgen.sh "$HERE/work/chars/seed_$NAME.png" "$DESC" >/dev/null 2>&1 \
      && echo "ok $NAME" || echo "FAIL $NAME"
  ) &
done
wait
echo SEEDSDONE
