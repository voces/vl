#!/usr/bin/env bash
# The whole first-miss tail of an I8 census directory (census.sh), by owning lane, and the programs
# behind each class: <out-dir>/classes/<slug>.txt holds one `<population>\t<path>` line per program
# with a function or start body missing on the class; <out-dir>/classes/index.tsv holds one row per
# class, `<lane>\t<rows>\t<distinct functions>\t<start bodies>\t<programs>\t<slug>\t<class>`, where
# rows = functions + start bodies, counted as summary.sh counts them and summed over populations;
# a module-level `claim fell back` (no function row holds it) counts one row for its program.
# The lane is red.sh's owner (family.awk over owners.tsv). A witness path is written from `wit/`
# on, since each census regenerates the witnesses.
# Feed one list back as `CENSUS_CLASS=<file> scripts/ir-i8-census/census.sh <seed> <out>`.
#
#     scripts/ir-i8-census/class-programs.sh <out-dir> [top]     # top: the first <top> rows only
set -euo pipefail
OUT=${1:?usage: scripts/ir-i8-census/class-programs.sh <out-dir> [top]}
TOP=${2:-0}
mkdir -p "$OUT/classes"
rm -f "$OUT"/classes/*.txt "$OUT/classes/index.tsv"
for pop in self distilled cases probes witnesses scripts; do
  [ -f "$OUT/$pop.rows" ] && awk -F'\t' -v pop="$pop" '{ print pop "\t" $0 }' "$OUT/$pop.rows"
done | awk -F'\t' -v out="$OUT/classes" -v owners="$(dirname "$0")/owners.tsv" "$(cat "$(dirname "$0")/family.awk")"'
  BEGIN { famLoad(owners) }
  function key(f, nm) { return (nm ~ /\$m/) ? nm : f "::" nm }
  function slug(s,   t) { t = tolower(s); gsub(/\+/, " plus ", t); gsub(/[^a-z0-9]+/, "-", t); gsub(/^-|-$/, "", t); return substr(t, 1, 60) }
  function norm(w) {
    sub(/^read of [A-Za-z0-9_$]+$/, "read of <name>", w)
    sub(/^claim fell back: .*list delivery.*/, "claim fell back: list delivery", w)
    return w
  }
  # A refusal a claim met is held by the `fnr` or `fnu` row of its unit; `fnr` is no class.
  $4 ~ /^claim fell back: [a-z ]*a legacy helper refused in `/ && $4 !~ /^claim fell back: const cell / { next }
  $4 ~ /^claim fell back/ { f = $2; j = index(f, "/wit/"); if (j) f = substr(f, j + 1); fb[$1 "\t" f, norm($4)] = 1; next }
  $4 ~ /^fnu / {
    r = substr($4, 5); i = index(r, " | "); nm = substr(r, 1, i - 1); why = norm(substr(r, i + 3))
    f = $2; j = index(f, "/wit/"); if (j) f = substr(f, j + 1)
    if (why ~ /^claim fell back/) held[$1 "\t" f, why] = 1
    if (nm ~ /^@/) st[why] += $3
    else { k = $1 SUBSEP key(f, nm); if (!(k in seen)) { seen[k] = 1; dist[why]++ } }
    cls[why] = 1
    p = why SUBSEP $1 "\t" f
    if (!(p in prog)) { prog[p] = 1; np[why]++ }
  }
  END {
    for (x in fb) if (!(x in held)) {
      split(x, q, SUBSEP); mod[q[2]]++; cls[q[2]] = 1
      p = q[2] SUBSEP q[1]; if (!(p in prog)) { prog[p] = 1; np[q[2]]++ }
    }
    for (w in cls) printf "%s\t%d\t%d\t%d\t%d\t%s\t%s\n", famOwner(w), dist[w] + st[w] + mod[w], dist[w], st[w], np[w], slug(w), w > (out "/index.unsorted")
    for (p in prog) { split(p, q, SUBSEP); print q[2] > (out "/" slug(q[1]) ".unsorted") }
  }'
sort -t$'\t' -k2,2nr -k7,7 "$OUT/classes/index.unsorted" > "$OUT/classes/index.tsv"
rm "$OUT/classes/index.unsorted"
if [ "$TOP" -gt 0 ]; then
  head -n "$TOP" "$OUT/classes/index.tsv" > "$OUT/classes/index.top" && mv "$OUT/classes/index.top" "$OUT/classes/index.tsv"
fi
cut -f6 "$OUT/classes/index.tsv" | while read -r s; do sort "$OUT/classes/$s.unsorted" > "$OUT/classes/$s.txt"; done
rm -f "$OUT"/classes/*.unsorted
awk -F'\t' '{ n[$1]++; r[$1] += $2; t += $2 } END { for (l in n) printf "%s\t%d classes\t%d rows\n", l, n[l], r[l]; printf "total\t%d classes\t%d rows\n", NR, t }' "$OUT/classes/index.tsv" | sort
