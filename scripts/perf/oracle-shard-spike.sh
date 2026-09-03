#!/usr/bin/env bash
# SPIKE: the corpus oracle is ONE test file, so `deno test` runs it in ONE
# process on ONE core — 44 s of the ci-native job's 235 s on GitHub. Shard it
# with `--filter` (a regex over the test NAME, which is the case path) and run
# the shards concurrently: the whole then costs the slowest shard plus one seed
# load, and that gap is what splitting the file into N files would buy.
#   scripts/perf/oracle-shard-spike.sh
set -u
cd "$(dirname "$0")/../.."
T=$(mktemp -d "${TMPDIR:-/tmp}/b7z-shard.XXXXXX"); trap 'rm -rf "$T"' EXIT
echo "load: $(uptime | sed 's/.*average/avg/')"
/usr/bin/time -f "whole-file\twall=%e\tuser=%U\tsys=%S" -o "$T/whole" \
  deno test -A tests/cases_wasm_test.ts > "$T/whole.log" 2>&1
cat "$T/whole"; grep -oE '[0-9]+ passed[^)]*' "$T/whole.log" | tail -1
s=$(date +%s.%N)
i=0
for g in '^[a-c]' '^[d-i]' '^[j-r]' '^[s-z]'; do
  ( /usr/bin/time -f "shard-$i\twall=%e\tuser=%U\tsys=%S" -o "$T/sh$i" \
      deno test -A tests/cases_wasm_test.ts --filter "/$g/" > "$T/sh$i.log" 2>&1 ) &
  i=$((i + 1))
done
wait
printf 'sharded-x4\twall=%.2f\n' "$(echo "$(date +%s.%N) - $s" | bc)"
for j in 0 1 2 3; do
  printf '%s\t%s\n' "$(cat "$T/sh$j")" "$(grep -oE '[0-9]+ passed' "$T/sh$j.log" | tail -1)"
done
echo "load: $(uptime | sed 's/.*average/avg/')"
