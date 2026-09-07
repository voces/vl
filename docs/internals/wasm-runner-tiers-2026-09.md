# The wasm-runner census and its tiers — 2026-09-07

ROADMAP row 28 read: *"F-tiers / J1 — collapse the redundant corpus runner. 8 files execute
emitted wasm under V8 via `tests/support/runWasm.ts`."*

**The census refutes the premise.** There is already ONE runner and ONE oracle; nothing is
redundant; and the row's own count had gone stale before anyone acted on it. What was missing
is the thing this doc adds: a derived population, a stated tier, and a gate that keeps both
true.

## The population is derived, because the hand-count was wrong

`scripts/wasm-runner-census.py` takes every `tests/*.ts` that reaches an instantiation — an
import of `runWasm` or `casesWasmOracle`, or a bare `WebAssembly.instantiate`, from CODE and
not from a comment. Two files that merely name one in prose (`module_gate_agreement_test.ts`,
`vl_run_args_test.ts`) are correctly excluded.

| file | role | compile path | grade |
| --- | --- | --- | --- |
| `cases_wasm_0..3_test.ts` | oracle shard | seed, in-process | `@log` output / `@trap` reason / `@hint` text |
| `vl_exported_memory_test.ts` | standalone | native `vl build` | the host reads `instance.exports.memory` in place |
| `vl_global_promotion_test.ts` | standalone | native `vl build` | GLOBAL section entry count, plus output through the OTHER path |
| `vl_instance_state_leak_test.ts` | standalone | seed, one SHARED instance | emission byte-identity against a fresh-instance oracle |
| `vl_reexport_abi_test.ts` | standalone | native `vl build` | the EXPORT section aliases the public name |
| `vl_std_process_test.ts` | standalone | native `vl build` | `std:process` / `std:env` across both hosts |
| `vl_seed_abi_test.ts` | seed ABI | none — instantiates the SEED | the seed's own export shape; not emitted user wasm |

**Nine files execute emitted user wasm, not eight** — four shards and five standalone suites.
The row said four standalone; `vl_std_process_test.ts` arrived and nothing was counting. That
is the whole argument for deriving it: `tests/vl_wasm_runner_census_test.ts` now fails until a
new runner is classified.

## Nothing in that table is redundant, and each claim was checked

* **The four shards are not four runners.** Each is `registerCorpusOracle(k, 4)` and nothing
  else. Deno gives one worker per FILE, so the single file this used to be ran the whole corpus
  on one core — 44 s of the job. The split is parallelism, and the shards partition the case
  list so every cell is graded exactly once.
* **The five standalone suites each grade something the oracle cannot.** The oracle adjudicates
  `@log` / `@trap` / `@hint`; a memory view read from the host, a GLOBAL section count, an
  EXPORT alias, cross-instance byte-identity and a process floor are none of those.
* **The 34 cells a standalone suite ALSO runs are a cross-path agreement check, not a
  duplicate.** `vl_global_promotion_test` compiles through the native `vl build` SUBPROCESS
  while the oracle compiles in-process through the seed instance; asserting the same `@log`
  through both is the only thing in the tree that would catch the two paths disagreeing. The
  28 in `vl_instance_state_leak_test` are graded on byte-identity, not output at all — its one
  `runWasm` call exists to prove the oracle is a module V8 accepts.

## The tiers, stated

Nothing said this anywhere; `scripts/gate.sh`'s `--ignore` list encoded it implicitly.

| tier | what runs | how it is selected |
| --- | --- | --- |
| **`ci` job — every PR** | the seed-gated suites SELF-IGNORE | that job builds no seed, so `exists(COMPILER)` is false and every wasm-executing suite skips |
| **`ci-native` job** | the five standalone suites | the `tests/vl_*_test.ts` glob |
| **`ci-native` job** | the four shards | named one by one in the "Corpus oracle on the wasm compiler" step, so `tests/ci_seed_coverage_test.ts` can hold the step to naming every one |
| **`scripts/gate.sh` row 1** | the four shards | `deno test tests/` minus `--ignore=$DEDUPE`; the shards are in neither `$CI_NATIVE` nor `$LSP_CI`, so they land here |
| **`scripts/gate.sh` ci-native row** | the five standalone suites | the same `vl_*` glob CI uses |

**So nothing runs twice, in CI or locally** — the `ci` job's suites all self-ignore, and
`gate.sh` takes the complement. That was worth checking rather than assuming: the obvious
reading of two jobs both naming `tests/` is that the corpus is graded twice per CI run.

## The number a collapse would have to hold fixed

Not byte identity — nothing here emits bytes to compare. **The graded-cell SET**:

```
$ python3 scripts/wasm-runner-census.py --cells | head -1
corpus cells graded by the oracle shards: 3100
```

Validated against the oracle itself rather than trusted: the four shards report 776 + 770 + 768
+ 774 = **3,088 passed** plus **13 ignored** = 3,101 registered tests, which is the 3,100 cells
plus shard 0's stale-entry tripwire. A `.vl` glob answers 3,210 instead, because the oracle
yields ONE case for a directory holding an `entry.vl` — a file count wearing a cell count's
clothes, and the second test in the census suite exists to keep the two walks from drifting.

## What this PR changed, and what it did not

**Removed: nothing.** No file merged, no grade dropped, no cell left the set — 3,100 before and
3,100 after, cell for cell. Collapsing any of the nine would have cost a distinct grade.

**Added:** the derivation, the classification gate, this doc, and the tier table. Row 28 is
narrowed to what is actually left, which is a documentation and drift problem rather than a
duplication one.
