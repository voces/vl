#!/usr/bin/env bash
# The I8 fleet scoreboard: units and classes per owner in a red list (red.sh), as a markdown table,
# with each owner's delta against an earlier red list when one is given. An owner absent from one
# side counts 0 there. A unit is a program's unclaimed function or start body; a class drops `: detail`.
#
#     scripts/ir-i8-census/scoreboard.sh <red.tsv> [<prev red.tsv>]
set -euo pipefail
RED=${1:?usage: scoreboard.sh <red.tsv> [<prev red.tsv>]}
PREV=${2:-}
[ -n "$PREV" ] && [ -f "$PREV" ] || PREV=/dev/null
T=$(mktemp)
trap 'rm -f "$T"' EXIT
awk -F'\t' -v prev="$PREV" '
  function tally(side) {
    if (/^#/ || $4 == "-") return
    if (!((side SUBSEP $2 SUBSEP $4) in u)) { u[side, $2, $4] = 1; n[side, $6]++ }
    c = $5; sub(/: .*/, "", c)
    if (!((side SUBSEP $6 SUBSEP c) in k)) { k[side, $6, c] = 1; m[side, $6]++ }
    own[$6] = 1
  }
  function d(x) { return x > 0 ? "+" x : (x < 0 ? x : "0") }
  FILENAME == prev { tally("p"); next }
  { tally("c") }
  END {
    has = (prev != "/dev/null")
    for (o in own) {
      if (has) printf "%d\t| %s | %d | %s | %d | %s |\n", n["c", o], o, n["c", o], d(n["c", o] - n["p", o]), m["c", o], d(m["c", o] - m["p", o])
      else printf "%d\t| %s | %d | %d |\n", n["c", o], o, n["c", o], m["c", o]
    }
  }' "$PREV" "$RED" | sort -t$'\t' -k1,1nr | cut -f2- > "$T"
if [ "$PREV" = /dev/null ]; then
  printf '| owner | units | classes |\n|---|--:|--:|\n'
else
  printf '| owner | units | Δ | classes | Δ |\n|---|--:|--:|--:|--:|\n'
fi
cat "$T"
