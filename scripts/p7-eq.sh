#!/usr/bin/env bash
# Assert base vs new benchmark modules produce identical stdout — the correctness
# fence a timing A/B is meaningless without, since a faster module that computes a
# different answer is not a speedup.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VL="$ROOT/scripts/vl-host/target/release/vl"
W="${P7_WORK:-/tmp/vl-p7-work}"
for b in map-string word-freq set-ops map-i32 str-eq; do
  a="$(taskset -c 2-5 "$VL" run "$W/$b.base.wasm" 2>&1 | md5sum)"
  c="$(taskset -c 2-5 "$VL" run "$W/$b.new.wasm" 2>&1 | md5sum)"
  if [ "$a" = "$c" ]; then echo "$b OUTPUT-EQUAL"; else echo "$b OUTPUT-DIFFERS  base=$a new=$c"; fi
done
