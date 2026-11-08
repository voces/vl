#!/bin/bash
# The box-destination shadow over the sweep population (box_dst_shadow.vl).
#
#   scripts/box-dst-shadow/run.sh [--seed S] [--out F] [--read]
#
# Builds a probe compiler from a copy of compiler/ (probe.sh: the shadow armed, every
# emitUnionBoxArg / emitUnionCoerce / emitUnionBoxAtRecord call tagged with its function and line),
# runs `vl check --batch --codegen` over `sweep.vl list` with `$VL_LATE_DEMANDS=1`, and writes one
# `<file>\t<class> | <helper> | site <union> | record <union> | pos <fn>:<line>` row per delivery
# to F (default box-dst-shadow.tsv). Prints the top-level rows that are not an agreement, by
# class, position and both unions, with a witness and a count. A position the table serves prints
# its `table` count and its floors; a floor floors.tsv does not list fails the run. Run from the
# checkout root.
set -euo pipefail
R="$PWD"; VL="${VL:-$R/scripts/vl-host/target/release/vl}"; SEED="$R/build/vl-compiler.wasm"
OUT=box-dst-shadow.tsv; JOBS="${JOBS:-4}"; READ=""
while [ $# -gt 0 ]; do
  case "$1" in --seed) SEED="$2"; shift 2 ;; --out) OUT="$2"; shift 2 ;; --read) READ=1; shift ;;
    *) echo "usage: $0 [--seed S] [--out F] [--read]"; exit 2 ;; esac
done
T="$(mktemp -d "${TMPDIR:-/tmp}/box-dst-shadow.XXXXXX")"
trap 'rm -rf "${T:?}"' EXIT
mkdir -p "$T/tree" && echo '{}' > "$T/tree/deno.json" && cp -r "$R/compiler" "$T/tree/compiler"
cat >> "$T/tree/compiler/emit_elab.vl" <<'X'

export function elabShadowNote(s: string): i32 {
  elabLateNames.push(s)
  0
}
X
"$R/scripts/box-dst-shadow/probe.sh" "$T/tree/compiler"
(cd "$T/tree" && VL_STD="$R/std" timeout 900 "$VL" build compiler/entry.vl --compiler "$SEED" \
  -o "$T/probe.wasm" > /dev/null)
"$VL" run scripts/sweep.vl -- list | cut -f2 | split -l 100 - "$T/c."
export R VL T
ls "$T"/c.* | xargs -P "$JOBS" -I{} sh -c 'VL_LATE_DEMANDS=1 VL_STD="$R/std" timeout 600 "$VL" check \
  --batch --json --codegen $(cat {}) --compiler "$T/probe.wasm" 2>&1 >/dev/null \
  | grep "demand bds" > {}.out || true'
cat "$T"/c.*.out | sed 's/^\[late\] //; s/: demand bds /\t/' > "$OUT"
echo "$(wc -l < "$OUT") deliveries in $OUT"
awk -F'\t' '$2 !~ /^nested/ && $2 !~ /^(agree|value already|value never|table|floor:|atom |arm )/ {
  n = split($2, a, " [|] "); p = a[n]; sub(/^pos /, "", p)
  k = a[1] " | " p " | " a[3] " | " a[4]; c[k]++; if (!(k in w)) w[k] = $1 }
  END { for (k in c) print c[k] "\t" k "\t" w[k] }' "$OUT" | sort -t$'\t' -k2
# The read side: each atom-to-string decode and narrowed-arm unbox against its source or arm
# record, by family, class and position, with a witness; `--read` prints the unions or heaps too.
awk -F'\t' -v D="$READ" '$2 ~ /^(atom|arm) / {
  n = split($2, a, " [|] "); p = a[n]; sub(/^pos /, "", p)
  k = a[1] " | " p; if (D != "") k = k " | " a[2] " | " a[3]; c[k]++; if (!(k in w)) w[k] = $1 }
  END { for (k in c) print "read\t" c[k] "\t" k "\t" w[k] }' "$OUT" | sort -t$'\t' -k3
# A position the table serves (`emitUnionBoxOwed`, `armClose`) is graded by the sweep, not here: its
# rows are `table` or a named floor, and a floor that floors.tsv does not list for its position fails.
awk -F'\t' -v L="$R/scripts/box-dst-shadow/floors.tsv" '
  BEGIN { while ((getline l < L) > 0) if (l !~ /^#/ && l != "") ok[l] = 1 }
  $2 ~ /^(arm )?(table|floor:)/ {
    n = split($2, a, " [|] "); p = a[n]; sub(/^pos (floor@)?/, "", p); sub(/:[0-9]+$/, "", p)
    if (a[1] ~ /table$/) { t[p (a[1] ~ /^arm/ ? " (arm)" : "")]++; next }
    k = p "\t" a[1]; f[k]++; if (!(k in w)) w[k] = $1 }
  END {
    for (p in t) print "table\t" t[p] "\t" p
    for (k in f) { seen[k] = 1; print (k in ok ? "floor" : "UNLISTED") "\t" f[k] "\t" k "\t" w[k]; if (!(k in ok)) bad = 1 }
    for (k in ok) if (!(k in seen)) print "unseen floor\t0\t" k
    exit bad }' "$OUT" | sort -t$'\t' -k3
