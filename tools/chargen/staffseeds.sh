#!/bin/bash
# Generate seed images for every staff_roster.json character lacking one
# (work/seed_<NAME>.png). Review the contact sheet, delete bad seeds, re-run.
# 3 concurrent generations. Mirrors batchseeds.sh but reads staff_roster.json.
set -uo pipefail
cd "$(dirname "$0")"
[ -n "${OPENAI_API_KEY:-}" ] || { echo "set OPENAI_API_KEY" >&2; exit 1; }
mkdir -p work
node -e "
const r=require('./staff_roster.json');
for(const n in r.staff)console.log(n+'\t'+r.staff[n]+'. Show ONE single figure only, from the front. Both arms must be PERFECTLY STRAIGHT and HORIZONTAL at exact shoulder height like a capital letter T, with a clear gap between arms and body');
" | while IFS=$'\t' read -r NAME DESC; do
  [ -f "work/seed_$NAME.png" ] && continue
  while [ "$(jobs -r | wc -l)" -ge 3 ]; do wait -n; done
  (
    ./seedgen.sh "work/seed_$NAME.png" "$DESC" >/dev/null 2>&1 \
      && echo "ok $NAME" || echo "FAIL $NAME"
  ) &
done
wait
echo SEEDSDONE
