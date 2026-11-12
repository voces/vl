# Step 7 L6 (step C7): the `is`-arm and receiver readers key by the box read's union type, 2026-11-12

The base is master `89ae9a714`.

## Changed

Four receiver readers asked `unionSetArmTysAB(site, unionNameOfExpr(recv), <declared or receiver
type>, ..)`. They now ask `unionTyArms(unionBoxTyOfRead(recv))`: the type the box read holds,
with no name. `unionBoxTyOfRead` is the read's store type where it has one, else its own type.

| site | reader |
| --- | --- |
| 91 | `unionBoxLacksTag` (also its row, now `unRowOfTyKey` of the same type) |
| 93 | `isPatUnionArmTy` |
| 94 | `mapSoftTwinTagFail` |
| 95 | `emitListIsAcrossReps` |

`markValueUnionAtoms(ty)` (site 87) drops its name and reads `unionTyArms(ty)`. Its five callers
drop theirs.

The `unionNameOfExpr(recv) != ""` gates stay. That hub is w310's.

## Census

A scratch probe compiler was run over the cases and cells. Today's arms at each site were
compared with two candidates: (A) the row `unionNameRowOfExpr` hands back, and (B)
`unionTyArms(unionBoxTyOfRead(recv))`.

| site | B same (calls, programs) | B differs |
| --- | --- | --- |
| 91 | 3,884 (1,091) | 28 (15) |
| 93 | 305 (104) | 0 |
| 94 | 6,786 (2,172) | 45 (22) |
| 95 | 688 (213) | 12 (4) |
| 92 (not cut) | 586 (165) | 2 (2) |

Program counts are summed over the probe's buckets, so a program can count twice.

(A) found no row for most receivers (`Adiff` in about 6,400 calls), so it is not the key.

(B) differs in three ways:
- **It covers a union no row keys.** For example `i32|string|null`, where today's read found
  nothing.
- **It adds the `null` arm of a nullable read** of an alias row (`M`, `A|B`).
- **It spells a newtype member** (`K`) where today's read gave its base. Two calls, in
  `types/newtype-union-distinct-reps.vl`.

## Refused: keying a nullable read by its non-null row

The first candidate keyed a nullable read by its non-null part's row, so that alias rows matched
today's arms. That drops the `null` arm. `unionBoxLacksTag` then said no arm carries the null
tag, and `x is null` on a `1 | 2 | null` parameter answered false
(`literal-unions/nullable-numeric-litunion-param.vl`, `tests(null)` printed `1`). A read that can
be null keys with its `null`.

## What is left

- **Site 92** (`emitListEmptyFitArms`): waits on w317's D15763 change (#7475) in the same
  function.
- **Sites 96 and 97** (`emitUnionUnionEq`): the eq cores, next.
- **Sites 102 and 103** (the shape interns): w324's walk.

## Proof

**Local full sweep:** in the PR.
