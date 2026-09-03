#!/usr/bin/env bash
# The `ci-native` job's REAL duration on GitHub's runners, per master push, with
# a per-STEP breakdown for the newest run. This is the only measurement of the
# job that is not contaminated by this box's load.
#   scripts/perf/ci-history.sh [n-runs]
set -u
N="${1:-40}"
R=$(gh repo view --json nameWithOwner -q .nameWithOwner)
gh run list --workflow=CI --branch master --limit "$N" \
  --json databaseId,createdAt -q '.[] | "\(.databaseId) \(.createdAt)"' |
while read -r id at; do
  gh api "/repos/$R/actions/runs/$id/jobs" --jq \
    '.jobs[] | select(.name=="ci-native") |
     "'"$at"' \(.conclusion) \((.completed_at|fromdate) - (.started_at|fromdate))s"' 2>/dev/null
done
echo "--- newest master run, per-step seconds (ci-native)"
id=$(gh run list --workflow=CI --branch master --limit 1 --json databaseId -q '.[0].databaseId')
gh api "/repos/$R/actions/runs/$id/jobs" --jq \
  '.jobs[] | select(.name=="ci-native") | .steps[] |
   "\((.completed_at|fromdate) - (.started_at|fromdate))s\t\(.name)"'
