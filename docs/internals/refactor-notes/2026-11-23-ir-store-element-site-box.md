# A shared let's cell write boxes its value at the site's union (2026-11-23, lane IR-N5)

`store element` was 10 tests/cases programs (19 functions) on #9790's head. The miss is legacy's
`idxStorePlainWhy`, which the IR's `elemStore` asked, on two arms:

| arm | programs | the store |
|---|---|---|
| U | 7 | a scalar written into a shared `let`'s `T \| null` cell (`i32`, `f64`, `v128`; D16023), owing no box |
| N | 3 | a literal written into a nested-list cell (a shared list or record `let`) |

Legacy's union arm (`emitIdxStoreValue` → `emitUnionBoxAtRecord`) delivers an owed box, boxes a
value already of a union at its own, and otherwise boxes at the site's union (`emitUnionBoxArg` at
`unionNm`).

## The change

- `idxStorePlainWhy` (`wasmEmit.vl`, its one caller the IR) is split: `idxStoreSiteBoxes` names arm
  U, `idxStoreOtherWhy` the rest. Legacy's writer does not call either, so no legacy byte moves.
- Where `idxStoreSiteBoxes` holds, `elemStore` boxes the value at `st.unionTy` (`boxTempIn`): the
  box plan legacy's `emitUnionBoxArg` writes there (`struct.new $box (i32.const <tag>) (payload)`).
- A `v128` shared `let` is lifted through its `$cb` cell (it is not a scalar `cboxScalarLets` takes),
  so the writer's capture parameter is held at the cell list's rep (`capRepFor`'s read fallback).
  `liftCapVar` now types such a parameter at that rep; it was typed at the binding's `v128`, a
  verifier rule-3 fail the store's miss had hidden.

New test cases:
- `closures/shared-scalar-let-cell-written-and-read-by-two-closures.vl`
- `simd/shared-vector-let-cell-written-and-read-by-two-closures.vl`
- `closures/shared-nullable-let-cell-written-null-after-a-number.vl` (arm N, a named miss)

## Not in this change

Arm N: dropping its refusal builds two of the three programs byte-identically; the third
(`shared-let-read-early-traps-nullable.vl`) is byte-identical with a `spans: read index` mismatch.
It is not a list-literal seeding mechanism.
