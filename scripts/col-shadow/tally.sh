#!/usr/bin/env bash
# Sum a col-shadow run's rows by class at one point (default "post settled"), names stripped.
# Usage: scripts/col-shadow/tally.sh <out.jsonl> [point] [--names <class-substring>]
set -euo pipefail
out=$1; at=${2:-post settled}
if [ "${3:-}" = "--names" ]; then
  jq -r --arg at "$at: " --arg c "$4" 'select(.rc==0) | .f as $f | .rows[] | select(startswith($at)) | select(contains($c)) | "\($f)\t\(.)"' "$out"
  exit 0
fi
jq -r --arg at "$at: " 'select(.rc==0) | .rows[] | select(startswith($at))' "$out" \
  | awk -F'\t' '{ k=$1; sub(/ \| .*/, "", k); n[k]+=$2 } END { for (k in n) printf "%7d  %s\n", n[k], k }' | sort -rn
