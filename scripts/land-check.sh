#!/usr/bin/env bash
# Lane self-merge gate: prints LAND-OK <sha> only when the PR head is green, mergeable, and the
# tree master+PR would produce typechecks. Usage: scripts/land-check.sh <pr-number>
set -euo pipefail
pr=$1
root=$(git rev-parse --show-toplevel); cd "$root"
read -r sha state < <(gh api "repos/voces/vl/pulls/$pr" -q '.head.sha + " " + .mergeable_state')
bad=$(gh api "repos/voces/vl/commits/$sha/check-runs" --paginate \
  -q '.check_runs[] | select(.status != "completed" or (.conclusion != "success" and .conclusion != "skipped")) | .name')
n=$(gh api "repos/voces/vl/commits/$sha/check-runs" -q '.total_count')
[ "$n" -ge 20 ] || { echo "LAND-NO: only $n check runs on $sha (CI not started or partial)"; exit 1; }
[ -z "$bad" ] || { echo "LAND-NO: checks not green on $sha:"; echo "$bad"; exit 1; }
[ "$state" = clean ] || [ "$state" = unstable ] || { echo "LAND-NO: mergeable_state=$state"; exit 1; }
git fetch -q origin master "refs/pull/$pr/head"
tree=$(git merge-tree --write-tree origin/master "$sha") || { echo "LAND-NO: conflicts with master"; exit 1; }
d=$(mktemp -d); trap 'rm -rf "$d"' EXIT
git archive "$tree" compiler std | tar -x -C "$d"
if VL_STD="$d/std" scripts/vl-host/target/release/vl check "$d/compiler/entry.vl" \
     --compiler build/vl-compiler.wasm 2>&1 | grep -q "Found 0 errors"; then
  echo "LAND-OK $sha"
else
  echo "LAND-NO: master+PR does not typecheck"; exit 1
fi
