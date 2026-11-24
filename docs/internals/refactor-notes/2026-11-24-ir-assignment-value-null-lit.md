# IR: an assignment of `null` the checker types `null`, as a value (2026-11-24, lane S1)

Legacy's `nullLit` arm of an assignment used as a value (`asgValueArmOf`, `emitAsgValueOf`)
writes the store, then the literal's own null (`emitNullAt`). The IR's `assignValueNullLit`
writes the same thing: `assignTo`, then `RNullOf` at the literal's `nullOwnAt`. No legacy change.

## Readings

| run | before (master `49a2a3c20`'s fixpoint) | after |
|---|---|---|
| `ir-only-census.vl`, class `assignment value nullLit` | 24 fns, 10 progs, 7 only | READINGS_CENSUS |
| the class's programs under `VL_IR_SHADOW=1` | 24 uncovered rows | 0; bytes identical in all 11 |

## What stays out

- `letInit` in `unions/deep-is-arm-write-in-expression.vl` (`const x = (r = null)`) misses at the
  binding as `assignment initialiser of a null-typed binding (D17088)`. Legacy writes such a
  binding's initialiser as a bare `null` and drops the store; that is D17088, a clause-1 fix of
  its own, not coverage to match.
- A literal whose own null is not the bottom ref misses as `assignment value nullLit rep`.
  `asgYieldsNullLit` makes the assignment's rep the `null` unit's, and the verifier admits only
  the bottom ref there (`RNullOf`, rule 2). Legacy writes the cell's typed null (a string's, a
  sentinel) in that place. The control rows: the four lambdas of
  `closures/capture-nullable-closure-null-write.vl` and of
  `closures/null-result-closure-writes-cell.vl` that write a captured `string | null`,
  `boolean | null` or list cell, and two in the read-back case below. Each misses under that
  name; before the guard each failed the verifier's rule 2.

## Read-back

`tests/cases/closures/assignment-value-null-read-back.vl` reads each cell back after the write:
captured `i32`, string, list and boolean locals, a captured parameter, a module global written in
a tail, and a deep `is` arm's place written in an expression. Several of the class's own fixtures
(`capture-cell-write-narrows`, `union-copy-captured`) never call their writing closures, because
the narrowing they test stands only while the closure is uncalled; the new case runs those shapes.
