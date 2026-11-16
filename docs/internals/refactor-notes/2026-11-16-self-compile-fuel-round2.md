# Self-compile fuel, round 2, 2026-11-16 (lane REP)

Coordinator ask: another −1% of L2 self-compile fuel after round 1 (#8798) and slot store part E
(#8806), so STORE's (a) stages and the IR steps have room.

## Where the profile points

`VL_PROFILE_GUEST` over master 3fd77f25a's L2 build, inclusive by caller. Self time stays flat
(`nodeAt` 6.2%, `__grow_0__` 5.6%, `tyAt` 3.5%, spread over hundreds of callers).

| site | inclusive | note |
|---|---:|---|
| `sameVariantTy` | 2.37% | 1.30% from `tyTestIsMember`; 0.99% of it is `svClosed` |
| `fnDetectScratch` | 4.47% | `fnHasStrOp` 1.36%, `leqScanBlock` 0.93%, `blockHasMapOp` 0.65% |
| list growth in type walks | ~1.6% | `flattenVariantsInto`, `unionMembersInto`, `readAtomKindOfTy`, `tyHasInferHoleIn` |

`svClosed` is round 1's own overhead: the memo stores only closed pairs, so an open pair misses
on every call and walks both types for a type parameter and an inference hole before it is
recomputed.

## The change

`svClosed` (check_relate_core.vl) answers once per type, in a map emptied with `svMemo`. A
type's closedness can move only by an in-place arena write, which advances `tyMutEpoch`.

## Readings

| reading | value |
|---|---|
| L2 fuel, master 3fd77f25a (fixed seed, `fueltree.sh` method) | 94,842,689,684 |
| with the change | 93,786,155,502 (−1.06G, −1.11%) |
| `self-compile-time.sh --write-baseline`, fixpoint seed | 93,786,155,502 (−0.77% on 94.52G) |
| corpus identity (`corpuscmp` against master's seed) | 8,456 modules, 0 DIFFER, 0 LOST |
| emitter-state audit | NEVER 0 |

## Left for a next round

`fnDetectScratch`'s per-function scans (4.47% inclusive) and the list growth in the type walks
are the next candidates; neither was measured for repeated arguments here.
