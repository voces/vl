# IR: a closure call's `null` and nullable reference arguments, 2026-11-25

Lane COV-CALL, PR B. Base: master 7eddff27. The class is `call of a non-declaration`, the
sub-reason where `callRefPlainKey` refuses an argument the general arm writes (`tail:arg`).

## Change

- `callRefArgPlain` admits the general arm at a `nulstruct`, `nullist` or `nulnone` parameter
  when no narrowing unbox is owed. `emitNonNullParamRecover` writes nothing at those kinds, so
  legacy writes the argument as it stands.
- It also admits a `null` literal at an `i32` parameter. That is a `boolean | null` niche, and
  legacy writes `i32.const 2`.
- In the IR, `closureCallAt` builds a `null` literal at the parameter's rep (`nullOwnAt`'s null).
  An argument built at exactly that rep passes as built, and `closureArgRepIs` takes a record or
  list, or its nullable, at `nulstruct` and `nullist`.

## Delta on the class's programs (scratch detail census, distinct functions)

| | cases before | cases after | witnesses before | witnesses after |
|---|---:|---:|---:|---:|
| `call of a non-declaration` functions | 10 | 7 | 4 | 3 |
| `call of a non-declaration` start bodies | 6 | 2 | 4 | 1 |

The probe `null-unit-function-value.vl`'s start body, the last miss in these classes on the
probes, is claimed.

## What is left in the class, and why

- **`ident:notroutedref`** (5 functions, 3 start bodies). `userFnCallRoutesRef` asks
  `identNameIsLiveBound`, which reads legacy's emission-time binding state; the builder does not
  see that state. A first attempt routed these to the scope's function (`directCallAt`) and was
  wrong. Inside a module-scope block, legacy calls the block's closure, and the builder called the
  module function of the same name (a verifier failure, `add has no signature over str`). Closing
  it needs a static liveness answer the builder and legacy share.
- **`tail:toplambdarecord`** (2): a top-level lambda returning a bundle record. Legacy picks the
  member after the closure call (`emitBundleResultPick`); the IR picks only after a direct call.
- **`tail:setsplit`** (1, plus 1 `indirect call`): legacy's own refusal (D16747).
- **A `null`-typed callee** (2, `hole-guarded-call-through-null-*`). Legacy writes
  `unreachable`, then prints that value through `__print_i32__`; the IR picks another print arm.
- Newly exposed first misses in other classes: none from this change.

## Proof

- Q58 sweep: `tests/cases/closures/closure-call-null-argument-positions.vl`, `null` and nullable
  arguments at each of the four kinds, the call's result at every position and at module scope.
  Every position function is claimed after and unclaimed before (11 functions, one `@init`). It
  builds under `VL_IR_SHADOW=6` with no mismatch and is claimless-identical.
- `scripts/ir-identity.sh --cases`: `cases: identical 8193, fail under both 74, differ 0, timeout 0,
  expected divergence 2`; `witnesses: same 89, differ 0, timeout 0, expected divergence 0`.
- `scripts/ir-identity.sh --claimless`: `claimless: identical 14524, fail under both 3267, differ 0,
  timeout 0, expected divergence 1`.
