# IR: a bundle parameter with a closed checked type (2026-11-22, lane IR-D1)

Follows #9466, which left two `bundle argument` arms: `closed parameter` (2 tests/cases
functions) and `choice` (9). `choice` waits for IR-N4's decided `SIf` join.

## The change

- A bundle parameter's checked type can be a closed function type when the instance pins it,
  e.g. a parameter forwarded to a closure-bound callee. Legacy still stores it as its record of
  one closure per signature (`vtKindOfParam` says `struct`).
- `bundleHeldTy` (ir_build.vl) took the record only for an open type. It now also takes it when
  `vtKindOfParam(p) == "struct"`. That is legacy's own answer, asked rather than restated. Every
  caller that shares `bundleHeldTy` (the delivery rep, `calleeSig`, the parameter's variable) moves
  with it, so the record row agrees at both ends.
- No new admission or route predicate.

## Witnesses

- `tests/cases/closures/bundle-parameter-forwarded-to-closure-bound-parameters.vl`
- `tests/cases/closures/bundle-parameter-handed-into-a-callee-shared-with-a-direct-caller.vl`

The measurements are in the PR body.
