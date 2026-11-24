# IR: a nullable record compare with an element side (2026-11-24, lane IR-N1)

`nullable record eq element place`: `xs[i] == y` where one side is a nullable record and at least
one side is a ref list element. #9905 left it a named miss.

## The family, by ablation

On master's seed, one program per ingredient:

| variant | master |
|---|---|
| base: `xs: (C|null)[]`, `xs[0] == y`, `y: C|null` | miss |
| `y` bare | miss |
| the element bare (`xs: C[]`) | miss |
| the element on the right | miss |
| a variable index | miss |
| a global receiver | miss |
| both sides elements | miss |
| control: nothing nullable | matched |

So the family is exactly a nullable compare (`seNul`) with an element side. Which side, either
side's nullability, the index kind and the receiver kind are incidental.

## What landed

- **wasmEmit** `nulStructEqGuardTail` takes the compare's `EqRootPlan`. Legacy's only caller,
  `emitNulStructEqAt`, passes `EQ_ROOTS_EXPR`, so legacy is unchanged.
  - The field roots read through the plan (`emitStructEqRec`).
  - The null tests read through `emitEqRootIsNull(..., place)`. An `elem` place whose null-test
    arm is `nullRef` is written as `emitChainRootElem`, then `nulTestRefTail(false)`. These are the
    bytes legacy's `emitExpr` and `ref.is_null` write, with the element-read row banked.
- **`eqElemNullTestOk`** names the element null tests a place can write: `nullRef`, a fold
  (`nnfold`, `nulfold`), or `instMap` with no scalar-map read (`emitEqIsNull`'s `i32.const 0`).
  Every other arm keeps the miss.
- **ir_build / ir_lower** take the compare when `eqElemNullTestOk` holds for each element side.
  The lowering passes `plan` to the tail and banks `epRows` after it.
- **ir_verify** rule 2 ("a nullable record compare has a nullable operand") reads an element side
  at its list's element rep (`eqSideRep`). Without it, a bare side against a nullable element, and
  two element sides, failed rule 2.
- **Control 9** (`nulEqNoNullableControl`) marks a non-nullable record compare nullable, and
  rule 2 must refuse it.

## Routes beside it

- A null-typed other side (`xs[0] == n`, `n` narrowed to `null`) is `eqRouteOf`'s `nulName`: the
  element's null test, chosen before any record route. It is matched on base and head alike.
- A side with effects is staged and read once (`structEqStagesLeft`), so it never becomes an
  element place. A call that moves the index in the other operand reads in source order on both
  seeds.
- `ys[j] == { r: 1, s: 2 }` (a literal right side) stays `record compare element place`, which is
  #9905's class.

## Legacy tails the IR calls

- `nulStructEqGuardTail` (`wasmEmit`), now with the compare's root plan.
- `eqElemNullTestOk` (`wasmEmit`), asked by the builder and the lowering.

## Witnesses

- `tests/ir-shadow-rows/nullable-record-compare-element-side.vl` holds:
  - the ablation set;
  - the order cells;
  - the `nulName` cell;
  - the named literal-right neighbour.

  It expects `no row containing spans` and `uncovered record compare element place = 1`.
  Base: 3 of 12 matched and the start missing. Head: 11 of 12 matched and the start matched.
- `tests/vl_ir_shadow_test.ts` adds two tests:
  - the row under control 5, which must red on `spans`;
  - rule 2's pair: a bare side against a nullable element verifies, and control 9 reds.

  A scratch mutant whose `eqSideRep` returns the list rep reds both.
- `tests/cases/operators/nulrec-eq-element-values.vl` covers each side null or not, equal, and
  unequal at each field of a nested record, with the boolean concatenated in both orders.
  Base 61/64, head 64/64. The nine `nulrec-eq-sweep-*-element.vl` programs are the Q58 positions.
