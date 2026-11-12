# Step 7 L6 (step C6): the bool `??` join and the record-default arm take the union's type, 2026-11-12

This is stacked on C5 (#7462).

## Changed

- **The bool `??` join (`emitCoalesceNulBoolJoin`)** no longer builds a member set. Its atom
  test is `unionTyHasAtom(joinTy, "boolean")`.
- **`coalJoinDefaultBoxes(joinTy, ..)`** drops its set.
- **`unionArmVariantForStructExpr(ty, ..)`** reads the row `unRowOfTyKey(ty)` in place of
  `unionRowKeyAB(83, set, ty)`. Its other caller, the record re-box in `emitUnionCoerce`, drops
  its name too.

## Census

A scratch probe compiler on C5's head was run over the cases and cells. Each call's name-and-type
answer was compared with the type-only one:

| consumer | same | differ |
| --- | --- | --- |
| site 83 (record default arm) | 99 (33 programs) | 0 |
| bool join atom | 33 (10) | 0 |

## What is left

The ref `??` join (`emitCoalesceNulRefJoin`) keeps `unionMemberSetOf(joinN)`, only for
`coalNicheBoxTag`'s ref-array arm test. That test keeps its name until [D4937](../inventory/D4937.md)'s
instance body is right (C5).

## Proof

**Local full sweep:** in the PR.
