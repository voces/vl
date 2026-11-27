#!/usr/bin/env bash
# Decide how much of ci.yml this run has to repeat. Prints one `mode=` line (to
# $GITHUB_OUTPUT when set) and the reason. Every refusal below answers `full`.
#
#   full     run everything.
#   inherit  a same-repository pull_request `synchronize` whose new head is a CLEAN merge of
#            the previous head with a commit of the base branch (what `gh pr update-branch`
#            pushes) that brings no compiler/, std/ or scripts/vl-host/ change since their merge
#            base, and whose previous head's CI run passed with
#            a successful job for every job this tree's ci.yml names (but INHERIT_EXEMPT): a
#            job added since, or one that run skipped, was never proved, so it runs.
#            The run carries that verdict instead of re-running it.
#   tree     a push to master whose commit is the squash of PR N, where N's latest
#            pull_request run on its final head (same repository, every job green, TREE_SKIPS
#            and seed each ran and passed, so not inherited or docs-only) recorded a
#            `tested-tree` equal to THIS commit's tree and the rustc this runner has. ci.yml
#            skips TREE_SKIPS; seed, ci, ci-cost and publish-seed still run.
#
# Env (ci.yml passes the github context): EVENT ACTION REF SHA REPO HEAD_REPO PR_HEAD
# PR_BEFORE PR_BASE; MODES (default "inherit tree"); VERDICT_WAIT, VERDICT_POLL (seconds);
# CI_YML (default .github/workflows/ci.yml), whose top-level jobs an inherited run must have passed.
set -uo pipefail

MODES=${MODES:-inherit tree}
# The jobs no pull_request run starts, so an inherited run needs none of them.
INHERIT_EXEMPT=""
CI_YML=${CI_YML:-.github/workflows/ci.yml}
# The jobs a `tree` verdict skips on master; each must have passed on the PR's run.
TREE_SKIPS="ci-native ci-release-shape checks checks-suites ci-distilled ci-witnesses ci-i8-sweep ci-embed-seed"
WAIT=${VERDICT_WAIT:-180}
POLL=${VERDICT_POLL:-15}

say() {
  echo "ci-verdict: mode=$1 ($2)"
  [ -n "${GITHUB_OUTPUT:-}" ] && echo "mode=$1" >> "$GITHUB_OUTPUT"
  exit 0
}
full() { say full "$1"; }
wants() { [[ " $MODES " == *" $1 "* ]]; }

# The conclusion of the newest pull_request CI run on <sha>: success, failure, ..., pending
# or none. Waits while it is pending, up to $WAIT seconds.
ci_verdict() { # <sha>
  local v deadline=$((SECONDS + WAIT))
  while :; do
    v=$(gh api "repos/$REPO/actions/runs?head_sha=$1&event=pull_request&per_page=50" --jq '
      [.workflow_runs[] | select(.path | startswith(".github/workflows/ci.yml"))]
      | sort_by(.created_at) | last
      | if . == null then "none" elif .status != "completed" then "pending"
        else .conclusion end' 2>/dev/null) || v=unreadable
    [ "$v" = pending ] && [ $SECONDS -lt $deadline ] || { echo "$v"; return; }
    sleep "$POLL"
  done
}

if [ "${EVENT:-}" = pull_request ]; then
  wants inherit || full "inherit not asked for"
  [ "${ACTION:-}" = synchronize ] || full "pull_request ${ACTION:-?}, not a synchronize"
  [ "${HEAD_REPO:-}" = "$REPO" ] || full "head is not in this repository"
  read -r -a fam <<< "$(git rev-list --parents -n1 "$PR_HEAD" 2>/dev/null)"
  [ ${#fam[@]} -eq 3 ] || full "head ${PR_HEAD:0:9} is not a two-parent merge"
  [ "${fam[1]}" = "$PR_BEFORE" ] || full "first parent is not the previous head"
  git merge-base --is-ancestor "${fam[2]}" "$PR_BASE" 2>/dev/null ||
    full "second parent is not on the base branch"
  clean=$(git merge-tree --write-tree "${fam[1]}" "${fam[2]}" 2>/dev/null) ||
    full "the merge does not apply cleanly"
  [ "${clean%%$'\n'*}" = "$(git rev-parse "$PR_HEAD^{tree}")" ] ||
    full "the merge's tree is not the clean merge of its parents"
  # A catch-up that brings master's compiler, std or host changes merges code the previous run
  # never built with this branch: two green PRs can still meet there, so it re-runs.
  git diff --quiet "$(git merge-base "${fam[1]}" "${fam[2]}")" "${fam[2]}" -- compiler/ std/ scripts/vl-host/ ||
    full "the catch-up brings compiler/, std/ or scripts/vl-host/ changes the previous run never built with this branch"
  v=$(ci_verdict "$PR_BEFORE")
  [ "$v" = success ] || full "previous head ${PR_BEFORE:0:9} CI is $v"
  [ -f "$CI_YML" ] || full "no $CI_YML to list the jobs an inherited run must have passed"
  id=$(gh api "repos/$REPO/actions/runs?head_sha=$PR_BEFORE&event=pull_request&per_page=50" --jq '
    [.workflow_runs[] | select(.path | startswith(".github/workflows/ci.yml"))]
    | sort_by(.created_at) | last | .id' 2>/dev/null) || id=""
  [[ "$id" =~ ^[0-9]+$ ]] || full "the run of previous head ${PR_BEFORE:0:9} could not be read"
  jobs=$(gh api "repos/$REPO/actions/runs/$id/jobs?filter=latest&per_page=100" \
    --jq '.jobs[] | "\(.id)\t\(.conclusion)\t\(.name)"' 2>/dev/null) ||
    full "the jobs of run $id could not be read"
  for j in $(awk '/^jobs:/ { on = 1; next } on && /^[^ #]/ { on = 0 } on && /^  [a-z][a-z0-9-]*:$/ { sub(/:$/, ""); print $1 }' "$CI_YML"); do
    [[ " $INHERIT_EXEMPT " == *" $j "* ]] && continue
    awk -F'\t' -v j="$j" '($3 == j || index($3, j " (") == 1) && $2 == "success" {f = 1} END {exit !f}' <<< "$jobs" ||
      full "run $id of previous head ${PR_BEFORE:0:9} passed no $j job (added since, or skipped), so it proves nothing for it"
  done
  say inherit "clean catch-up merge; previous head ${PR_BEFORE:0:9} CI passed"
fi

# Answers `tree` for PR <pr> with final head <head> when its run proved <tree>, else `full`.
tree_proof() { # <pr> <head> <tree>
  local run id status concl repo jobs bad j seedid note ttree trustc want
  run=$(gh api "repos/$REPO/actions/runs?head_sha=$2&event=pull_request&per_page=50" --jq '
    [.workflow_runs[] | select(.path | startswith(".github/workflows/ci.yml"))]
    | sort_by(.created_at) | last
    | if . == null then "none" else "\(.id) \(.status) \(.conclusion) \(.head_repository.full_name)" end' 2>/dev/null) || run=unreadable
  read -r id status concl repo <<< "$run"
  [ "${status:-}" = completed ] && [ "${concl:-}" = success ] || full "#$1 head ${2:0:9} CI is $run"
  [ "${repo:-}" = "$REPO" ] || full "#$1 head ${2:0:9} ran from ${repo:-?}, not this repository"
  jobs=$(gh api "repos/$REPO/actions/runs/$id/jobs?filter=latest&per_page=100" \
    --jq '.jobs[] | "\(.id)\t\(.conclusion)\t\(.name)"' 2>/dev/null) || full "the jobs of run $id could not be read"
  bad=$(awk -F'\t' '$2 != "success" && $2 != "skipped" {printf "%s=%s ", $3, $2}' <<< "$jobs")
  [ -z "$bad" ] || full "run $id: $bad"
  for j in $TREE_SKIPS seed; do
    awk -F'\t' -v j="$j" '($3 == j || index($3, j " (") == 1) && $2 == "success" {f = 1} END {exit !f}' <<< "$jobs" ||
      full "run $id passed no $j job (inherited, docs-only or skipped), so it proves nothing about its tree"
  done
  seedid=$(awk -F'\t' '$3 == "seed" {print $1}' <<< "$jobs")
  note=$(gh api "repos/$REPO/check-runs/$seedid/annotations" \
    --jq '[.[] | select(.title == "tested-tree") | .message] | first // ""' 2>/dev/null)
  [ -n "$note" ] || full "run $id recorded no tested tree"
  read -r ttree trustc <<< "$note"
  [ "$ttree" = "$3" ] || full "run $id tested tree ${ttree:0:9}, this push is ${3:0:9}"
  want="rustc=$(rustc -V 2>/dev/null | tr ' ' '_')"
  [ "${trustc:-}" = "$want" ] || full "run $id built with ${trustc:-no rustc}, this runner has $want"
  say tree "#$1: run $id tested this tree ${3:0:9}, every job green, same rustc"
}

if [ "${EVENT:-}" = push ] && [ "${REF:-}" = refs/heads/master ]; then
  wants tree || full "tree not asked for"
  subj=$(git log -1 --format=%s "$SHA")
  [[ "$subj" =~ \(#([0-9]+)\)$ ]] || full "subject names no PR"
  pr=${BASH_REMATCH[1]}
  info=""
  for _ in 1 2 3; do
    info=$(gh api "repos/$REPO/pulls/$pr" --jq '"\(.merged) \(.merge_commit_sha) \(.head.sha)"' 2>/dev/null)
    [ "${info%% *}" = true ] && break
    sleep "$POLL"
  done
  read -r merged mc head <<< "$info"
  [ "${merged:-}" = true ] && [ "${mc:-}" = "$SHA" ] || full "#$pr is not merged as ${SHA:0:9}"
  tree=$(git rev-parse "$SHA^{tree}")
  tree_proof "$pr" "$head" "$tree"
fi

full "event ${EVENT:-?} on ${REF:-?}"
