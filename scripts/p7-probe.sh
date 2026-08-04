#!/usr/bin/env bash
# P7 scratch: build a probe .vl into the scratch dir and disassemble it.
#   p7-probe.sh <src.vl> <outbase>
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
VL="$ROOT/scripts/vl-host/target/release/vl"
SRC="$1"; OUT="$2"
"$VL" build "$SRC" --compiler build/vl-compiler.wasm -o "$OUT.wasm"
echo "BUILD_RC=$?"
wasm-tools print "$OUT.wasm" > "$OUT.wat"
echo "PRINT_RC=$?"
grep -n 'rem_u\|(func (;' "$OUT.wat" | head -40
