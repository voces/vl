# IR coverage: a direct call typed past its callee's result (2026-11-23, lane IR-N7)

| Mechanism | Change | tests/cases blocker class, functions (alone), before → after |
|---|---|---|
| call typed past its callee's result | `exprAtPre` builds a direct call whose callee's result rep differs from the call's at the callee's rep, as legacy's `emitDirectCall` writes the value the callee returns, after the bundle pick and the `repStoresAs` cases; the record/list/box-only restriction (`sameRefKind`, `callAtCalleeResultRow`) goes | `call result coercion` NN → 0 |

The refused calls were a hole function or pinned generic called through a lifted binding
(`cloLiftCalleeOf`, `userFnCallTarget`, both shared with legacy) whose result is a scalar, a map
or a bundle record at another rep than the call's type; legacy writes each as the callee returns it.

## Measured

Fixpoint seeds: master BASE and the batch head.
- tests/cases functions with no blocker: B0 → B1; covered = verified = matched.
- `ir-only-census`: programs fully IR-only, I0 → I1.

| Predicate the IR asks | Legacy writer it mirrors |
|---|---|
| `userFnCallTarget`, `cloLiftCalleeOf` (shared) | `emitCallCoreUserFn`, `emitCallRefUnder`'s lifted arm, both `emitDirectCall` |

## Legacy tails the IR calls

None new.
