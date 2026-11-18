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
# Each row: `file:function`, hits claiming off, hits claiming on, static call sites in compiler/,
# its lines, and the doors still reaching it: under the shipped claim, the blocker classes
# (`$VL_IR_SHADOW=4`) of every unclaimed function whose legacy body hits it, joined, or `@ir` when
# the IR's own build or lowering calls it, `@start` for top-level code. A row hit off and not on
# is a candidate: on this population every function reaching it is claimed. A row whose doors are
# one class is that class's to delete; `<out>.doors` ranks the classes by those lines. Evidence,
# not proof: a deletion still needs every caller to be an arm the IR fully replaces. Run from the
# checkout root; $VL names the host, $JOBS the fan-out (default 4).
set -euo pipefail
SEED=${1:?usage: scripts/ir-driver-census.sh <seed> [out.tsv]}
OUT=${2:-/dev/stdout}
VL=${VL:-vl}
JOBS=${JOBS:-4}
T=$(mktemp -d)
trap '[ -n "${KEEP:-}" ] && echo "kept $T" >&2 || rm -rf "${T:?}"' EXIT
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
# Mode 1 counts each driver's hits; mode 5 also records which tag (the IR, top-level code, no
# function, or a function node) reached each driver, one bit row per tag; mode 4 counts nothing.
{
  echo "const DRV_N = $(wc -l < "$T/names")"
  cat <<'PROBE'
const DRV_W = DRV_N / 32 + 1
let drvCnt: i32[] = []
let drvBits: i32[] = []
let drvTagIx: {[i32]: i32} = Map()
let drvTagList: i32[] = []
let drvInIr = false
let drvFn = -1
let drvStmt = -1
let drvMode = 0
export function drvModeSet(m: i32) {
  drvMode = m
  return 0
}
export function drvIr(b: boolean) {
  drvInIr = b
  return 0
}
export function drvFnSet(x: i32) {
  drvFn = x
  return 0
}
export function drvStmtSet(x: i32) {
  drvStmt = x
  return 0
}
// A hit on driver `i`: its count, and under mode 5 its tag's bit (0 IR, 1 top level, 2 none, 3 + node).
export function dh(i: i32) {
  if drvMode == 4 { return 0 }
  while drvCnt.length < DRV_N { drvCnt.push(0) }
  drvCnt[i] = drvCnt[i] + 1
  if drvMode != 5 { return 0 }
  const tag = if drvInIr { 0 } else if drvStmt >= 0 { 1 } else if drvFn < 0 { 2 } else { 3 + drvFn }
  let d = drvTagIx[tag] ?? -1
  if d < 0 {
    d = drvTagList.length
    drvTagIx[tag] = d
    drvTagList.push(tag)
    let z = 0
    while z < DRV_W {
      drvBits.push(0)
      z = z + 1
    }
  }
  const w = d * DRV_W + i / 32
  drvBits[w] = drvBits[w] | (1 << (i % 32))
  return 0
}
const DRV_DIGITS: string[] = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
function drvItos(n: i32): string {
  if n < 10 { return DRV_DIGITS[n] }
  return drvItos(n / 10) + DRV_DIGITS[n % 10]
}
// The rows since the last flush: `drv <id>` with its count, and `drvf <tag> <id>...` per tag.
export function drvFlush(keys: string[], ns: i32[]) {
  let i = 0
  while i < drvCnt.length {
    if drvCnt[i] > 0 {
      keys.push("drv " + drvItos(i))
      ns.push(drvCnt[i])
    }
    i = i + 1
  }
  let d = 0
  while d < drvTagList.length {
    const tag = drvTagList[d]
    let row = if tag == 0 { "drvf @ir" } else if tag == 1 { "drvf @start" } else if tag == 2 { "drvf @module" } else { "drvf f" + drvItos(tag - 3) }
    let j = 0
    while j < DRV_N {
      if ((drvBits[d * DRV_W + j / 32] >> (j % 32)) & 1) == 1 { row = row + " " + drvItos(j) }
      j = j + 1
    }
    keys.push(row)
    ns.push(0)
    d = d + 1
  }
  drvCnt = []
  drvBits = []
  drvTagIx = Map()
  drvTagList = []
  return 0
}
PROBE
} > "$T/probe/drv_probe.vl"
# The emitter's function and statement cursors, mirrored into the probe beside each assignment.
for f in "$T"/probe/emit_*.vl; do
  if grep -q 'from "./drv_probe"' "$f"; then
    sed -i -E 's/^( *)emitCurFnIx = ([^/]*[^ /])( *\/\/.*)?$/&\n\1drvFnSet(\2)/; s/^( *)emitCurStmtIx = ([^/]*[^ /])( *\/\/.*)?$/&\n\1drvStmtSet(\2)/' "$f"
    sed -i 's/^import { dh } from "\.\/drv_probe"$/import { dh, drvFnSet, drvStmtSet } from ".\/drv_probe"/' "$f"
  fi
done
# Flush the counts into the shadow's rows, which the host prints as `[ir]` lines.
awk '
  /^export function irShadowRowCount\(\) \{ return ibRowKey.length \}$/ {
    print "export function irShadowRowCount() {"
    print "  drvFlush(ibRowKey, ibRowN)"
    print "  return ibRowKey.length"
    print "}"
    hit = 1; next
  }
  /^export function irShadowArm\(on: i32\) \{$/ { print; print "  drvModeSet(on)"; arm = 1; next }
  # What the claim path calls (build and lowering) belongs to the IR, not to a door.
  /^export function irClaimFn\(fnIx: i32, fnPos: i32, out: u8\[\]\): boolean \{$/ {
    print "export function irClaimFn(fnIx: i32, fnPos: i32, out: u8[]): boolean {"
    print "  drvIr(true)"
    print "  const r = irClaimFnGo(fnIx, fnPos, out)"
    print "  drvIr(false)"
    print "  return r"
    print "}"
    print "function irClaimFnGo(fnIx: i32, fnPos: i32, out: u8[]): boolean {"
    claim = 1; next
  }
  # Each function: its blocker set, beside the summed census row.
  /^  count\("blockers " \+ key\)$/ {
    print; print "  count(\"fnb \" + i32ToStr(ibFnIx) + \" \" + key)"; fnb = 1; next
  }
  /^    count\("blockers none"\)$/ {
    print; print "    count(\"fnb \" + i32ToStr(ibFnIx) + \" none\")"; next
  }
  { print }
  END { if (!hit || !claim || !fnb || !arm) { print "ir-driver-census: a probe anchor in ir_build.vl was not found" > "/dev/stderr"; exit 1 } }
' "$T/probe/ir_build.vl" > "$T/ir_build.vl"
{ echo 'import { drvFlush, drvIr, drvModeSet } from "./drv_probe"'; cat "$T/ir_build.vl"; } > "$T/probe/ir_build.vl"
"$VL" build "$T/probe/entry.vl" -o "$T/probe.wasm" --compiler "$SEED" > /dev/null

# One mode's `[ir]` rows over the self-compile and the corpus, condensed as they come: mode 1
# keeps each function's hits, mode 5 its tagged hits, mode 4 each function's blocker set.
cat > "$T/one.sh" <<'ONE'
T=$(dirname "$0")
mode=$1; out=$2; probe=$3; shift 3
if [ "$1" = self ]; then
  VL_IR_SHADOW=$mode "$VL" build compiler/entry.vl -o "$out.wasm" --compiler "$probe" 2>&1 > /dev/null
else
  VL_IR_SHADOW=$mode "$VL" check --codegen --compiler "$probe" "$@" 2>&1 > /dev/null
fi | awk -F'\t' -v mode="$mode" -v names="$T/names" '
  BEGIN { while ((getline l < names) > 0) name[i++] = l }
  /^\[ir\] / {
    h = $1; sub(/^\[ir\] /, "", h); n = h; sub(/.*: /, "", n); sub(/: [0-9]+$/, "", h)
    if ($2 ~ /^drv /) s[name[substr($2, 5)]] += n
    else if (mode == 5 && $2 ~ /^drvf /) print h "\t0\t" $2
    else if (mode == 4 && $2 ~ /^fnb /) print h "\t" n "\t" $2
  }
  END { for (f in s) print "-\t" s[f] "\tdrv " f }
' > "$out"
ONE
run() {
  local mode=$1 dir="$T/m$1"
  mkdir -p "$dir"
  VL="$VL" sh "$T/one.sh" "$mode" "$dir/self" "$T/probe.wasm" self
  [ -s "$dir/self" ] || { echo "ir-driver-census: self-compile gave no rows (mode $mode)" >&2; exit 2; }
  ls scripts/silent-sweep/distilled/cells/*.vl scripts/silent-sweep/distilled/named/*.vl \
    | xargs -n 200 -P "$JOBS" sh -c 'VL="$0" sh '"$T/one.sh $mode $dir"'/$$ '"$T/probe.wasm"' "$@"' "$VL"
  cat "$dir"/* > "$T/rows$1"
  rm -rf "$dir"
}
run 1
run 5
run 4

# Hits per function, claiming off and on.
for m in 1 5; do
  awk -F'\t' '$3 ~ /^drv / { s[substr($3, 5)] += $2 } END { for (f in s) print f "\t" s[f] }' \
    "$T/rows$m" | sort > "$T/hits$m"
done
# Under the shipped claim, the doors reaching each function: every tag's blocker classes, joined.
awk -F'\t' -v names="$T/names" '
  BEGIN { while ((getline l < names) > 0) name[c++] = l }
  FNR == NR { if ($3 ~ /^fnb /) { r = substr($3, 5); i = index(r, " "); set[$1 SUBSEP substr(r, 1, i - 1)] = substr(r, i + 1) }; next }
  $3 ~ /^drvf / {
    m = split($3, k, " "); tag = k[2]
    if (tag ~ /^f[0-9]+$/) {
      b = set[$1 SUBSEP substr(tag, 2)]
      if (b == "") b = "?"
      if (b == "none") b = "@unclaimed covered"
    } else {
      b = tag
    }
    n = split(b, parts, / \+ /)
    for (i = 3; i <= m; i++) for (j = 1; j <= n; j++) d[name[k[i]] SUBSEP parts[j]] = 1
  }
  END { for (x in d) { split(x, y, SUBSEP); print y[1] "\t" y[2] } }
' "$T/rows4" "$T/rows5" | sort -t$'\t' -k1,1 -k2,2 > "$T/doors"

# The static call sites of each name in compiler/, its definition excluded, and its lines.
cat compiler/*.vl > "$T/all.vl"
{
  printf 'function\thits_claim_off\thits_claim_on\tstatic_callers\tlines\tdoors\n'
  while read -r key; do
    base=${key%%:*}
    name=${key#*:}
    off=$(awk -F'\t' -v k="$key" '$1 == k { print $2 }' "$T/hits1")
    on=$(awk -F'\t' -v k="$key" '$1 == k { print $2 }' "$T/hits5")
    c=$(grep -oE "(^|[^A-Za-z0-9_.])$name\(" "$T/all.vl" | wc -l)
    lines=$(awk -v nm="$name" '
      !inside && $0 ~ "^(export )?function " nm "[ (<]" { inside = 1 }
      inside { n++ }
      inside && /^}/ { print n; exit }
    ' "compiler/$base.vl")
    doors=$(awk -F'\t' -v k="$key" '$1 == k { printf "%s%s", (n++ ? " + " : ""), $2 }' "$T/doors")
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$key" "${off:-0}" "${on:-0}" "$((c - 1))" "${lines:-0}" "${doors:--}"
  done < "$T/names"
} > "$T/table"
cat "$T/table" > "$OUT"

# Each door's deletion: the lines of every function hit under the claim whose one door it is.
if [ "$OUT" != /dev/stdout ]; then
  awk -F'\t' 'NR > 1 && $3 > 0 && $6 !~ / \+ / && $6 !~ /^[@?-]/ { l[$6] += $5; n[$6]++ }
    END { for (d in l) print l[d] "\t" n[d] "\t" d }' "$T/table" | sort -rn \
    | { printf 'lines\tfunctions\tdoor\n'; cat; } > "$OUT.doors"
fi
