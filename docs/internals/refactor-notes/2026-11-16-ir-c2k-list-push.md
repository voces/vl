# IR cutover C2k: a one-argument list push (coverage step), 2026-11-16

Lane IR-C. This is a coverage step under the `ir-design-2026-11.md` §10 exemption, sized with the
blocker census. On C2j's tree, `method push` was the self-compile's largest single blocker: 433
functions. `CLAIMED` stays empty, and no emitted byte moves.

## What landed

- **Legacy's push decision is shared.** `emitPush`'s one-argument path splits into these pieces:
  - `pushPlanOf`: the receiver, the argument, the `PushSlot` and the `PushValKinds`.
  - `pushPlainWhy`: names what the IR does not take, which is a ref, u8 or scalar-width list; an
    atom or niche seed; a nested list; a record box; an arm unbox (the `armSeat` coercion seat,
    deferred to I8); or a late receiver.
  - Two tails, `pushValueTail` (the recover where owed, then the stage) and `pushAppendTail`.
- **The receiver decision is shared.** `listOpRecvLocal` splits into `listOpRecvHeld`, which returns
  the local a receiver already is, and `stageListRecvTail`, which recovers and stages a receiver the
  IR has read. A module-global list, the self-compile's usual receiver, is staged.
- **`RListPush`** is a new `Rhs`. It lowers in value position, leaving the new length, and in
  statement position (`irLowerEffectHook`). The verifier requires a list receiver, a value at its
  element rep, and an i32 result.
- **`pop` is not in this step.** In value position it yields `T | null` through legacy's nullable box,
  and the IR has no nullable rep yet. It held 93 self-compile functions alone.

## Coverage

| reading | C2j | this step | gained |
|---|---:|---:|---:|
| corpus covered = matched | 18,809 | 18,809 | 0 |
| self-compile covered | 4,637 | 5,019 | +382 |
| self-compile matched | 4,632 | 5,013 | +381 |

Both columns are read from fixpoint seeds, with master merged. The corpus's pushes are onto `f64`
and `i64` lists, which this step excludes. Compiler lines are given in the PR.

On the self-compile, one more function is unlowered for `folded global read`, which makes four.

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; the armed self-build is byte-identical |
| corpus identity against the C2j seed, 12,213 cells | IDENTITY |
| shadow | corpus 18,809 of 18,809 matched; self-compile 5,013 of 5,019, six named unlowered |
| mode 3 with `list` admitted (throwaway build) | self-compile 5,013 claimed and byte-identical; corpus MODE3 |
| L2 self-compile fuel, C2j tree to this tree from one seed | 94,728,682,607 to 94,793,071,267 (+0.068%) |
| seed size | 6,462,813 to 6,465,215 (+2,402) |
