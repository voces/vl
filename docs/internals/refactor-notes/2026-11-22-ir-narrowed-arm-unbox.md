# IR: a box narrowed to a record arm, unboxed at a record delivery (2026-11-22, lane IR-N3)

Family A's record rows (IR-N5's narrowed-read ranking): a box local narrowed to a record or
nullable record arm, delivered into a record destination. Legacy emits the box as it stands, then
the table's unbox (`emitCoerced`'s `unbox`, `emitArmDelivery`): `struct.get $box 1`, then
`ref.cast (null) $H` at the arm's record heap. The IR's `narrowedLocalRead` had no rung for a box
cell at a record rep.

## The change

- `wasmEmit.vl`: a new export, `emitArmUnboxAt(ix, fnIx)`, which is `emitArmUnboxCast` at
  `armRecordHeapAt` with `armUnboxNullable`; it returns -1 and writes nothing where the read has
  no arm record.
- `ir.vl`: `RArmUnbox { uaV, uaAt }`, in the `box` family.
- `ir_build.vl` `deliver`: at a record or nullable-record destination, a box `Ident` for which
  `narrowedArmNeedsUnbox` holds and `narrowedArmTyAt` names an arm builds `RArmUnbox` over
  `irBBoxLocal`, typed at the destination.
- `ir_lower.vl`: the box, then `emitArmUnboxAt`. A missing heap is a named lowering miss, and the
  heap is asked at the lowering, so a claim mints nothing.
- `ir_verify.vl`: the operand is box-shaped and the destination a record or nullable record, else
  rule 2. Self-test case 26 is an arm unbox over an `i32` operand, refused under rule 2.

The object field, field store and global initializer refusals cast at the site's heap behind
`armUnboxCastOwed`, a different pair, and stay named misses. Family A's atom and list rows read in
non-delivery positions (an operator, `??`, a receiver) and are not covered here.

## Witness

`tests/ir-shadow-rows/narrowed-box-arm-unboxed-at-a-record.vl`: a return, an argument and a
binding of a narrowed record arm. The old seed covers 3 of its 5 functions.
