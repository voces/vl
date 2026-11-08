#!/bin/bash
# The box-destination shadow over the sweep population (box_dst_shadow.vl).
#
#   scripts/box-dst-shadow/run.sh [--seed S] [--out F]
#
# Builds a probe compiler from a copy of compiler/ (probe.sh: the shadow armed, every
# emitUnionBoxArg / emitUnionCoerce / emitUnionBoxAtRecord call tagged with its function and line),
# runs `vl check --batch --codegen` over `sweep.vl list` with `$VL_LATE_DEMANDS=1`, and writes one
# `<file>\t<class> | <helper> | site <union> | record <union> | pos <fn>:<line>` row per delivery
# to F (default box-dst-shadow.tsv). Prints the top-level rows that are not an agreement, by
# class, position and both unions, with a witness and a count. Run from the checkout root.
set -euo pipefail
R="$PWD"; VL="${VL:-$R/scripts/vl-host/target/release/vl}"; SEED="$R/build/vl-compiler.wasm"
OUT=box-dst-shadow.tsv; JOBS="${JOBS:-4}"
while [ $# -gt 0 ]; do
  case "$1" in --seed) SEED="$2"; shift 2 ;; --out) OUT="$2"; shift 2 ;; *) echo "usage: $0 [--seed S] [--out F]"; exit 2 ;; esac
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
awk -F'\t' '$2 !~ /^nested/ && $2 !~ /^(agree|value already|value never)/ {
  n = split($2, a, " [|] "); p = a[n]; sub(/^pos /, "", p)
  k = a[1] " | " p " | " a[3] " | " a[4]; c[k]++; if (!(k in w)) w[k] = $1 }
  END { for (k in c) print c[k] "\t" k "\t" w[k] }' "$OUT" | sort -t$'\t' -k2
