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
- No rep guard on the literal. `asgYieldsNullLit` requires the assignment's type to be `null`, so
  its rep is the `null` unit's. Legacy writes the literal's own null there whatever that null is,
  and `RNullOf` lowers through the same `emitNullOwn`. A guard on the rep would have no failing
  program, so it was dropped rather than kept untested.

## Read-back

`tests/cases/closures/assignment-value-null-read-back.vl` reads each cell back after the write:
captured `i32`, string, list and boolean locals, a captured parameter, a module global written in
a tail, and a deep `is` arm's place written in an expression. Several of the class's own fixtures
(`capture-cell-write-narrows`, `union-copy-captured`) never call their writing closures, because
the narrowing they test stands only while the closure is uncalled; the new case runs those shapes.
