#!/usr/bin/env bash
# The one command a lane runs on the head it will send READY for (docs/internals/lane-brief.md).
#
#     scripts/ready-check.sh [--sweep <path>...]
#
# It refuses a dirty tree (the proof must name a commit), runs `scripts/gate.sh --fast`, then
# what CI does not run on the PR: the armed position sweep (Q58) over each `--sweep` program.
# A sweep program under tests/cases/ is graded by CI's corpus oracle, so it is only checked to be
# committed (Q66) and in run mode (`@run`/`@trap`); any other path is built and run.
# It ends with a block to paste into the READY message, and exits non-zero when any step failed.
# Run it from the checkout root after `scripts/refresh-compiler.sh`.
set -uo pipefail
cd "$(dirname "$0")/.."
VL=${VL:-$PWD/scripts/vl-host/target/release/vl}
SEED=build/vl-compiler.wasm
export VL_STD="${VL_STD:-$PWD/std}" VL_IR_STRICT=1

SWEEP=()
while [ $# -gt 0 ]; do
  case "$1" in
    --sweep) shift; while [ $# -gt 0 ] && [ "${1#--}" = "$1" ]; do SWEEP+=("$1"); shift; done ;;
    *) echo "usage: scripts/ready-check.sh [--sweep <path>...]" >&2; exit 2 ;;
  esac
done

dirty=$(git status --porcelain --untracked-files=no | head -3)
[ -z "$dirty" ] || { echo "ready-check: commit first; the tree differs from HEAD: $(tr '\n' ' ' <<< "$dirty")" >&2; exit 2; }
SHA=$(git rev-parse HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)
BASE=$(git merge-base HEAD origin/master 2>/dev/null) || { echo "ready-check: no merge-base with origin/master; git fetch origin master" >&2; exit 2; }
CHANGED=$(git diff --name-only "$BASE" HEAD)
LOG=$(mktemp -d)
trap 'rm -rf "$LOG"' EXIT
fail=0
LINES=()

# 1. The fast tier, read by its exit code.
echo "== scripts/gate.sh --fast =="
scripts/gate.sh --fast 2>&1 | tee "$LOG/gate"
grc=${PIPESTATUS[0]}
summary=$(grep -E '^(FAST TIER PASSED|GATE FAILED|SEED BUILD FAILED)' "$LOG/gate" | tail -1)
[ "$grc" -eq 0 ] || fail=1
LINES+=("gate.sh --fast: exit $grc (${summary%% —*})")

# 2. The armed position sweep (Q58), when a claim was added or widened.
if [ ${#SWEEP[@]} -gt 0 ]; then
  echo "== Q58 armed position sweep (${#SWEEP[@]} programs) =="
  bad=() other=()
  for p in "${SWEEP[@]}"; do
    if ! git ls-files --error-unmatch "$p" > /dev/null 2>&1; then bad+=("$p (not committed, Q66)")
    elif [ "${p#tests/cases/}" = "$p" ]; then other+=("$p")
    elif ! grep -qE '^\s*// @(run|trap|no-instantiate)\b' "$p"; then
      bad+=("$p is a check-mode case, which the corpus oracle never builds: add @run and its @log lines")
    fi
  done
  if [ ${#other[@]} -gt 0 ]; then
    for p in "${other[@]}"; do
      "$VL" run "$p" --compiler "$SEED" > /dev/null 2> "$LOG/run" || bad+=("$p does not run: $(head -1 "$LOG/run")")
    done
  fi
  for b in "${bad[@]+"${bad[@]}"}"; do echo "  SWEEP RED: $b"; done
  if [ ${#bad[@]} -eq 0 ]; then
    LINES+=("Q58 sweep: ${#SWEEP[@]} programs clean ($(( ${#SWEEP[@]} - ${#other[@]} )) under tests/cases graded by CI, ${#other[@]} built and run): ${SWEEP[*]}")
  else
    fail=1; LINES+=("Q58 sweep: RED, ${#bad[@]} of ${#SWEEP[@]}")
  fi
elif grep -q '^compiler/ir_' <<< "$CHANGED"; then
  LINES+=("Q58 sweep: none given (compiler/ir_* changed; a PR that adds or widens a claim passes --sweep)")
fi

# 3. What a lane must still attach by hand.
if grep -q '^std/.*\.vl$' <<< "$CHANGED" && git diff "$BASE" HEAD -- 'std/*.vl' | grep -qE '^[-+]\s*export '; then
  LINES+=("std exports changed: attach the std-api-reviewer agent's verdict")
fi
# A changelog entry is optional (DECISIONS.md, "Docs and comments are not part of the job").
if grep -qx "changelog.d/$BRANCH.md" <<< "$CHANGED"; then LINES+=("changelog.d/$BRANCH.md: present")
else LINES+=("changelog.d/$BRANCH.md: none (optional)"); fi

echo
echo "== paste into the READY message =="
echo "READY #<pr> $SHA"
printf '%s\n' "${LINES[@]}"
[ "$fail" -eq 0 ] && echo "ready-check: passed" || echo "ready-check: FAILED"
exit "$fail"
