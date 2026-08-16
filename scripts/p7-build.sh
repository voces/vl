#!/usr/bin/env bash
# P7 scratch: build the string-hashing-family benchmark modules once.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
VL="$ROOT/scripts/vl-host/target/release/vl"
W="${P7_WORK:-/tmp/vl-p7-work}"
mkdir -p "$W"
TAG="${1:-base}"
for b in collections/map-string collections/word-freq collections/set-ops collections/map-i32 strings/str-eq; do
  n="$(basename "$b")"
  "$VL" build "bench/$b/main.vl" --compiler build/vl-compiler.wasm -o "$W/$n.$TAG.wasm" >/dev/null 2>"$W/$n.$TAG.err"
  rc=$?
  echo "$n rc=$rc bytes=$(stat -c %s "$W/$n.$TAG.wasm" 2>/dev/null)"
done
