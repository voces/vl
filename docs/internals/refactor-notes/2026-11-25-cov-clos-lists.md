# IR coverage: spread sources at the literal's twin (2026-11-25, lane COV-CLOS)

The lists and maps classes the coordinator moved to COV-CLOS on 2026-11-25. This PR takes one
mechanism and measures what the rest needs.

## Mechanism

A spread literal's plain arm (`spreadPlanOf`) copies each source's elements raw at one kind. A
source list whose rep is the literal's list twin, or apart from it only in a hole (`listRetag`,
`holeRetagNoted`), is that list retagged. The IR missed it as `array spread source rep`. The case
that occurs is a list holding a generic function, spread into an instance's list of closures at
its own type.

Over the 17 programs of CENSUS's `array-spread-source-rep.txt`: 111 → 127 of 130 distinct functions
claimed, none lost, claimless identical, no shadow mismatch. The rest of the class is a `boolean[]`
spread into a `(boolean | null)[]` and fresh literal or call sources at another record row. Neither
is a twin.

## Q58 sweep

`tests/cases/arrays/spread-source-retag-positions.vl`: every position is claimed in both instances,
claimless identical, with no shadow mismatch. The record-field position is run at one instance only,
because the second traps on master, legacy and claimless alike: filed as
[D17580](../inventory/D17580.md). The nested argument is bound first, since `vl fmt` emits invalid
output for a call nested in an explicitly instanced call, as in `a<T>(b<T>(x))`.

## What the rest of the family needs (measured on master 33681f0b)

| class | rows | what it needs |
|---|---:|---|
| `array spread boxed` | 28 | the boxing arm of legacy's spread join (`emitArrSpread`'s box path): a lowering, not a claim |
| `map get rep` | 20 | a nullable record or closure read whose inner is not the map's value rep. Admitting a same-valtype inner (`repStoresAs`) made the verifier refuse three programs, so it was dropped |
| `for in list union` | 18 | the per-arm walk over a union of lists (`luForUnionIter`, D16897): a new loop shape |
| `closure temp at an open type's rep` | 15 | a closure temp whose type stays open; the guard in `irBLetTempTy` holds for rule 3 |

## Legacy tails the IR calls

None new.
