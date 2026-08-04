#!/usr/bin/env bash
# P7 scratch: assert base vs new benchmark modules produce identical stdout.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VL="$ROOT/scripts/vl-host/target/release/vl"
W="${P7_WORK:-/tmp/claude-1000/-workspace/2affa9b0-2835-43ff-8cfe-223a7861ce47/scratchpad/p7}"
for b in map-string word-freq set-ops map-i32 str-eq; do
  a="$(taskset -c 2-5 "$VL" run "$W/$b.base.wasm" 2>&1 | md5sum)"
  c="$(taskset -c 2-5 "$VL" run "$W/$b.new.wasm" 2>&1 | md5sum)"
  if [ "$a" = "$c" ]; then echo "$b OUTPUT-EQUAL"; else echo "$b OUTPUT-DIFFERS  base=$a new=$c"; fi
done
