# IR: a map whose value is a rowless record, at legacy's storage row, 2026-11-23

Lane IR-N6, the class `map read mv value rep` (rowless records, the coordinator's ruling). #9760
let 9 map-default corpus cells through the null test, and they then stopped at this sentence: the
read's out is the row legacy stores the value in (`mvValStructIdxOf`), while the map's own rep
still carried the value's rowless record type.

## The mechanism

`rtOfMap` builds the value rep with `rtMapValTy(v)`: for a record type, the type of the struct row
legacy stores it in (`structRowOfRecordTy`, then `slotRowTyOf`), else `v`. For a rowless record that
is the row another type is stored at, the one legacy's mv slot holds; for a record type with a row
of its own it is that row's canonical twin's type, usually `v` itself. Sets are unchanged (a `bool`
leaf).

The row comes from one new slot in `emit_rep`, installed by `emitProgram` beside
`rowFieldStorageFn` (as `structRowOfRecordTy`), since both sit above the rep module:

```
export let recordRowFn: (ty: i32) => i32   // the struct row legacy stores record type ty at, or -1
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

Answering only a type no row records (-1 where `structIndexOfTy` names a row) was tried and
refused: a map value type that gets its own row after its map rep is built flips that answer, the
recorded check fires, and 8 corpus cells and `maps/arm-valued-map-slot-layout-twin-of-its-render.vl`
stopped building. `structRowOfRecordTy` folds the new row to its canonical twin, so its decision
holds.

## Legacy tails the IR calls

None new. `structRowOfRecordTy` is legacy's own answer, read through the slot.

## Readings (fixpoint seeds on both sides, base: #9760's merged fixpoint, b994a210)

Functions with no blocker, `VL_IR_SHADOW=4`: distilled corpus 45,452 -> 45,461; tests/cases
79,249 -> 79,247. `map read mv value rep`: corpus 9 -> 0 (all 9 sole blockers). The 3 corpus cells
at `map read default rep` (each also at `null test nullty operand`) are unchanged.

| program | change |
| --- | ---: |
| 9 corpus map-default cells (`b021395` ... `b021474`) | +1 each |
| `generics/generic-body-push-record-of-generic-fn-two-instances.vl` | -1 |
| `structs/record-literal-beside-declared-record-with-another-field-function.vl` | -1 |

The price: the two tests/cases functions now stop at `map get rep`. Each is a generic instance's
map whose record value type has a row of its own; `structRowOfRecordTy` answers its canonical twin
row, so the map's value rep is the twin's while the read is typed at the instance's own record. They
fall back to legacy. Reading the get at the twin's type would move every field read off the value;
it is heap identity's question (IR-M1), which reads the same slot.

Shadow row `tests/ir-shadow-rows/rowless-map-value.vl`.

Legacy lines deleted: 0. Moved to `@ir`: 0.
