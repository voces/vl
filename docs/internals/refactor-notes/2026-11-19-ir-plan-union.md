# IR decision modules 3: the union plans (2026-11-19, lane IR6)

§10.1(a) stage 3, step 3. The inventory is in `2026-11-19-ir-plan-list.md`. This step moves the
union family out of `wasmEmit.vl` and splits the last two legacy writers the IR called whole. It
deletes no mirror: each union mirror re-derives an arm of a legacy dispatch, and converting it
is a ladder change of its own (below).

## Moved

- **`compiler/emit_plan_union.vl`** (143 declarations, from 3): the `is` test's rungs
  (`isArmOf`, `tagIsArmOf`, `litIsArmOf`), the narrowed reads, atom and union equality
  (`atomEqPlanOf`, `unionUnionEqStagedOf`), and the box plan `holeBoxPlanOf` with its deciders.
  - The plan's shape stays open: F1 adds a non-null union arm for `union elem` after this lands.
- **`narrowedArmNeedsUnbox` and its two helpers** move down into `emit_plan_coerce.vl`. They
  decide whether a narrowed arm is unboxed at its delivery, which is a coercion. The list module
  reads them, so the order is `coerce < list < null < union`, with no cycle.

## Split

- **The read recover:** the IR's three sites ask `readOwesNonNullRecover`, the shared decision
  in `emit_classify.vl`, and write `ref.as_non_null` themselves. They no longer call legacy's
  `emitReadRecover`.
- **The compare recover:** `eqOperandRecovers` is now a shared decision in
  `emit_plan_union.vl`. Legacy's `emitEqRecoverNarrowed` is that decision plus its tail, and the
  IR's two sites ask the decision and write the tail.

## Not done here: the union mirrors

These IR-only predicates mirror a legacy dispatch arm and have no agreement check:

| mirror | legacy dispatch it mirrors |
|---|---|
| `structFieldPlain`, `variantFieldPlain` | `emitExpr`'s member arm to `emitMemStructRead` / `emitMemVariantRead` |
| `narrowedFieldPlain` | `emitNarrowedMem` |
| `narrowedBoxVariantPlain`, `narrowedVariantRepIs` | `emitVariantCoerce`'s box arm |
| `isBoxGuardPlain`, `isVariantTagPlain` | `emitIs` / `emitIsTest`'s rungs |

Each becomes one arm enum that legacy's dispatch consumes, as `coalNulRefArmOf` did in step 2.
That reshapes the dispatch rather than moving a function, so it is a follow-up, one ladder per
PR.

## Lines

Code lines (comments and import lists excluded), from a multiset diff against master:

| | lines |
|---|---|
| moved | 2,032 |
| deleted | 10 |
| new | 28 |

The deleted and new lines are the two recover splits plus signatures reflowed by their new
`export`.
