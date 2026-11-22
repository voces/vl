# IR: a struct boxed as itself on its arm's variant heap (2026-11-22, lane IR-N2)

`box ladder`, the record residue. In a generic instance (`tag<T>(v: T)` at `T = Circle`, boxed
into `i32 | string | T`) the value is a plain struct: `exprVariantIndex` is -1 and
`structIndexOfExpr` names its struct row. The plan's `rec` rung reads `armValuePlainOf`, which
needs a variant index, so it returned the ladder.

Legacy's ladder reaches `emitUnionCoerceRecord`'s struct rung. Where the struct's row is on its arm's
variant heap (`unionArmVariantForStructExpr`), legacy writes the arm's tag, the struct as itself,
and the box. That is the `rec` shape.

## The change

- `structArmPlainOf` (`emit_plan_union.vl`) names that rung's decision once. It takes a non-null
  struct value, the arm `unionArmVariantForStructExpr` names, and the two heaps agreeing.
  `emitUnionCoerceRecord` and `holeBoxPlanOf` both ask it. Off the arm's heap, legacy still
  rebuilds the struct onto it.
- The plan's rung sits after the null-niche rung. A struct that may be null is excluded, as
  `armValuePlainOf` excludes it: legacy boxes such a value through a null test earlier in its
  ladder. A first cut without the exclusion boxed `mkB()`'s `B | null` raw and trapped in
  `tests/cases/unions/record-join-place-elimination.vl`.

Covered = matched over the files the ladder census named: 631 → 644. Legacy bytes are identical
over all of them.

Row file `tests/ir-shadow-rows/struct-boxed-on-arm-heap.vl`; witness
`tests/cases/generics/struct-param-boxed-into-wider-union-at-instance.vl`.
