#!/usr/bin/env bash
# The `ci-native` job's duration on GitHub's runners, sampled one week apart, so
# "it used to be a lot less" is a number rather than a memory. Also prints the
# ci-native STEP breakdown for the oldest and newest sample.
#   scripts/perf/ci-trend.sh [dates...]   (default: six weekly Mondays)
set -u
R=$(gh repo view --json nameWithOwner -q .nameWithOwner)
DATES=("$@")
[ ${#DATES[@]} -gt 0 ] || DATES=(2026-07-30 2026-08-06 2026-08-13 2026-08-20 2026-08-27 2026-09-02)
for d in "${DATES[@]}"; do
  ids=$(gh run list --workflow=CI --branch master --limit 6 \
          --created "$d" --json databaseId -q '.[].databaseId' 2>/dev/null)
  [ -n "$ids" ] || { echo "$d  (no master runs)"; continue; }
  for id in $ids; do
    gh api "/repos/$R/actions/runs/$id/jobs" --jq \
      '.jobs[] | select(.name=="ci-native" and .conclusion=="success") |
       "'"$d"' \(.id) \((.completed_at|fromdate) - (.started_at|fromdate))s"' 2>/dev/null
  done
done
