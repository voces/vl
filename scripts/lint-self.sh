#!/usr/bin/env bash
# Dogfood: lint the compiler's OWN VL source with `vl check` — `vl` polices the
# code it's compiled from (the kill-TS endgame). Gated at `info`, so a
# `prefer-const` opportunity, an unused binding/function, or any warning/error in
# our source fails CI.
#
# The compiler is a real module graph (entry.vl → driver → the pipeline), and a
# single-file `vl check` lints EVERY module of the resolved graph (the
# per-module lint tier), each finding attributed to its own file — so checking
# the entry covers all of compiler/*.vl with source-file positions.
# `prefer-const` stays safe on cross-module reassignment because EXPORTED
# bindings are exempt (another module may rebind them). `std/` is linted as
# ordinary modules. `tests/` — the corpus of deliberately-malformed fixtures —
# is excluded by construction (never passed in).
#
# fmt IS gated here too (below): `vl fmt --check` over the source `.vl`
# (compiler/, std/, scripts/) — only `.vl` files are gathered, so the `.ts`/`.sh`
# alongside scripts/ are ignored. `tests/` is excluded by construction (the
# deliberately-malformed fixture corpus is never fmt-clean and is not source we
# ship). Unlike the lint above, fmt is PER-FILE (it needs no cross-file
# resolution), so the files fan out over the cores (`xargs -P`) — the formatter
# is the dominant cost of this gate and every file is independent — while the
# module-graph check runs concurrently in the background. Same files, same
# checks, same gates as running everything sequentially; only the schedule
# differs.
set -euo pipefail
cd "$(dirname "$0")/.."

VL="${VL:-scripts/vl-host/target/release/vl}"
[ -x "$VL" ] || { echo "missing vl binary: $VL (cd scripts/vl-host && cargo build --release)"; exit 1; }
[ -f build/vl-compiler.wasm ] || { echo "missing seed: build/vl-compiler.wasm (scripts/refresh-compiler.sh)"; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# std/ goes first: it is near-instant AND its module load warms the seed's
# `.cwasm` sidecar, so the parallel workers below all deserialize instead of
# racing to Cranelift-compile (and write the same sidecar) at once.
echo "== self-lint: std/ =="
"$VL" check std/ --severity info

# The compiler is a real module graph — lint it through its entry, so the
# checker resolves `import`/`export` across the modules exactly as a build does.
# Backgrounded across the fmt sweep: it shares no state with fmt (diagnostics
# buffer to a log, replayed below, so output stays unscrambled).
echo "== self-lint: the compiler module graph (concurrent with fmt) =="
"$VL" check compiler/entry.vl --severity info > "$WORK/graph.log" 2>&1 &
GRAPH_PID=$!

# fmt gate: the source tree must be `vl fmt`-clean. `--check` exits non-zero on
# any drift, naming the offending file on stderr; xargs propagates any failure
# (exit 123) and set -e fails the run. tests/ is NOT passed in.
echo "== fmt-check: compiler/ std/ scripts/ (parallel per file) =="
find compiler std scripts -name '*.vl' -print0 \
  | xargs -0 -n 1 -P "$(nproc)" "$VL" fmt --check

echo "== self-lint: the compiler module graph (result) =="
GRAPH_RC=0
wait "$GRAPH_PID" || GRAPH_RC=$?
cat "$WORK/graph.log"
[ "$GRAPH_RC" = 0 ] || exit "$GRAPH_RC"

echo "self-lint + fmt-check clean ✅"
