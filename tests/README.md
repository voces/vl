# tests/ — what each kind of test is for and how to run it

Everything under `tests/` is a Deno test file named `<family>_<topic>_test.ts`. **The prefix
is load-bearing**: `gate.sh` and `ci.yml` select suites by glob on it. **No test here imports
an assertion library**; they all `throw new Error` with want/got in the message.

Run one file: `deno test -A --no-check tests/<file>`. A file that drives the native binary
needs `SELFHOST_NATIVE_ALIGN=1` (its negative gates are skipped without it) and a seed:
`scripts/refresh-compiler.sh`. The whole ladder is `scripts/gate.sh`.
`tests/README.md` is held to the tree by `tests/tests_readme_test.ts`.

## Families

A file must match a Files pattern in this table (the drift guard reads the first column
of each row, backticked, `*` = any run of characters).

| Files | What it grades | `gate.sh` row | `ci.yml` job |
| --- | --- | --- | --- |
| `selfhost_native_*_test.ts` | The native `vl` binary on the seed, end to end: corpus alignment, diagnostics, GC, `build -O` | `ci-native` | `ci-native` shards |
| `selfhost_native_release_*_test.ts`, `selfhost_native_opt_test.ts` | The `-O3` / wasm-opt / wasm-dis output shape (a subset of the row above) | `ci-native` | `ci-release-shape` (listed in its SUITES block) |
| `vl_*_test.ts` | The `vl` CLI, compiler, linter, formatter, std and the repo's own ratchets; most spawn the binary | `ci-native` | `ci-native` shards |
| `cases_wasm_*_test.ts` | The corpus oracle: `tests/cases/` through the seed driven as a wasm module (shard files over `tests/support/casesWasmOracle.ts`) | `deno task test` | `checks`, "Corpus oracle on the wasm compiler" |
| `lsp_*_test.ts` | Editor features (hover, completion, rename, inlay hints, semantic tokens) | `lsp suites (ci list)` for the seed-backed ones, else `deno task test` | `checks`, "Editor features on the wasm compiler", else `ci` |
| `playground_*_test.ts` | The browser playground's LSP, completion, trap frames and theme | as `lsp_*` | as `lsp_*` |
| `ci_*_test.ts` | The CI wiring itself: shard partition, seed-backed coverage of ci.yml's lists, the docs-only doc-reader list | `deno task test` | `ci` |
| `cli_*_test.ts`, `budget_*_test.ts`, `keyword_*_test.ts`, `module_*_test.ts`, `std_*_test.ts`, `tests_*_test.ts` | Single-file cross-checks of one table or one vocabulary against its twin (CLI vs host, budget targets, keywords, module gate, embedded std, this index) | `deno task test` | `ci` |

`deno task test` (`deno.json`) runs every file in `tests/` that the other rows do not claim.
`scripts/ci-shard.sh native|release <k> <n>` is the partition of the `ci-native` and
`ci-release-shape` files into shards; `tests/ci_shard_test.ts` holds it to a partition.
The scaling-shape file is its own row (`scaling shape`) and, with the cost ratchets, runs
only off pull requests in `ci-cost`.

## vl_* by topic

| Files | Topic |
| --- | --- |
| `vl_check_*`, `vl_invalid_*`, `vl_unknown_*` | Checker verdicts and diagnostics |
| `vl_std_*` | `std:*` modules |
| `vl_lint_*`, `vl_fmt_*` | Linter rules and the formatter |
| `vl_inventory_*`, `vl_survey_*` | Filed-witness rows and survey measurements (see below) |
| `vl_capability_*` | Capability probes and the matrix generator (see below) |
| `vl_seed_*`, `vl_compile*_*` | Seed size, compile cost and compile output |
| `vl_scaling_shape_test.ts`, `vl_no_conflict_markers_test.ts`, `vl_inventory_refs_test.ts` | Pure file scans or measurements with their own `gate.sh` row |

## Fixtures and support

| Path | Role |
| --- | --- |
| `tests/cases/<area>/*.vl` | The corpus. A file's own `// @` directives classify it; a file with none is a module part, not a case |
| `tests/fixtures/` | Inputs for one suite (`opt-*` for the release shape, `vl-test*` for `vl test`, and so on) |
| `tests/support/` | Shared helpers; not tests |

### tests/cases directives

| Directive | Meaning |
| --- | --- |
| `// @run` with `// @log <line>` | Compiles and runs; stdout lines must equal the `@log` lines in order. These are the logged values |
| `// @check` | Must type-check clean and nothing more |
| `// @error <text>`, `// @error-at <line>:<col> <text>` | A checker reject; each diagnostic must match a directive and each directive a diagnostic. `error-*.vl` file names mark these by convention |
| `// @warning`, `// @info`, `// @hint` | The same contract at a lower severity |
| `// @trap` | Runs and must trap |
| `// @emit-error <text>` | Passes `check`, refused at emit |
| `// @skip` | Not graded |

The authoritative list and rules are the headers of `tests/support/casesWasmOracle.ts` and
`tests/selfhost_native_align_test.ts`.

## Other instruments, not Deno suites

| What | Where | How to run | `gate.sh` row | `ci.yml` |
| --- | --- | --- | --- | --- |
| Capability probes: one program per capability gap | `scripts/capability-probes/*.vl` | `vl run scripts/capability-probes.vl -- --live-sites` or `--floor` | `capability probes` | `checks`, "Capability probes (live sites + clause-1 floor)" |
| Matrix templates: one template becomes a position x face grid | `scripts/capability-probes/matrix/*.matrix.vl` | `vl run scripts/capability-matrix.vl -- <template>` | none (graded by `tests/vl_capability_matrix_test.ts`) | none |
| Inventory witnesses: each row's `Repro:` program | `docs/internals/inventory/`, `inventory-2/` | `vl run scripts/check-filed-witnesses.vl -- --strict <dirs>` | `filed witnesses`, `inventory refs` | `inventory refs` only, inside `ci-native` |
| Distilled corpus | `scripts/silent-sweep/distilled/` | `vl run scripts/silent-sweep/distilled/regress.vl -- build/vl-compiler.wasm` | `distilled corpus` | none |
| `.vl` test files for `vl test` | `*.test.vl` | `vl test <path>` | none | none |
