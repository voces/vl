# IR coverage: assignment values boxedArm and widerRow (lane COV-UNION, 2026-11-25)

`assignment value boxedArm` (4 rows) and `assignment value widerRow` (3 rows) of the I8 census.

## Mechanism

- **boxedArm.** A write into a union list's element or a union map's entry, used as a value whose
  type is one arm: legacy parks the stored box, reads it back, recovers it and unboxes it to the
  value's arm (`emitUnionUnboxTail`). The IR builds the store and the parked read as #10095 does
  (the store-and-park half is now `parkedStore`, shared with `assignValueParked`), the read typed
  at the box's own type, then `RBoxNarrow` with the value's box tag (`boxTagOfTy`).
- **widerRow.** A record wider than a name's own, written into the name: legacy re-reads the name
  and casts it to the wider row (`asgNameWiderRow`, D16105). A new Rhs `RRecDown { rdV, rdAt }`
  writes that cast through `asgWiderRowTail`, which `emitAsgValueOf`'s `widerRow` arm now calls
  too. Its operand is the name's record or the nullable record its cell holds.

- **widerRow as an `if` arm.** Legacy's arm planner (`refIfArmOf`, through `ifArmIsValue`)
  counts an assignment as an arm's value only where its target re-reads, so a `widerRow` write
  is `noValue` and legacy refuses ("if-expression arm ends in a statement"). The IR's `refIfArm`
  builds such an arm as a plain value (`ifArmWiderWrite`); the claimless build still refuses, so
  `scripts/ir-divergence-baseline.txt` lists `ifArm` and `elseArm` of
  `tests/cases/records/wider-record-write-as-if-arm-value.vl` as legacy-wrong (O3).

## Measurements

- Class cut of the census (`CENSUS_CLASS`, 47 programs), against the tree after #10095 (this
  branch does not hold #10104):
  - `assignment value boxedArm` 4 → 0; `assignment value widerRow` 3 → 0;
  - cases functions claimed 388 → 390 of 412, start bodies 14 → 15 of 27; witnesses functions
    237 → 238 of 239, start bodies 9 → 10 of 17;
  - two `widerRow` start bodies move to `global store coercion` (a global name's own store).
- Q58 sweeps:
  - `tests/cases/unions/write-into-union-element-value-in-each-position.vl`: 71 of 71 functions
    and both starts matched; 5 missed `assignment value boxedArm` before. An interpolation hole
    position is left out: legacy writes invalid wasm there (reported to SOUND).
  - `tests/cases/records/wider-record-write-value-in-each-position.vl`: 9 of 9 and the start
    matched; 6 missed `assignment value widerRow` before. An `if` arm position is left out: legacy
    refuses it ("if-expression arm ends in a statement"), reported to SOUND.
