# Step 3: a forwarded `Fn#d` keeps its id rep under a closed pin (2026-11-08)

Lane "the representation fix, then the binding switch". Base: master `09435d74`, built to a
fixpoint. The switch is `4ab6fc60`'s binding answering `genFnHoleInstance` and
`genFnHoleCallInsts` (the other four functions unchanged), applied as a probe only.

## The rung

`monoPinHoleParam`'s tagged-set rung pins a hole parameter at the elaboration's bound when that
bound is a tagged set. Probed at `apply2`'s `g`:

| spelling | `elabCallParamBoundTy` | the argument's type in the frame |
|---|---|---|
| `apply2(add, 1)`, direct | `Fn#add` (tagged) | none |
| `inner(h) { apply2(h, 1) }`, under the switch | `(i32, i32) => i32` (plain) | `Fn#add` (tagged) |

So the forwarded spelling missed the rung and took `monoHoleGenFnPin`'s `=>ii>i` pin (closure
ABI). The fix: when the bound is a closed plain function type and the argument is a name that
holds a tagged set in this frame, the set binds the parameter. The rung then pins it as it pins
the direct spelling.

## Measured

| build | D15570 | sweep vs base (23,714 programs) |
|---|---|---|
| master + fix | `2` | 23,714 same, 0 bytes-only movers |
| switch | invalid wasm | 126 runs lost, 86 traps (the earlier note, on `41df34b8`) |
| switch + fix | `2` | **40 runs lost, 2 traps**, 14 bytes-only movers |

D13102 also runs under switch + fix. Both seeds are fixpoints.

## Two binding arms, probed (commit `c766168f`, reverted next)

The 40 are 17 `cannot pass the generic function … through …`, 18 argument misfits, 2 `cannot
infer`, and 3 invalid wasm or unknown function. Two arms, measured together on a fixpoint
against master + this PR:

| arm | reading | cells |
|---|---|---|
| `reassignedFnValueErr` only at a lambda's hole (`?#L`) | the extra instance is real: `f` holds a `Fn#d` set, and the family saw none through a value (`calleeFn` -1). "One signature" is true only of a closure | all 17 run; both refusal tests keep their errors |
| `holeBindSelfForward`: a self-recursive call handing the hole to another own parameter binds it there | the family's answer had the forwarded instance (`mid(b, a, …)` swaps `F`/`G`), and the binding stopped at `g == owner` | D15406, D6202 and the swapped-recursion cases run |

Result: **15 runs lost, 2 traps** (from 40 and 2).

## What stands

| message | cells | reading |
|---|---|---|
| `argument N: expected …, got f64` | 10 | `for f in [apply4, apply5] { f(h, k) }` (D13520, D12702, D13661, D14428, D15068's `forin`). `f`'s type carries `apply4`'s holes, so `apply4`'s instance is pinned and judged against `apply5`'s body. Forwarding into each element moves the error into `apply5`, so the pin of a joined element type is the owner, not the walk |
| `cannot infer a type for parameter a` | 2 | not ablated |
| invalid wasm in a lambda, `call to unknown function` | 3 | not ablated |

`genFnHole*` stands. Step 3 is not done.
