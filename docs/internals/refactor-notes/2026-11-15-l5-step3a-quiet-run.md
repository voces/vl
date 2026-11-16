# L5 step 3a: the quiet re-check brackets as `QuietRun` values (2026-11-15)

Part of L5 step 3 (`CheckRun`, `2026-11-14-phase-products-design.md` §2.2, §3). This slice covers the
six re-check brackets that `2026-11-15-relate-recorder-design.md` §1.4 assigns to L5. The 14 fit
brackets stay with lane relate.

## What changed

- **`check_cursor.vl`: `quietEnter(): boolean` and `quietLeave(q)`.** These are now the only code
  that sets `inferQuiet` together with `quietDepth`. A bracket holds the flag it replaced as a value.
- **`check_rollback.vl`: `type QuietRun = {mark, sym, quiet}`.**
  - `quietRunOpen()` reports `prbEnter`, takes `checkMark()`, and turns `symEnabled` and reporting off.
  - `quietRunEnd(r)` restores both flags.
  - `quietRunDrop(r, set, site)` rolls back and reports `prbLeave(site)`. It is separate from
    `quietRunEnd` because `solveUnannotParams` reads `holeFlow` between the two.
- **Sites:**

| site | before | after |
|---|---|---|
| `solveUnannotParams`, `globalInitPrePass`, `cstrProbeBefore`, `inferReturnsPrePass` | `prbEnter`, mark, two saves, three writes; three restores, rollback, `prbLeave` | `quietRunOpen` / `quietRunEnd` / `quietRunDrop` |
| `bankGenAliasDeclTys`, `letFnLambdaParamTys` (two exits), `dstTyParamAdapts`'s nested-call ask | save, two writes; two restores | `quietEnter` / `quietLeave` |

- **`inferReturnsPrePass` is a seventh site.** It wrote `inferQuiet = false` on exit, not the saved
  flag. It only runs at the top level, where the flag is false, so restoring the saved value gives
  the same answer, and the fingerprints below confirm it.
- **Not touched:**
  - `dstTyParamAdapts`'s other two brackets and the 11 other fit brackets (lane relate);
  - `callArgRepTy` and `callRetRepTy`, which set `inferQuiet` with no depth;
  - `monoRecheckBegin`/`End`, whose `MonoSave` becomes a child run later in step 3.
- **`inferQuiet` is not deleted.** Every bracket that still sets it now pairs it with `quietDepth`,
  except the two `check_bind_adopt.vl` asks. Once lane relate's brackets are gone, `inferQuiet`
  becomes `quietDepth > 0`.

## The census

`phase-state-census.vl -- --list` drops from 14 to 10 `inferQuiet` scope rows. Four are removed by
this PR. A fifth, `dstTyParamAdapts`, stays because the `savedQ` it reads also serves lane relate's
bracket. One row is added for `quietEnter` itself. `symEnabled`'s hidden row in `check_state.vl`
falls from 1 to 0, because no function saves it to a local any more. `--write-baseline` records
that fall, plus `emit_ty_canon.vl`'s surface fall from master.

## Gate

- **Seeds:** A is a fixpoint built from `git archive 10a7cc4d6` (this branch's master); D is a fixpoint
  built from this branch. Both are reached at rung 2.
- **Identity:** `probe-rollback-census.ts --fingerprint` over `tests/cases`, `distilled/cells` and
  `distilled/named` gives **20,298 programs, 0 different**.
- **L2:** the base tree's `compiler/entry.vl` built with A and with D is byte-identical. Guest fuel is
  88,302,566,828 for A and 88,302,566,902 for D (+74).
- **Gates:** `regress.vl` reports no runs lost. `lint-self.sh` is clean. The probe-rollback,
  emitter-state audit, phase-state, memo-generation and pin-helper tests pass.
- **`tests/vl_probe_rollback_test.ts`:** the probe reach now also starts from modules that call
  `quietRunOpen()`. Without that, four rows go stale (`lamRetWritten`, `modLetNames`, `igPos`,
  `igByName`), because `check_fn_decl.vl` and `check_top_level.vl` no longer call `prbEnter()`
  themselves.

## Lines

The compiler is **+77 / −84, net −7** over 7 modules. The two helper modules gain 43 lines, and the five site modules lose 50.
