# IR N2b-2a: a `.pop()` statement through legacy's plan and drop tail, 2026-11-16

Lane IR-C. This is the first part of N2b-2, by the coordinator's split: 2a (statement pop), then
2c (the atom, niche and sentinel nullable reps), then M1 with 2b (one `coalescePlanOf` front door
for the `??` ladder, which takes `pop() ?? d` and `m[k] ?? d` together), then I8c. On master plus
N2b-1, `method pop` held 104 self-compile functions alone and no corpus function. Most of those
were `.pop()` statements. `CLAIMED` stays empty, and no emitted byte moves.

## What landed

- **Legacy's pop layout is shared.** `emitPopGo`'s i32 and scalar-list arms take their wrapper,
  backing and push scratch base from `popPlanOf`, and its numeric statement arm writes
  `popDropTail`: under the length test the element is taken and dropped, so an empty list is
  left as it is (D8360).
- **`RListPop { lqV, lqAt }`** is a statement only. The builder takes it where `popStmtPlainWhy`
  admits the pop: an i32, i64, f64 or f32 list.
  - The receiver is held or staged exactly as for a push (`listOpRecvHeld`/`stageListRecvTail`).
  - A pop's value is `T | null`, so as a value it stays a miss (`method pop`).
- **Named misses:**
  - `pop niche`: a boolean or `K[]` atom list, which legacy pops checked on a niche.
  - `pop typed element`: a pop the checker types as the element under a length test (D3558).
  - `pop ref element`: a ref or string list, which legacy pops checked as a ref.
  - `pop element`: a byte list.

## Coverage

| reading | N2b-1 | this step | gained |
|---|---:|---:|---:|
| self-compile claimed in mode 3 | 5,314 | 5,383 | +69 |
| corpus covered = matched (12,294 cells) | 23,077 | 23,077 | 0 |

On the self-compile the remaining pop misses are 7 `pop typed element`, 7 `pop niche`, 21 `pop ref
element` and 2 `method pop` (a value pop).

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; the armed self-build is byte-identical |
| corpus identity against the N2b-1 seed, 12,294 cells | 9,016 identical, 3,278 fail under both, 0 differ (so the `emitPopGo` split moves no corpus byte) |
| mode 3 with `list` admitted (throwaway build) | self-compile 5,383 claimed and byte-identical, the same 2 fallbacks as before; corpus 9,016 identical, 0 differ, 0 fell back |
| L2 self-compile fuel (`self-compile-time.sh`, each tree from its own fixpoint seed) | 95,096,417,652 to 95,163,411,136 (+0.07%) |
| seed size, N2b-1 seed to this one | 6,509,386 to 6,511,514 (+2,128) |
