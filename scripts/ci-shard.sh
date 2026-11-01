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

# ci.yml's "Warm the seed's sidecars" step with `--fuel`: about 1 s when the `seed` job's fuel
# sidecars restore (run 41267899399), 15-17 s of all four cores (64) on a miss. Charged near the
# restored cost, since a miss is the exception and only slows the one shard that pays it.
FUEL_WARM=8

# The native rows are the mean over two PR runs (41191375015, 41194363060; 2026-10-31) of each
# file's summed test seconds, every native file listed: a sub-second file left at the default 2
# overcharged its shard, and a 26 s one missing from the table sat on the critical path at 2. The
# headroom test was charged a whole shard (58) while it re-JITted the seed; since #5408 it checks
# a warm default heap in about 8 s. A self-sharded file's row is its whole cost, and each shard
# is charged 1/n of it.
WEIGHTS='
vl_seed_gc_headroom_test.ts 8
vl_check_filed_witnesses_test.ts 16
selfhost_native_release_inline_test.ts 14
vl_distilled_tools_test.ts 14
vl_test_runner_test.ts 14
vl_day_one_sampler_test.ts 12
vl_deep_nesting_test.ts 11
vl_memo_generation_test.ts 10
selfhost_native_align_test.ts 9
vl_capability_matrix_test.ts 9
vl_ratchet_hold_test.ts 8
selfhost_native_release_multivalue_test.ts 7
vl_std_fs_write_test.ts 7
vl_fmt_test.ts 7
vl_std_math_grade_test.ts 7
vl_capability_probes_port_test.ts 6
vl_census_readers_test.ts 6
vl_emitter_state_audit_test.ts 6
vl_memarg_offset_test.ts 6
vl_census_generators_test.ts 6
vl_parse_replay_test.ts 5
vl_ladder_census_test.ts 4
vl_compile_cache_test.ts 4
vl_std_json_test.ts 4
vl_shared_memory_test.ts 4
vl_check_skip_test.ts 4
vl_perf_tools_test.ts 4
vl_plumb_shape_port_test.ts 4
vl_survey_regrade_port_test.ts 4
vl_check_fix_test.ts 3
vl_large_source_test.ts 3
vl_gen_cases_test.ts 3
vl_check_within_test.ts 3
vl_union_key_licence_test.ts 3
vl_run_args_test.ts 3
vl_std_fs_range_test.ts 3
vl_compile_gc_test.ts 2
vl_check_codegen_test.ts 2
vl_iface_hash_test.ts 2
vl_instance_state_leak_test.ts 2
vl_corpuscmp_test.ts 2
vl_seed_memo_test.ts 2
vl_zext_load_fold_test.ts 2
vl_help_test.ts 2.0
vl_label_block_object_test.ts 1.9
vl_addr2line_test.ts 1.8
vl_std_float_text_test.ts 1.7
vl_invalid_module_types_test.ts 1.7
vl_large_output_test.ts 1.5
vl_std_process_test.ts 1.5
vl_sentinel_index_test.ts 1.5
vl_dup_census_test.ts 1.5
vl_twin_agreement_test.ts 1.5
vl_fn_type_param_names_test.ts 1.5
vl_seed_provenance_test.ts 1.4
vl_wasm_runner_census_test.ts 1.4
vl_std_bytes_test.ts 1.4
vl_std_fs_into_test.ts 1.4
vl_regress_seed_arg_test.ts 1.4
vl_kind_ladder_test.ts 1.4
vl_run_cache_test.ts 1.3
selfhost_native_release_bounds_test.ts 1.2
vl_std_args_test.ts 1.2
vl_initial_memory_test.ts 1.2
vl_import_memory_test.ts 1.2
vl_check_dir_test.ts 1.1
vl_lossless_recovery_test.ts 1.1
vl_capability_matrix_port_test.ts 1.1
vl_global_read_before_init_message_test.ts 1.1
vl_getter_codegen_test.ts 1.0
vl_inventory_refs_test.ts 1.0
vl_simd_lane_codegen_test.ts 1.0
vl_probe_rollback_test.ts 1.0
vl_gc_heap_shape_test.ts 1.0
vl_module_cache_test.ts 1.0
vl_grade_test.ts 1.0
vl_match_br_table_test.ts 0.9
vl_unbraced_body_recovery_test.ts 0.9
vl_widen_hint_test.ts 0.9
vl_paren_newline_test.ts 0.9
vl_goal_scoreboard_test.ts 0.9
vl_budget_mode_test.ts 0.9
vl_module_gate_test.ts 0.9
vl_inventory_ls_test.ts 0.9
vl_check_json_test.ts 0.9
vl_std_int_text_test.ts 0.9
selfhost_native_diag_pos_test.ts 0.8
vl_print_color_test.ts 0.8
vl_check_args_test.ts 0.8
vl_label_codemod_test.ts 0.8
vl_opt_after_link_test.ts 0.8
vl_render_parse_budget_test.ts 0.8
vl_emit_refusal_sites_test.ts 0.8
vl_shift_mask_fold_test.ts 0.8
vl_memarg_const_fold_test.ts 0.8
vl_list_walk_hoist_test.ts 0.7
vl_export_budget_test.ts 0.7
vl_std_base64_test.ts 0.7
vl_seed_size_test.ts 0.7
vl_trap_source_frames_test.ts 0.7
vl_shorthand_first_field_test.ts 0.7
selfhost_native_gc_test.ts 0.6
selfhost_native_bulk_readback_test.ts 0.6
vl_compiler_trap_banner_test.ts 0.6
vl_module_id_stable_test.ts 0.6
vl_lint_rule_scope_test.ts 0.6
vl_ident_audit_test.ts 0.5
vl_profile_rank_test.ts 0.5
vl_check_import_diag_test.ts 0.5
vl_inventory_rows_test.ts 0.5
vl_no_conflict_markers_test.ts 0.5
vl_shared_instance_order_test.ts 0.5
vl_fn_set_rep_test.ts 0.5
vl_extern_test.ts 0.5
vl_list_index_trap_test.ts 0.5
vl_shared_instance_test.ts 0.5
vl_check_redundant_type_test.ts 0.4
selfhost_native_diag_code_test.ts 0.4
vl_fn_flow_shadow_test.ts 0.4
selfhost_native_conv_test.ts 0.4
vl_parse_image_stable_test.ts 0.4
vl_no_method_suggestion_test.ts 0.4
vl_compiler_no_interpolation_test.ts 0.4
vl_cli_build_stdout_test.ts 0.4
vl_std_resolution_test.ts 0.4
vl_doc_script_paths_test.ts 0.4
vl_exported_memory_test.ts 0.4
selfhost_native_bulk_intake_test.ts 0.4
vl_lint_span_test.ts 0.4
vl_check_severity_test.ts 0.4
vl_unknown_type_suggestion_test.ts 0.4
vl_build_validate_test.ts 0.4
vl_comment_budget_test.ts 0.3
vl_shared_constants_test.ts 0.3
vl_exhaustive_chain_elision_test.ts 0.3
vl_invalid_module_position_test.ts 0.3
vl_fmt_scale_test.ts 0.3
vl_hoist_trap_iteration_test.ts 0.3
vl_deep_is_walker_test.ts 0.3
vl_as_cast_trap_message_test.ts 0.3
vl_codegen_check_agreement_test.ts 0.3
vl_effects_summary_test.ts 0.2
vl_check_std_diag_test.ts 0.2
vl_minted_annot_test.ts 0.2
vl_check_hygiene_test.ts 0.2
vl_buffer_bytes_trap_message_test.ts 0.2
vl_checker_program_isolation_test.ts 0.2
vl_std_fs_permission_test.ts 0.2
vl_ufcs_import_suffix_test.ts 0.2
vl_reexport_abi_test.ts 0.2
vl_check_module_lint_test.ts 0.2
vl_check_exclude_test.ts 0.2
vl_call_bind_shadow_test.ts 0.2
vl_empty_array_cast_hint_test.ts 0.2
vl_global_promotion_test.ts 0.2
vl_std_cmd_test.ts 0.1
vl_query_entry_only_test.ts 0.1
vl_diag_span_test.ts 0.1
vl_literal_byte_write_test.ts 0.1
vl_lint_parse_bank_test.ts 0.1
vl_std_comment_audience_test.ts 0.1
vl_emit_diag_position_test.ts 0.1
vl_immutable_const_global_test.ts 0.1
vl_live_sites_test.ts 0.1
vl_literal_note_scope_test.ts 0.1
vl_seed_abi_test.ts 0.1
vl_engine_fail_offset_test.ts 0.1
vl_mint_facts_test.ts 0.1
vl_mono_arena_tick_test.ts 0.1
vl_check_module_diag_test.ts 0.1
vl_errno_agreement_test.ts 0.1
vl_scan_passes_test.ts 0.1
vl_host_floor_test.ts 0.1
vl_survey_measure_test.ts 0.1
vl_ast_value_children_test.ts 0.1
vl_opt_js_host_test.ts 0.1
vl_union_return_sink_test.ts 0.1
vl_view_descriptor_melt_test.ts 0.1
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

# "<shard> <file>" for every file of the set; a self-sharded file once for every shard.
assign() {
  local rows files
  files=$(population "$1")
  # "<unit> <weight> <file>": a unit is the file itself, `fuel`, or `own` (self-sharded).
  # One awk over the whole set: a process per file made this the cost of every call.
  rows=$(printf '%s\n' "$files" |
    W="$WEIGHTS" O="$OWN" F="$(printf '%s\n' "$files" | xargs grep -l VL_FUEL || true)" awk '
    BEGIN {
      n = split(ENVIRON["W"], l, "\n")
      for (i = 1; i <= n; i++) if (split(l[i], p, " ") >= 2) w[p[1]] = p[2]
      n = split(ENVIRON["O"], l, "\n"); for (i = 1; i <= n; i++) own[l[i]] = 1
      n = split(ENVIRON["F"], l, "\n"); for (i = 1; i <= n; i++) fuel[l[i]] = 1
    }
    NF {
      b = $0; sub(/^tests\//, "", b)
      if ($0 in own) { print "own", ((b in w) ? w[b] : 0), $0; next }
      print (($0 in fuel) ? "fuel" : $0), ((b in w) ? w[b] : 2), $0
    }')
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
