#!/usr/bin/env bash
# After I8 a unit the IR does not claim fails its program, so the census alone is the red list's
# input: one `pop\tprogram\t-` line per program with an unclaimed function or start body, or a
# fallback of its own (the raw row a unit's refusal also leaves is not one). A program that meets
# the refusal it expects (`fnr`) fails by design and is left out. In failing.tsv's shape, for red.sh.
#
#     scripts/ir-i8-census/census-failing.sh <census-out> > <dir>/failing.tsv
set -euo pipefail
CEN=${1:?usage: census-failing.sh <census-out>}
for pop in self distilled cases probes witnesses scripts harness; do
  [ -f "$CEN/$pop.rows" ] || continue
  awk -F'\t' -v pop="$pop" -v w="$CEN/" '
    { p = $1; sub(w, "", p) }
    $3 ~ /^fnr / { expd[p] = 1; next }
    $3 ~ /^claim fell back: [a-z ]*a legacy helper refused in `/ && $3 !~ /^claim fell back: const cell / { next }
    $3 ~ /^(fnu |start uncovered |claim fell back)/ { if (!(p in s)) { s[p] = 1; o[++n] = p } }
    END { for (i = 1; i <= n; i++) if (!(o[i] in expd)) print pop "\t" o[i] "\t-" }
  ' "$CEN/$pop.rows"
done
