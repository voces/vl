# IR-X1: what a one-shot I8 would face (experiment, 2026-11-22)

Branch `ir-x1-oneshot` off master `898b840d`, measured against master's fixpoint seed. Not for merge.

## What the branch does

- `ir_build.vl`: `ibForce` (default on) admits every family, `raw` and `other` included, to the claim.
  A function or start body the IR does not claim is a hard `emitFail`:
  `IR-only miss [<class>] in function <name>`. A lifted function with extra results is a miss too.
- `$VL_IR_SHADOW=5` makes the forced claim report-only: one `fmiss <fn> | <class>` row per missed
  function, and legacy lowers it, so one compile names every miss.
- `irForceLegacy` counts the module-level bodies still written by legacy (`legacy module: <what>`).
- `ibRelax` (off) is the experiment that widens call results and arguments through `widenTo` instead
  of missing.
- `scripts/ir-x1/`: `cases.py` grades the run and trap tiers of tests/cases by stdout (a/b/c/d).
  `soft.sh` runs the report-only census, `an.py` ranks classes, `junit.py` buckets deno failures.

## Behaviour, forced IR-only (f1) against master

| population | master | forced IR | (b) IR miss | (c) wrong output | (d) trap/invalid |
|---|---:|---:|---:|---:|---:|
| tests/cases run+trap tiers (7,043) | 7,042 pass | 3,937 pass | 3,106 | 0 | 0 |
| `deno task test` (9,924 tests) | 9,924 pass | 6,755 pass | 3,168 | 0 | 0 (1 shape test) |
| native `selfhost_native_*` + `vl_*` (2,259) | 2,255 (4 = provenance) | 1,824 | 435 | 0 | 0 |
| distilled (12,304 cells) | 9,026 runs | 8,136 runs | 891 classes / 1,866 census cells | 0 silent | 0 |
| capability probes (281) | 280 run | 166 run | 114 | 0 silent | 0 |
| fuzz, 3 × 400 `--branching --multiobs` | 0 findings | 29/36/37 REJECT | all | 0 | 0 |

Every failure read was a compile-time IR miss. The deno and native failures without the miss text
are compile failures seen through another assertion (rc 3, `compiled=false`, empty stdout). The one
exception is `vl_memarg_const_fold_test`, a shape test, whose program still runs correctly.

## Admitting `raw` and `other` costs no bytes

- The self-compile under the forced claim, with the 63 missed functions left on legacy, is
  byte-identical to master's compile. It is a fixpoint.
- 298 of 300 sampled passing cases are byte-identical. The 2 that differ are the memarg offset fold
  (`intrinsics/memarg-const-fold-*`): the IR's `raw` lowering does not fold the offset. The bytes
  differ, the behaviour does not.

## The gap, tests/cases run tier

- 446 classes and 6,651 distinct missed functions. Std functions count once, by `$m`.
- 2,094 of 3,140 failing programs are blocked by one class alone. The tail is long: a greedy order
  of the top 10 classes unlocks 546 programs, and the top 30 unlock 968.
- Top classes by distinct functions: `call result coercion` 213, `box receiver` 173 (start bodies),
  `closure env capture` 162, `operand type` 146, `narrowed read` 145, `global read coercion` 137,
  `parameter rep ?` 128, `argument coercion` 127, `box ladder` 113, `is rung` 113,
  `capture binding` 106, `closure value of a call` 103 (start bodies), `tag dispatch result` 99.
- Start bodies are the first miss in 1,121 programs: top-level lets read as boxes, closure values
  of calls, coercions.
- Nearly every miss happens in the build. One is in the lowering (`effect outside I1`), and the
  verifier rejects none.

## Identity-only versus capability

- `ibRelax` widened through `widenTo`. It moved `call result coercion` from 213 to 199 functions and
  unlocked 1 program, because the remaining mismatches are structural. Split by rep: record to
  record 139, record to closure 69, closure to closure 34, list to list 26, into a box about 25.
  These need record copy, closure adaptation and list retag as IR conversions. That is capability,
  even though legacy tails exist for most of them.
- Classes whose names say they exist for legacy's order or bytes: `is staged` 55, `shift-mask fold
  narrowing source` 44, `coalesce box stash operand` 42, `coalesce nulRef operand temp` 31,
  `tail if is chain falls off` 12, plus the `after another` and `minted` rows. They total about 250
  of 6,651 functions (about 4%). With the memarg fold and a margin for misses I mislabelled, the
  identity-only share is at most about 10%.

## Module-level bodies still on legacy (count, programs, run tier)

- Closure thunks (`emitCloThunkCode`): in 1,977 programs, and 68 in the self-compile.
- Const cell initializers: `emitConstFoldValue` in 360 programs, unclaimed plain inits through
  `emitExpr` in 28, union-box inits in 14, generic-alias closures.
- Structural eq helper bodies (`eqHelpFnBody` through `emitStructEqRec`): 5 programs.
- The section writers (types, imports, functions, tables, memory, globals, exports, start,
  elements, data, names). These are not expression lowering.
- The runtime helpers are already the IR's (`ir*FnCode`).

## Self-compile

- Forced, it fails at `lexer.vl` `lexOperator`: `method cpAt`.
- 63 of about 19.8k compiled function instances miss, in 31 classes, so the IR claims 99.7%.
  `string operand coercion` alone is 15.
- With those 63 left on legacy, the seed is master's own bytes.
