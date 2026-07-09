#!/bin/bash
# Generate kid variant atlases from kid_reskins_manifest.json via reskin.js
# (gpt-image-1 layout-preserving edit). Input = work/tex_<BASE>.jpg, output =
# work/<file>. Resumable: skips variants whose output already exists. 3 conc.
set -uo pipefail
cd "$(dirname "$0")"
[ -n "${OPENAI_API_KEY:-}" ] || { echo "set OPENAI_API_KEY" >&2; exit 1; }
node -e "
const m=require('./kid_reskins_manifest.json');
for(const v of m)console.log([v.file,'tex_'+v.base+'.jpg',v.instr].join('\t'));
" | while IFS=$'\t' read -r OUT INTEX INSTR; do
  [ -f "work/$OUT" ] && { echo "skip $OUT"; continue; }
  while [ "$(jobs -r | wc -l)" -ge 3 ]; do wait -n; done
  (
    node reskin.js "work/$INTEX" "work/$OUT" "$INSTR" low >/dev/null 2>&1 \
      && echo "ok $OUT" || echo "FAIL $OUT"
  ) &
done
wait
echo RESKINSDONE
