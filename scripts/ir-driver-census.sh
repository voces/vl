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
# Each row: `file:function`, hits claiming off, hits claiming on, the claiming-on hits split by
# where legacy was emitting (a user function, the start body, a module pass), static call sites
# in compiler/. A row hit off and not on is a candidate: on this population every function
# reaching it is claimed; a row whose on hits are all `start` is a stage-1 row. That is evidence, not proof; a deletion still needs every caller to be an arm the IR
# fully replaces. Run from the checkout root; $VL names the host, $JOBS the fan-out (default 4).
set -euo pipefail
SEED=${1:?usage: scripts/ir-driver-census.sh <seed> [out.tsv]}
OUT=${2:-/dev/stdout}
VL=${VL:-$PWD/scripts/vl-host/target/release/vl}
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
# A hit's context: a user function (`emitCurFnIx` set, mirrored at each assignment below), the
# start body (inside the wrapper below), or a module pass. Each name has three counters, at
# `3 * id + context`.
{
  echo 'export const DRV_NAMES: string[] = ['
  sed 's/.*/  "&",/' "$T/names"
  echo ']'
  echo 'export const DRV_CTX: string[] = ["fn", "start", "module"]'
  echo 'export let drvHits: i32[] = []'
  echo 'export let drvStart = 0'
  echo 'export let drvFn = -1'
  echo 'export function drvFnSet(f: i32) {'
  echo '  drvFn = f'
  echo '  return 0'
  echo '}'
  echo 'export function drvStartSet(on: i32) {'
  echo '  drvStart = on'
  echo '  return 0'
  echo '}'
  echo 'export function dh(i: i32) {'
  echo '  const c = if drvFn >= 0 { 0 } else if drvStart == 1 { 1 } else { 2 }'
  echo '  const k = 3 * i + c'
  echo '  while drvHits.length <= k { drvHits.push(0) }'
  echo '  drvHits[k] = drvHits[k] + 1'
  echo '  return 0'
  echo '}'
} > "$T/probe/drv_probe.vl"
# The start body runs inside a wrapper that marks its context.
awk '
  /^ *emitCurFnIx = / { print; m = $0; sub(/emitCurFnIx = .*/, "", m); print m "drvFnSet(emitCurFnIx)"; next }
  /^function emitStartBodyCode\(out: u8\[\], k: i32\) \{$/ {
    print "function emitStartBodyCode(out: u8[], k: i32) {"
    print "  drvStartSet(1)"
    print "  const r = emitStartBodyCode0(out, k)"
    print "  drvStartSet(0)"
    print "  return r"
    print "}"
    print "function emitStartBodyCode0(out: u8[], k: i32) {"
    hit = 1; next
  }
  { print }
  END { if (!hit) { print "ir-driver-census: emitStartBodyCode not found" > "/dev/stderr"; exit 1 } }
' "$T/probe/emit_sections.vl" > "$T/es.vl"
{ echo 'import { drvFnSet, drvStartSet } from "./drv_probe"'; cat "$T/es.vl"; } > "$T/probe/emit_sections.vl"
# Flush the counts into the shadow's rows, which the host prints as `[ir]` lines.
awk '
  /^export function irShadowRowCount\(\) \{ return ibRowKey.length \}$/ {
    print "export function irShadowRowCount() {"
    print "  let i = 0"
    print "  while i < drvHits.length {"
    print "    if drvHits[i] > 0 {"
    print "      ibRowKey.push(\"drv \" + DRV_CTX[i % 3] + \" \" + DRV_NAMES[i / 3])"
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
{ echo 'import { DRV_CTX, DRV_NAMES, drvHits } from "./drv_probe"'; cat "$T/ir_build.vl"; } > "$T/probe/ir_build.vl"
"$VL" build "$T/probe/entry.vl" -o "$T/probe.wasm" --compiler "$SEED" > /dev/null

# One mode's `drv` rows over the self-compile and the corpus, summed per context and function.
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

# The hits of `file:function` $1 in context $2 (empty for all) from mode file $3.
hits() {
  awk -F'\t' -v k="$1" -v c="$2" '{ split($1, p, " ") }
    p[2] == k && (c == "" || p[1] == c) { n += $2 } END { print n + 0 }' "$3"
}

# The static call sites of each name in compiler/, its definition excluded.
cat compiler/*.vl > "$T/all.vl"
{
  printf 'function\thits_claim_off\thits_claim_on\ton_fn\ton_start\ton_module\tstatic_callers\n'
  while read -r key; do
    name=${key#*:}
    c=$(grep -oE "(^|[^A-Za-z0-9_.])$name\(" "$T/all.vl" | wc -l)
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$key" "$(hits "$key" "" "$T/hits1")" \
      "$(hits "$key" "" "$T/hits5")" "$(hits "$key" fn "$T/hits5")" \
      "$(hits "$key" start "$T/hits5")" "$(hits "$key" module "$T/hits5")" "$((c - 1))"
  done < "$T/names"
} > "$OUT"
