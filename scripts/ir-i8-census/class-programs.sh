#!/usr/bin/env bash
# The whole first-miss tail of an I8 census directory (census.sh), by owning lane, and the programs
# behind each class: <out-dir>/classes/<slug>.txt holds one `<population>\t<path>` line per program
# with a function or start body missing on the class; <out-dir>/classes/index.tsv holds one row per
# class, `<lane>\t<rows>\t<distinct functions>\t<start bodies>\t<programs>\t<slug>\t<class>`, where
# rows = functions + start bodies, counted as summary.sh counts them and summed over populations;
# a module-level `claim fell back` (no function row holds it) counts one row for its program.
# Lanes follow the coordinator's ownership list of 2026-11-25 (if joins to COV-CLOS, unions and
# most `??` arms to COV-UNION, the lead-staging family, other start-only classes and orphans to
# CENSUS), by nearest family. A witness path is written from `wit/` on, since each census
# regenerates the witnesses.
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
done | awk -F'\t' -v out="$OUT/classes" '
  function key(f, nm) { return (nm ~ /\$m/) ? nm : f "::" nm }
  function slug(s,   t) { t = tolower(s); gsub(/\+/, " plus ", t); gsub(/[^a-z0-9]+/, "-", t); gsub(/^-|-$/, "", t); return substr(t, 1, 60) }
  function lane(c) {
    if (c ~ /^(short-circuit right operand|short-circuit argument after another|(slice|method|push|store|simd|array spread) short-circuit operand)$/) return "CENSUS"
    if (c ~ /^(read of <name>|closure |capture|callee captures|array spread |for in |map |list |null unit read rep|null unit element|coalesce listGetOr|coalesce mapJoin|coalesce optional mapField|hole closure|tag dispatch lambda|expression if |scalar map|ref if |rep nullable of if|union if |box of a valued if|declaration if per arm coercion)/ || c ~ /list delivery|valued if/) return "COV-CLOS"
    if (c ~ /^(call of a non-declaration|indirect call|intrinsic |bundle parameter read|method |named call|record compare|coalesce optional record field|coalesce boxRuntime|callee signature|short-circuit closure argument|print )/) return "COV-CALL"
    if (c ~ /^(union (compare|cast|staged)|coalesce |optional read|assignment value|store arm)/) return "COV-UNION"
    if (c ~ /^(box |null test |null name test|array null sentinel|is box not a local|is member storage rep|atom tower place|pre-path nul atom niche|narrowed read|claim fell back: verifier)/) return "COV-IS"
    if (c ~ /coercion/ || c ~ /^(widen |void return value|open .* type|parameter rep unsup|operand type)/) return "COV-START"
    if (c ~ /arm unbox|box|^(is |null|tail if |else-less|never |not over a never|identity compare|store null|store of an assignment of null|object field explicitNull|object field nulStrAtom|rep nullable|local rep nullable|nullable|atom |decided is|int switch|operand at null|compare of a joined const atom|string atom)/) return "COV-IS"
    if (c ~ /^(member |shared member|field store|field read|object field|object variant|get index|index |array ref|string operand)/) return "COV-CALL"
    if (c ~ /^(global |rep |list reserve|float literal|unary |operator |string literal|array long|array new|staged literal|local slot|for range|zero-extending|expression as|trap message|returned trap|integer negation|simd |push |assignment target|store element|pre-path |arm site|expression null|tail arm)/) return "COV-START"
    return "CENSUS"
  }
  # A class only start bodies miss on goes to CENSUS unless COV-START owns it or it is a `??` or union
  # class, which COV-UNION takes (coordinator rulings, 2026-11-25): its function owner never meets it.
  function owner(w,   l) {
    l = lane(w)
    if (dist[w] > 0 || st[w] == 0 || l == "COV-START") return l
    if (w ~ /^(coalesce |union |optional read|assignment value|store arm)/) return "COV-UNION"
    return "CENSUS"
  }
  function norm(w) {
    sub(/^read of [A-Za-z0-9_$]+$/, "read of <name>", w)
    sub(/^claim fell back: .*list delivery.*/, "claim fell back: list delivery", w)
    return w
  }
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
    for (w in cls) printf "%s\t%d\t%d\t%d\t%d\t%s\t%s\n", owner(w), dist[w] + st[w] + mod[w], dist[w], st[w], np[w], slug(w), w > (out "/index.unsorted")
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
