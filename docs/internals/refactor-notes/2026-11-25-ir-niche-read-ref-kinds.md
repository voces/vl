# IR: a box narrowed to a nullable map, list or closure (2026-11-25, lane COV-IS)

`narrowed read niche kind`: a union-box local narrowed to `M | null`, `T[] | null` or
`(…) => R | null` reads as that reference's niche. `nicheReadKindAt` names the kind:
`NICHE_NUL_MAP`, a list wrapper's kind, or 11, the closure arm's tag. `emitNicheReadTail` already
writes all of them: the box's null tag becomes the reference's null, and any other arm is the
payload unboxed. The builder took only kinds 1 and 2 (`boolean | null`, `string | null`).

## What landed

- `nicheKindRepFits`: the builder takes a map, list or closure kind where the read's rep is that
  reference's own nullable (`RNullable` discipline 1 over `RMap`, `RList` or `RClosure`).
- The verifier's `RNicheRead` rule admits those reps for a kind other than 1 and 2.

## Legacy tails the IR calls

None new: `emitNicheReadTail`, already called for kinds 1 and 2.

## Census (restricted to the 8 tests/cases and 2 witness programs the class held)

Base rows from master 7eddff27; head on this branch.

| reading | base | head |
|---|---|---|
| tests/cases distinct functions claimed | 114 of 153 | 143 of 153 |
| tests/cases `narrowed read niche kind` | 31 | 0 |
| witnesses distinct functions claimed | 1 of 3 | 3 of 3 |

The 10 tests/cases functions left miss on other classes: `is member storage rep`, `is box not a
local`, `box ladder` and `global read coercion`.

## Witnesses (Q58: the position sweeps already under tests/cases, armed shadow)

- `unions/narrowed-nullable-closure-out-of-union-box-positions.vl`: 11 of 14 matched; the 3 left
  are other classes.
- `unions/narrowed-nullable-map-out-of-union-box-positions.vl`: 6 of 10 matched; likewise.
- `loops/for-in-nulclosure-element-in-each-position.vl` (76 of 76) and
  `loops/for-in-nullist-element-in-each-position.vl` (74 of 74).
- `unions/box-narrowed-to-nullable-list-copied.vl`: 15 of 16 matched.
