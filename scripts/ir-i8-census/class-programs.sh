#!/usr/bin/env bash
# Writes, for the top first-miss classes of an I8 census directory (census.sh), the programs whose
# functions miss on each class: <out-dir>/classes/<slug>.txt, one `<population>\t<path>` line per
# program, plus <out-dir>/classes/index.tsv (`<slug>\t<distinct functions>\t<programs>\t<class>`).
# Classes rank by distinct functions summed over the populations, as summary.sh counts them.
# A witness path is written from `wit/` on, since each census regenerates the witnesses.
# Feed one list back as `CENSUS_CLASS=<file> scripts/ir-i8-census/census.sh <seed> <out>`.
#
#     scripts/ir-i8-census/class-programs.sh <out-dir> [top]
set -euo pipefail
OUT=${1:?usage: scripts/ir-i8-census/class-programs.sh <out-dir> [top]}
TOP=${2:-15}
mkdir -p "$OUT/classes"
rm -f "$OUT"/classes/*.txt "$OUT/classes/index.tsv"
for pop in self distilled cases probes witnesses; do
  [ -f "$OUT/$pop.rows" ] && awk -F'\t' -v pop="$pop" '{ print pop "\t" $0 }' "$OUT/$pop.rows"
done | awk -F'\t' -v out="$OUT/classes" -v top="$TOP" '
  function key(f, nm) { return (nm ~ /\$m/) ? nm : f "::" nm }
  function slug(s,   t) { t = tolower(s); gsub(/[^a-z0-9]+/, "-", t); gsub(/^-|-$/, "", t); return substr(t, 1, 60) }
  $4 ~ /^fnu / {
    r = substr($4, 5); i = index(r, " | "); nm = substr(r, 1, i - 1); why = substr(r, i + 3)
    sub(/^read of [A-Za-z0-9_$]+$/, "read of <name>", why)
    if (nm ~ /^@/) next
    f = $2; j = index(f, "/wit/"); if (j) f = substr(f, j + 1)
    k = $1 SUBSEP key(f, nm)
    if (!(k in seen)) { seen[k] = 1; dist[why]++ }
    p = why SUBSEP $1 "\t" f
    if (!(p in prog)) { prog[p] = 1; np[why]++ }
  }
  END {
    n = 0
    for (w in dist) { n++; ws[n] = w }
    for (a = 1; a <= n; a++) for (b = a + 1; b <= n; b++)
      if (dist[ws[b]] > dist[ws[a]] || (dist[ws[b]] == dist[ws[a]] && ws[b] < ws[a])) { t = ws[a]; ws[a] = ws[b]; ws[b] = t }
    for (a = 1; a <= n && a <= top; a++) { want[ws[a]] = slug(ws[a]); printf "%s\t%d\t%d\t%s\n", slug(ws[a]), dist[ws[a]], np[ws[a]], ws[a] > (out "/index.tsv") }
    for (p in prog) { split(p, q, SUBSEP); if (q[1] in want) print q[2] > (out "/" want[q[1]] ".unsorted") }
  }'
for f in "$OUT"/classes/*.unsorted; do
  [ -e "$f" ] || continue
  sort "$f" > "${f%.unsorted}.txt"
  rm "$f"
done
cat "$OUT/classes/index.tsv"
