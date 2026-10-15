#!/usr/bin/env bash
# Run the standalone VL lint pass over a single .vl file and print its
# diagnostics in the stable differential format (CODE | LINE:COL | SEV | MSG).
#
# Assembles: lexer (Tok/Diag/advance renamed, like every compiler assembly) +
# ast + parser + lint + the lint harness, with the harness's LINT_SOURCE token
# replaced by the file under test as a VL string literal. Compiles+runs the
# assembly with the seed compiler.
set -euo pipefail
cd "$(dirname "$0")/.."

VL="${VL:-scripts/vl-host/target/release/vl}"
SEED="${SEED:-build/vl-compiler.wasm}"
TARGET="$1"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Assemble the modules (lexer renamed to dodge the parser-facing Tok/Diag).
sed -E 's/\bTok\b/LexTok/g; s/\bDiag\b/LexDiag/g; s/\badvance\b/lexAdvance/g' \
  compiler/lexer.vl > "$WORK/asm.vl"
cat compiler/ast.vl compiler/parser.vl compiler/lint.vl scripts/lint-harness.vl \
  >> "$WORK/asm.vl"
# Blank the module import statements (the vl binary's module gate rejects a
# line-leading `import {`). Handles BOTH a single-line `import { … } from "…"`
# and a `vl fmt`-wrapped multi-line one: accumulate from `import {` until the
# line carrying `from "`, then blank the whole span.
sed -i -E '/^import \{/{:a;/from "/!{N;ba};s/.*//}' "$WORK/asm.vl"

# Splice the target source in as a VL string literal. The harness ends with the one call
# `runLint(LINT_SOURCE)`; that line is replaced by a call carrying the source with `\`, `"`
# and newlines escaped, so embedded backslashes/quotes/newlines survive intact. `sed -z`
# reads the file as one record, so a file with no final newline gets no `\n` added.
CALL='runLint(LINT_SOURCE)'
grep -qxF "$CALL" "$WORK/asm.vl" || { echo "run-lint-diff: harness has no '$CALL' line" >&2; exit 1; }
sed -i -e "/^runLint(LINT_SOURCE)\$/d" "$WORK/asm.vl"
{
  printf 'runLint("'
  sed -z -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\n/\\n/g' "$TARGET"
  printf '")\n'
} >> "$WORK/asm.vl"

"$VL" run "$WORK/asm.vl" --compiler "$SEED"
