# IR box ladder: a `M | null` boxed under its map arm (2026-11-25, lane COV-IS)

`box ladder` is the shared box plan's (`holeBoxPlanOf`) word for a value it leaves to legacy's
ladder. On master `af0877ad0` it is the first miss of 39 functions across `tests/cases` and the
inventory witnesses. A probe build tagged each of the plan's `return ladder` sites, giving the
breakdown by rung:

| rung | functions | what declines |
|---|---|---|
| no scalar base (`pn == null`) | 16 | 9 are a `M \| null` map; the rest are lists and records |
| a join with no record arm (`IfStmt`) | 4 | the if-join family's (COV-CLOS) |
| a record the record rungs decline | 4 | |
| no prim kind (`null`-typed value) | 4 | an assignment of `null` boxed |
| widen `asgLit`/`radix`/`convert` | 3 | |
| other | 8 | |

## What landed

- **Plan**: a new arm, `nulMap`, for a value that is `M | null` (not a map, not a box) going into
  a union that has the map's arm. That is the nullable rung of legacy's `emitUnionMapArmBox`.
- **Writers**: `emitNulMapArmBox` is split byte-neutral into `nulMapArmBoxHead` (the box's block,
  the tag's block, the tag) and `nulMapArmBoxTail` (`br_on_null`, the map arm's box out, then the
  null box). These are the arm's head and tail in `holeBoxHead`/`holeBoxTail`, which legacy's
  `emitHoleBox` and the IR's `RToBox` lowering both call.
- **Builder**: the arm's operand is a nullable-map rep (`mapNullable`).

## How it was measured

- **Rung probe** over the 34 programs with a `box ladder` row: the class drops from 39 functions
  to 30. The 9 that leave are exactly the nullable-map ones; the remaining rungs are unchanged.
- **Byte compare** (`VL_IR_SHADOW=2`): every claimed function in those programs matches.
- **Legacy identity**: the 729 `tests/cases` programs that mention a nullable or `??` value and a
  map type build byte-identical under a compiler built from `origin/master` and under this one.
- **Q58 position sweep** (`tests/cases/unions/nullable-map-boxed-into-union-positions.vl`, new):
  a `M | null` delivered as an argument, a return, a `let`, a record field, a list element and an
  assignment's value, each with `null` and with a map. On master the 6 functions are `box ladder`
  misses; here all 69 functions match and the program runs its 12 lines.
