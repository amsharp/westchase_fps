#!/bin/bash
# Generate CHILD seed images for every kid_roster.json entry lacking one
# (work/seed_<NAME>.png). Younger kids get a smaller heads-tall hint. Review
# the contact sheet, delete adult-proportioned seeds, re-run. 3 concurrent.
set -uo pipefail
cd "$(dirname "$0")"
[ -n "${OPENAI_API_KEY:-}" ] || { echo "set OPENAI_API_KEY" >&2; exit 1; }
mkdir -p work
node -e "
const r=require('./kid_roster.json').kids;
for(const n in r){const k=r[n];const heads=(4.5+k.age*0.14).toFixed(1);console.log(n+'\t'+heads+'\t'+k.seed+'. Show ONE single figure only, from the front. Both arms must be PERFECTLY STRAIGHT and HORIZONTAL at exact shoulder height like a capital letter T, with a clear gap between arms and body');}
" | while IFS=$'\t' read -r NAME HEADS DESC; do
  [ -f "work/seed_$NAME.png" ] && continue
  while [ "$(jobs -r | wc -l)" -ge 3 ]; do wait -n; done
  (
    ./kidseedgen.sh "work/seed_$NAME.png" "$DESC" "$HEADS" >/dev/null 2>&1 \
      && echo "ok $NAME" || echo "FAIL $NAME"
  ) &
done
wait
echo SEEDSDONE
