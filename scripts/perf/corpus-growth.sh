#!/usr/bin/env bash
# What GREW: corpus cases, ci-native test files, `Deno.test` count and compiler
# lines, sampled weekly off master. Counted from the git tree, so it needs no
# build and cannot be contaminated by box load.
#   scripts/perf/corpus-growth.sh [dates...]
set -u
cd "$(dirname "$0")/../.."
DATES=("$@")
[ ${#DATES[@]} -gt 0 ] || DATES=(2026-07-30 2026-08-06 2026-08-13 2026-08-20 2026-08-27 2026-09-03)
printf '%-12s %8s %7s %7s %8s %8s %9s\n' date cases files tests testLOC cLOC stdLOC
for d in "${DATES[@]}"; do
  c=$(git rev-list -1 --before="$d" origin/master 2>/dev/null) || continue
  [ -n "$c" ] || continue
  cases=$(git ls-tree -r --name-only "$c" tests/cases | grep -c '\.vl$')
  files=$(git ls-tree -r --name-only "$c" tests |
            grep -cE 'tests/(selfhost_native_[a-z_]*|vl_[a-z_]*)_test\.ts$')
  tests=0; tloc=0
  for f in $(git ls-tree -r --name-only "$c" tests |
               grep -E 'tests/(selfhost_native_[a-z_]*|vl_[a-z_]*)_test\.ts$'); do
    b=$(git show "$c:$f" 2>/dev/null) || continue
    tests=$((tests + $(printf '%s' "$b" | grep -c 'Deno\.test')))
    tloc=$((tloc + $(printf '%s\n' "$b" | wc -l)))
  done
  cl=0; for f in $(git ls-tree -r --name-only "$c" compiler | grep '\.vl$'); do
    cl=$((cl + $(git show "$c:$f" | wc -l))); done
  sl=0; for f in $(git ls-tree -r --name-only "$c" std | grep '\.vl$'); do
    sl=$((sl + $(git show "$c:$f" | wc -l))); done
  printf '%-12s %8d %7d %7d %8d %8d %9d\n' "$d" "$cases" "$files" "$tests" "$tloc" "$cl" "$sl"
done
