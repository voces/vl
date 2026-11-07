#!/usr/bin/env bash
# The return-column shadow (`fnColShadowArm`) over tests/cases and the distilled corpus, sharded.
# Usage: scripts/col-shadow/run.sh <seed.wasm> <out.jsonl> [shards]
# Then: scripts/col-shadow/tally.sh <out.jsonl> ["post settled"]
set -euo pipefail
seed=$1; out=$2; n=${3:-4}
root=$(cd "$(dirname "$0")/../.." && pwd)
list=$(mktemp); trap 'rm -f "$list" "$out".part.*' EXIT
(cd "$root" && find tests/cases scripts/silent-sweep/distilled/cells scripts/silent-sweep/distilled/named -name '*.vl' | sort) > "$list"
pids=()
for ((s = 0; s < n; s++)); do
  (cd "$root" && deno run -A --v8-flags=--stack-size=8000 scripts/col-shadow/worker.ts "$seed" "$list" "$s" "$n" > "$out.part.$s") &
  pids+=($!)
done
for p in "${pids[@]}"; do wait "$p"; done
cat "$out".part.* | sort > "$out"
echo "files $(wc -l < "$list"), graded $(grep -c '"rc":0' "$out")"
