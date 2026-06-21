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

# Splice the target source in as a VL string literal (Python does the escaping
# so embedded backslashes/quotes/newlines survive intact).
python3 - "$TARGET" "$WORK/asm.vl" <<'PY'
import sys
target, asm = sys.argv[1], sys.argv[2]
src = open(target, "r").read()
lit = '"' + src.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n") + '"'
text = open(asm, "r").read().replace("LINT_SOURCE", lit)
open(asm, "w").write(text)
PY

"$VL" run "$WORK/asm.vl" --compiler "$SEED"
