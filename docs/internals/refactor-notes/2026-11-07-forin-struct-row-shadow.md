# `forInVarStructIdx` against the canonical row, 2026-11-07

The re-census ([step7-classifier-recensus](2026-11-07-step7-classifier-recensus.md)) shadowed
`forInVarStructIdx` against `repOfTy(elem).rdSlot`, and that comparison disagreed 175 times.
In every disagreement the typed side read `-1` for a record spelled as a shape or written inline.
`rdSlot` is `repSlotOfTy`'s answer, and `repSlotOfTy` names only DECLARED struct slots.

**The canonical row already has a reader.** `repSlotOfKind(kind, ty)` (`emit_rep_slot.vl`)
answers a struct kind with `repStructRowOfTy`: a shape-named row, then the type's own row, the
declared row, then the canonical-key row (`repRowOfTyStruct`), then a narrower declared record.
This PR shadows the classifier's struct arm against
`repSlotOfKind(fk, tyRefArrElemOf(nodeTyAt(iter)))` (`fivsShadow`, under `$VL_REP_SHADOW`).

| population | asks | agree | old row, typed none | two rows |
| --- | --- | --- | --- | --- |
| sweep population, 23,610 programs (223 reach the struct arm) | 286 | 284 | 1 | 1 |

The two disagreements are both a record whose fields hold functions:

* `distilled/named/d15207_loop_over.vl`: `[{ fs: [inc0] }, …]` from an un-annotated `mk()`.
  The old answer is a row; the typed reader finds none for the element type at the iterated call.
* `tests/cases/closures/record-literal-written-into-slot-of-fn-widened-binding-runs.vl`: a record
  literal written into a slot whose function field the writes widen (D15307). The typed reader
  picks a different row from the old answer.

In both, the element type at the iterated expression holds each function's singleton, and the
row it is stored under was built at the widened set. That is identity typing for concrete
function values (step 3), not a missing rep rung, so `forInVarStructIdx` stays. Switch it to
`repSlotOfKind` when this shadow reads 0 disagreements.

**`repSlotOfTy` is not widened.** A probe in `repSlotOfTy` measured what answering the
canonical-key row for an undeclared record would change. During emit it is called 1,783,758
times in 17,477 files. In 322,340 calls (5,578 files) it declines where the widened reader
finds a row. Its callers rely on the declared-only answer: they read a miss as
"not a declared struct" (`emit_sig_tokens.vl`, `emit_union_atoms.vl`, `emit_shape_rows.vl`). One row per canonical type (D3870 C) therefore goes
through `repSlotOfKind`, and `repSlotOfTy` keeps its name's narrower contract. The probe is
not committed.

**Other shadows.** The re-census's other row-reading shadow was `callLoweredKindOf` against
`rdKind`. It compares kinds, not rows, so nothing here moves it. Its instrument was never
committed, and it was not re-run.

Seed 6,444,134 → 6,444,526 bytes, fixpoint. Sweep against #6698's seed: 23,610 of 23,610 the
same, 0 bytes-only movers.
