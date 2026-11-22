# IR: a captured call of a generic instanced at two types, 2026-11-22

Lane IR-N6. #9498 typed a captured call's closure temp as the instance's declaration closes it. A
nested generic instanced at two types has no single recorded declaration type, so its 56
`tests/cases` rows kept the `captured call closure rep` refusal.

## The change

- `repClosureOfReps(params, ret, isVoid)` (emit_rep.vl) interns an `RClosure` with no type,
  through `rtAlloc` and `rtComplete` as `repRawOf` does. Equal nodes hash-cons to one index, and a
  node equal to a typed closure's is that typed node.
- `capturedCallRhs` (ir_build.vl) falls back to `instanceClosureRep(pos)` where
  `capturedCalleeTy` finds no type. It is built from legacy's own answers:
  - instance `pos`'s parameter reps (`scopeTyAt`);
  - its result rep (`resultTy`);
  - void per its `$fnsig` key (`sigKeyRetIsVoid(cloSigKeyExt(pos))`).

  The temp takes the interned node's type where a type built it first, else -1. The call is still
  at legacy's `fnSigIdxOfFn(pos)`.
- A verifier invariant is relaxed, by the coordinator's ruling (i). `irUntypedClosure(ty, rep)`
  holds when `ty < 0` and `rep` is an interned `RClosure` of no type. Such a variable passes:
  - rule 10's typed-or-raw arm, which exists for raw helper values; a closure is not raw;
  - rule 1, which counts it held, as `tyOpenHeldAsIds` counts a function held at a closure rep;
  - rule 3, which has no type whose rep to compare.

  The builder's rule-3 mirror in `irBLetTempTy` asks the same predicate. A call through such a
  variable is still checked against its `RClosure`.

The new row `tests/ir-shadow-rows/captured-call-generic-at-two-instances.vl` has covered and
matched floors of 3 (base: 2).

## Readings (base: #9498's head `c605e6276`, fixpoint; candidate fixpoint)

| reading | base | this change |
| --- | ---: | ---: |
| `tests/cases` functions with no blocker | 68,145 | 68,183 (+38) |
| armed `tests/cases` covered / matched | 68,145 / 68,144 | 68,183 / 68,182 |
| `tests/cases` `captured call closure rep` (any / alone) | 59 / 56 | 0 / 0 |
| corpus functions with no blocker | 45,028 | 45,028 |
| self-compile functions with no blocker | 19,754 | 19,754 |
| L2 self-compile fuel | 110,309,262,427 | +0.03% |

`scripts/rep-fuzz-check.sh`: `exact ✅ (0 baselined failures — 0 unsound, 0 reject; 0 new, 0 stale)`.

A throwaway probe build checked the hash-consing over `tests/cases`; it was not committed.
- 55 untyped closures: two equal `repClosureOfReps` calls returned one index.
- 227 typed closure reps: each, rebuilt from its own kids, returned the same rep.

Identity, each with 0 differing and 0 timeouts:

| identity check | identical |
| --- | ---: |
| `--names` (self-compile also identical) | 9,037 |
| `--cases` (witnesses 60 the same) | 7,611 |
| `--claimless` | 14,018 |
| mode 3 corpus (mode 3 self also identical) | 9,037 |
| `tests/cases` A/B | 7,331 |

Late demands stay at 9 and late tag rows at 307. `scripts/gate.sh --fast` passes, and so does
`tests/vl_ir_shadow_test.ts` (250 passed).
