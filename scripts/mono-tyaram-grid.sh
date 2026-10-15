#!/usr/bin/env bash
# The MONOMORPHIZATION type-parameter grid — every constructor a type parameter can sit
# behind, at every position that reaches a different emitter path, over three reps.
#
# WHAT IT IS FOR. `monoSubstAnn` rebuilds a type SPELLING per generic instance, and a
# rebuilt spelling is a second intern key (that function's own header says so). The failure
# it produces is not a diagnostic: the emitter resolves a type-parameter name through the
# NOMINAL path and emits a module wasmtime refuses. (`vl check --codegen` accepted such a
# module when this grid was written; it now validates its output, so the `check=` column
# reads 1 on a BAD cell. The BUCKETS are still decided by `vl run`, so that change moves no
# cell — which is why this grid stays the instrument for the class.)
# Four such holes were closed in #1473/#1475; the corpus contained NONE of them, because
# every corpus generic annotates the shape that hides the bug.
#
# THE SABOTAGE IS PART OF THE TOOL, not a footnote. A grid that reports 0 BAD proves
# nothing until it has been shown to report BAD on a compiler that has the bug. Pass a
# pre-#1475 seed as $2 and the six `par_gaarr_*` / `par_gaargarr_*` cells MUST come back
# BAD; if they do not, the grid has drifted away from the class it exists to cover. An
# earlier version of this grid reported a clean 0 BAD against that same seed — its
# alias-application cells used a SCALAR-bodied alias (`{ v: X }`) where the hole needs an
# ARRAY-bodied one (`{ v: X[] }`), so it was blind to the very bug it was written for.
#
# The constructor list GREW once, and should grow again the same way: the original twelve
# reported 0 BAD while `{[string]: T}` — a map whose VALUE is a type parameter — was
# check-clean invalid wasm and had been since long before the programme. A grid is only ever
# evidence about the cells it contains. When a new hole is found by hand, add its constructor
# here so the next run covers it.
#
# Usage:  scripts/mono-tyaram-grid.sh [OUTDIR] [COMPILER_WASM]
#   OUTDIR         defaults to a mktemp dir
#   COMPILER_WASM  defaults to build/vl-compiler.wasm; pass an older seed to sabotage
#
# Buckets: OK (compiles + runs), REJECT (a loud diagnostic — acceptable), BAD (invalid
# wasm or an out-of-bounds compiler crash). Only BAD is a defect.
set -euo pipefail
cd "$(dirname "$0")/.."
VL="${VL:-scripts/vl-host/target/release/vl}"
OUT="${1:-$(mktemp -d)}"
COMP="${2:-build/vl-compiler.wasm}"
[ -x "$VL" ] || { echo "missing vl binary: $VL" >&2; exit 1; }
mkdir -p "$OUT/cells"

"$VL" run scripts/mono-tyaram-cells.vl -- "$OUT/cells" >&2

: > "$OUT/results.txt"
mkdir -p "$OUT/res"
# Cells are independent, so they run in parallel; each writes its own line to its own file.
export VL COMP OUT
printf '%s\0' "$OUT"/cells/*.vl | xargs -0 -n 1 -P "${JOBS:-4}" bash -c '
  f=$1
  "$VL" check --codegen "$f" --compiler "$COMP" >/dev/null 2>&1 && c=0 || c=$?
  # OK is decided by the EXIT CODE, not by the absence of an "Error:" line: a run the box
  # killed under load prints nothing, matched no pattern and scored OK, so the grid reported
  # a cell as passing that had not run. Seen as 163/98 once against 162/99 twice, same seed.
  out="$("$VL" run "$f" --compiler "$COMP" 2>&1)" && rc=0 || rc=$?
  if printf "%s" "$out" | grep -q "Invalid input WebAssembly\|index outside the bounds"; then k=BAD
  elif [ "$rc" -ne 0 ]; then k=REJECT
  else k=OK; fi
  printf "%s\t%s\tcheck=%s\n" "$k" "$(basename "$f" .vl)" "$c" > "$OUT/res/$(basename "$f" .vl)"' _
cat "$OUT"/res/* >> "$OUT/results.txt"

sort -o "$OUT/results.txt" "$OUT/results.txt"
echo "== mono type-parameter grid ($COMP) =="
cut -f1 "$OUT/results.txt" | sort | uniq -c
if grep -q "^BAD" "$OUT/results.txt"; then
  echo "BAD cells (check-clean invalid wasm / compiler crash):"
  grep "^BAD" "$OUT/results.txt" | sed 's/^/  /'
  exit 1
fi
echo "no BAD cells ✅  (results: $OUT/results.txt)"
