# Step 7: `njKindOfExpr`'s fallback rungs are deleted, and `annSigKeyTy`'s spelling path is measured, 2026-11-10

This covers row 4 of `2026-11-10-step7-vkind-census.md` §4, for `njKindOfExpr`'s three syntax
rungs, and measures `annParamKindTy`'s spelling-only path. Base is master `aa36acae` (#7097). Its
fixpoint seed is 6,603,813 bytes.

## Orchestrator rulings recorded

These are also in DECISIONS.md, under "Step 7: what VKind producers stand by design (2026-11-10)".

- `ifExprRefKindAt`'s object-literal arm stands by design. An `ObjLit` is built at its context's row.
- `letCellKindGo`'s `holderRecordSigs` arm stands by design. It is the emitter's own bundle layout.
- `repKindOfSigTok` stands while `$fnsig` keys are strings.

All three fall under the classifier-half ruling: a storage or layout fact belongs to the emitter.

## 1. `njKindOfExpr`'s rungs were never reached

`njKindOfExpr` gave the kind of a scalar operand of a numeric-union operator. It returned
`njKindOfTy(nodeTyIxOf(ix))`. When that was not a number, it fell to three syntax rungs
(`exprIsF64`, `exprIsF32`, `exprIsI64`) and then to `0`.

**The probe.** A probe compiler put a distinctive `emitFail` on each rung and on the `0` default. It
was built by the base seed into scratch, never refreshed into `build/`. A control compiler put one
`emitFail` at the function's entry instead.

**The control fires.** The control's sweep of the whole population (23,857 programs) records
`NJPROBE-CONTROL` in 2 cells:

- `generics/kept-join-call-result-in-arithmetic.vl`;
- `unions/captured-copy-of-mixed-width-litunion-list.vl`.

Four hand-written programs also fire it. They use an alias `i32 | f64` union beside a call result,
a `const`, a `let` `f64`, a list element, `.length` and a generic identity call.

**The probe does not fire.** The probe's sweep of the same 23,857 programs records 0 cells with an
`NJPROBE-*` message. The same four hand-written programs are also silent. So every operand that
reaches the function already has a numeric recorded type.

**The change.** The rungs are deleted. The `k < 0` case is now an invariant `emitFail`. It used to
be a silent i32. `njStash` returns -1 on it, and `njScalarTy` is the recorded type behind the same
test. `fnIx` leaves both signatures.

## 2. `annSigKeyTy`'s spelling path is reached in 6 programs

`annParamKindTy`'s only caller is `annSigKeyTy`'s spelling loop, and it always passes `ty = -1`.
That loop runs only when no function type of the spelling's arity came.

**The control fires.** A control compiler put an `emitFail` at `annSigKeyTy`'s entry. Its sweep
fires in 45 cells.

**The probe.** A second probe fired only when the spelling loop produced a non-empty key. That is the
only case where deleting the loop could move an answer, because the loop's empty answer is the same
as having no loop. It fires in **6 of 23,857** programs. All 6 have `fty < 0`, and none has an
arity mismatch or a non-function type:

| cell | spelling | key |
| --- | --- | --- |
| `closures/hole-fn-in-unannotated-map.vl` | `(i32)=>i32` | `i>i` |
| `closures/is-remainder-field-closure-call-in-hole-body.vl` | `()=>i32` | `>i` |
| `unions/arm-struct-equality.vl` | `(i32)=>i32` | `i>i` |
| `unions/union-variant-field-reps-equality.vl` | `()=>i32` | `>i` |
| `unions/variant-closure-field.vl` | `()=>boolean` | `>i` |
| `inventory/D3232.md#D3232` | `()=>i32` | `>i` |

**Where `-1` comes from.** Tagged probes on the callers find one caller: `fieldCloSigOf` (the
`sFieldCloSig` column) called with a field type of -1. There are two routes to it:

- **`internInlineShapeTyGo`** (`emit_shape_intern.vl`, the `sFieldCloSig.push`). It interns an
  inline shape with `tyIx = -1`, so `shapeFieldRowOf` has no field type to give. This is 4 of the 5
  `tests/cases` cells.
- **`sFieldCloSigCompat`'s query side** (`emit_lit_atoms.vl`). Its caller passed no field type. This
  is `variant-closure-field.vl`.

So the path is not dead. It is not converted here. The fix is to give `internInlineShapeTy` its
shape's arena type at the callers that pass -1 (a union arm's field element, through
`uFieldElemTyIxRow`). That is shape-interner work and is queued as its own change.

## Proof

- **Seed:** 6,603,813 → 6,603,876 bytes (+63, the invariant's message). Two refreshes are
  byte-identical.
- **Sweep:** `sweep.vl -- record` over all 23,857 programs, base against candidate: **23,857 the
  same**, with 0 bytes-only movers, 0 output movers, 0 `runs → not-runs` and 0 new compiler traps.
- **Also green:**
  - rep-fuzz (exact), lint-self, seed-size (+0.2%) and late-demands (6);
  - the dead-export, render-parse and pin-helper budgets;
  - cases_wasm (7,412 passed), and the inventory refs and rows tests;
  - `check-filed-witnesses --strict` on both inventories (4,697 as filed, 0 MOVED);
  - scaling-shape, probe-rollback and plumb-shape-cost.
