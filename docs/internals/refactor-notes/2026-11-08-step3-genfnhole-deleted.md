# Step 3: the per-call `Fn#d` binding replaces `genFnHole*`, which is deleted (2026-11-08)

Lane "finish the per-call binding switch". Base: master `42604cf2`, built to a fixpoint; the
candidate is that master plus this PR, also a fixpoint. The starting point was #6885's probe
`c766168f` (15 runs lost, 2 traps), re-applied.

## What the switch needed

| arm | cells it fixed | reading |
|---|---|---|
| a call through a set of named functions binds each member at its own holes (`cstrSetOwners`, renamed per member), and a frame forwarding the hole into such a call forwards it into every member (`elabFnSetOf` of the callee) | the 10 `for f in [a4, a5] { f(h, k) }` cells | the join's type carries the FIRST member's holes, so the binding walked `a4`'s body and pinned `h` at its instance, then judged `a5` against it. Both arms are needed: dropping the forward arm loses 9 of the 10 again |
| `holeParamDecl` reads a nested function's hole, `?f@<decl>.<i>` | the 2 `cannot infer` cells | the binding found no owner for `nlap(g)` nested in `main`, and answered "uncalled" |
| a call through a re-pointed `let` walks every function it may hold (`holeBindHeld`, from `holeFnArgDecls`), under both its own and the initializer's hole names | the 3 invalid-wasm cells | the initializer `(g, x) => x + 1` never calls `g`; the writes do, and their bodies are typed by the initializer's names |
| `holeBindCalled` counts a call the hole is handed on to | 6 cells lost when `genFnHoleCalled` went | the family's moved rows counted `h(g)` in `apply3` as a call of `g` |
| `pinHoleLambdaVals` skips a declared type parameter (`use<T>(ys: T[])`) | item 4, refused on base too | `T` bound to a listed lambda is no hole `use` calls, so "uncalled and unread" refused it |

`genFnHoleInstance`, `CallInsts`, `SoleInst`, `MovedInsts`, `OpenInsts` and `Called` are deleted,
with their helpers (`CallOwn`, `CallBind`, `hdParamOfHole`). So is `genFnHolePinAt`'s forward in
check_demands, because the binding forwards itself. The `SoleInst` and `MovedInsts` instances need
no replacement: the forwarded instances are already in the binding's answer, and the sweep shows
no difference. `genFnHoleBodyRet` stays as the direct call's body rule, renamed `holeBodyRet`.
`genFnHoleDeliveryMisfits` is renamed `holeBindDeliveryMisfits`.

## Measured

| | base | candidate |
|---|---|---|
| sweep, 23,726 programs | | 0 `runs → not-runs`, 0 new traps, 9 `check_reject → runs`, 12 bytes-only |
| the switch alone (two functions answered), against `51af2db6` | | 0 lost, 0 traps (was 15 and 2); identical to the full deletion on all 23,719 programs |
| D15272, the six `d15068_mix_*` cells it grades | check reject | run (D15272 closes) |
| `for f in [apply4, apply5] { f(add, 0.5) }`, direct | check reject | runs (pin: `hole-fn-list-members-bound-at-own-holes.vl`) |
| `take((x) => x)` handing `[a]` to `use<T>(ys: T[])` | check reject | runs (pin: `hole-lambda-listed-handed-to-generic-list-param.vl`) |
| seed (fixpoint) | 6,576,217 | 6,574,351 (−1,866; +2.8% of the seed-size baseline) |
| pin-helper budget (`emit_mono.vl`) | 921 | 921 (untouched) |
| late demands | 5 | 4: the `use<T>` pin mints `use` after `elabRun` (+1, recorded), two `listed`/`untagged-records` cases fell (−2) |

The 12 bytes-only movers are the programs the per-call binding instances differently. Their output
is unchanged.

## Is step 3 done?

The family is gone, so the checker types a call of a `Fn#d` parameter by instantiating `d` at
that call's own arguments. The function-value relation no longer has a second judge. What stands
from the earlier notes is join-shaped and belongs to step 4: x04/x05/y05/y06, D15565, and a set
call that dispatches by tag. Of the two singleton items there, `pass(h)` (x06, y03) runs on base
and candidate alike (`6 6`). D10382 still refuses as filed (`expected (string) => string, got
(i32) => i32`): a hole that flows into two function types is solved to one, in
`check_fn_decl.vl`'s solve, not in the call typing. So step 3 is done except D10382.
