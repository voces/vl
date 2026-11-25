# I8: the self-compile's `decodeArities` claims without legacy's hoist (2026-11-25)

Lane COV-CALL, at the coordinator's top priority. Under the I8 draft (`ir-i8-sweep.sh keep --pops
self`), the self-compile's first unit the IR could not claim was `decodeArities`
(`compiler/opt_multivalue.vl`). INFRA traced it to `claim fell back: a legacy helper refused …: i8
reentry emitStrValue`.

## Mechanism

`for s in [AR_00, AR_FB, AR_FC, AR_FD, AR_FE]` iterates module `const` strings, each built by
concatenating literals. `forLitConstStrOf` names only a plain literal, so `forLitElemWrites` said
no. `irForLitHoist` then asked legacy's hoist (`hoistInRangeCopy` → `arrLitHoistGlobal` →
`forLitHoistPlan`), which writes each element with `emitStrValue`, a re-entry under the sweep. On
master the hoist returns -1: the element's `global.get` is not one constant
(`isOneConstIns`), so the list builds as usual.

The IR now writes a string global's read itself: `forLitElemAt` takes it through `RGlobalGet`'s
own lowering, factored as `globalGetRhs` so the two share one writer. `forLitHoistAdd` then makes
the same one-constant decision for both sides. The pooled-string check applies only to a literal
element. Legacy is not changed.

## Proof

- `ir-i8-sweep.sh scripts/ir-i8-census/keep --pops self`: before, the self-compile stops on
  `reentry emitStrValue` in `decodeArities`; after, a self-compile fixpoint (step 2) with 0
  unexplained programs and no stub or re-entry reached.
- Byte identity, from a current master seed and from this branch's fixpoint seed: `tests/cases` 0
  of 9,422 differ, distilled + capability probes + witnesses 0 of 18,150, and the self-compile is
  identical.
- Q58 sweep: `tests/cases/loops/for-literal-of-string-globals.vl` iterates over concatenated
  `const`s, a mix with a literal `const`, a reassigned `let`, a nested walk over the elements, and
  module scope. Under the swept compiler of master, `concatenated` falls back on `reentry
  emitStrValue`; with this change every function and the start body claim.
