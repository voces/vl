#!/usr/bin/env bash
# The NATIVE self-hosting fixpoint — gcc-style stage3 == stage4 with zero
# TS/deno/V8 in the loop. The auditable bootstrap proof:
#
#   stage3 = vl build <compiler source>                       (seeded compiler)
#   stage4 = vl build <compiler source> --compiler stage3     (self-rebuilt compiler)
#   assert stage3 == stage4 byte-for-byte, and stage3 runs a program correctly
#
# Prereqs (each step prints how to produce it if missing):
#   build/vl-compiler.wasm        — the seed (deno run -A scripts/build-compiler-wasm.ts)
#   scripts/vl-host target        — the vl binary (cargo build --release in scripts/vl-host)
#
# Everything PAST the seed is TS-free: the compiler-source assembly below is
# sed/cat, the compiles run the self-hosted compiler under wasmtime. ~6s total.
set -euo pipefail
cd "$(dirname "$0")/.."

VL="${VL:-scripts/vl-host/target/release/vl}"
SEED="${SEED:-build/vl-compiler.wasm}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

[ -x "$VL" ] || { echo "missing vl binary: $VL (cd scripts/vl-host && cargo build --release)"; exit 1; }
[ -f "$SEED" ] || { echo "missing seed: $SEED (deno run -A scripts/build-compiler-wasm.ts)"; exit 1; }

# X = the compiler's own source + the single-sourced driver. The lexer rename is
# the same Tok/Diag/advance de-collision glue the whole self-host suite applies.
sed -E 's/\bTok\b/LexTok/g; s/\bDiag\b/LexDiag/g; s/\badvance\b/lexAdvance/g' \
  compiler/lexer.vl > "$WORK/vlsrc.vl"
cat compiler/ast.vl compiler/parser.vl compiler/typecheck.vl compiler/wasmEmit.vl compiler/lint.vl compiler/format.vl \
  scripts/vl-compiler-driver.vl >> "$WORK/vlsrc.vl"
# BLANK the compiler's own import statements (range-aware — two compiler imports
# span multiple lines): a line-leading `import {` would trip the vl binary's
# module gate and send the fetch loop chasing `./ast` against the temp dir.
# Blanking (not deleting) preserves line numbers; imports are parse no-ops
# contributing zero AST nodes, so the output is byte-identical (verified).
sed -i -E '/^import \{/,/\} from "/ s/.*//' "$WORK/vlsrc.vl"

echo "== stage3: seed compiles the compiler =="
"$VL" build "$WORK/vlsrc.vl" -o "$WORK/stage3.wasm" --compiler "$SEED"

echo "== stage3 sanity: compiles + runs a program =="
printf 'print(6 * 7)\nprint(1 + 2)\n' > "$WORK/hello.vl"
out="$("$VL" run "$WORK/hello.vl" --compiler "$WORK/stage3.wasm")"
[ "$out" = "$(printf '42\n3')" ] || { echo "stage3 misbehaves: $out"; exit 1; }

echo "== stage4: stage3 compiles the compiler =="
"$VL" build "$WORK/vlsrc.vl" -o "$WORK/stage4.wasm" --compiler "$WORK/stage3.wasm"

cmp "$WORK/stage3.wasm" "$WORK/stage4.wasm"
echo "NATIVE FIXPOINT HOLDS: stage3 == stage4 byte-for-byte ($(wc -c < "$WORK/stage3.wasm") bytes)"
