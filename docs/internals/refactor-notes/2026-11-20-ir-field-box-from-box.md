# IR: a box into a field's union asks legacy's box plan, 2026-11-20

The IR's object-literal field arms (#9222 struct, #9244 variant) refused any field value that
was already a union box ("object field box from a box", "object variant field box from a box"),
because a box into another union's box can retag its members on legacy's side. Thirty
self-compile functions were blocked by the variant arm alone. Legacy's `emitUnionBoxOwed` takes
the checker's recorded box first (`boxOwedAt` → `emitDelivered`) and otherwise asks
`holeBoxPlanOf` at the field's site union, passing the box whole on `pass`.

## The change

- `structFieldBoxTy` and `variantFieldBoxTy` (wasmEmit.vl) are the site union a box into a
  struct row's or a variant's field is planned at. Legacy's three field writers
  (`emitStructFieldValue`, `emitStructFieldStoreValue`, `emitVariantFieldBox`) and the IR's
  field deliver all call them, so the pairing is written once.
- The two field guards now ask `boxIntoOtherUnion`, #9254's deliver fence, at that site type:
  a recorded box goes in first, and otherwise the box passes only where the plan says `pass`.
  The field's `deliver` passes the same site type to the fence.

Compiler lines are +35 −10 across `ir_build.vl` and `wasmEmit.vl`; no legacy line is deleted.
The capability template `matrix/box-of-same-union-delivered.matrix.vl` grades every position plus
a struct and a variant receiver, an alias destination, a recorded box into a wider field, the
`i32` into `f64 | string` cast, and a narrowed wider union into a narrower field.

## Readings (vs merge-base `f129fdba8`, fixpoint seeds on both sides)

| reading | merge-base | this change |
| --- | ---: | ---: |
| self-compile functions claimed (mode 5) | 18,330 | 18,360 (+30) |
| self-compile functions with no blocker | 18,411 | 18,441 (+30) |
| self-compile `object variant field box from a box`, alone | 30 | 0 |
| corpus covered = verified = matched (shadow) | 40,615 of 45,678 | 40,615 |
| L2 self-compile fuel | 103,406,192,530 | 103,386,916,746 (−0.019%) |
| seed size | 6,890,524 | 6,890,688 (+164 bytes) |

Legacy now reads the site type through the shared functions, so it is A/B'd on its own:
compilers with `CLAIMED` empty built from both trees give identical bytes on every tests/cases
program and probe (7,522 identical, 68 failing under both, 0 differ) and the same first
diagnostic on all 59 filed emit-reject witnesses. The matrix runs 76 of 76 graded cells before
and after.
