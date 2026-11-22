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

## Measured vs merge-base 454e5ab9 (fixpoint seeds on both sides)

The branch is stacked on #9574 (the niche read), and this proves both.

- `--names` self-compile identical. `ir-identity.sh --cases`: identical 7625, fail under both 68,
  differ 0; witnesses same 61, differ 0. `--claimless`: identical 14019, fail under both 3267,
  differ 0.
- tests/cases shadow sum: matched 69765 → 69789, `uncovered narrowed read` 66 → 44, start matched
  6217 → 6226. Against the niche-read head alone this change is +7 matched (69773 → 69780), with
  narrowed read 49 → 44 and start global read coercion 91 → 81. Two start functions move on to the
  named `object field arm unbox`, and one to `closure env capture`.
- `tests/cases/unions/narrowed-arm-unbox-field-reads.vl` runs; 9 of its 9 functions are covered
  and matched, against 5 on the old seed.
- Corpus shadow: 45225 of 45678 functions covered, verified and matched.
- L2 self-compile fuel +0.23% on base 454e5ab9 (per-PR tier +1%). The same-tree pair, both
  seeds compiling the base tree, reads 112290532099 → 112277477718 (−0.0116%), so the rise is
  source growth.
- Deep-nesting margin: base and branch alike, 920 KB fail, 930 KB pass.
- Late demands 9 (baseline 9); late tag rows 307; `ladder-sets` 101 sets clean; `ir prepost`
  (mode 6) and `ir claims` ok with no new row; `gate.sh --fast` passed.
