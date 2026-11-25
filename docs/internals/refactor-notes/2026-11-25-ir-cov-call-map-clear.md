# COV-CALL: a map or set `.clear()` (2026-11-25)

Lane COV-CALL, class `method clear`.

## Mechanism

The IR had list `.clear()` (`RListClear`) but no map or set one, so `m.clear()` fell through
`methodRhs` to `method clear`.

- **`RMapClear`** (ir.vl) takes the shape of `RMapDelete` with no key: global `mcSym` with its
  recovery, or receiver operand `mcLoc`. It sits in the map family, with verifier rule 2 (a
  statement whose receiver is a map), its text and the lint ladder sets.
- **Builder:** `mapClearStmt` reads the receiver through `mapRecvLoc`, as delete and set do.
- **Lowering:** `mapClear` writes the receiver read and `mapRecvRefTail`, then `mapClearTail`. That
  is `emitMapClear`'s body after its receiver, split out unchanged; legacy calls it too, so its
  bytes do not move.

## Census (`CENSUS_CLASS=classes/method-clear.txt`, rows)

| row | before | after |
|---|---:|---:|
| `method clear` | 9 | 0 |

Every class program builds under `VL_IR_STRICT=1 VL_IR_SHADOW=6` to the base seed's bytes.

## Proof

- **Q58 sweep:** `tests/cases/maps/clear-more-receivers.vl` covers the receivers
  `clear-receivers.vl` leaves out: a parameter, a nullable map narrowed non-null, a set in a record
  field, an `if` arm, a loop, and a string-keyed map. On master 5 of its functions miss on this row;
  with this change none, and all match.
