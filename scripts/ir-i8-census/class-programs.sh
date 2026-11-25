#!/usr/bin/env bash
# The whole first-miss tail of an I8 census directory (census.sh), by owning lane, and the programs
# behind each class: <out-dir>/classes/<slug>.txt holds one `<population>\t<path>` line per program
# with a function or start body missing on the class; <out-dir>/classes/index.tsv holds one row per
# class, `<lane>\t<rows>\t<distinct functions>\t<start bodies>\t<programs>\t<slug>\t<class>`, where
# rows = functions + start bodies, counted as summary.sh counts them and summed over populations.
# Lanes follow the coordinator's ownership list of 2026-11-25, by nearest family. A witness path
# is written from `wit/` on, since each census regenerates the witnesses. Feed one list back as
# `CENSUS_CLASS=<file> scripts/ir-i8-census/census.sh <seed> <out>`.
#
#     scripts/ir-i8-census/class-programs.sh <out-dir> [top]     # top: the first <top> rows only
set -euo pipefail
OUT=${1:?usage: scripts/ir-i8-census/class-programs.sh <out-dir> [top]}
TOP=${2:-0}
mkdir -p "$OUT/classes"
rm -f "$OUT"/classes/*.txt "$OUT/classes/index.tsv"
for pop in self distilled cases probes witnesses; do
  [ -f "$OUT/$pop.rows" ] && awk -F'\t' -v pop="$pop" '{ print pop "\t" $0 }' "$OUT/$pop.rows"
done | awk -F'\t' -v out="$OUT/classes" '
  function key(f, nm) { return (nm ~ /\$m/) ? nm : f "::" nm }
  function slug(s,   t) { t = tolower(s); gsub(/\+/, " plus ", t); gsub(/[^a-z0-9]+/, "-", t); gsub(/^-|-$/, "", t); return substr(t, 1, 60) }
  function lane(c) {
    if (c ~ /^(read of <name>|closure |capture|callee captures|array spread |for in |map |list |union staged compare operand rep|null unit read rep|null unit element|coalesce listGetOr|coalesce mapJoin|coalesce optional mapField|hole closure|tag dispatch lambda|expression if ref closure|scalar map)/ || c ~ /list delivery/) return "COV-CLOS"
    if (c ~ /^(call of a non-declaration|indirect call|intrinsic |bundle parameter read|method |named call|record compare|coalesce optional record field|coalesce boxRuntime|callee signature|short-circuit closure argument|print )/) return "COV-CALL"
    if (c ~ /^(box |union cast |null test |null name test|array null sentinel|expression if null join|is box not a local|is member storage rep|atom tower place|pre-path nul atom niche|ref if arm rep|declaration if per arm coercion|coalesce nulnone|narrowed read)/) return "COV-IS"
    if (c ~ /coercion/ || c ~ /^(widen |void return value|open .* type|parameter rep unsup|operand type)/) return "COV-START"
    if (c ~ /arm unbox|box|^(is |null|union |coalesce |optional read|expression if |tail if |else-less|never |not over a never|identity compare|store null|store of an assignment of null|store arm|object field explicitNull|object field nulStrAtom|rep nullable|local rep nullable|nullable|assignment value|atom |decided is|int switch|operand at null|compare of a joined const atom|string atom|declaration if per arm|narrowed read|atom tower place|pre-path nul atom niche|ref if )/) return "COV-IS"
    if (c ~ /^(member |shared member|field store|field read|object field|object variant|get index|index |array ref|string operand)/) return "COV-CALL"
    if (c ~ /^(global |rep |list reserve|float literal|unary |operator |string literal|array long|array new|staged literal|local slot|for range|zero-extending|expression as|trap message|returned trap|integer negation|simd |store short-circuit|push |short-circuit |assignment target|store element|pre-path |arm site|expression null|tail arm|claim fell back: operand)/) return "COV-START"
    return "?"
  }
  $4 ~ /^fnu / {
    r = substr($4, 5); i = index(r, " | "); nm = substr(r, 1, i - 1); why = substr(r, i + 3)
    sub(/^read of [A-Za-z0-9_$]+$/, "read of <name>", why)
    sub(/^claim fell back: .*list delivery.*/, "claim fell back: list delivery", why)
    f = $2; j = index(f, "/wit/"); if (j) f = substr(f, j + 1)
    if (nm ~ /^@/) st[why] += $3
    else { k = $1 SUBSEP key(f, nm); if (!(k in seen)) { seen[k] = 1; dist[why]++ } }
    cls[why] = 1
    p = why SUBSEP $1 "\t" f
    if (!(p in prog)) { prog[p] = 1; np[why]++ }
  }
  END {
    for (w in cls) printf "%s\t%d\t%d\t%d\t%d\t%s\t%s\n", lane(w), dist[w] + st[w], dist[w], st[w], np[w], slug(w), w > (out "/index.unsorted")
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
