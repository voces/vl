# Step 7: classifier round 20, deleting onto typed readers, 2026-11-08

Round 20 starts from master `0cfd71c8` (#6882), where `classifier-census.vl --callers` reads
73 probed, 73 post-only, 0 pre-only, 0 both. Since nothing asks a probed classifier before
`monomorphized`, a post-mono shadow now grades each one against a typed reader at the instance.
Counts are calls over the 23,720-program sweep population. They come from `clsCensusEnter("SH …")`
keys in a scratch compiler that runs both readers and returns the classifier's answer.

**Shadow** (post-mono, legacy / typed):

| classifier | typed reader | agree | disagree |
| --- | --- | --- | --- |
| `exprListRep` | `listOfColumn(listColumnDesc)` | 6,187,115 | 28 (ladder none, column `list`/`reflist`) |
| `letIsNulNone` | `letBindRepKind == "nulnone"` | 473,395 | 0 |
| `letIsMap` | `letBindRepKind == "map"` | 39,990 | 38 (T/F) |
| `exprUnionCall` | `nodeRepIs(·, "union")` | 170,477 | 9 (T/F) |
| `letCellKind` | `letBindRepKind ?? "i32"` | 358,291 | 243 |
| `globalCellKind` | `letBindRepKind(·, -1) ?? "i32"` | 904,827 | 1,209 |
| `exprIsLitAtom` | `nodeRepIsAtom` or `nodeRepIsNulAtom` | 1,241,201 | 738 |
| `exprNulLitUnion` | `nodeRepIsNulAtom` | 1,220,010 | 916 |
| `exprIsNulNone` | `nodeRepIs(·, "nulnone")` | 973,949 | 23,562 |
| `structIndexOfExpr` | `structRowOfRecordTy(nonNullTy(nodeTyAt))` | 3,485,215 | 44,649 |
| `identCellVKind` | the read's `repOfNode` kind | — | the cell is not the read's type |

**Switched and deleted.** These three were switched, and each sweep was graded against the base:

* `exprListRep` reads the column in both phases. Its post-mono ladder `exprListRepOf` is deleted, and so are
  the helpers only the ladder reached: `columnListRepOfRead`, `placeStoreListKind` and its memo,
  `valueUnionBoxList`, `tyMayInstUnionList`, `identReadOutOfScope`, `lrTyIsNoList`,
  `lrRawHasTyVar`, `listRepFamilyOf`, the list-rep A/B note, `arenaListRep`, `arrayKindCode`,
  `arenaRepOf`, `instanceBindsNothingClosed` and `columnListRep`/`At`. The 28 disagreements
  move no byte: 23,720 same.
* `letIsNulNone` and `letIsMap` read the binding's rep. Their 38 disagreements move no byte either.

**Tried and reverted.** `exprUnionCall` → `nodeRepIs(·, "union")` loses 2 runs to invalid wasm
(`recursive-fn-joins-runtime-numbers-apart.vl`, `numeric-join-held-back-through-a-wrapper.vl`). A
recursive call's recorded type is not the `i32 | f64` box its function returns, and
`fnRetUnionSid` is what knows it. The missing fact is the call's result at the callee's join.

**What stands, with the missing fact:**
* `exprIsNulNone`, `exprIsLitAtom`, `exprNulLitUnion` and `identCellVKind` answer for the CELL a
  read loads, while `repOfNode` answers for the read's narrowed type. So they disagree at every
  narrowed read (`nulstruct` cell, `struct` read). Their typed reader is a read rep, not a node rep.
* `letCellKind` and `globalCellKind`: a holder of a returned bundle is `struct`, and its type
  reps as `closure`. `letBindRepClaims` already answers first everywhere else.
* `structIndexOfExpr`: 24,245 calls where only the type names a row, 12,734 where only the
  classifier does, and 7,670 that name different rows (layout twins, as in r18 and r19).
* Not shadowed this round: the other 59 probed classifiers. By inspection, `forInElemKind` already reads only
  the iterable's type, and `scalarKindWidth`, `readListKindOf` and `readKindIsNul` are fixed
  lookups over a kind, so these four belong in `NOT_BLIND`. None of the 69 has no caller.

**Census** (`classifier-census.vl`):

| tree | probed | post-only | pre-only | both | uncalled |
| --- | --- | --- | --- | --- | --- |
| master `0cfd71c8` | 73 | 73 | 0 | 0 | 0 |
| this PR | 69 | 69 | 0 | 0 | 0 |

`emit_classify.vl` goes from 633 functions and 15,968 lines to 622 and 15,560. The PR removes 518 lines and adds 13, over six files.

**Proof.** Both sides are fixpoint seeds: base 6,580,497 bytes, this PR 6,571,256 (−9,241). The
sweep over 23,720 programs: 23,720 same, 0 bytes-only, 0 output movers, 0 `runs → not-runs`,
0 new traps. `rep-fuzz-check.sh`: exact, 0 failures.

## The ci-cost RSS regression (main unit 450 MB against 318 MB)

Not a retained table: every seed's tenth collection grows the copying heap to 512 MiB, and
master ends the compile before an eleventh copies into the new semispace. This round's column
read built a `RepDesc` per `exprListRep` and `letBindRepKind` call, which added ~42 MB of total
allocation (null collector: 1,033 MB against master's 991 MB) and so forced the eleventh
collection, which committed the extra 130 MB. `repKindOfTyMemo` caches the kind per arena type
(stamped on the compile generation, `emitPassGen` and `tyRegWrites`). After that, main reads
318.1 MB and fuel 8.90 G (head before the fix: 9.20 G). The self-build and the plumb unit are
byte-identical. Master is close to the same edge, so a later +40 MB of garbage in the late
phases will fail this row the same way.
