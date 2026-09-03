#!/usr/bin/env bash
# PART C: the cost of ONE module-graph check — what the LSP pays per keystroke,
# since `onDidChangeContent` calls `wasmChecker.check` (whole graph) and then
# `wasmChecker.lint` (a SECOND parse of the file) on every change.
# Three graph sizes: no imports, std-importing, and the compiler's own 26 modules.
#   scripts/perf/module-graph-check.sh [reps]
set -u
cd "$(dirname "$0")/../.."
export VL_STD="$PWD/std"
V=./scripts/vl-host/target/release/vl
R="${1:-3}"
T=$(mktemp -d "${TMPDIR:-/tmp}/b7z-graph.XXXXXX"); trap 'rm -rf "$T"' EXIT
printf 'print(1)\n' > "$T/none.vl"
printf 'import { parseJson } from "std:json"\nimport { fmt } from "std:fmt"\nprint(fmt("{}", [1]))\nprint(parseJson("1") != null)\n' > "$T/std3.vl"
echo "load: $(uptime | sed 's/.*average/avg/')"
row() { local n="$1" f="$2" best=999
  for _ in $(seq "$R"); do
    s=$(date +%s.%N); "$V" check "$f" --compiler build/vl-compiler.wasm >/dev/null 2>&1
    e=$(date +%s.%N); best=$(echo "$e - $s; $best" | bc | sort -g | head -1)
  done
  printf '%-22s modules=%-3s best %7.3f s\n' "$n" "$3" "$best"; }
row "no imports"      "$T/none.vl"        1
row "std:json+std:fmt" "$T/std3.vl"       "4"
row "std/json.vl"     std/json.vl         "3"
row "compiler/entry.vl" compiler/entry.vl "26"
echo "load: $(uptime | sed 's/.*average/avg/')"
