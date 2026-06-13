#!/usr/bin/env bash
# Assemble compiler/format.vl into a standalone runnable program.
#
# format.vl reuses the native lexer + arena AST + parser (compiler/lexer.vl,
# ast.vl, parser.vl), which are designed for CONCATENATION (the vl binary's
# module gate trips on a line-leading `import {`), so this mirrors the
# sed/cat/blank assembly of scripts/refresh-compiler.sh: rename the lexer's
# `Tok`/`Diag`/`advance` to de-collide with the parser's, concatenate
# ast+parser+format, blank every import line, then append a driver tail.
#
#   build-format.sh DRIVER_TAIL.vl  >  /tmp/fmtprog.vl
#
# The DRIVER_TAIL is a .vl snippet that calls the exported `format(source)` and
# prints the result; the corpus harness generates one per file (embedding the
# file's source as a string literal, since `vl run` exposes no file I/O).
set -euo pipefail
cd "$(dirname "$0")/.."

DRIVER="${1:?usage: build-format.sh DRIVER_TAIL.vl}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

sed -E 's/\bTok\b/LexTok/g; s/\bDiag\b/LexDiag/g; s/\badvance\b/lexAdvance/g' \
  compiler/lexer.vl > "$WORK/p.vl"
cat compiler/ast.vl compiler/parser.vl compiler/format.vl "$DRIVER" >> "$WORK/p.vl"
sed -i -E '/^import \{/,/\} from "/ s/.*//' "$WORK/p.vl"
cat "$WORK/p.vl"
