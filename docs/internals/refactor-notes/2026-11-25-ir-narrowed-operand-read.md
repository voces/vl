# IR narrowed read: two operand reads of a narrowed local (2026-11-25, lane COV-IS)

- **The miss**: `narrowed read` is `narrowedLocalRead`'s fall-through, where a local is read at a
  rep its narrowing gives it and no arm takes the pair. CENSUS's list at `0c946159` holds 21 rows. A
  probe naming the arm and both reps sorts the `tests/cases` and distilled rows into four shapes:
  - an atom cell read at a string, outside a delivery (4 rows, 2 programs);
  - a `let m = null` local read at `null` outside a delivery (5 rows, 2 programs);
  - a record or list read at another record or list rep on the same struct (7 rows; not here);
  - a closure read at `i32` (1 row; not here).

## What landed

- **Atom decode**: an operand read of an atom cell narrowed to a string-typed set decodes it with
  `atomToStr`, as legacy's `emitAtomToStr` does for `"then " + J`.
- **The `is` operand**: a literal arm that compares atom ids (`atomEq`, `atomNotNul`) reads its
  operand as its cell, so the decode above does not reach the test.
- **Null read**: an operand read narrowed to `null` whose destination owns a null
  (`nullReadOwnAt`) is that null at `rep`, as the delivery arm already writes it.
- **Not landed**: the record pair is the same wasm struct in legacy, but neither `retagsAsStands` nor
  a `repsLowerAlike` test over the noted heaps admits it; it stays `narrowed read`.

## How it was measured

- **The class**: `literal-unions/is-const-literal-overlapping-set.vl` and
  `is-literal-set-overlap-narrows-to-meet.vl` now match in full. In `types/null-hole-fill-after-join-runs.vl`
  and `null-hole-loop-write-not-carried.vl`, the 5 rows match or move on to `null read storage rep`
  and `box of a valued if` (COV-CLOS).
- **Legacy identity and the shadow**: the 1,599 programs under
  `tests/cases/{types,null,inference,unions,literal-unions,conditionals,narrowing}` build
  byte-identical under a compiler built from `origin/master` and under this one, and their
  `VL_IR_SHADOW=2` tallies move only in the four programs above.
- **Q58 position sweep** (`tests/cases/narrowing/narrowed-operand-read-positions.vl`, new): the atom
  read as a concat's left and right operand and in an interpolation, and the null read in an `if`
  join, a loop body's join and a nested join. On master its 6 functions are this miss; here all 67
  match and it prints its 13 lines.
