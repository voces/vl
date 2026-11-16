# Type hash-cons stage 6b: four type-existence walks in `check_types.vl` take a visited set (lane HASH), 2026-11-16

The s6b21 census found four `check_types.vl` walks whose depth limit is the only thing that ends a walk
over a recursive type: `tyReachesEmptyHole`, `tyReachesUnion`, `tyMentionsErr` (countdowns from 6 or 8)
and `tyHasRepHoleAt` (counts up to 8). With 48 more levels, five recursive-type fixtures hang:
`recursive-tree.vl`, `nullable-recursive-call-narrow-canary.vl`, `recursive-binary-tree-sound.vl`,
`recursive-nullable-field-equality.vl` and `struct-holding-self-recursive-arm.vl`.

Each answers whether a type holds something. Each is now a wrapper over a walk that visits a type
once (`…In(ty, seen)`), and the depth argument is gone from all its callers. A type already in
`seen` answers `false`: one walked before held nothing, or the walk is on a cycle back to it. Every
caller passed the full budget, so none relied on the limit as a "look only this far" contract.

## Grading (fixpoint seeds, master `4bc9c9ee0` vs this branch)

- The five fixtures that hang when the limits are raised run, with the same output.
- Identity sweep: all 3,223 programs build byte-identical (the 2,827-file identity list plus the 6b
  grids). No program held the answer past the old depth.
- `regress.vl`: 0 `runs → not-runs`, 0 → silent.
- `tests/vl_scaling_shape_test.ts`: 90 of 90.
