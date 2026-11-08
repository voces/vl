# Step 7: run #2's return walk deleted

Measured 2026-11-08 on master `67f200b7` (fixpoint 6,512,594 bytes), 4-core box, with
`scripts/col-shadow/run.sh` (19,371 files, 13,538 graded) and the sweep over 23,649 programs.

## What the walk still decided, and who was right

Every row the walk overwrote was ablated by letting the recorded columns win, then sweeping.

| class at `post settled` | n | ablation | producer fixed |
|---|---|---|---|
| struct / variant "rows differ" | 15 + 4 | recorded wins: 14 `runs → compiler_trap` (invalid wasm) | the record's row now comes from its values' rep stamps (`frsValuesStampSlot`), the row `criRowByStamp` wrote |
| reflist elem "names differ" / "column names none" | 2 + 1 | walk off: 7 traps (`.map` results) | the recorded list result's row is interned before the columns are read (`criRecordedRefListDemand`); before, only the walk minted it |
| recorded result has no token (maps of hole functions) | 3 | walk off: 3 traps | a map's columns name no row, so a `TyMap` with an open value type is read as `map` (what the walk answered) |
| row reflist 0 vs 1 (d15296 `mk`) | 1 | join off for recorded rows: 4 traps elsewhere | none: `fnRetRefListRowJoin` stays, and corrects the record here |

The emitted program needs the stamp row in every struct case: the record names the row a
delivery widens to (`{x: i64}`), the function builds at its own (`{x: i32}`).

## Deleted

`criWalkBlock`, `criClassify` and its six rungs, `criRowByStamp`, `criStructByFnTy`,
`criChanged`, and the 25 helpers only they reached: 35 functions and 75 imports, 1,186 lines
removed and 101 added over 11 files. `computeRetInference` keeps the recorded read, `criNulCloByRecorded`, the record
row check, the non-null settle, the ref-list row join and the literal-atom flag.

## Counts

| | before | after |
|---|---|---|
| run #2 declined (post settled) | 3 | 0 |
| post settled disagreements | 23 | 1 (the row join, above) |

## Proof

| check | result |
|---|---|
| fixpoint | two `refresh-compiler.sh` runs byte-identical |
| seed size | 6,512,594 → 6,497,368 (−15,226, −0.23%), both fixpoints on `67f200b7` |
| L2 self-compile guest fuel | 76,056,556,211 → 76,080,740,303 (+0.03%) |
| `scripts/gate.sh` | all 23 rows pass on the final merged tree |
| `scripts/sweep.vl` diff, 23,649 cells | 23,649 same: 0 bytes-only movers, 0 output movers |
