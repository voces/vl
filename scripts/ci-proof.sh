#!/usr/bin/env bash
# The gate.sh rows a pull request's CI already runs with the same command on the same seed, one
# per line, so a lane does not run them again (docs/internals/lane-brief.md):
#
#   scripts/ci-proof.sh rows
#
# tests/ci_proof_test.ts holds the list to ci.yml and gate.sh. The merge queue's `verify` mode,
# which let gate.sh skip these rows on a queue push's proven run, retired with the queue (O2).
set -uo pipefail

# The gate rows CI runs with the same command on the same seed. `corpus oracle` is the part
# of `deno task test` that checks-suites runs; the rest of that row stays local (CI runs it
# without a seed), as do `self-compile pair` (CI proves its fixpoint and fuel, not its survey rows), `plumb-shape
# cost` (CI runs it without binaryen), the distilled corpus (gate.sh adds --verify-fresh on master)
# and the filed witnesses (CI grades them in two --shard runs).
ROWS=(
  "ci-native"
  "lsp suites (ci list)"
  "lsp typecheck"
  "lsp lint"
  "lint-self + fmt"
  "seed size"
  "late demands"
  "self ir misses"
  "phase state"
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
  "rep-fuzz"
  "splice scan"
  "ir shadow cases"
)

case "${1:-}" in
  rows) printf '%s\n' "${ROWS[@]}" ;;
  *) echo "usage: ci-proof.sh rows" >&2; exit 2 ;;
esac
