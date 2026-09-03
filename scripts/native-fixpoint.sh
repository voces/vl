#!/usr/bin/env bash
# The NATIVE self-hosting fixpoint — gcc-style stage3 == stage4 with zero
# TS/deno/V8 in the loop. The auditable bootstrap proof:
#
#   stage3 = vl build compiler/entry.vl                       (seeded compiler)
#   stage4 = vl build compiler/entry.vl --compiler stage3     (self-rebuilt compiler)
#   assert stage3 == stage4 byte-for-byte, and stage3 runs a program correctly
#
# Prereqs (each step prints how to produce it if missing):
#   build/vl-compiler.wasm        — the seed (scripts/fetch-seed.sh, or scripts/refresh-compiler.sh)
#   scripts/vl-host target        — the vl binary (cargo build --release in scripts/vl-host)
#
# The compiler is built from REAL `import`/`export` modules: `compiler/entry.vl`
# re-exports the host ABI under bare names (H-reexport), and the vl host's module
# fetch loop resolves the graph (entry → driver → the pipeline). No sed/cat/rename
# glue — the module system carries the structure. ~6s total.
set -euo pipefail
cd "$(dirname "$0")/.."

VL="${VL:-scripts/vl-host/target/release/vl}"
SEED="${SEED:-build/vl-compiler.wasm}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

[ -x "$VL" ] || { echo "missing vl binary: $VL (cd scripts/vl-host && cargo build --release)"; exit 1; }
[ -f "$SEED" ] || { echo "missing seed: $SEED (scripts/fetch-seed.sh, or scripts/refresh-compiler.sh)"; exit 1; }

echo "== stage3: seed compiles the compiler =="
"$VL" build compiler/entry.vl -o "$WORK/stage3.wasm" --compiler "$SEED"

echo "== stage3 sanity: compiles + runs a program =="
printf 'print(6 * 7)\nprint(1 + 2)\n' > "$WORK/hello.vl"
out="$("$VL" run "$WORK/hello.vl" --compiler "$WORK/stage3.wasm")"
[ "$out" = "$(printf '42\n3')" ] || { echo "stage3 misbehaves: $out"; exit 1; }

# STAGE 4 IS WHERE A COST REGRESSION FIRST SHOWS. Stage 3 runs the OLD compiler, so a
# quadratic pass added to the source leaves it fast; stage 4 is the candidate compiling
# the compiler, and that is the run that hangs (CLAUDE.md, "A COST REGRESSION SHOWS UP
# ONE BOOTSTRAP STEP LATE"; measured 2026-09-02, D1090: 32 s at L1 against 321 s at L2).
# USER time, not wall: the box is shared, and user seconds are the honest column.
echo "== stage4: stage3 compiles the compiler =="
{ time -p "$VL" build compiler/entry.vl -o "$WORK/stage4.wasm" --compiler "$WORK/stage3.wasm"; } \
  2> "$WORK/stage4.time" || { cat "$WORK/stage4.time"; exit 1; }

cmp "$WORK/stage3.wasm" "$WORK/stage4.wasm"
echo "NATIVE FIXPOINT HOLDS: stage3 == stage4 byte-for-byte ($(wc -c < "$WORK/stage3.wasm") bytes)"

# STAGE 4 IS WHERE A COST REGRESSION FIRST SHOWS. Stage 3 runs the OLD compiler, so a
# quadratic pass added to the source leaves it fast; stage 4 is the candidate compiling
# the compiler, and that is the run that hangs (CLAUDE.md, "A COST REGRESSION SHOWS UP
# ONE BOOTSTRAP STEP LATE"; measured 2026-09-02 on D1090, 32 s at L1 against 321 s at
# L2). USER+SYS, not wall: the box is shared, and CPU seconds are the honest column.
# `scripts/self-compile-time.sh` grades the same quantity against a committed baseline.
awk '/^user/{u=$2} /^sys/{s=$2} END{printf "stage4 self-compile CPU %.2fs\nSELF_COMPILE_USER_SECONDS=%.2f\n", u + s, u + s}' \
  "$WORK/stage4.time"
