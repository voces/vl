# IR coverage: a direct call typed past its callee's result (2026-11-23, lane IR-N7)

| Mechanism | Change | tests/cases blocker class, functions (alone), before → after |
|---|---|---|
| call typed past its callee's result | `exprAtPre` builds a direct call whose callee's result rep differs from the call's at the callee's rep, as legacy's `emitDirectCall` writes the value the callee returns, after the bundle pick and the `repStoresAs` cases; the record/list/box-only restriction (`sameRefKind`, `callAtCalleeResultRow`) goes | `call result coercion` 22 → 0 |

The refused calls were a hole function or pinned generic called through a lifted binding
(`cloLiftCalleeOf`, `userFnCallTarget`, both shared with legacy) whose result is a scalar, a map
or a bundle record at another rep than the call's type; legacy writes each as the callee returns it.

## Measured

Fixpoint seeds: master 9b1868057 and the batch head.
- tests/cases functions with no blocker: 78,999 → 79,019; covered = verified = matched (one
  unmatched function is the same on both sides).
- `ir-only-census`: programs fully IR-only, 5,669 → 5,683 of 7,144.
- Corpus 45,441 and self-compile 20,330, unchanged. L2 fuel +0.00%; late demands 9 / 9.

Moved on, not closed: `closure callee rep` 0 → 1, `map get rep` 1 → 2.

| Predicate the IR asks | Legacy writer it mirrors |
|---|---|
| `userFnCallTarget`, `cloLiftCalleeOf` (shared) | `emitCallCoreUserFn`, `emitCallRefUnder`'s lifted arm, both `emitDirectCall` |

## Legacy tails the IR calls

None new.
