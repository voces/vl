# IR: a vector boxed into a union of it (2026-11-22, lane IR-N2)

`box ladder`, the v128 rung. On #9493's head, 9 corpus functions miss at `box ladder` alone with
a `v128` value: `v128 | null`, `v128 | string` and `v128 | i32` destinations. #9445's note parked
this rung because it needs a value-atom kind outside the plan's scalar range.

Legacy's ladder gives a vector value-atom kind 14 (`coerceValueAtomKind`) and boxes it through
`emitUnionCoerceAtomBox`. It writes the kind's tag, the vector, its value box, then the union
box. That is the `atom` arm's shape (`atomBoxTail`). `holeBoxPlanOf` read the vector's primitive
as no value atom (`holePrimKind`) and returned the ladder.

## The change

- `holeBoxPlanOf` gives a `v128` value the `atom` arm at kind 14 where legacy's ladder settles
  that kind (`coerceListAtomOf` of `coerceValueAtomKind`), else the ladder. The kind is named
  `V128_ATOM_KIND`, the same constant `coerceValueAtomKind` assigns. Legacy now writes these
  boxes through `emitHoleBox`. ir-identity `--names` and `--cases` compare its bytes, and every
  `tests/cases/simd` program builds byte-identically.
- `boxPlanWhy`'s `atom` arm takes a `v128` operand at that kind. `holeKindRep`, which the unbox
  side also reads, is unchanged.

Covered = matched over the files the ladder census named: 622 → 630.

Row file `tests/ir-shadow-rows/vector-boxed-into-union.vl`; witness
`tests/cases/simd/vector-boxed-into-union-argument.vl`.
