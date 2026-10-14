#!/usr/bin/env bash
# The native-suite shards of ci.yml's `native` matrix job.
#
#   scripts/ci-shard.sh <k> <n>    the test files shard k (1-based) of n runs, one per line
#   scripts/ci-shard.sh --check <n> exit 1 unless the n shards partition the population
#
# THE POPULATION is the two auto-discovery globs (`selfhost_native_*`, `vl_*`) minus every
# file another ci.yml step names: the "Release-profile suites" step runs its files with
# binaryen present, so every test they hold runs there too (each gate is positive), and the
# "Cost ratchets" step owns the fuel-ratio file. Both lists are read FROM ci.yml, so a file
# leaves the shards only by being named elsewhere. tests/ci_shard_test.ts runs `--check`.
#
# THE SPLIT is greedy longest-first over WEIGHTS: each file's summed test time in seconds on
# a CI runner, read from a ci-native job log. A file missing from the table weighs 2, so a new
# test lands somewhere and only a heavy one needs a row. Deterministic: same tree, same split.
set -euo pipefail
cd "$(dirname "$0")/.."

WEIGHTS='
vl_budget_mode_test.ts 90
selfhost_native_align_test.ts 112
vl_capability_probes_port_test.ts 81
vl_check_filed_witnesses_test.ts 59
vl_deep_nesting_test.ts 45
vl_test_runner_test.ts 39
vl_regress_port_test.ts 36
vl_plumb_shape_port_test.ts 35
vl_survey_regrade_port_test.ts 27
vl_check_codegen_test.ts 22
vl_capability_matrix_test.ts 17
vl_memo_generation_test.ts 16
vl_std_fs_write_test.ts 15
vl_fmt_test.ts 13
vl_compile_gc_test.ts 12
vl_ratchet_hold_test.ts 11
vl_check_fix_test.ts 10
vl_sentinel_index_test.ts 10
vl_emitter_state_audit_test.ts 9
vl_std_json_test.ts 7
vl_seed_size_test.ts 6
vl_seed_provenance_test.ts 6
vl_shared_memory_test.ts 5
vl_compile_cache_test.ts 4
vl_std_process_test.ts 4
vl_union_key_licence_test.ts 4
vl_run_args_test.ts 4
vl_large_source_test.ts 4
'

# The files a named ci.yml step lists, one per line.
step_files() {
  awk -v want="$1" '$0 ~ "- name: " want {f=1; next} f && /- name:/{exit} f{print}' \
    .github/workflows/ci.yml | { grep -oE "tests/[a-zA-Z0-9_]+\.ts" || true; } | sort -u
}

population() {
  local elsewhere
  elsewhere=$( (step_files "Release-profile suites"; step_files "Cost ratchets") | sort -u)
  [ -n "$elsewhere" ] || { echo "ci-shard: no Release-profile/Cost ratchets list in ci.yml" >&2; exit 1; }
  ls tests/selfhost_native_*_test.ts tests/vl_*_test.ts | grep -vxF "$elsewhere"
}

# "<shard> <file>" for every file in the population.
assign() {
  population | while read -r f; do
    w=$(printf '%s' "$WEIGHTS" | awk -v b="${f#tests/}" '$1 == b {print $2}')
    printf '%s %s\n' "${w:-2}" "$f"
  done | sort -k1,1nr -k2,2 | awk -v n="$1" '
    { best = 1
      for (s = 2; s <= n; s++) if (load[s] < load[best]) best = s
      load[best] += $1; print best, $2 }'
}

if [ "${1:-}" = --check ]; then
  n="${2:?usage: ci-shard.sh --check <n>}"
  want=$(population | sort)
  got=$(for k in $(seq 1 "$n"); do bash "$0" "$k" "$n"; done | sort)
  dup=$(printf '%s\n' "$got" | uniq -d)
  [ -z "$dup" ] || { echo "ci-shard: in more than one shard:"; echo "$dup"; exit 1; }
  [ "$want" = "$got" ] || { echo "ci-shard: the shards do not cover the population:"; diff <(echo "$want") <(echo "$got"); exit 1; }
  echo "ci-shard: $n shards partition $(echo "$want" | wc -l) files"
  exit 0
fi

k="${1:?usage: ci-shard.sh <k> <n> | --check <n>}"
n="${2:?usage: ci-shard.sh <k> <n> | --check <n>}"
assign "$n" | awk -v k="$k" '$1 == k {print $2}'
