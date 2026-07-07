#!/bin/bash
# Generate seed images for every roster.json character that doesn't have one
# yet (work/seed_<NAME>.png). Run, review the contact sheet, delete bad seeds,
# re-run. 3 concurrent generations.
set -uo pipefail
cd "$(dirname "$0")"
[ -n "${OPENAI_API_KEY:-}" ] || { echo "set OPENAI_API_KEY" >&2; exit 1; }
mkdir -p work
node -e "
const r=require('./roster.json');
const all={...r.civs,...r.cops,...r.roles};
for(const n in all)console.log(n+'\t'+all[n]+'. Show ONE single figure only, from the front. Both arms must be PERFECTLY STRAIGHT and HORIZONTAL at exact shoulder height like a capital letter T, with a clear gap between arms and body');
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
