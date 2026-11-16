# Union arm rows in one pass, and the `fnDetectScratch` census, 2026-11-16 (lane REP)

Self-compile fuel, round 3. This note records what was measured and declined, so nobody
re-measures it, and the one change that landed.

## `fnDetectScratch`: no win (declined)

4.47% of master's L2 inclusive. The calls per distinct argument come from an instrumented L1,
whose L2 self-compile was counted under the shadow channel:

| scan | calls | distinct |
|---|---:|---:|
| `fnDetectScratch` | 18,159 | 18,159 |
| `blockHasStrOp` | 61,146 | 61,146 |
| `exprHasStrOp` | 594,284 | 592,310 |
| `leqScanBlock` | 158,937 | 117,339 |
| `blockHasMapOp` | 93,823 | 93,823 |
| `blockPushPopBits` | 104,139 | 103,780 |
| `blockScratchMisses` | 103,780 | 103,780 |
| `scanStashes` | 20,059 | 19,109 |
| `collectRefSlots` | 18,159 | 18,159 |
| `mfScan` | 1,331,343 | 1,328,008 |

Every scan runs about once per argument, so a memo cannot pay. Samples whose leaf is a walk frame
are 0.83% across all nine scans, so folding the string-op, `==` and map-op scans into one pass
would save about 0.2%; they also stop differently (first hit against a whole body). The cost is
in the per-node predicates the emit pass asks too.

The one repeated predicate is `tyTakesAtomAsStr`: 52,217 calls over 4,371 types, 0.42%
inclusive. Its answer reads the nominal names, the literal-union alias index and the twin tables,
so a sound memo stamps each type with `tyRegGenNow()` and the alias table's length. That read
94.84G → 94.79G (−0.06%): the generation moves with every minted type and node. Declined.

## `canonUnionMembersWalk`: not quadratic

0.71% of L2. Its dedupe (`memberTySame`, `memberDeclPos`) is about 0%. The cost is the walk's own
frame (0.17%), list growth (0.20%) and map writes (0.09%): eight fresh lists and a map per call,
over 4.6K calls.

## Union width: the super-linear cost is the return boxing and the return join

The family is one function returning a union of N declared record types (`{ tag: "rk", vk: i32 }`)
from N returns, called N times. Build fuel:

| N | master | this change |
|---:|---:|---:|
| 16 | 24.3M | 22.8M |
| 64 | 362.9M | 234.9M |
| 128 | 2,293M | 1,266M |

A union of N string literals beside `i32 | string` grows linearly (5.3M, 7.7M, 13.0M, 25.3M at
8 to 64). At N = 128, 41% of the record family's samples were the emit path and 30% the
checker's return join (`noteNaturalRet` → `joinVariantTys`, pairwise per return), which is the
next step.

## The change

`armRowTysOfUnionTy` asked `unionArmRowOfTy` per arm, and each ask scanned every variant row of
the union with `tySame`. `unionArmRowsOfTys` (emit_local_slots.vl) builds, once per call, a
bucket per key that `tySame` implies: the constructor, a scalar's name, a function's arity, a
record's field-name set (an order-free sum of name hashes), a type parameter's slot, else the
index. Union-typed rows go in a list every arm also tries, and a union arm takes the old scan.
Each arm compares only its bucket's rows, in row order, so the first `tySame` row still wins.
Unions of eight rows or fewer keep the scan.

No state survives the call, so nothing needs a stamp. A first version keyed records by their
sorted, joined field names and read +0.09% on L2 (`sortedNames` alone was 0.39%); the integer
key reads −0.29%.

The union-typed-row path is reached by nothing in `tests/cases` (an `emitFail` probe, checked
against a control that fires on every match) nor by three hand-written nestings. Union rows hold
flattened members. `tests/cases/unions/nested-alias-arm-rows-per-return.vl` pins a nested alias
and two records that share a field-name set.

## Readings

| reading | value |
|---|---|
| L2 fuel, master bc6546163 (fixed seed, measured alike) | 94,969,644,303 |
| with the change | 94,694,040,323 (−0.28G, −0.29%) |
| `self-compile-time.sh --write-baseline`, fixpoint seed | 94,694,040,323 |
| corpus identity (`corpuscmp` against master's fixpoint seed) | 8,462 modules, 0 DIFFER, 0 LOST |
| scaling axis `record union arms returned` (64 against 16) | 10.39 (master 14.96), bar 13.0 |
