# Python removal census

Owner directive 2026-10-13: no Python in the repo; tooling is written in VL. Census at
`df4771000`: 233 tracked `.py`, 44,547 lines. After the first PR: 161 files, 27,128 lines
(`scripts/py-budget.vl`, baseline `scripts/py-budget-baseline.json`, rows `py budget` in
`scripts/gate.sh` and the ci-native job). Inline `python3 -` heredocs in shell
(`bench/run.sh`, `scripts/mono-tyaram-grid.sh`, `scripts/run-lint-diff.sh`,
`scripts/perf/seed-sections.sh`) are not `.py` files and are not counted yet.

| Class | Meaning | Files | Lines |
| --- | --- | --- | --- |
| G | a gate row in `scripts/gate.sh` / `ci.yml`, or a shell script those run | 9 | 2,794 |
| T | run or read by a test under `tests/` | 17 | 6,328 |
| I | imported by a G/T file (a D file importing it keeps it D) | 12 | 3,119 |
| D | named as a procedure in `CLAUDE.md`, a README, `REPRODUCE.md`, a docs tool table or a fixture header | 122 (48 are `bench/*/main.py`) | 14,745 |
| X | nothing reaches it; deleted in this PR | 72 | 17,419 |

Reacher is the first two reachers found, `(+n)` for more. D rules: a per-grid
`scripts/silent-sweep/dNNN/README.md` that says "re-run with" counts as D; a mention only in
an inventory row, `CHANGELOG.md`, `DECISIONS.md`, a dated report or a code comment does not.
Data (`distilled/named/`, `census/*.json`, `nulvariant/*.csv`) was kept; only code was deleted.
`scripts/twin-agreement.py` is D by activity, not by a doc: the L2 refactor lane edited it in
#3562, #3603 and #3608.

Other lanes are porting concurrently. A `.py` whose VL port is already on master stays only as
the oracle of its `tests/vl_*_port_test.ts` and goes with that test's oracle half.

## G port order (gate order)

| # | Gate row | Python still reached | VL replacement |
| --- | --- | --- | --- |
| 1 | `comment budget` | done: `vl check --budget` (#3648) | - |
| 2 | `arena-scan budget` | done: `vl check --budget` (#3648) | - |
| 3 | `kind-ladder budget` | done: `vl check --budget` plus `ladder-sets.vl`; `ladder-census.py` stays as the discovery tool | - |
| 4 | `dead-export budget` | done: `dead-exports.vl` plus `vl check --budget --findings` | - |
| 5 | `render-parse budget` | done: `render-parse-census.vl` plus `vl check --budget --findings` | - |
| 6 | `splice scan` | done: `inventory/splice-scan.vl`; `inventory/{rows,ls,split,selftest}.py` deleted, the row grammar is `scripts/lib/inventory.vl` | - |
| 7 | `lint-self.sh` (`matrix.py`) | done: `scripts/capability-matrix.vl`, `matrix.py` deleted | - |
| 8 | `refresh-compiler.sh` | done: `seed-provenance.vl` (via `record-seed-provenance.sh`); `seed_provenance.py` is deleted and `tests/vl_seed_provenance_test.ts` holds the VL fold to the values the Python printed on a fixed tree | - |
| 9 | `python preflight` | none (`python-preflight.sh`) | delete the row with the last `.py` |
| - | `plumb-shape cost`, `filed witnesses`, `capability probes`, `distilled corpus`, `baseline freshness`, `survey measurements`, `interp budget`, `sentinel-index budget` | ported on master; `plumb-shape-cost.py`, `survey-regrade.py`, `check-filed-witnesses.py` and `distilled/{regress,index,redistil}.py` (+ `gradecensus.py`) deleted | done: `distilled/cellmap.py` is deleted (`loadCells`/`dumpCells`), and `corpuscmp.py`, `grade.py` and `profile-rank.py` are deleted for their VL ports (rows below) |

Rows 1-5 are done and `ratchet.py` is deleted. `mono-tyaram-grid.sh` carries an inline python
heredoc and moves with its own PR.

## Files


### G: gate

| File | Lines | Class | Reached by | Planned VL replacement |
| --- | --- | --- | --- | --- |
| `scripts/capability-probes/run.py` | 274 | G | .github/workflows/ci.yml scripts/gate.sh | done: `scripts/capability-probes.vl`; the `.py` is deleted and its port test pins goldens |
| `scripts/seed_provenance.py` | 223 | I | tests/vl_seed_provenance_test.ts (oracle only) | done: deleted; the test pins `seed-provenance.vl` to the Python's fold, sidecar and verdict lines over a fixed tree |
| `scripts/silent-sweep/distilled/regress.py` | 177 | G | scripts/lint-self.sh | deleted: `regress.vl` runs the gate rows |

### T: tests

| File | Lines | Class | Reached by | Planned VL replacement |
| --- | --- | --- | --- | --- |
| `scripts/check-filed-witnesses.py` | 712 | T | tests/vl_check_codegen_test.ts tests/vl_check_filed_witnesses_test.ts (+3) | deleted: `scripts/check-filed-witnesses.vl`; its test pins the report |
| `scripts/codemods/label-at.py` | 322 | T | tests/vl_label_codemod_test.ts | scripts/codemods/label-at.vl |
| `scripts/day-one/modules.py` | 552 | T | tests/vl_day_one_sampler_test.ts | scripts/day-one/modules.vl |
| `scripts/day-one/sample.py` | 657 | T | tests/vl_day_one_sampler_test.ts | scripts/day-one/sample.vl (grades through `capability-probes.vl --grade-channel`, no longer imports `run.py`) |
| `scripts/emitter-state-audit.py` | 238 | T | tests/vl_emitter_state_audit_test.ts | done: `scripts/emitter-state-audit.vl`, output byte-identical to the Python's (default and `--names`) and now the L7 `emitter state budget` ratchet; the `.py` is deleted |
| `scripts/goal-scoreboard.py` | 273 | T | tests/vl_invalid_module_position_test.ts tests/vl_live_sites_test.ts | done: `scripts/goal-scoreboard.vl`, pinned by `tests/vl_goal_scoreboard_test.ts`; the `.py` is deleted |
| `scripts/inventory/ls.py` | 200 | T | tests/vl_inventory_rows_test.ts | deleted: `scripts/inventory/ls.vl`, graded beside it flag by flag |
| `scripts/ladder-census.py` | 884 | T | tests/lsp_ratchet_hold_test.ts tests/vl_kind_ladder_test.ts | scripts/ladder-census.vl (shares the budget walk) |
| `scripts/memo-generation-probe.py` | 403 | T | tests/vl_memo_generation_test.ts | done: `scripts/memo-generation-probe.vl`, rows in `scripts/memo-generation-rows.json`; the `.py` is deleted |
| `scripts/plumb-shape-cost.py` | 397 | T | tests/vl_plumb_shape_port_test.ts | done: deleted; `scripts/plumb-shape-cost.vl` runs the gate row and the port test pins its outcomes |
| `scripts/sentinel-census.py` | 481 | T | tests/vl_budget_mode_test.ts tests/vl_sentinel_index_test.ts | scripts/sentinel-census.vl (shares the budget walk) |
| `scripts/silent-sweep/census/gradecensus.py` | 217 | T | tests/vl_regress_port_test.ts | deleted: `census/gradecensus.vl`, grading shared with `regress.vl` through `scripts/lib/census-grade.vl` |
| `scripts/silent-sweep/distilled/cellmap.py` | 35 | I | none | done: deleted; `loadCells`/`dumpCells` in `scripts/lib/corpus.vl` round-trip its files byte for byte |
| `scripts/silent-sweep/distilled/index.py` | 157 | T | tests/vl_regress_port_test.ts | deleted: `distilled/index.vl` |
| `scripts/silent-sweep/grade.py` | 165 | T | docs/internals/inventory/README.md (the test reach was `survey-regrade.py` matching as a substring; it is D) | done: deleted; `scripts/silent-sweep/grade.vl` matched its stdout and csv byte for byte on two real sweeps, and `tests/vl_grade_test.ts` pins every column and the two named disagreements |
| `scripts/survey-regrade.py` | 463 | T | tests/vl_seed_provenance_test.ts tests/vl_survey_measure_test.ts (+1) | done: deleted; `scripts/survey-regrade.vl` runs the gate row, its port test holds it to the Python's frozen reports |
| `scripts/wasm-runner-census.py` | 172 | T | tests/cases_wasm_0_test.ts tests/cases_wasm_1_test.ts (+3) | scripts/wasm-runner-census.vl (shares the budget walk) |

### I: imported

| File | Lines | Class | Reached by | Planned VL replacement |
| --- | --- | --- | --- | --- |
| `scripts/day-one/grammar.py` | 802 | I | scripts/day-one/sample.py | scripts/day-one/grammar.vl |
| `scripts/day-one/imports.py` | 168 | I | scripts/day-one/sample.py | scripts/day-one/imports.vl |
| `scripts/day-one/render.py` | 541 | I | scripts/day-one/modules.py | scripts/day-one/render.vl |
| `scripts/inventory/rows.py` | 120 | I | scripts/inventory/ls.py (+2) | deleted: `scripts/lib/inventory.vl` |
| `scripts/inventory/selftest.py` | 127 | I | scripts/inventory/split.py | retired with `split.py` |
| `scripts/inventory/split.py` | 388 | I | scripts/check-filed-witnesses.py | retired: both inventories are split, and the generated `INDEX.md` it wrote (stale at 608 rows) went with it |
| `scripts/profile-rank.py` | 98 | I | scripts/perf/profile-parents.py scripts/perf/profile-phases.py (+1; `survey-regrade.py` is deleted) | done: deleted; `scripts/profile-rank.vl` (`perf/guest-profile.sh` calls it) matched it on real profiles, and `tests/vl_profile_rank_test.ts` pins the rounding tie and the error lines it could not match |
| `scripts/silent-sweep/corpuscmp.py` | 91 | D | dated reports and READMEs | done: deleted; `scripts/silent-sweep/corpuscmp.vl` matched it over the whole corpus and three candidate seeds, and `tests/vl_corpuscmp_test.ts` pins its verdicts |
| `scripts/silent-sweep/d451/mkcells.py` | 246 | X | nothing since `gradecensus.py` (a comment) was deleted | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/distilled/redistil.py` | 153 | I | scripts/silent-sweep/distilled/index.py | deleted: `distilled/redistil.vl` |
| `scripts/silent-sweep/sabotage.py` | 162 | I | scripts/check-filed-witnesses.py | retired: nothing ran it (the grader only cited it); its proof that the silent columns fire is carried every gate run by the distilled corpus's known-silent `named/` cells |

### D: documented

| File | Lines | Class | Reached by | Planned VL replacement |
| --- | --- | --- | --- | --- |
| `bench/algorithms/binarytrees/main.py` | 64 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/algorithms/dispatch-table/main.py` | 77 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/algorithms/lambda-hot/main.py` | 60 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/algorithms/mandelbrot/main.py` | 62 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/algorithms/map-filter-reduce/main.py` | 60 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/algorithms/nbody/main.py` | 153 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/algorithms/spectralnorm/main.py` | 69 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/arith/bitcount/main.py` | 10 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/arith/bitops/main.py` | 18 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/arith/convert/main.py` | 11 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/arith/f64-accum/main.py` | 11 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/arith/floatops/main.py` | 18 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/arith/i32-accum/main.py` | 11 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/arith/i64-accum/main.py` | 9 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/arith/intdivmod/main.py` | 11 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/arith/mixed-width/main.py` | 16 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/arrays/binsearch/main.py` | 44 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/arrays/fill-sum/main.py` | 20 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/arrays/matmul/main.py` | 28 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/arrays/push-growth/main.py` | 19 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/arrays/push-known-size/main.py` | 26 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/arrays/reverse-inplace/main.py` | 29 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/arrays/sort-heap/main.py` | 64 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/arrays/struct-aos/main.py` | 31 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/arrays/struct-soa/main.py` | 26 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/collections/live-set-churn/main.py` | 31 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/collections/map-i32/main.py` | 44 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/collections/map-string/main.py` | 44 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/collections/set-ops/main.py` | 53 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/collections/struct-alloc/main.py` | 52 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/collections/struct-array-scan/main.py` | 40 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/collections/struct-field/main.py` | 56 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/collections/word-freq/main.py` | 67 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/recursion/ackermann/main.py` | 16 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/recursion/deeprec/main.py` | 14 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/recursion/fib/main.py` | 8 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/recursion/flatcall-inlined/main.py` | 8 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/recursion/flatcall/main.py` | 12 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/recursion/mutual/main.py` | 20 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/recursion/tailcall/main.py` | 14 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/recursion/treewalk/main.py` | 37 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/strings/char-scan/main.py` | 39 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/strings/concat-build/main.py` | 23 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/strings/int-format/main.py` | 23 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/strings/slice-extract/main.py` | 36 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/strings/str-eq/main.py` | 64 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/strings/substr-search/main.py` | 41 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `bench/strings/token-count/main.py` | 58 | D | bench/run.sh bench/README.md | drop the python column from bench/run.sh (comparison language, not tooling) |
| `scripts/day-one/file_row.py` | 160 | D | scripts/day-one/README.md | scripts/day-one/file_row.vl |
| `scripts/day-one/minimise.py` | 258 | D | scripts/day-one/README.md | scripts/day-one/minimise.vl |
| `scripts/emit-refusal-sites.py` | 226 | D | CLAUDE.md scripts/capability-probes/README.md | port to VL or retire (decide at its turn) |
| `scripts/gen-atomic-cases.py` | 291 | D | doc tool (+4) | scripts/gen-atomic-cases.vl (fixture generator) |
| `scripts/gen-conv-cases.py` | 398 | D | doc tool (+4) | scripts/gen-conv-cases.vl (fixture generator) |
| `scripts/gen-shift-mask-fold.py` | 159 | D | doc tool (+4) | scripts/gen-shift-mask-fold.vl (fixture generator) |
| `scripts/gen-simd-int-cases.py` | 450 | D | doc tool (+4) | scripts/gen-simd-int-cases.vl (fixture generator) |
| `scripts/p7-patch.py` | 156 | D | doc tool (+4) | port to VL or retire (decide at its turn) |
| `scripts/perf/parent-let-cache-probe.py` | 245 | D | doc tool (+4) | scripts/perf/parent-let-cache-probe.vl |
| `scripts/perf/per-test-rank.py` | 56 | D | doc tool (+4) | scripts/perf/per-test-rank.vl |
| `scripts/perf/profile-parents.py` | 59 | D | doc tool (+4) | scripts/perf/profile-parents.vl |
| `scripts/perf/profile-phases.py` | 104 | D | doc tool (+4) | scripts/perf/profile-phases.vl |
| `scripts/perf/string-concat-sites.py` | 94 | D | doc tool (+4) | scripts/perf/string-concat-sites.vl |
| `scripts/rep-classifier-census.py` | 650 | D | doc tool (+4) | port to VL or retire (decide at its turn) |
| `scripts/silent-sweep/census/coverage.py` | 77 | D | scripts/silent-sweep/census/README.md | scripts/silent-sweep/census/coverage.vl |
| `scripts/silent-sweep/census/delta.py` | 117 | D | scripts/silent-sweep/census/README.md scripts/silent-sweep/d243/README.md | scripts/silent-sweep/census/delta.vl |
| `scripts/silent-sweep/census/families.py` | 120 | D | scripts/silent-sweep/census/README.md | scripts/silent-sweep/census/families.vl |
| `scripts/silent-sweep/census/gencensus.py` | 867 | D | scripts/silent-sweep/census/README.md scripts/silent-sweep/d181/README.md (+2) | scripts/silent-sweep/census/gencensus.vl |
| `scripts/silent-sweep/census/mkmatrix.py` | 233 | D | scripts/silent-sweep/census/README.md | scripts/silent-sweep/census/mkmatrix.vl |
| `scripts/silent-sweep/census/rescue.py` | 81 | D | scripts/silent-sweep/census/README.md scripts/silent-sweep/d181/README.md | scripts/silent-sweep/census/rescue.vl |
| `scripts/silent-sweep/census/rows.py` | 73 | D | scripts/silent-sweep/census/README.md | scripts/silent-sweep/census/rows.vl |
| `scripts/silent-sweep/census/sabcensus.py` | 141 | D | scripts/silent-sweep/census/README.md | scripts/silent-sweep/census/sabcensus.vl |
| `scripts/silent-sweep/census/siblings.py` | 76 | D | scripts/silent-sweep/census/README.md | scripts/silent-sweep/census/siblings.vl |
| `scripts/silent-sweep/counts.py` | 61 | D | docs/internals/inventory/README.md scripts/silent-sweep/REPRODUCE.md | port to VL or retire (decide at its turn) |
| `scripts/silent-sweep/d111/ablate111.py` | 117 | D | scripts/silent-sweep/d111/README.md scripts/silent-sweep/d131/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d111/gen111.py` | 212 | D | scripts/silent-sweep/d111/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d112/gen112.py` | 191 | D | scripts/silent-sweep/d112/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d131/gen131.py` | 219 | D | scripts/silent-sweep/d131/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d139/gen139.py` | 63 | D | scripts/silent-sweep/d139/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d139/grade139.py` | 51 | D | scripts/silent-sweep/d139/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d14/lengrid.py` | 96 | D | scripts/silent-sweep/d14/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d156/gen156.py` | 199 | D | scripts/silent-sweep/d156/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d181/gen181.py` | 82 | D | scripts/silent-sweep/d181/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d184/genlist.py` | 239 | D | scripts/silent-sweep/d184/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d188/aliasgrid.py` | 134 | D | scripts/silent-sweep/d188/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d188/isgrid.py` | 101 | D | scripts/silent-sweep/d188/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d199/gen199.py` | 184 | D | scripts/silent-sweep/d199/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d224/gen224.py` | 49 | D | scripts/silent-sweep/d224/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d224/pairs224.py` | 74 | D | scripts/silent-sweep/d224/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d243/genbox.py` | 316 | D | scripts/silent-sweep/d243/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d243/mkset.py` | 58 | D | scripts/silent-sweep/census/README.md scripts/silent-sweep/d199/README.md (+2) | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d272/gen272.py` | 105 | D | scripts/silent-sweep/d272/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d282/gen282.py` | 140 | D | scripts/silent-sweep/d282/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d290/gen290.py` | 120 | D | scripts/silent-sweep/d290/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d341/mkgrid.py` | 204 | D | scripts/silent-sweep/d341/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d352/parengrid.py` | 142 | D | scripts/silent-sweep/d352/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d361/genbind.py` | 69 | D | scripts/silent-sweep/d361/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d52/delta.py` | 97 | D | scripts/silent-sweep/d52/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d52/gen52.py` | 280 | D | scripts/silent-sweep/d52/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d52/pivot52.py` | 32 | D | scripts/silent-sweep/d52/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d52/sweep52.py` | 151 | D | scripts/silent-sweep/d111/README.md scripts/silent-sweep/d131/README.md (+4) | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d87/ablate87.py` | 160 | D | scripts/silent-sweep/d87/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d87/gen87.py` | 286 | D | scripts/silent-sweep/d87/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d88/ablate88.py` | 84 | D | scripts/silent-sweep/d88/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d88/gen88.py` | 119 | D | scripts/silent-sweep/d88/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d88/grade88.py` | 75 | D | scripts/silent-sweep/d112/README.md scripts/silent-sweep/d156/README.md (+4) | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d94/ablate94.py` | 117 | D | scripts/silent-sweep/d94/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/d94/gen94.py` | 330 | D | scripts/silent-sweep/d94/README.md | retire: closed grid; keep README + data, drop the generator |
| `scripts/silent-sweep/final.py` | 70 | D | scripts/silent-sweep/REPRODUCE.md | port to VL or retire (decide at its turn) |
| `scripts/silent-sweep/gen.py` | 628 | D | docs/internals/inventory/README.md scripts/silent-sweep/REPRODUCE.md (+1) | port to VL or retire (decide at its turn) |
| `scripts/silent-sweep/genorder.py` | 135 | D | docs/internals/inventory/README.md scripts/silent-sweep/REPRODUCE.md (+1) | port to VL or retire (decide at its turn) |
| `scripts/silent-sweep/mkrepro.py` | 728 | D | scripts/silent-sweep/REPRODUCE.md | port to VL or retire (decide at its turn) |
| `scripts/silent-sweep/pairscope.py` | 91 | D | docs/internals/inventory/README.md scripts/silent-sweep/REPRODUCE.md | port to VL or retire (decide at its turn) |
| `scripts/silent-sweep/pivot.py` | 41 | D | docs/internals/inventory/README.md scripts/silent-sweep/REPRODUCE.md | port to VL or retire (decide at its turn) |
| `scripts/silent-sweep/pivotG.py` | 25 | D | scripts/silent-sweep/REPRODUCE.md | port to VL or retire (decide at its turn) |
| `scripts/silent-sweep/summ.py` | 25 | D | scripts/silent-sweep/REPRODUCE.md | port to VL or retire (decide at its turn) |
| `scripts/silent-sweep/tp-join/grid.py` | 275 | D | scripts/silent-sweep/d14/README.md scripts/silent-sweep/d188/README.md (+2) | retire with the grids that import it |
| `scripts/silent-sweep/verify.py` | 67 | D | scripts/silent-sweep/REPRODUCE.md | port to VL or retire (decide at its turn) |
| `scripts/std-math/arc-tables.py` | 40 | D | doc tool (+4) | VL port with exact-rational tables, or retire after the tables are frozen |
| `scripts/std-math/explog-tables.py` | 169 | D | doc tool (+4) | VL port with exact-rational tables, or retire after the tables are frozen |
| `scripts/std-math/math-grade.py` | 203 | D | doc tool (+4) | VL port with exact-rational tables, or retire after the tables are frozen |
| `scripts/std-math/trig-grade.py` | 78 | D | doc tool (+4) | VL port with exact-rational tables, or retire after the tables are frozen |
| `scripts/std-math/trig-remez.py` | 77 | D | doc tool (+4) | VL port with exact-rational tables, or retire after the tables are frozen |
| `scripts/twin-agreement.py` | 298 | D | L2 refactor (+6) | port to VL or retire (decide at its turn) |

### X: deleted in this PR

| File | Lines | Class | Reached by | Planned VL replacement |
| --- | --- | --- | --- | --- |
| `scripts/block-census.py` | 88 | X | nothing | deleted in this PR |
| `scripts/capability-probes/const-exact-grid.py` | 260 | X | nothing | deleted in this PR |
| `scripts/capability-probes/covar-scope-grid.py` | 272 | X | nothing | deleted in this PR |
| `scripts/capability-probes/generic-let-written-grid.py` | 260 | X | nothing | deleted in this PR |
| `scripts/capability-probes/list-kind-grid.py` | 418 | X | nothing | deleted in this PR |
| `scripts/capability-probes/literal-binding-grid.py` | 231 | X | nothing | deleted in this PR |
| `scripts/capability-probes/narrowed-write-grid.py` | 287 | X | nothing | deleted in this PR |
| `scripts/flow-narrowing/assign-join-grid.py` | 197 | X | nothing | deleted in this PR |
| `scripts/flow-narrowing/join-compare.py` | 24 | X | nothing | deleted in this PR |
| `scripts/flow-narrowing/join-grid.py` | 248 | X | nothing | deleted in this PR |
| `scripts/flow-narrowing/join-hazards.py` | 921 | X | nothing | deleted in this PR |
| `scripts/flow-narrowing/join-kills.py` | 125 | X | nothing | deleted in this PR |
| `scripts/flow-narrowing/pop-length-grid.py` | 228 | X | nothing | deleted in this PR |
| `scripts/fn-table-audit.py` | 156 | X | nothing | deleted in this PR |
| `scripts/literal-tree-grid.py` | 264 | X | nothing | deleted in this PR |
| `scripts/record-covariance/adoption-grid.py` | 90 | X | nothing | deleted in this PR |
| `scripts/record-covariance/compare.py` | 21 | X | nothing | deleted in this PR |
| `scripts/record-covariance/position-grid.py` | 124 | X | nothing | deleted in this PR |
| `scripts/refslot-consumer-census.py` | 60 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/census/analyze.py` | 68 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/census/mkmin.py` | 129 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/census/mkmin2.py` | 123 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/census/mkrows2.py` | 256 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/census/mkrows3.py` | 126 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/census/pick.py` | 52 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/census/pick2.py` | 59 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d181/twin181.py` | 230 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d2567/genlam.py` | 92 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d2572/gen.py` | 32 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d3079/gen.py` | 107 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d3125/gen.py` | 77 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d401/mkset.py` | 92 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d401/printgrid.py` | 171 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d411/gen411.py` | 281 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d411/grade411.py` | 101 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d426/lamgrid.py` | 187 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d444/opgrid.py` | 288 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d471/opdeclgrid.py` | 534 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d492/pingrid.py` | 571 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d501/reachprobe.py` | 223 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d511/pingrid2.py` | 570 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d521/unannotgrid.py` | 492 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d532/opretgrid.py` | 569 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d551/retgrid.py` | 856 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d572/letgrid.py` | 867 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d581/litgrid.py` | 1053 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d591/joingrid.py` | 1072 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d661/gen661.py` | 340 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d661/grade661.py` | 90 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d741/gen741.py` | 286 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/d833/gen833.py` | 126 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/minimise-cell.py` | 58 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/mkprobes.py` | 249 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/mkprobes2.py` | 252 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/mkprobes3.py` | 199 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/mkprobes4.py` | 85 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/mkprobes5.py` | 244 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/mkrepro2.py` | 335 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/mkrepro3.py` | 173 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/mkrepro4.py` | 208 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/nulvariant/delta.py` | 48 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/nulvariant/grid1-callboundary.py` | 220 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/nulvariant/grid2-monopin.py` | 162 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/nulvariant/grid3-position.py` | 136 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/nulvariant/grid4-specimenhunt.py` | 137 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/rv3175/gen.py` | 67 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/rv3189/gen.py` | 66 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/rv3571/gen.py` | 49 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/show1.py` | 26 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/show2.py` | 18 | X | nothing | deleted in this PR |
| `scripts/silent-sweep/showres.py` | 27 | X | nothing | deleted in this PR |
| `scripts/test-timing.py` | 266 | X | nothing | deleted in this PR |
