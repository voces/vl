# IR null read: a stored null narrowed into a union box (2026-11-25, lane COV-IS)

- **The miss**: `null read storage rep` is a read the checker narrowed to `null` whose storage
  holds that null (`nullReadOwnAt` is `NULL_READ_STORED`), delivered at a rep other than its own.
  CENSUS's list at `0c946159` holds 11 rows; 10 are in five `tests/cases` programs.
- **Legacy**: `nullReadDstOwnOf` answers "stored" for every union destination, and the delivery's
  box then writes the union's own null tag and bottom ref without reading the storage (a
  `boolean | null` handed to an `i32 | null` writes `6` and `ref.null none`).

## What landed

- **The delivery**: a stored null read delivered to a box whose plan is its `null` arm
  (`holeBoxPlanOf`) is that box's null (`boxTemp` over the no-value immediate), the storage unread.
- **Not landed**: `inference/null-let-read-takes-its-most-recent-write.vl`'s `boundCopy`, where
  legacy holds `const v = x` at `x`'s box and the builder at the `null` unit: a binding rep, not
  this read.

## How it was measured

- **The class**: 9 of the 10 `tests/cases` rows now match under `VL_IR_SHADOW=2`, in
  `null/narrowed-null-bool-into-scalar-nullable-box.vl` (4), `types/null-hole-fill-after-join-runs.vl`,
  `types/null-hole-fill-loop-variants.vl` (2) and `types/null-hole-loop-write-not-carried.vl`.
- **Legacy identity and the shadow**: the 13,200 programs under
  `tests/cases/{null,types,inference,unions,narrowing,conditionals,assignment,soundness}` and
  `distilled/named` build byte-identical under a compiler built from `origin/master` and under this
  one; their tallies move only in the four programs above, 8 functions gained and none lost.
- **Q58 position sweep** (`tests/cases/null/narrowed-null-sentinel-into-union-box-positions.vl`,
  new): a `K | null` and a `string | null` narrowed to `null`, handed as an argument, a `let`, a
  record field, a list element, an assignment's value and a return. On master its 2 functions are
  this miss; here all 5 match and it prints its 11 lines.
