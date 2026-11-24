# A closure call's nullable union-arm parameter takes its argument as legacy does (2026-11-24, lane IR-N5)

A closure call whose parameter is a nullable union arm (`Circle | null` with `Circle` an arm of
`Shape`, D3074) takes legacy's `nulArm` argument arm (`callRefArgArmOf`, pkk `nulvariant`).
`callRefArgPlain` did not count that arm as plain, so `callRefPlainKey` was empty and the IR's
`closureCallRhs` missed as `call of a non-declaration`.

Legacy's arm writes `armOpen` / `emitExpr` / `armClose` at `armDestHeapOf("nulvariant", slot)`:
a narrowed box owed an unbox (`narrowedArmNeedsUnbox`) is read at its payload and cast to the
arm's nullable heap; an object literal, a `null` or a nullable list element is written as it stands.

## The change

- `callRefArgPlain`: `nulArm` is plain where the key's parameter has a variant slot. With none,
  legacy's arm emits its own refusal and the key stays non-plain. Only the recorded plain key
  moves; legacy writes no other byte.
- `closureCallAt`: a `nulArm` argument is delivered at the closure's parameter rep
  (`closureParamRep`), the nullable arm record. `deliver` reaches the existing `armUnboxOwed` /
  `RArmUnbox` path for an owed box, as the direct call already does.

New test case: `closures/nullable-arm-closure-param-each-value-kind.vl`.

## Not in this change

- `closures/nullable-arm-param-function-value.vl`'s start next stops at `for in element
  nulvariant` (a walk over a `(Circle | null)[]`), the for-in element family.
- `soundness/narrowed-nullable-record-delivery.vl`'s start stops at `narrowed read`.
