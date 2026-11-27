#!/usr/bin/env bash
# Layer 3's board (one delivery converter, DECISIONS.md "Delivery after I8: four layers"): the units
# of a red list or holdout list whose miss is a rep conversion. A `convert A -> B` miss (irConvert)
# counts under its rep pair; a miss the builder raises right after comparing a value's rep with the
# one it wants (`irBOpRep(v) != rep`, found by scanning compiler/ir_build*.vl at run time) counts as a
# local compare not yet routed through irConvert, as does a class convert-shaped.txt names. Both
# shrink as the converter grows.
#
#     scripts/ir-i8-census/convert-board.sh <red.tsv | holdouts.tsv> [<prev>]
#
# A red.tsv row is `pop program stub unit class owner`, a holdouts.tsv row `program unit class owner`.
set -euo pipefail
IN=${1:?usage: convert-board.sh <red.tsv | holdouts.tsv> [<prev>]}
PREV=${2:-}
[ -n "$PREV" ] && [ -f "$PREV" ] || PREV=/dev/null
T=$(mktemp -d)
trap 'rm -rf "${T:?}"' EXIT
# A miss raised within three lines after a rep compare is convert-shaped.
awk '
  { l[NR % 4] = $0 }
  /(irBMiss|missRhs|skip)\("[^"]+"/ {
    cmp = 0
    for (i = 0; i < 4; i++) if (l[i] ~ /irBOpRep\(/ && l[i] ~ /!=/) cmp = 1
    if (cmp) { m = $0; sub(/.*(irBMiss|missRhs|skip)\("/, "", m); sub(/".*/, "", m); print m }
  }' compiler/ir_build*.vl > "$T/scan"
grep -v '^#' "$(dirname "$0")/convert-shaped.txt" | cat - "$T/scan" | grep . | sort -u > "$T/local"
tally() {
  awk -F'\t' -v side="$2" '
    FILENAME == ARGV[1] { loc[$0] = 1; next }
    /^#/ { next }
    { c = (NF >= 6) ? $5 : $3; if (c == "" || c == "-") next; sub(/: .*/, "", c)
      if (c ~ /^convert .* -> /) print side "\tpair\t" c
      else if (c in loc) print side "\tlocal\t" c }' "$T/local" "$1"
}
{ tally "$IN" c; tally "$PREV" p; } > "$T/rows"
awk -F'\t' '
  function d(x) { return x > 0 ? "+" x : (x < 0 ? x : "0") }
  { n[$1, $2]++; if ($2 == "pair") { k[$3] = 1; pc[$1, $3]++ } }
  END {
    has = ((("p", "pair") in n) || (("p", "local") in n))
    printf "layer 3 (one converter): %d convert-shaped units", n["c", "pair"] + n["c", "local"]
    if (has) printf " (%s)", d(n["c", "pair"] + n["c", "local"] - n["p", "pair"] - n["p", "local"])
    printf "; %d routed through irConvert (`convert A -> B`), %d at a local rep compare\n", n["c", "pair"], n["c", "local"]
    for (x in k) if (pc["c", x] + 0 > 0) printf "  %d\t%s\n", pc["c", x], x | "sort -rn"
  }' "$T/rows"
