# Step 3: the per-call `Fn#d` binding, built and shadowed; the family still stands (2026-11-08)

Lane "end of step 3, the per-call Fn#d binding". Base: master `c0d9e1f9`, built to a fixpoint. The
binding and its probe are commit `4ab6fc60` on `claude/step3-fnd-per-call`, reverted by the next
commit, so this PR changes no compiler source.

## The 18 call sites and the binding answer each one needs

| site | family read | question | binding answer |
|---|---|---|---|
| `fsbGenFnHolePins` (check_calls) | `Instance` | a marked binding's one instance | `holeBindInstance` |
| `holeParamUse` | `Called` | whether the body calls the hole | a call is seen |
| `holeOpenCallsWait` | `OpenInsts` | calls left open at this caller | the calls that stay open, with their types |
| `judgeFnArgHoleCalls`, re-pointed `let` (2) | `CallInsts` + `SoleInst` | each instance a `let` or choice is judged at | `holeBindInsts`, forwarding included |
| `judgeFnArgHoleCalls`, named generic (2) | `CallInsts` + `MovedInsts` | each instance a generic is judged at | the same |
| record-field arm (2) | `CallInsts` + `MovedInsts` | the same, for a field | the same |
| `pinHoleLambdaVals` | `Instance` | a lambda's parameter types | `holeBindInstance` |
| `pinHoleLambdaVals`, `holeLambdaAtEachInst` | `CallInsts` | a lambda judged at each instance | `holeBindInsts` |
| `instGenFnHolePins` → `genFnHolePinAt` (check_demands, 3) | `Instance`, forwarded 8 deep | the pin a delivered generic takes | `holeBindInstance` (it forwards itself) |
| `holeFnArgInst` (check_relate_core, 2) | `Instance` | an open function argument's instance | `holeBindInstance` |
| `genFnHoleBodyRet` (check_relate_core, emit_elab) | none | an instance's body-given result | stays. It is the direct call's body rule, and the binding calls it |

## The binding

`holeBindInsts(vNames, vTys, k, vt, calleeFn, out)` binds hole `vNames[k]` to `vt` for one call. It
walks the body of the hole's own declaration (`holeParamDecl` of the name, so a call through a
value with `calleeFn = -1` still has one). Each call whose callee is typed `vNames[k]`, or names the
parameter, is instanced at its own arguments as a direct call is. A call handing the hole to another
declaration's hole parameter re-binds there and recurses, whether that declaration is named or
reached through a value whose type names its holes. `holeBindInstance` is the single-answer form.

Disagreement, measured as programs where `genFnHoleCallInsts` or `genFnHoleInstance` answered
differently (first error only, so this is a floor):

| binding revision | programs |
|---|---|
| walk the `calleeFn` body, calls of the parameter by name | 552 |
| owner taken from the hole's name | 412 |
| a call counts when its callee is *typed* as the hole (`<F>` parameters, list elements) | 264 |
| argument types read from the call's `argCstr` row (a literal's node type reads `_`) | 215 |
| `Instance`: uncalled / open / two-instance semantics | 154 |
| a closed `vt` is its own instance; defaulted arguments; forwarding through a value | 149 |

## Switching to it loses 126 runs

The candidate answers `genFnHoleCallInsts` and `genFnHoleInstance` from the binding. The other four
functions stay as they are. Swept against base: **126 `runs → not-runs`, 86 new compiler traps**,
132 movers. By origin: closures 40, inventory 38, functions 29, generics 4. Answering "nothing"
everywhere loses 149 runs (#6870), so this binding, as built, is not yet close.

| message | cells | what the binding gets wrong |
|---|---|---|
| invalid wasm inside the callee (`apply2`, `same`, `take`) | 82 | forwarding through a value (`for f in [apply2] { f(h, k) }`) loses `k`'s binding. The family's moved rows carry it, and the frame does not. D13102 reads `(f64, f64) => f64` from the family and nothing from the binding |
| `cannot pass the generic function … through …` | 17 | it finds two instances where the family reports one, so `reassignedFnValueErr` fires |
| `argument N: expected …, got …` | 16 | a closed `vt` or a forwarded instance is judged where the family judged none |

## What deleting the family still needs

1. A forwarded frame takes the caller's argument types for the other holes. Use the
   forwarding call's own `argCstr` rows, not `holeCallNodeTy` under the outer names, which cannot
   see a frame's loop element.
2. The pin consumers (`genFnHolePinAt`, `fsbGenFnHolePins`) must treat "a closed function's own
   instance" as no pin, or mono reads it as one.
3. Then shadow all six functions at once, and switch only once every disagreement is ablated.

## D2621

The fix is not small. An intrinsic named as a value needs either a synthesised wrapper per
intrinsic, with a function index the fn-value ABI can call, or a check-time refusal, as `sqrt`
already gets. The row asks for a ruling first, and it recommends the wrapper.

## Is step 3 done apart from w149's rows?

No. Besides the blocked rows (`pass(h)` x06/y03, D10382, D12218, D14883, D14888, D15014,
D15566), the `genFnHole*` family stands, with the three items above between it and deletion.
