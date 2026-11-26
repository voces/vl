#!/usr/bin/env bash
# One regeneration of the I8 draft (ir-i8-cutover-2026-11.md §7, §8) on fresh origin/master:
#   scripts/ir-i8-regen.sh [<draft-ref>]        default origin/infra-i8-draft
# Checks out branch infra-i8-draft at origin/master, runs `ir-i8-sweep.sh keep --apply` (one
# commit), replays the draft's hand series onto it, then `ir-i8-rebaseline.sh` and the fuel ledger
# line (one commit). The series is <draft-ref>'s first-parent chain after its `--apply` commit,
# minus merges and its rebaseline commit, so a hand fix is added once, as a commit on the draft.
# A replayed commit that deletes a file master has since edited keeps the deletion; any other
# conflict stops the script (exit 1) with the cherry-pick in progress. Exit 2: apply or rebaseline
# failed. It pushes nothing: the draft's head is updated by `git merge -s ours <old head>` (the tree
# stays this run's), then a plain push. Run from the checkout root of a clean worktree.
set -uo pipefail
DRAFT=${1:-origin/infra-i8-draft}
T=$(mktemp -d)
trap 'rm -rf "${T:?}"' EXIT
export GIT_EDITOR=true
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "ir-i8-regen: the tree is dirty"; exit 2; }
git fetch -q origin master || exit 2
BASE=$(git rev-parse --short=9 origin/master)

# The series, oldest first: stop at the apply commit; skip merges and the rebaseline.
SERIES=()
FOUND=0
while read -r c; do
  s=$(git log -1 --format=%s "$c")
  case "$s" in
    "I8 draft: ir-i8-sweep.sh --apply"*) FOUND=1; break ;;
    "I8 draft: ir-i8-rebaseline.sh"*) continue ;;
  esac
  [ "$(git rev-list --parents -n 1 "$c" | wc -w)" -gt 2 ] && continue
  SERIES=("$c" "${SERIES[@]}")
done < <(git rev-list --first-parent "$DRAFT")
[ "$FOUND" = 1 ] || { echo "ir-i8-regen: no '--apply' commit on $DRAFT's first-parent chain"; exit 2; }

git checkout -q -B infra-i8-draft origin/master || exit 2
scripts/ir-i8-sweep.sh scripts/ir-i8-census/keep --apply --out "$T/apply" > "$T/apply.log" 2>&1 \
  || { echo "ir-i8-regen: --apply failed:"; tail -5 "$T/apply.log"; exit 2; }
git commit -qam "I8 draft: ir-i8-sweep.sh --apply on master $BASE"
echo "ir-i8-regen: applied on $BASE; stubs still called: $(grep -c . "$T/apply/apply-stubs.txt" 2>/dev/null || echo 0)"

for c in "${SERIES[@]}"; do
  if git cherry-pick "$c" > "$T/pick.log" 2>&1; then echo "  ok   $(git log -1 --format=%s)"; continue; fi
  git status --porcelain | awk '$1=="UD"||$1=="DU"||$1=="DD"{print $2}' | xargs -r git rm -q
  if git status --porcelain | grep -q '^\(UU\|AA\|AU\|UA\)'; then
    echo "ir-i8-regen: conflict replaying $(git log -1 --format='%h %s' "$c"):"
    git status --porcelain | grep '^\(UU\|AA\|AU\|UA\)'
    exit 1
  fi
  git cherry-pick --continue > /dev/null && echo "  ok (kept deletion)  $(git log -1 --format=%s)"
done

scripts/ir-i8-rebaseline.sh > "$T/rebase.log" 2>&1 || { echo "ir-i8-regen: rebaseline failed:"; tail -8 "$T/rebase.log"; exit 2; }
grep '^rebaseline: \(fixpoint\|seed size\|self-compile\)' "$T/rebase.log"
FUEL=$(sed -n 's/.*"fuel": *\([0-9]*\).*/\1/p' scripts/self-compile-baseline.json)
printf '%s\t%s\t#10096\tI8 dress rehearsal on master %s: legacy expression emitter deleted (ir-i8-regen.sh); fixpoint seed, VL_FUEL=1\n' \
  "$FUEL" "$(git rev-parse --short=9 HEAD)" "$BASE" >> scripts/self-compile-ledger.txt
git add -A scripts && git commit -qm "I8 draft: ir-i8-rebaseline.sh"
echo "ir-i8-regen: done; to publish: git merge -s ours --allow-unrelated-histories $DRAFT && git push origin HEAD:infra-i8-draft"
