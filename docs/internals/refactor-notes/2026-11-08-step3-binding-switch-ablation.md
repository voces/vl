# Step 3: the binding's 82 invalid-wasm cells are a pin/rep disagreement, not a value forward (2026-11-08)

Lane "finish the per-call Fn#d binding". Base: master `41df34b8`, built to a fixpoint. The binding is
commit `4ab6fc60` (#6874's branch), re-applied unchanged except for item 1's fix below. No compiler
source changes in this PR.

## Shadow and switch, re-measured

| | |
|---|---|
| shadow disagreement (programs, first error only) | **151** (#6874 read 149 on `c0d9e1f9`) |
| switch `genFnHoleCallInsts` + `genFnHoleInstance` to the binding | **126 runs → not-runs, 86 new compiler traps**, 127 output movers |

The shadow's 151, by shape (`old` = family, `new` = binding):

| cells | shape |
|---|---|
| 99 | `CallInsts`: family `[]`, binding finds 1–2 instances |
| 21 | `CallInsts`: binding finds fewer or different instances |
| 29 | `Instance`: family -1 (open) or a type, binding finds 0 or 1 |
| 2 | other |

## Item 1's fix moved nothing

The fix: a forwarded frame takes the other holes' types from the forwarding call's own `argCstr`
rows (`holeBindRowTy`) when `holeCallNodeTy` leaves them open. The switch still loses exactly
126 runs and adds 86 traps.

## The value forward is scenery

D13102's witness is `for f in [apply2] { f(h, k) }` inside `inner(k, h)`, called as
`inner(0.5, add)`. With every disagreement logged (not just the first), there is exactly **one**:
`?inner.1`, family `[]`, binding `[(f64, f64) => f64]`. That binding answer is correct.

Ablated under the switch:

| spelling | base | switched |
|---|---|---|
| `for f in [apply2] { f(h, k) }` (filed) | `1` | invalid wasm inside `apply2` |
| `const f = apply2; f(h, k)` | `1` | invalid wasm inside `apply2` |
| `apply2(h, k)` (direct) | `1` | invalid wasm inside `apply2` |
| `apply2(h, k)` direct, `inner(1, add)` | runs | invalid wasm inside `apply2` |

The validator says `expected i32, found (ref $2); $2 is struct {structref, i32, i32}`. Once
`judgeFnArgHoleCalls`' named-generic arm sees an instance, it judges `add` at it
(`genFnValueCstrs`, `holeDeclCstrsAt` at the `inner(…, add)` argument). That gives `apply2`'s `g`
another representation from what its caller passes (a closure struct against a direct index).
The family answered `[]` here, so nothing was judged, and the elaboration picked one
representation for both ends.

So the largest blocker is not the binding's answer. It is that a judged instance at a hole's
outer caller and the emitted instance of the callee the hole is forwarded to disagree about the
function value's representation. Which side owes the fix decides the lane. The emit side is
`emit_mono`'s hole-binding family or `emit_elab` (w152); the checker side is `holeDeclCstrsAt`
recording a pin it should not.

## What stands, re-ranked

1. **Rep disagreement after a judged instance** (the 82 cells, and plausibly the 86 traps): needs
   a ruling on which lane owns it. The binding is correct on the one witness ablated.
2. `reassignedFnValueErr` on two found instances (17 cells), and argument misfits at a closed or
   forwarded instance (16 cells): item 3, not ablated in this lane.
3. Item 2 (pin consumers reading a closed function's own instance): not reached.

`genFnHole*` stands. Step 3 is not done.
