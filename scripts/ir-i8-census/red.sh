#!/usr/bin/env bash
# The I8 red list: every program `ir-i8-sweep.sh` finds newly failing, one row per unit the census
# leaves unclaimed in it, with that unit's class and its owner from the registry (owners.tsv).
#
#     scripts/ir-i8-census/red.sh <census-out> <sweep-out> [--sha <sha>] [--prev <red.tsv>] > red.tsv
#
# <census-out> is census.sh's directory and <sweep-out> is `ir-i8-sweep.sh keep --out`'s, both on
# the same tree. Rows: pop, program, first stub, unit, class, owner; a program with no census row
# gets `-` for unit and class. A class is the miss with any `: detail` dropped, and every fallback
# row is `claim fell back`. The summary line goes to stderr, with deltas against `--prev`.
set -euo pipefail
CEN=${1:?usage: red.sh <census-out> <sweep-out> [--sha <sha>] [--prev <red.tsv>]}
SW=${2:?usage: red.sh <census-out> <sweep-out> [--sha <sha>] [--prev <red.tsv>]}
shift 2
SHA="" PREV=""
while [ $# -gt 0 ]; do
  case "$1" in
    --sha) SHA=$2; shift 2 ;;
    --prev) PREV=$2; shift 2 ;;
    *) echo "red.sh: unknown argument $1" >&2; exit 2 ;;
  esac
done
OWNERS=$(dirname "$0")/owners.tsv
T=$(mktemp -d)
trap 'rm -rf "${T:?}"' EXIT

# Each unclaimed unit, keyed by its program's checkout-relative path (witnesses keep `wit/...`).
cat "$CEN"/*.rows | awk -F'\t' -v w="$CEN/" '$3 ~ /^(fnu |claim fell back)/ {
  p = $1; sub(w, "", p); u = $3; c = $3
  if (u ~ /^fnu /) { sub(/^fnu /, "", u); sub(/ \|.*/, "", u); sub(/^[^|]*\| /, "", c) }
  else { u = "(fallback)"; sub(/^claim fell back: /, "", c) }
  print p "\t" u "\t" c }' | sort -u > "$T/unc"

{
  printf '# I8 red list%s: ir-i8-sweep (keep list) joined with the I8 census on one seed (red.sh).\n' \
    "${SHA:+ on master $SHA}"
  printf '# pop\tprogram\tfirst stub\tunit\tclass\towner\n'
  awk -F'\t' -v OFS='\t' '
    function cls(u, c) { if (u == "(fallback)") return "claim fell back"; sub(/: .*/, "", c); return c }
    FILENAME == ARGV[1] { if ($0 !~ /^#/ && NF >= 2) own[$1] = $2; next }
    FILENAME == ARGV[2] { r[$1] = r[$1] $2 "\t" $3 "\n"; next }
    {
      p = $2; sub(/^\/tmp\/tmp\.[A-Za-z0-9]+\//, "", p)
      n = split(r[p], L, "\n")
      if (n <= 1) { print $1, p, $3, "-", "-", "unowned"; next }
      for (i = 1; i < n; i++) {
        split(L[i], f, "\t"); k = cls(f[1], f[2])
        print $1, p, $3, f[1], f[2], (k in own ? own[k] : "unowned")
      }
    }' "$OWNERS" "$T/unc" "$SW/failing.tsv" | sort
} > "$T/red"
cat "$T/red"

# programs, units, classes; with --prev, each as a delta.
count() {
  awk -F'\t' '!/^#/ { p[$2] = 1; if ($4 != "-") u[$2 "\t" $4] = 1; c = $5; sub(/: .*/, "", c); if (c != "-") k[c] = 1 }
    END { printf "%d %d %d", length(p), length(u), length(k) }' "$1"
}
read -r P U K <<< "$(count "$T/red")"
if [ -n "$PREV" ] && [ -f "$PREV" ]; then
  read -r P0 U0 K0 <<< "$(count "$PREV")"
  printf 'red.sh: %d programs (%+d), %d units (%+d), %d classes (%+d)\n' \
    "$P" $((P - P0)) "$U" $((U - U0)) "$K" $((K - K0)) >&2
else
  printf 'red.sh: %d programs, %d units, %d classes\n' "$P" "$U" "$K" >&2
fi
