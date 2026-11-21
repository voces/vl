#!/usr/bin/env bash
# Summarises an I8 census directory (census.sh): per population, functions claimed of total per
# file and per distinct function, start bodies (`@start`, `@init`) claimed of total, the first
# misses ranked by the distinct functions they keep, and every `claim fell back` row. `read of
# <name>` is one arm (`identRead`: a name neither local, global nor a function), so it is one class.
#
#     scripts/ir-i8-census/summary.sh <out-dir> [top]
set -euo pipefail
OUT=${1:?usage: scripts/ir-i8-census/summary.sh <out-dir> [top]}
TOP=${2:-25}
for pop in self distilled cases probes witnesses; do
  [ -f "$OUT/$pop.rows" ] || continue
  awk -F'\t' -v pop="$pop" -v top="$TOP" -v progs="$(cat "$OUT/$pop.programs")" '
    function key(f, nm) { return (nm ~ /\$m/) ? nm : f "::" nm }
    { files[$1] = 1 }
    $3 ~ /^fnc @/ { sc++; next }
    $3 ~ /^fnc / { fc++; k = key($1, substr($3, 5)); if (!(k in st)) st[k] = "c"; next }
    $3 ~ /^fnu / {
      r = substr($3, 5); i = index(r, " | "); nm = substr(r, 1, i - 1); why = substr(r, i + 3)
      sub(/^read of [A-Za-z0-9_$]+$/, "read of <name>", why)
      if (nm ~ /^@/) { su++; sm[why]++; next }
      fu++; mf[why]++; k = key($1, nm); st[k] = "u"; dw[k] = why; next
    }
    $3 == "claimed start" { sc += $2; next }
    $3 ~ /^claim fell back/ { fb[$1 ": " $3] += $2; next }
    END {
      for (k in st) { d++; if (st[k] == "c") dc++; else dm[dw[k]]++ }
      nf = 0; for (f in files) nf++
      printf "== %s: %d programs (%d with rows)\n", pop, progs, nf
      printf "functions per file: %d claimed of %d (%.1f%%)\n", fc, fc + fu, (fc + fu) ? 100 * fc / (fc + fu) : 0
      printf "distinct functions: %d claimed of %d (%.1f%%)\n", dc, d, d ? 100 * dc / d : 0
      printf "start bodies: %d claimed of %d\n", sc, sc + su
      cmd = "sort -rn | head -" top
      print "first misses (distinct functions kept, per-file count):"
      for (w in dm) printf "  %6d %6d  %s\n", dm[w], mf[w], w | cmd
      close(cmd)
      print "start misses:"
      for (w in sm) printf "  %6d  %s\n", sm[w], w | "sort -rn | head -10"
      close("sort -rn | head -10")
      for (x in fb) printf "  fell back %d  %s\n", fb[x], x
      print ""
    }' "$OUT/$pop.rows"
done
