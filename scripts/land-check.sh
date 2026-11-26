#!/usr/bin/env bash
# Lane self-merge gate: prints LAND-OK <sha> only when the PR head is green, mergeable, and the
# tree master+PR would produce typechecks and, where master's compiler/ moved since the PR's merge
# base, builds and passes the IR shadow rows. Usage: scripts/land-check.sh <pr-number>
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
# The lines of log `$2` matching `$1`, or its tail when none does (a step that died before its rows).
excerpt() { { grep -E "$1" "$2" || tail -n 10 "$2"; } | head -10 | sed 's/^/  /'; }
if printf '%s\n' "$out" | grep -q "Found 0 errors"; then
  # Two PRs green against an older master can still meet in the merged compiler. Where master's
  # compiler/ moved after the PR's merge base, the merged tree's compiler is built with this seed
  # and graded on the cheap IR rows: the shadow over tests/cases and the shadow suite.
  base=$(git merge-base origin/master "$sha")
  if ! git diff --quiet "$base" origin/master -- compiler/; then
    command -v deno > /dev/null || { echo "LAND-NO: deno not found (needed for the IR shadow suite)"; exit 1; }
    # A worktree, since the shadow lists its programs with `git ls-files`; removed on exit.
    t="$d/tree"
    git worktree add -q --detach "$t" "$(git commit-tree "$tree" -p origin/master -m land-check)"
    trap 'git worktree remove --force "$t" 2>/dev/null; rm -rf "$d"' EXIT
    mkdir -p "$t/build" "$t/scripts/vl-host/target/release"
    cp "$d/host/vl" "$t/scripts/vl-host/target/release/vl"
    [ -e "$main/node_modules" ] && ln -s "$main/node_modules" "$t/node_modules"
    if ! (cd "$t" && VL_STD="$t/std" timeout 600 "$d/host/vl" build compiler/entry.vl \
        -o build/vl-compiler.wasm --compiler "$d/host/seed.wasm" > "$d/build.log" 2>&1); then
      echo "LAND-NO: the merged tree's compiler does not build:"; tail -5 "$d/build.log" | sed 's/^/  /'
      exit 1
    fi
    if ! (cd "$t" && VL_STD="$t/std" timeout 900 scripts/vl-host/target/release/vl run \
        scripts/silent-sweep/distilled/ir-shadow.vl --compiler build/vl-compiler.wasm -- \
        --seed build/vl-compiler.wasm --cases --prepost > "$d/shadow.log" 2>&1); then
      echo "LAND-NO: the merged tree's IR shadow over tests/cases reds:"
      excerpt 'rose|fail rule|above' "$d/shadow.log"
      exit 1
    fi
    if ! (cd "$t" && timeout 600 deno test -A --no-check tests/vl_ir_shadow_test.ts > "$d/suite.log" 2>&1); then
      echo "LAND-NO: the merged tree's IR shadow suite reds:"
      excerpt 'FAILED|error: ' "$d/suite.log"
      exit 1
    fi
  fi
  echo "LAND-OK $sha"
else
  echo "LAND-NO: master+PR does not typecheck:"
  # Each error block (its message and source lines, not the warnings), then the summary line.
  printf '%s\n' "$out" | awk '/^\[ERROR\]/ { e = 1 } /^\[WARNING\]/ { e = 0 } e' | head -20 | sed 's/^/  /'
  printf '%s\n' "$out" | grep -E '^Found [0-9]+ error|^Error: ' | tail -2 | sed 's/^/  /'
  exit 1
fi
