#!/usr/bin/env bash
# Dogfood: lint the compiler's OWN VL source with `vl check` — `vl` polices the
# code it's compiled from (the kill-TS endgame). Gated at `info`, so a
# `prefer-const` opportunity, an unused binding/function, or any warning/error in
# our source fails CI.
#
# The compiler is a CONCATENATION (the sed-rename + cat assembly that
# refresh-compiler.sh / native-fixpoint.sh use), so we lint the WHOLE assembled
# program as one unit rather than per file: the driver and cli.vl reference
# globals from across the assembly and don't type-check standalone, and a
# whole-program pass keeps cross-file reassignments visible (so `prefer-const`
# doesn't false-positive on an exported global the driver rebinds). `std/` is
# linted as ordinary modules. `tests/` — the corpus of deliberately-malformed
# fixtures — is excluded by construction (never assembled, never passed in).
#
# A failure prints positions against the assembled file; to get source-file
# positions while developing, run `vl check <file.vl>` (or `vl check compiler/`).
#
# fmt is NOT gated here yet — `vl fmt` needs a hardening pass first (wrapped
# object-literal indentation); add `vl fmt --check` here once that lands.
set -euo pipefail
cd "$(dirname "$0")/.."

VL="${VL:-scripts/vl-host/target/release/vl}"
[ -x "$VL" ] || { echo "missing vl binary: $VL (cd scripts/vl-host && cargo build --release)"; exit 1; }
[ -f build/vl-compiler.wasm ] || { echo "missing seed: build/vl-compiler.wasm (scripts/refresh-compiler.sh)"; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Same assembly as the fixpoint scripts (lexer Tok/Diag/advance de-collision).
sed -E 's/\bTok\b/LexTok/g; s/\bDiag\b/LexDiag/g; s/\badvance\b/lexAdvance/g' \
  compiler/lexer.vl > "$WORK/self.vl"
cat compiler/ast.vl compiler/parser.vl compiler/typecheck.vl compiler/wasmEmit.vl \
  compiler/lint.vl compiler/format.vl scripts/vl-compiler-driver.vl compiler/cli.vl >> "$WORK/self.vl"
# Blank the compiler's own import statements (range-aware; multi-line imports), so
# the single-file check doesn't chase `./ast` against the temp dir.
sed -i -E '/^import \{/,/\} from "/ s/.*//' "$WORK/self.vl"

echo "== self-lint: the assembled compiler =="
"$VL" check "$WORK/self.vl" --severity info

echo "== self-lint: std/ =="
"$VL" check std/ --severity info

echo "self-lint clean ✅"
