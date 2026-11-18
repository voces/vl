#!/usr/bin/env bash
# The legacy driver census: which emitter functions every function that reaches them now ships
# from the IR (ir-design-2026-11.md §10, "once every function that reaches a legacy driver is
# claimed, that driver deletes").
#
#     scripts/ir-driver-census.sh <seed> [out.tsv]
#
# A throwaway copy of compiler/ counts the calls into every top-level function of wasmEmit.vl
# and emit_*.vl. It is built with <seed> into a temp dir, never into build/, and builds the
# self-compile and every distilled cell twice: armed with claiming off ($VL_IR_SHADOW=1, legacy
# emits every function) and as shipped ($VL_IR_SHADOW=5, legacy runs only for unclaimed ones).
# Each row: `file:function`, hits claiming off, hits claiming on, static call sites in compiler/.
# A row hit off and not on is a candidate: on this population every function reaching it is
# claimed. That is evidence, not proof; a deletion still needs every caller to be an arm the IR
# fully replaces. Run from the checkout root; $VL names the host, $JOBS the fan-out (default 4).
set -euo pipefail
SEED=${1:?usage: scripts/ir-driver-census.sh <seed> [out.tsv]}
OUT=${2:-/dev/stdout}
VL=${VL:-vl}
JOBS=${JOBS:-4}
T=$(mktemp -d)
trap 'rm -rf "${T:?}"' EXIT
cp -r compiler "$T/probe"

# Instrument: `dh(<id>)` as the first statement of every multi-line top-level function.
n=0
for f in "$T"/probe/wasmEmit.vl "$T"/probe/emit_*.vl; do
  b=$(basename "$f" .vl)
  awk -v base="$b" -v start="$n" -v names="$T/names" '
    BEGIN { id = start; pend = "" }
    {
      if (pend == "" && match($0, /^(export )?function [A-Za-z0-9_]+[ (<]/)) {
        s = $0; sub(/^(export )?function /, "", s); sub(/[ (<].*/, "", s)
        if ($0 ~ /\{$/) { print; print "  dh(" id ")"; print base ":" s >> names; id++; next }
        if ($0 ~ /\}$/) { print; next }
        pend = s; print; next
      }
      if (pend != "" && $0 ~ /\{$/) {
        print; print "  dh(" id ")"; print base ":" pend >> names; id++; pend = ""; next
      }
      print
    }
    END { print id > "/dev/stderr" }
  ' "$f" > "$f.new" 2> "$T/count"
  if [ "$(cat "$T/count")" != "$n" ]; then
    { echo 'import { dh } from "./drv_probe"'; cat "$f.new"; } > "$f"
  fi
  rm -f "$f.new"
  n=$(cat "$T/count")
done
{
  echo 'export const DRV_NAMES: string[] = ['
  sed 's/.*/  "&",/' "$T/names"
  echo ']'
  echo 'export let drvHits: i32[] = []'
  echo 'export function dh(i: i32) {'
  echo '  while drvHits.length <= i { drvHits.push(0) }'
  echo '  drvHits[i] = drvHits[i] + 1'
  echo '  return 0'
  echo '}'
} > "$T/probe/drv_probe.vl"
# Flush the counts into the shadow's rows, which the host prints as `[ir]` lines.
awk '
  /^export function irShadowRowCount\(\) \{ return ibRowKey.length \}$/ {
    print "export function irShadowRowCount() {"
    print "  let i = 0"
    print "  while i < drvHits.length {"
    print "    if drvHits[i] > 0 {"
    print "      ibRowKey.push(\"drv \" + DRV_NAMES[i])"
    print "      ibRowN.push(drvHits[i])"
    print "      drvHits[i] = 0"
    print "    }"
    print "    i = i + 1"
    print "  }"
    print "  return ibRowKey.length"
    print "}"
    hit = 1; next
  }
  { print }
  END { if (!hit) { print "ir-driver-census: irShadowRowCount not found" > "/dev/stderr"; exit 1 } }
' "$T/probe/ir_build.vl" > "$T/ir_build.vl"
{ echo 'import { DRV_NAMES, drvHits } from "./drv_probe"'; cat "$T/ir_build.vl"; } > "$T/probe/ir_build.vl"
"$VL" build "$T/probe/entry.vl" -o "$T/probe.wasm" --compiler "$SEED" > /dev/null

# One mode's `drv` rows over the self-compile and the corpus, summed per function.
run() {
  local mode=$1 dir="$T/m$1"
  mkdir -p "$dir"
  VL_IR_SHADOW=$mode "$VL" build compiler/entry.vl -o "$dir/self.wasm" --compiler "$T/probe.wasm" \
    2> "$dir/self.err" > /dev/null || { echo "ir-driver-census: self-compile failed" >&2; exit 2; }
  ls scripts/silent-sweep/distilled/cells/*.vl scripts/silent-sweep/distilled/named/*.vl \
    | xargs -n 200 -P "$JOBS" sh -c 'VL_IR_SHADOW='"$mode"' "$0" check --codegen --compiler '"$T/probe.wasm"' "$@" > /dev/null 2> '"$dir"'/$$.err || true' "$VL"
  cat "$dir"/*.err | awk -F'\t' '/^\[ir\]/ && $2 ~ /^drv / {
      split($1, a, ": "); k = substr($2, 5); s[k] += a[length(a)]
    } END { for (k in s) print k "\t" s[k] }' | sort > "$T/hits$mode"
}
run 1
run 5

# The static call sites of each name in compiler/, its definition excluded.
cat compiler/*.vl > "$T/all.vl"
{
  printf 'function\thits_claim_off\thits_claim_on\tstatic_callers\n'
  while read -r key; do
    name=${key#*:}
    off=$(awk -F'\t' -v k="$key" '$1 == k { print $2 }' "$T/hits1")
    on=$(awk -F'\t' -v k="$key" '$1 == k { print $2 }' "$T/hits5")
    c=$(grep -oE "(^|[^A-Za-z0-9_.])$name\(" "$T/all.vl" | wc -l)
    printf '%s\t%s\t%s\t%s\n' "$key" "${off:-0}" "${on:-0}" "$((c - 1))"
  done < "$T/names"
} > "$OUT"
