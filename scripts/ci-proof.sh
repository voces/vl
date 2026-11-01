#!/usr/bin/env bash
# Decide whether a CI run already proved some of gate.sh's rows on THIS tree, so gate.sh can
# skip them. The proof is a push-event run of .github/workflows/ci.yml on the exact commit
# the gate is grading, whose every job passed and whose `ci-proof` job printed the tree, the
# seed's sha256 and the rustc it ran. Every input of a covered row is pinned by one of:
#
#   tree    the run's commit has this checkout's tree, and nothing tracked or untracked
#           (outside .gitignore) differs from it: every source, test, lock file, baseline
#           and ci.yml itself.
#   seed    the sha256 of the seed the CI jobs restored equals the local seed's.
#   deno    .dvmrc, which every setup-deno step in ci.yml reads, names the local deno.
#   rustc   the host binary CI built and the local one come from the same rustc.
#   jobs    every job of the run passed, none was skipped, and every matrix shard the
#           covered rows need is present.
#
#   scripts/ci-proof.sh rows                  # the gate rows a proof covers, one per line
#   scripts/ci-proof.sh verify <sha> <seed>   # exit 0 and the run's URL when proven
#
# Any refusal exits 1 and names the input that did not match; gate.sh then runs every row.
# Env: REPO (owner/name, default the checkout's GitHub repo), CI_PROOF_WAIT (seconds to wait
# for a run still in progress, default 0), CI_PROOF_POLL (default 20). tests/ci_proof_test.ts
# mutates each input and holds the row list to ci.yml.
set -uo pipefail

# The gate rows CI runs with the same command on the same seed. `corpus oracle` is the part
# of `deno task test` that checks-suites runs; the rest of that row stays local (CI runs it
# without a seed), as do `self-compile pair` (CI proves only the fixpoint), `plumb-shape
# cost` (CI runs it without binaryen), and the four corpus and inventory graders.
ROWS=(
  "ci-native"
  "lsp suites (ci list)"
  "lsp typecheck"
  "lsp lint"
  "lint-self + fmt"
  "seed size"
  "no-python"
  "kind-ladder sets"
  "dead-export budget"
  "render-parse budget"
  "scaling shape"
  "deno lint"
  "inventory refs"
  "capability probes"
  "conflict markers"
  "corpus oracle"
)
# The jobs those rows run in, with how many matrix shards each must have passed.
JOBS=(
  "ci=1" "seed=1" "ci-native=7" "ci-release-shape=1" "checks=1" "checks-suites=2"
  "ci-cost=4" "ci-proof=1"
)
PROOF_RE='ci-proof: tree [0-9a-f]{40} seed [0-9a-f]{64} rustc [^ ]+'

refuse() { echo "ci-proof: refused: $1" >&2; exit 1; }

case "${1:-}" in
  rows) printf '%s\n' "${ROWS[@]}"; exit 0 ;;
  jobs) printf '%s\n' "${JOBS[@]}"; exit 0 ;;
  verify) [ $# -eq 3 ] || refuse "usage: ci-proof.sh verify <sha> <seed>" ;;
  *) echo "usage: ci-proof.sh rows | jobs | verify <sha> <seed>" >&2; exit 2 ;;
esac
SHA=$2; SEED=$3
WAIT=${CI_PROOF_WAIT:-0}; POLL=${CI_PROOF_POLL:-20}

# tree
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || refuse "'$SHA' is not a full commit sha"
want_tree=$(git rev-parse -q --verify "$SHA^{tree}" 2>/dev/null) || refuse "commit ${SHA:0:9} is not in this checkout"
tree=$(git rev-parse HEAD^{tree})
[ "$want_tree" = "$tree" ] || refuse "commit ${SHA:0:9} has tree ${want_tree:0:9}, this checkout ${tree:0:9}"
dirty=$(git status --porcelain 2>/dev/null | head -3)
[ -z "$dirty" ] || refuse "the checkout differs from its tree: $(tr '\n' ' ' <<< "$dirty")"

# deno: every setup-deno step reads .dvmrc, and .dvmrc names the local deno.
[ -f .dvmrc ] || refuse "no .dvmrc, so CI's deno is not pinned"
setups=$(grep -c 'uses: denoland/setup-deno' .github/workflows/ci.yml)
pinned=$(grep -c 'deno-version-file: .dvmrc' .github/workflows/ci.yml)
[ "$setups" -gt 0 ] && [ "$setups" = "$pinned" ] || refuse "$pinned of $setups setup-deno steps in ci.yml read .dvmrc"
want_deno=$(tr -d ' \r\n' < .dvmrc); want_deno=${want_deno#v}
deno=$(deno --version 2>/dev/null | awk 'NR==1 {print $2}')
[ "$deno" = "$want_deno" ] || refuse "CI runs deno $want_deno (.dvmrc), this box ${deno:-none}"

# rustc and seed, local side.
rustc=$(rustc -V 2>/dev/null | tr ' ' '_')
[ -n "$rustc" ] || refuse "no rustc on this box to compare with CI's"
[ -f "$SEED" ] || refuse "no seed at $SEED"
seed=$(sha256sum "$SEED" | awk '{print $1}')

# The run.
if [ -z "${REPO:-}" ]; then
  REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null) || refuse "cannot name the GitHub repository (set REPO)"
fi
deadline=$((SECONDS + WAIT))
while :; do
  run=$(gh api "repos/$REPO/actions/runs?head_sha=$SHA&event=push&per_page=50" --jq "
    [.workflow_runs[] | select(.path == \".github/workflows/ci.yml\" and .event == \"push\"
       and .head_sha == \"$SHA\" and .head_repository.id == .repository.id)]
    | sort_by(.created_at) | last
    | if . == null then \"none\" else \"\(.id) \(.status) \(.conclusion) \(.html_url)\" end" 2>/dev/null) || run=unreadable
  read -r id status conclusion url <<< "$run"
  if [ "$id" != none ] && [ "$id" != unreadable ] && [ "$status" != completed ] && [ $SECONDS -lt $deadline ]; then
    sleep "$POLL"; continue
  fi
  break
done
[ "$id" != unreadable ] || refuse "the runs of ${SHA:0:9} could not be read"
[ "$id" != none ] || refuse "no push-event CI run of ${SHA:0:9} in this repository"
[[ "$id" =~ ^[0-9]+$ ]] || refuse "unreadable run id '$id'"
[ "$status" = completed ] || refuse "run $id is $status"
[ "$conclusion" = success ] || refuse "run $id concluded $conclusion"

# Its jobs: all passed, and every required shard is there.
jobs=$(gh api "repos/$REPO/actions/runs/$id/jobs?filter=latest&per_page=100" --jq '.jobs[] | "\(.id)\t\(.conclusion)\t\(.name)"' 2>/dev/null) || refuse "the jobs of run $id could not be read"
[ -n "$jobs" ] || refuse "run $id lists no jobs"
bad=$(awk -F'\t' '$2 != "success" {print $3 " " $2}' <<< "$jobs" | head -3)
[ -z "$bad" ] || refuse "run $id: $(tr '\n' ',' <<< "$bad")"
for j in "${JOBS[@]}"; do
  name=${j%=*}; want=${j#*=}
  if [ "$want" = 1 ]; then n=$(awk -F'\t' -v n="$name" '$3 == n' <<< "$jobs" | wc -l | tr -d ' ')
  else n=$(awk -F'\t' -v n="$name (" 'index($3, n) == 1' <<< "$jobs" | wc -l | tr -d ' '); fi
  [ "$n" -eq "$want" ] || refuse "run $id has $n '$name' jobs, ci.yml runs $want"
done

# The proof line: exactly one, and it names this tree, this seed and this rustc.
pid=$(awk -F'\t' '$3 == "ci-proof" {print $1}' <<< "$jobs")
# A job log carries the runner's colour codes, which gh refuses to print without the flag.
lines=$(gh api "repos/$REPO/actions/jobs/$pid/logs" --allow-escape-sequences 2>/dev/null | grep -oE "$PROOF_RE" | sort -u)
[ -n "$lines" ] || refuse "run $id's ci-proof job printed no proof line"
[ "$(wc -l <<< "$lines")" -eq 1 ] || refuse "run $id's ci-proof job printed $(wc -l <<< "$lines" | tr -d " ") different proof lines"
read -r _ _ ptree _ pseed _ prustc <<< "$lines"
[ "$ptree" = "$tree" ] || refuse "run $id graded tree ${ptree:0:9}, this checkout ${tree:0:9}"
[ "$pseed" = "$seed" ] || refuse "run $id graded seed ${pseed:0:12}, this checkout's is ${seed:0:12}"
[ "$prustc" = "$rustc" ] || refuse "run $id built its host with $prustc, this box has $rustc"

echo "ci-proof: run $id proved tree ${tree:0:9} seed ${seed:0:12} ($url)" >&2
printf '%s\n' "${ROWS[@]}"
