# An open-typed parameter is held at legacy's declared kind (2026-11-23, lane IR-N5)

A parameter whose type is a template's open `T`, or has no value rep, missed as `parameter rep unsup`
or `open parameter type`. These are mostly lambdas inside generic or hole bodies, and the
closure thunks of such functions. Legacy declares such a parameter anyway, at the kind its type
section writes (`vtKindOfParam`, `fbValtype`). The kind is not one constant:
- `vtKindOfType` falls back to `i32` only where `annRepKindOf` names no kind, which is a bare type
  variable.
- Most of these parameters get their kind from `repOfNodeAt`'s descriptor instead: `i32`, `str`,
  `closure` or `nulnone`.

## The change

- `repDescTy` (in `emit_rep.vl`) is the type a legacy descriptor names by its kind alone: a scalar,
  `str`, `nulstr` or `nulnone`. A kind that needs more than itself (a row, a list or map shape, a
  closure signature, a box's members), and an atom, answer -1.
- `repNodeOfDesc` is that type's tree node. `repDescSelfTest` round-trips each named kind through
  `repOfTy`, and the IR shadow suite runs it.
- `paramFrameTy` (in `ir_build.vl`) holds a parameter at its own type, or, where that type is open or
  has no value rep, at `repDescTy` of legacy's declared descriptor. `buildParams` and `buildThunk`
  both ask it. A thunk forwards each parameter at the rep the target's frame gives it, so the two
  must agree.

New test case: `generics/template-lambda-open-parameter-held-at-declared-kind.vl`.

## Not in this change

- Open result types (M1's 20 thunk rows) go through `resultRep`, which `ir-m1-thk` also changes.
  They follow once that branch is on master.
- A parameter whose declared kind is `closure`, `struct` or another shaped kind stays a miss: 8
  `parameter rep unsup` rows remain.
- The three `never | null` functions in `generics/null-only-type-param-binds-never.vl` also miss on
  `pre-path dead never`.
- Open-typed expressions in a body were measured and left out. The nodes still missing `rep unsup`
  are closures, which need a signature.

## Post-I8: templates legacy emits but nothing reaches

These lambdas sit in the function table, or nowhere, with no direct call and no closure built at
their table index (a `wasm-dis` scan of the legacy build). Once the IR owns emission, they should
not be emitted:

- `closures/hole-fn-into-pushed-lambda-bound-by-every-call.vl`: `__lambda_0`, `__lambda_1`, `__lambda_2`
- `closures/hole-fn-list-capturing-lambda-member-at-handed-result.vl`: `__lambda_1`
- `closures/hole-lambda-on-hole-fn-list-capturing-hole-param.vl`: `__lambda_0`, `__lambda_1`, `__lambda_2`
- `closures/record-of-written-lambda-let-capturing-instance-param.vl`: `__lambda_0`
- `generics/capturing-lambda-in-generic-value-slot-at-shared-type-parameter-name.vl`: `__lambda_0`
- `generics/generic-value-slot-written-in-generic-body-at-two-instances.vl`: `__lambda_4`

The other open-typed functions are reached, by one direct call (including the three `never | null`
functions) or by a closure built at their index.

The measurements are in the PR body.
