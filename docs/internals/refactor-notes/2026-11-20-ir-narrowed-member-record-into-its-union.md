# Fix: a narrowed member record delivered into its union (2026-11-20, lane IR6; D17027)

`if z.h is B { show(z.h) }`, with `z.h: A | B` and `show(h: A | B)`, was check-clean and wrote a
module that does not validate: the argument was `B`'s record where the parameter takes the box.

## The mechanism

Inside the arm `z.h` is a read of `B` at its own type out of the union field it is held in, and
`boxedArmOfMember` names it: the field tail casts the box's payload to `B`'s record (off a struct
receiver always, off a variant receiver since D17025). The checker records the argument's box, so
the delivery boxes through `holeBoxPlanOf`. Its record rung asks `armValuePlainOf`, which asks
`exprVariantIndex`, and `memberVariantRow` names no variant for that read. The plan answered
`ladder`, and the ladder handed the record over as it stood.

`armValuePlainOf` now takes the arm `boxedArmOfMember` names where `exprVariantIndex` names none.
The plan answers `rec` for exactly the reads the tail casts, and both writers read the plan
(legacy's `emitUnionBoxArg`, the IR's box nodes). `exprVariantIndex` itself is unchanged: moving
it would move every field read off such a receiver.

## The window #9251 opened

Before D17025's fix the variant tail left these reads as the box, so off a union-member receiver
the argument, wider-union, return, binding, field and element positions ran by accident. #9251
cast them, as the struct tail always did, and they met this gap: invalid wasm on master from
`a5b8be3d7` until this fix. No corpus cell held the shape; the two cases below now do.

## Witnesses

- `tests/cases/narrowing/narrowed-field-record-delivered-to-its-union.vl`: eleven positions off a
  plain record receiver, an annotated and an un-annotated spelling of the return and the binding.
- `tests/cases/narrowing/narrowed-field-record-delivered-to-its-union-of-a-union-member.vl`: the
  same off a receiver that is a union member.

## Capability matrix

Three templates under `scripts/capability-probes/matrix/`, a narrowed member read off a struct,
a union-member and a null-tested nullable union-member receiver, each over the built-in positions
plus a record and a union parameter, an early return into either, and interpolation. Graded with
`--before` master `f2ec7aa7c` and `--after` this branch:

| template | runs before | runs after | runs → not-runs | SILENT after |
|---|---:|---:|---:|---:|
| `narrowed-member-record-struct-recv` | 31 of 72 | 72 of 72 | 0 | 0 |
| `narrowed-member-record-variant-recv` | 65 of 72 | 67 of 72 | 0 | 5 |
| `narrowed-member-record-nullable-recv` | 70 of 72 | 72 of 72 | 0 | 0 |

The variant template's five SILENT cells are SILENT before as well, and before #9251: a module
`const` receiver whose record is a union member, delivered at the member record (`record_param`
in both faces; the un-annotated `argument`, `early_return_guard`, `fn_body_capture`). That is
another reader, filed as unfiled: D17028. The six positions #9251 broke are read off a parameter
receiver, which the template's module `const` does not reach; the union-member case file holds
them.

