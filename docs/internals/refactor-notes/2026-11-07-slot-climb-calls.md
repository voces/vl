# The per-call slot-type fact: the calls a literal slot's climb reaches

Lane F (2026-11-07-lane-f-map-values.md) left `monoReachSlotTy` blocked on one fact: its type was
already the climb's, but the callee write-back (`nodeTyRecord(callFn, ct)`) still iterated
`vrCalls`, and deleting it loses 70 runs. This note measures the elaboration's answer for those
calls and switches the write-back to it. Measured on master `0e2c0ca5` with lane F's branch
(#6708) merged, over the sweep population of 23,610 programs.

## The reader

`elabLitSlotClimbCalls(a, step, qs, calls)` (`emit_elab.vl`) runs `elabLitSlotCallTys` and returns
the calls each value's climb reached as callee, so each is called at the one tuple `qs`. Two parts
are new:

- `elabSlotCallTysOpenFns` keeps its own climb's hits (`elabSlotLastHits`), written after its
  nested result climbs, which would otherwise overwrite them.
- The climb runs over the source tree, so a call it reaches is a source node. Mono's instance
  bodies carry copies of that call, and the write-back must land on them too. `elabCopiesOf`
  indexes `nodeSrc` in reverse, once per arena length and epoch.

## Shadow (counted per decision; a decision is one `monoReachSlotTy` with a closed `ct`)

Calls are compared after mono's own filter: a `Call` whose callee type is still open.

| | decisions |
|---|---|
| agree | 355 |
| both reach no open call | 268 (188 with `vrCalls` lost) |
| the climb reaches more (`vrCalls` ⊂ climb) | 1 |
| climb only (`vrCalls` reached no open call) | 135 (101 with `vrCalls` lost) |
| `vrCalls` only, or a call `vrCalls` reached that the climb did not | **0** |

Without the copy step, 3 decisions differed: `vrCalls` reached the source call and two instance
copies, the climb reached only the source call (D7202, `written-let-in-*-two-instances`). With it
they agree.

## The switch

`monoReachSlotTy` now writes back at `elabLitSlotClimbCalls`'s calls. Mono no longer reads `vrCalls`.
The 136 decisions where the climb writes more move no program, not even its module bytes. Why
those extra writes are inert was not examined further.

| fixpoint seeds, base vs candidate | |
|---|---|
| same | 23,610 / 23,610 |
| output movers | 0 |
| bytes-only movers | 0 |
| runs → not-runs | 0 |
| new compiler traps | 0 |
| seed | 6,452,493 → 6,453,636 bytes (+1,143) |
| pin-helper budget (`emit_mono.vl`) | 943 → 943 |

## What is left, and why

- **`vrCalls` stays in `value_reach.vl`.** `vrInert` and `vrInertFor` are built on it, and so is the
  inert-value reach mono's pruning reads. It has no mono caller left.
- **`monoReachLitTys` and `monoReachSlotTy` stay, as the write-back's driver.** Neither one derives
  anything now: the calls, the tuple and the type are all the elaboration's. What is left is a loop
  over `vrLits` that records `ct` on each callee. This retires when the elaboration records the
  callee types itself, or when emit reads the callee's type from the climb instead of the node.
  That decision is a write in the elaboration, outside this lane.
