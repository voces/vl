#!/usr/bin/env bash
# Lane self-merge gate: prints LAND-OK <sha> only when the PR head is green, mergeable, and the
# tree master+PR would produce typechecks. Usage: scripts/land-check.sh <pr-number>
set -euo pipefail
pr=$1
root=$(git rev-parse --show-toplevel); cd "$root"
# The host and the seed, from this checkout or, in a worktree that has neither, the main checkout.
main=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
pick() { for r in "$root" "$main"; do [ -e "$r/$1" ] && { echo "$r/$1"; return; }; done; }
vl=$(pick scripts/vl-host/target/release/vl || true)
seed=$(pick build/vl-compiler.wasm || true)
[ -n "$vl" ] && [ -n "$seed" ] || {
  echo "LAND-NO: missing scripts/vl-host/target/release/vl or build/vl-compiler.wasm (in $root or $main)"
  exit 1
}
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
out=$(VL_STD="$d/std" "$vl" check "$d/compiler/entry.vl" --compiler "$seed" 2>&1) || true
if printf '%s\n' "$out" | grep -q "Found 0 errors"; then
  echo "LAND-OK $sha"
else
  echo "LAND-NO: master+PR does not typecheck:"
  # Each error block (its message and source lines, not the warnings), then the summary line.
  printf '%s\n' "$out" | awk '/^\[ERROR\]/ { e = 1 } /^\[WARNING\]/ { e = 0 } e' | head -20 | sed 's/^/  /'
  printf '%s\n' "$out" | grep -E '^Found [0-9]+ error|^Error: ' | tail -2 | sed 's/^/  /'
  exit 1
fi
