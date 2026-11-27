#!/usr/bin/env bash
# The post-I8 fleet scoreboard: holdouts per owner (scripts/ir-i8-census/holdouts.tsv, one
# `program\tunit\tclass\towner` row per program) as a markdown table, each owner's delta against an
# earlier list when one is given, and with --red, the red list's programs no holdout names (each
# one a CI red after the cutover; this must read 0) and the file holdouts it no longer names. A red row's witness `wit/<inv>/D<id>/w.vl` is
# its holdout's `docs/internals/inventory/D<id>.md`.
#
#     scripts/ir-i8-census/holdouts-board.sh <holdouts.tsv> [<prev>] [--red <red.tsv> [--measured <census programs.txt>]]
set -euo pipefail
HO=${1:?usage: holdouts-board.sh <holdouts.tsv> [<prev holdouts.tsv>] [--red <red.tsv>]}
shift
PREV=/dev/null RED="" MEAS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --red) RED=${2:?--red needs a file}; shift 2 ;;
    --measured) MEAS=${2:?--measured needs a file}; shift 2 ;;
    *) [ -f "$1" ] && PREV=$1; shift ;;
  esac
done
awk -F'\t' -v prev="$PREV" '
  /^#/ || NF < 4 { next }
  FILENAME == prev { p[$4]++; pt++; o[$4] = 1; next }
  { c[$4]++; ct++; o[$4] = 1 }
  function d(x) { return x > 0 ? "+" x : (x < 0 ? x : "0") }
  END {
    has = (prev != "/dev/null")
    print has ? "| owner | holdouts | Δ |" : "| owner | holdouts |"
    print has ? "|---|--:|--:|" : "|---|--:|"
    for (w in o) printf "%d\t%s\n", c[w], has ? sprintf("| %s | %d | %s |", w, c[w], d(c[w] - p[w])) : sprintf("| %s | %d |", w, c[w]) | "sort -t\"\t\" -k1,1nr | cut -f2-"
    close("sort -t\"\t\" -k1,1nr | cut -f2-")
    printf has ? "| **total** | **%d** | **%s** |\n" : "| **total** | **%d** |\n", ct, d(ct - pt)
  }' "$PREV" "$HO"
if [ -n "$RED" ]; then
  awk -F'\t' '
    FILENAME == ARGV[1] { if ($0 !~ /^#/) h[$1] = 1; next }
    /^#/ { next }
    { p = $2; if (match(p, /^wit\/[^\/]+\/D[0-9]+\/w\.vl$/)) { split(p, q, "/"); p = "docs/internals/inventory/" q[3] ".md" }
      if (!(p in h) && !(p in seen)) { seen[p] = 1; n++; miss = miss "\n- " p } }
    END { printf "\nnew failing not in holdouts: %d%s\n", n, miss }' "$HO" "$RED"
  # A holdout the census measured (--measured, its programs.txt) and the red list no longer names
  # runs now; its line is due to go. Any other holdout is not judged here.
  if [ -n "$MEAS" ]; then
    awk -F'\t' '
      function key(p, q, k) { if (match(p, /(^|\/)wit\/[^\/]+\/D[0-9]+\/w\.vl$/)) { k = split(p, q, "/"); return "docs/internals/inventory/" q[k - 1] ".md" } return p }
      FILENAME == ARGV[1] { m[key($0)] = 1; next }
      FILENAME == ARGV[2] { if ($0 !~ /^#/) r[key($2)] = 1; next }
      /^#/ || NF < 4 { next }
      ($1 in m) && !($1 in r) { n++; l = l "\n- " $1 }
      END { printf "holdouts that run now (remove their lines): %d%s\n", n, l }' "$MEAS" "$RED" "$HO"
  fi
fi
