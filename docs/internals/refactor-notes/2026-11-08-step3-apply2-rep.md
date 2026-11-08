# Step 3: the switch's invalid wasm is a plain pin at elaboration's re-check (2026-11-08)

Lane "fix the representation behind the per-call binding". Base: master `957c647d`, built to a
fixpoint. Probe builds re-apply `4ab6fc60` and turn its shadow into a switch. This PR changes no
compiler source. It adds [D15570](../inventory/D15570.md), a refutation pin that runs today.

## The direct spelling does not break on master

D13102's direct spelling (`apply2(h, k)` in `inner(k, h)`) runs on master at f64 and at i32. It
breaks only under the switch. Minimal witness (D15570): `inner(h) { apply2(h, 1) }`, `inner(add)`.

| build | D15570 | D13102 direct, f64 | the same, i32 |
|---|---|---|---|
| master | `2` | `1` | `2` |
| switch both `CallInsts` and `Instance` | invalid wasm | invalid wasm | invalid wasm |
| switch `judgeFnArgHoleCalls`' named-generic arm only | `2` | `1` | `2` |
| switch `Instance` only | invalid wasm | invalid wasm | invalid wasm |
| `Instance` switched only after `checkProgram` returns | invalid wasm | — | — |

So judging is not the trigger. The trigger is one `genFnHoleInstance` answer, asked after checking.

## The chain

Captured with a trap under a `--names` build: `elabRun`, `elabOneAt`, `monoRecheckBegin`, then
`checkCallNode`, `callFtyPinCstrs`, `instGenFnHolePins`, `genFnHolePinAt` and
`genFnHoleInstance`. The re-check of `inner`'s instance asks for `apply2`'s `g` at
`vt = add`'s signature, with `s` bound to i32 or f64:

| answer | value | reason |
|---|---|---|
| family | -1 | the instance keeps a TyVar: its row substitution does not bind `add`'s variables there |
| binding | `(i32, i32) => i32` | correct |

With the family's -1, `g` stays `add`'s signature and lowers as an i32 id. With the binding's
answer, `g` is pinned plain and lowers with the closure ABI (`(ref $clo)`, `$clo = struct
{structref, i32, i32}`), while `inner` passes `h` as the id (`i32`). At check time the
switch's answers are type-for-type equal to the family's. Returning a fresh copy of the family's
type keeps the program running, so no table keyed by type index is involved.

At the direct spelling `apply2(add, 1)`, `g` is pinned the same plain way and still lowers as an
id, because the argument names the declaration. The forwarding spelling has no such name: its
argument is `inner`'s parameter `h`, whose binding is that name's `Fn#d`.

## Ruling applied, and the owner

The checker's answer is right, so the emitter owes the fix. At an instance, a hole function
parameter pinned to a plain function type should take its caller's rep: an id when every
caller hands it a `Fn#d` (a declaration by name, or a parameter that holds one), as the direct
spelling does. That decision is made where an elaboration-time pin becomes the instance's
parameter kind. That is `emit_elab` or `emit_mono`'s hole-binding family (`monoPinHoleParam`,
`monoArgPinName`), both owned by w155. I did not touch them.

## What stands

1. The fix above: a decision for w155 or the orchestrator. Its grading list is D15570's.
2. Re-measure the switch after it lands (126 runs lost and 86 traps on `41df34b8`). Not done here.
3. The 17 `reassignedFnValueErr` cells and the 16 argument-misfit cells: not reached.

`genFnHole*` stands. Step 3 is not done.
