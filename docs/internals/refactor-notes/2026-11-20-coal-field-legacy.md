# Legacy refactor: one plan and one refusal decision for a union field's `??`, 2026-11-20

Lane F2. The legacy half of the parked IR arm on branch `f2/ir-coal-field` (closed #9246; its note
is on that branch), landed alone on the coordinator's ruling: the arm has no self-compile or corpus
population today, and this half stands by itself.

## What changed

`emitCoalesceUnionField` (`o.v ?? d` over a value-union record field) becomes:

- `coalFieldPlanOf`: where the box lives (receiver, cast, heap, field, the box's name and type), the
  old inline `mHeap`/`mfi`/`mCast` resolution verbatim; null where legacy falls through.
- `coalFieldResidualKind`: the value-union, has-`null` and one-residual-atom test.
- `coalFieldRefusedWhy`: the three refusals ahead of any byte (a box at a wider record, D3006,
  anchored at the read through the now-shared `boxAmbiguousWhy`; a narrowed union-box read; an
  unbanked set), and `coalFieldUnboxWhy`, the scalar arm's missing value box. The four sentences
  are unchanged.
- `coalFieldOpen` / `coalFieldPresent`: the shared head and present arm of the two result shapes.

`emitCoalArmRecv`, whose only caller this was, folds into them.

## The deleted call

Legacy wrote `const munTy = mphysTy`, then, in both present arms,
`if msSetOfTyAny(munTy) != msSetOfTyAny(mphysTy) { emitBoxAtomRetag(mphysTy, munTy, lhsIx) }`: a
comparison of one value with itself, so the retag never ran. It is deleted, and with it
`emitBoxAtomRetag`, which had no other caller; its contract comment moves to
`emitBoxAtomRetagMembers`.

## Measured

Byte-identical output, master's fixpoint seed against this branch's: see the PR for the
`ir-identity` corpus A/B, `--cases` and the per-file `tests/cases` A/B. Compiler lines: net +42
(`wasmEmit.vl` +202 / −160), the cost of naming the plan and the refusals.
