#!/usr/bin/env bash
# The test shards of ci.yml's two matrix jobs.
#
#   scripts/ci-shard.sh <set> <k> <n>     the files shard k (1-based) of n of <set> runs
#   scripts/ci-shard.sh --check <set> <n> exit 1 unless the n shards partition <set>
#
# <set> is `native` or `release`.
#
# RELEASE is the file list of ci.yml's "Release-profile suites" step (its SUITES block): the
# binaryen-backed files, every gate in them positive, so each runs only there.
#
# NATIVE is the two auto-discovery globs (`selfhost_native_*`, `vl_*`) minus every file another
# ci.yml step names: the release list above and the "Cost ratchets" step's fuel-ratio file.
# Both lists are read FROM ci.yml, so a file leaves the native shards only by being named
# elsewhere. tests/ci_shard_test.ts runs `--check` on both sets.
#
# THE SPLIT is greedy longest-first over WEIGHTS: a file's test seconds on a CI runner whose
# seed sidecars are warm, summed over its tests even where they run concurrently (the runner's
# cores are the shared resource, so the sum is the cost). A file missing from the table weighs 2,
# so a new test lands somewhere and only a heavy one needs a row. Deterministic.
#
# The files that read `$VL_FUEL` are placed as ONE unit, weighing their sum plus FUEL_WARM:
# a shard holding any of them warms the two fuel sidecars (a whole-seed JIT each) before its
# tests start, so one shard paying that is better than two.
#
# A SELF-SHARDED file is in EVERY shard and divides its own cases instead: the CI step sets
# `$VL_CI_SHARD=<k>/<n>`, the file registers only its k-th share, and the n shares partition
# its cases. It is for a file whose cost is many independent cases, too heavy for one shard.
# Without the variable (a local run, gate.sh) it registers every case.
set -euo pipefail
cd "$(dirname "$0")/.."

SELF_SHARDED='
selfhost_native_align_test.ts
'

# ci.yml's "Warm the seed's sidecars" step with `--fuel` on a cache miss: ~33 s of wall that
# holds back all four of the runner's cores, and a weight counts seconds of one file.
FUEL_WARM=110

# The native rows are the mean over two PR runs of each file's summed test seconds. A
# self-sharded file's row is its whole cost, and each shard is charged 1/n of it.
WEIGHTS='
selfhost_native_align_test.ts 9
vl_distilled_tools_test.ts 24
vl_deep_nesting_test.ts 35
vl_capability_probes_port_test.ts 14
vl_day_one_sampler_test.ts 27
vl_census_generators_test.ts 24
vl_check_filed_witnesses_test.ts 9
vl_capability_matrix_test.ts 23
vl_capability_matrix_port_test.ts 6
selfhost_native_release_inline_test.ts 22
vl_census_readers_test.ts 20
vl_fmt_test.ts 18
vl_memo_generation_test.ts 6
vl_test_runner_test.ts 13
vl_check_codegen_test.ts 16
vl_sentinel_index_test.ts 6
vl_compile_gc_test.ts 14
vl_plumb_shape_port_test.ts 13
vl_survey_regrade_port_test.ts 3
selfhost_native_release_multivalue_test.ts 10
vl_label_codemod_test.ts 11
vl_gen_cases_test.ts 10
vl_ladder_census_test.ts 10
vl_perf_tools_test.ts 7
vl_std_math_grade_test.ts 9
vl_memarg_offset_test.ts 5
vl_emit_refusal_sites_test.ts 5
vl_twin_agreement_test.ts 4
vl_check_fix_test.ts 6
vl_emitter_state_audit_test.ts 6
vl_goal_scoreboard_test.ts 2
vl_std_fs_write_test.ts 6
vl_std_json_test.ts 6
vl_label_block_object_test.ts 5
vl_seed_size_test.ts 2
vl_union_key_licence_test.ts 5
vl_compile_cache_test.ts 4
vl_instance_state_leak_test.ts 4
vl_kind_ladder_test.ts 4
vl_large_source_test.ts 4
vl_print_color_test.ts 4
vl_profile_rank_test.ts 2
vl_ratchet_hold_test.ts 4
vl_shared_memory_test.ts 4
vl_lint_span_test.ts 3
vl_run_args_test.ts 3
vl_seed_provenance_test.ts 2
vl_std_process_test.ts 3
vl_budget_mode_test.ts 1
vl_deep_else_chain_test.ts 11
vl_buffer_view_bounds_shape_test.ts 33
selfhost_native_release_shape_test.ts 30
selfhost_native_release_escape_test.ts 20
selfhost_native_release_melt_test.ts 25
selfhost_native_release_loops_test.ts 12
selfhost_native_opt_test.ts 13
vl_getter_body_shape_test.ts 7
selfhost_native_release_runonce_test.ts 6
selfhost_native_release_leaf_test.ts 7
vl_closure_lift_shape_test.ts 6
vl_extern_link_test.ts 7
selfhost_native_release_test.ts 4
vl_extern_global_test.ts 5
'

usage() { echo "usage: ci-shard.sh <native|release> <k> <n> | --check <native|release> <n>" >&2; exit 2; }

# The files a named ci.yml step lists, one per line.
step_files() {
  awk -v want="$1" '$0 ~ "- name: " want {f=1; next} f && /- name:/{exit} f{print}' \
    .github/workflows/ci.yml | { grep -oE "tests/[a-zA-Z0-9_]+\.ts" || true; } | sort -u
}

population() {
  local release elsewhere
  release=$(step_files "Release-profile suites")
  [ -n "$release" ] || { echo "ci-shard: ci.yml's Release-profile suites step lists no files" >&2; exit 1; }
  case "$1" in
    release) printf '%s\n' "$release" ;;
    native)
      elsewhere=$( (printf '%s\n' "$release"; step_files "Cost ratchets") | sort -u)
      ls tests/selfhost_native_*_test.ts tests/vl_*_test.ts | grep -vxF "$elsewhere" ;;
    *) usage ;;
  esac
}

OWN=$(printf '%s' "$SELF_SHARDED" | awk 'NF {print "tests/" $1}')
is_own() { printf '%s\n' "$OWN" | grep -qxF "$1"; }

# "<shard> <file>" for every file of the set; a self-sharded file once for every shard.
assign() {
  local rows
  # "<unit> <weight> <file>": a unit is the file itself, `fuel`, or `own` (self-sharded).
  rows=$(population "$1" | while read -r f; do
    w=$(printf '%s' "$WEIGHTS" | awk -v b="${f#tests/}" '$1 == b {print $2}')
    if is_own "$f"; then echo "own ${w:-0} $f"; continue; fi
    unit="$f"
    if grep -q VL_FUEL "$f"; then unit=fuel; fi
    printf '%s %s %s\n' "$unit" "${w:-2}" "$f"
  done)
  # "<shard> <weight> <file>"; a self-sharded file is charged 1/n of its weight in every shard.
  {
    printf '%s\n' "$rows" | awk -v n="$2" '$1 == "own" {for (s = 1; s <= n; s++) print s, $2 / n, $3}'
    # Longest unit first, ties by name, each to the least-loaded shard; then its files.
    own=$(printf '%s\n' "$rows" | awk -v n="$2" '$1 == "own" {s += $2 / n} END {print s + 0}')
    printf '%s\n' "$rows" |
      awk -v warm="$FUEL_WARM" 'NF == 3 && $1 != "own" {w[$1] += $2}
        END {for (u in w) print w[u] + (u == "fuel" ? warm : 0), u}' |
      sort -k1,1nr -k2,2 |
      awk -v n="$2" -v own="$own" 'NR == 1 {for (s = 1; s <= n; s++) load[s] = own}
        { best = 1
        for (s = 2; s <= n; s++) if (load[s] < load[best]) best = s
        load[best] += $1; print best, $2 }' |
      awk 'NR == FNR {shard[$2] = $1; next} ($1 in shard) {print shard[$1], $2, $3}' - <(printf '%s\n' "$rows")
  } | sort -k1,1n -k2,2nr -k3,3 | awk '{print $1, $3}'
}

if [ "${1:-}" = --check ]; then
  [ "$#" = 3 ] || usage
  set="$2" n="$3"
  want=$(population "$set" | sort)
  for f in $OWN; do
    grep -q VL_CI_SHARD "$f" 2>/dev/null ||
      { echo "ci-shard: SELF_SHARDED names $f, which does not read \$VL_CI_SHARD"; exit 1; }
  done
  split=$(assign "$set" "$n")
  # A self-sharded file must be in every shard; every other file in exactly one.
  bad=$(printf '%s\n' "$split" | awk -v n="$n" -v own="${OWN//$'\n'/ }" '
    BEGIN {split(own, o, " "); for (i in o) is[o[i]] = 1}
    {c[$2]++}
    END {for (f in c) if (c[f] != ((f in is) ? n : 1)) print f " is in " c[f] " shards"}')
  [ -z "$bad" ] || { echo "ci-shard: a self-sharded file is in every shard, any other in one:"; echo "$bad"; exit 1; }
  got=$(printf '%s\n' "$split" | awk '{print $2}' | sort -u)
  [ "$want" = "$got" ] || { echo "ci-shard: the shards do not cover the $set set:"; diff <(echo "$want") <(echo "$got"); exit 1; }
  for k in $(seq 1 "$n"); do
    printf '%s\n' "$split" | awk -v k="$k" '$1 == k {f=1} END {exit !f}' ||
      { echo "ci-shard: $set shard $k of $n is empty"; exit 1; }
  done
  echo "ci-shard: $n shards partition the $(echo "$want" | wc -l) $set files"
  exit 0
fi

[ "$#" = 3 ] || usage
assign "$1" "$3" | awk -v k="$2" '$1 == k {print $2}'
