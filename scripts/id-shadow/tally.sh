#!/bin/bash
# Tallies a `run.sh --shadow` result: scripts/id-shadow/tally.sh OUT  (reads OUT.rows, OUT.insts).
set -euo pipefail
OUT="$1"
echo "== (a) function-valued reads by kind (summed over programs)"
awk '$2 == "kind" {
  k = $3; for (i = 4; i <= NF; i++) { split($i, kv, "="); s[k, kv[1]] += kv[2] }; ks[k] = 1; p[k]++
} END {
  printf "%-8s %8s %8s %8s %8s %8s %8s\n", "kind", "programs", "reads", "single", "set", "open", "todayset"
  for (k in ks) printf "%-8s %8d %8d %8d %8d %8d %8d\n", k, p[k], s[k, "n"], s[k, "single"], s[k, "set"], s[k, "n"] - s[k, "single"] - s[k, "set"], s[k, "todayset"]
}' "$OUT.rows" | sort
echo
echo "== (b) specialization decisions: today x shadow (tagged)"
awk '$2 == "spec" { n[$3 " " $4 " " $5]++; t++ } END { for (k in n) printf "%7d  %s\n", n[k], k; printf "%7d  total\n", t }' "$OUT.rows" | sort -rn
echo
echo "== (c) joins of function values: position x shadow class x today"
awk '$2 == "join" { n[$3 " " $4 " " $5]++ } END { for (k in n) printf "%7d  %s\n", n[k], k }' "$OUT.rows" | sort -rn
echo
echo "== (e) function-typed slot writes: position x slot set x value/slot/held rep x verdict"
awk '$2 == "slot" { n[$3 " " $4 " " $5 " " $6]++ } END { for (k in n) printf "%7d  %s\n", n[k], k }' "$OUT.rows" | sort -rn
echo
[ -f "$OUT.insts" ] || exit 0
echo "== (d) instance count, mode 1 against mode 2"
awk '{ a += $2; b += $3; if ($2 != $3) { m++; if ($3 > $2) g++; else f++ } } END {
  printf "programs %d  insts mode1 %d  mode2 %d  delta %+d  programs moved %d (grew %d, fell %d)\n", NR, a, b, b - a, m, g, f
}' "$OUT.insts"
awk '$3 > $2 { print "  GREW", $0 }' "$OUT.insts" | head -40
