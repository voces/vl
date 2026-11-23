# IR: a map whose value is a rowless record, at legacy's storage row, 2026-11-23

Lane IR-N6, the class `map read mv value rep` (rowless records, the coordinator's ruling). #9760
let 9 map-default corpus cells through the null test, and they then stopped at this sentence: the
read's out is the row legacy stores the value in (`mvValStructIdxOf`), while the map's own rep
still carried the value's rowless record type.

## The mechanism

`rtOfMap` builds the value rep with `rtMapValTy(v)`: for a record type no struct row records, the
type of the row legacy stores it in (`structRowOfRecordTy`, then `slotRowTyOf`), the one legacy's
mv slot holds; else `v`. A record type with a row of its own keeps `v`: answering
`structRowOfRecordTy` for it too moved two generic-instance maps to a twin row
(`generics/generic-body-push-record-of-generic-fn-two-instances.vl` and
`structs/record-literal-beside-declared-record-with-another-field-function.vl` stopped at `map get
rep`). Sets are unchanged (a `bool` leaf).

The row comes from one new slot in `emit_rep`, installed by `emitProgram` beside
`rowFieldStorageFn` (as `rowlessRecordRow`: -1 when `structIndexOfTy` names a row, else
`structRowOfRecordTy`), since both sit above the rep module:

```
export let recordRowFn: (ty: i32) => i32   // the row legacy stores a rowless record type at, or -1
export function askRecordRowTy(ty: i32): i32  // that row's type, else ty; recorded once per type
```

The API is deliberately minimal (type → row), as the coordinator ruled, so IR-M1's heap-identity
work builds on it and `rowFieldStorage` may later read through it. `askRecordRowTy` records the
DECISION (the type the rep is built at), not the raw row: a type whose own row is minted after its
map rep was built moves the raw answer from -1 to a row while the decision stays the same. Six
programs (three `mty_ret_mapapp_*` cells and three unions/closures cases) tripped the check before
it compared decisions. The recorded decisions are re-asked by `rowFieldAsksHold`, so a row minted
or re-laid later that moves one fails loudly (`a record's field storage changed after its rep was
built`).

## Legacy tails the IR calls

None new. `structRowOfRecordTy` is legacy's own answer, read through the slot.

## Readings (fixpoint seeds on both sides, base: #9760's merged fixpoint)

READINGS

Shadow row `tests/ir-shadow-rows/rowless-map-value.vl`.

Legacy lines deleted: 0. Moved to `@ir`: 0.
