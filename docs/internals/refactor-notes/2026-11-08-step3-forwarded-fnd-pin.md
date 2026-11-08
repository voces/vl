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

## What the 40 are

| message | cells | reading |
|---|---|---|
| `cannot pass the generic function … through …` | 17 | `f` holds a `Fn#d` set. The binding finds `apply2`'s two real instances, while the family found none for a call through a value. The refusal's premise ("one signature") holds only for a lambda's hole |
| `argument N: expected …, got …` | 18 | not yet ablated |
| `cannot infer a type for parameter` | 2 | not yet ablated |
| invalid wasm / `call to unknown function` | 3 | not yet ablated |

`genFnHole*` stands. Step 3 is not done.
