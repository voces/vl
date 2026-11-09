# Step 4: a written hole parameter binds at its hand joined with its writes (2026-11-09)

Lane "D15011 and the function-value rows". Base: master `67362572`, built to a fixpoint
(6,570,731 bytes). The candidate is that master plus this PR, also a fixpoint.

## What refused, and where

`take(a) { const xs = [a]; a = dbl; xs[0]("ab"); xs[0](7) }` with `take(id)` (D15011). The
instance bound `a` at the hand's own set `{id}`, so the write `a = dbl` had no set to land in.

Three producers now agree that a written parameter's reads hold its hand or what is written:

| producer | change |
|---|---|
| `fnTagListJoinSet` (check_elab_cap.vl) | joins the list join, or the hand's set, with each function the body writes to the parameter (`fnTagParamWritesJoin`, from `cwDeclFnWrites`). Every reader of it agrees: `elabSetArgBind`, `ftLateParamOk`, mono's late demand. |
| `ftPlan` (check_fn_tag.vl) | takes each call's hand and each write's value as leaves of the joined set (`fnTagParamWriteJoinsOf`). Without them the plan passed and `ftPlLeafTysFill` committed nothing. |
| `elabMintHandedIn` (emit_elab.vl) | a write's target is no hand-on of the joined set. Without it the set was marked partial. |

A throwaway probe on `ftTry` (not part of this PR, never a seed) showed each of the last two in
turn: first `mintSetPartial` at the catch-all, then an `OK` plan that tagged nothing.

## Measured

| | base | candidate |
|---|---|---|
| sweep, 23,749 programs | | 23,747 same, 0 bytes-only, 2 output movers, 0 `runs → not-runs`, 0 new traps, 1 only in candidate (the new fixture) |
| the 2 movers | emit reject | D15011's witness runs; its refusal pin `listed-hole-fn-written-param-reject.vl` compiles, and is deleted (the new fixture runs the same program) |
| rep-fuzz | | exact, 0 failures |
| plumb-shape fuel, main / tail (against its baseline) | | −1.8% / −2.8% |
| self-compile peak RSS (VmHWM) | 3,954,980 kB | 3,963,616 kB (+0.2%) |
| seed (fixpoint) | 6,570,731 | 6,573,953 (+3,222; +2.8% of the seed-size baseline) |

## What stands

The same parameter called directly still refuses, at either order of call and write
(`a = dbl; a("ab"); a(7)`), with `cannot take the generic function id as a value`: no call
through the parameter gives the hand a set, so `fnTagParamWritesJoin` has no hand's set to
join. A written `let` copy (`let a = a0; a("ab"); a = dbl; a(7)`) refuses with `reaches no
call that fixes its type`. `let a = id` with the same write runs, as it did before.
