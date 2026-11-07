# Step 7: an assignment's returned value read off the recorded result

Measured 2026-11-07 on master `1421c902` (fixpoint base, 6,475,115 bytes), 4-core box.

## What changed

`fnRecordedRetCols` declined every function that returns an assignment (`return (g = e)`, a
tail `g = e`), because the emitter can hand back the target cell's kind rather than the value's.
It now declines only where some returned assignment's target has a rep (kind or atom flag) that
differs from the recorded result's (`frsAssignTargetsAgree`, class `assignment target's rep
differs`). Everywhere else the recorded result already is what the walk computes.

## The column shadow, post settled (13,514 files compile with no imports staged)

Graded with an experimental build that kept every assignment function on the walk while the
shadow classified it with the new reader, so "agree" means "agrees with the walk", not "agrees
with itself":

| class | before | after |
|---|---|---|
| result is an assignment's value | 153 | (retired) |
| assignment target's rep differs | | 12 |
| agree, recorded read == walk | 2,743 | 2,884 |
| disagree with the walk (any new class) | | 0 |

Before the switch, 152 of the 153 already agreed with the walk when read off the recorded result.
The one that did not, `setK` in `tests/cases/functions/return-assign-expression-global.vl`, writes a
module `K` literal-union cell: the recorded value is the literal `"b"` (a string), the column the
atom `i32`. A captured `K` cell is the reverse case: the walk returns the string, as recorded, so
"read the target's type" is wrong there (it moved 10 functions in a trial build). The 12 kept
declined are `setK` and 11 captured literal-union / shared-writer cells
(`captured-litunion-assign.vl`, `captured-cell-shared-writer-hole-lambda-*.vl`).

Declined functions of the 2,994 post-mono population: **232 → 91** (12 assignment, 32 no token,
17 own record at a variant, 17 no result recorded, 13 rep uncovered).

## Proof

| check | result |
|---|---|
| fixpoint | two `refresh-compiler.sh` runs byte-identical (before and after the master merge) |
| seed size | 6,475,115 → 6,475,501 (+386, +0.006%) |
| `scripts/sweep.vl` diff, 23,613 cells | 23,613 same, 0 bytes-only, 0 output movers, 0 `runs → not-runs`, 0 traps |
| `tests/vl_fn_ret_shadow_test.ts` | new `col assignment` row: `setK` declined, `setN` agrees |
