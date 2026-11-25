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
# Run from copies taken now: a ready-check rebuilding the seed mid-run would otherwise be read
# half-written. The verdict waits on the originals still matching them.
d=$(mktemp -d); trap 'rm -rf "$d"' EXIT
mkdir -p "$d/host"
cp "$vl" "$d/host/vl"
cp "$seed" "$d/host/seed.wasm"
# GitHub answers `unknown` for a minute or two after master moves: ask again, 15 s apart.
for try in 1 2 3 4 5 6; do
  read -r sha state < <(gh api "repos/voces/vl/pulls/$pr" -q '.head.sha + " " + .mergeable_state')
  [ "$state" != unknown ] || [ "$try" = 6 ] && break
  sleep 15
done
bad=$(gh api "repos/voces/vl/commits/$sha/check-runs" --paginate \
  -q '.check_runs[] | select(.status != "completed" or (.conclusion != "success" and .conclusion != "skipped")) | .name')
n=$(gh api "repos/voces/vl/commits/$sha/check-runs" -q '.total_count')
[ "$n" -ge 20 ] || { echo "LAND-NO: only $n check runs on $sha (CI not started or partial)"; exit 1; }
[ -z "$bad" ] || { echo "LAND-NO: checks not green on $sha:"; echo "$bad"; exit 1; }
[ "$state" = clean ] || [ "$state" = unstable ] || { echo "LAND-NO: mergeable_state=$state"; exit 1; }
git fetch -q origin master "refs/pull/$pr/head"
tree=$(git merge-tree --write-tree origin/master "$sha") || { echo "LAND-NO: conflicts with master"; exit 1; }
git archive "$tree" compiler std | tar -x -C "$d"
out=$(VL_STD="$d/std" "$d/host/vl" check "$d/compiler/entry.vl" --compiler "$d/host/seed.wasm" 2>&1) || true
if ! cmp -s "$vl" "$d/host/vl" || ! cmp -s "$seed" "$d/host/seed.wasm"; then
  echo "LAND-RETRY: $seed or $vl changed during the check; re-run"
  exit 2
fi
if printf '%s\n' "$out" | grep -q "Found 0 errors"; then
  echo "LAND-OK $sha"
else
  echo "LAND-NO: master+PR does not typecheck:"
  # Each error block (its message and source lines, not the warnings), then the summary line.
  printf '%s\n' "$out" | awk '/^\[ERROR\]/ { e = 1 } /^\[WARNING\]/ { e = 0 } e' | head -20 | sed 's/^/  /'
  printf '%s\n' "$out" | grep -E '^Found [0-9]+ error|^Error: ' | tail -2 | sed 's/^/  /'
  exit 1
fi
