#!/usr/bin/env bash
# Per-STEP seconds of a ci-native JOB id (from ci-trend.sh), so the job's growth
# can be attributed to the step that grew rather than to the total.
#   scripts/perf/ci-steps.sh <job-id> [job-id...]
set -u
R=$(gh repo view --json nameWithOwner -q .nameWithOwner)
for j in "$@"; do
  echo "== job $j"
  gh api "/repos/$R/actions/jobs/$j" \
    --jq '.steps[] | "\((.completed_at|fromdate) - (.started_at|fromdate))s\t\(.name)"' \
    | grep -v '^0s'
done
