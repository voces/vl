# D16039: identity over a union of record and function arms (2026-11-14)

The identity flag (D15975, #7965) lowered `===` as `ref.eq` on a record union's payload and as the
`==` closure compare on a function operand, and the checker refused a union that mixes the two
(`tyIsRecordFnMix`, `CODE_UNSUPPORTED_LOWERING`). Under DECISIONS A15 every arm of the mix has an
identity, so the refusal was a clause-2 floor.

## Change

- `tyHasIdentity` accepts a union whose non-null arms are records or functions, mixed or not; the
  refusal and `tyIsRecordFnMix` are gone. `tyIdentityMixesArms` (check_identity) names the mix
  for the emitter.
- `emitIdentityMixed` (wasmEmit) stages each operand's payload in a new `(ref null eq)` scratch
  slot (code 45, `identityArmSlot`). When both payloads are closures it runs `emitCloEqCore`;
  otherwise `ref.eq`, which holds a record apart from a function and either apart from `null`
  without a tag test.
- `cloEqNoteBin` reserves the closure frame for a mixed identity compare, and `eqCoreKindOfBin`
  answers `"none"` for it, so the reservation scan and the emitter agree.

## Measured

Master `f1933c5aa` fixpoint seed against this branch's fixpoint seed:

- `matrix/identity-eq-mixed-union.matrix.vl` (a declared function arm) and
  `identity-eq-mixed-union-closure.matrix.vl` (a closure over a captured environment): 0 of 66
  cells ran before, 66 of 66 after, each.
- E's nine `identity-eq-*` templates: 66 of 66 before and after, 0 `runs -> not-runs`, 0 silent.
- `tests/cases/operators/identity-eq-mixed-record-fn-union.vl` covers `!==`, two closures from one
  maker (unequal), one closure held twice (equal), a nullable of the mix, and a union with two
  record arms beside the function.
