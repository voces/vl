# Step 7 codecs: `emit_classify.vl`'s arm-field and member-field code comparisons ask the storage, 2026-11-12

This is group 1 of `2026-11-11-step7-codec-field-rep-column-design.md` (#7250) for
`emit_classify.vl`, the largest reader of the code column outside `wasmEmit.vl`. It takes the ten
comparisons that test one code.

## What changed

- **Arm-row predicates** (`emit_atom_kinds.vl`): `armRowIsUnionBox(r)` and `armRowIsRecordRef(r)`
  read `repOfTy(armFieldStoreTy()[r])` and fall back to the code as the struct-row predicates do.
  `variantFieldIsUnionBox` and `variantFieldIsRecordRef` delegate to them.
- **`memberFieldIsUnionBox` and `memberFieldIsRecordRef`** (`emit_classify.vl`) answer through
  `memberFieldPos`:
  - a struct row asks the flat-row predicate;
  - an arm row asks the arm-row predicate;
  - a shared read asks its plan's code.

  They replace `memberFieldCode(..) == FC_UNION` in `memberUnionReadKind` and `!= FC_STRUCT` in
  `memberVariantRowGo`.
- The variant comparisons:
  - four `== FC_UNION` read `variantFieldIsUnionBox`, in `memberUnionFieldName` (2) and
    `armFieldUnionName` (2);
  - `!= FC_STRUCT` in `variantFieldStructRow` and `== FC_STRUCT` in `objMatchesVariantIdxOmit` read
    `variantFieldIsRecordRef`;
  - `== FC_I32` in `memberReadIsLitAtom` reads `variantFieldNumKind(..) == 0`;
  - `objMatchesVariantIdxOmit`'s `== FC_MAP` reads `eqRowFieldKind(-1 - vi, fj) == "map"`.

## Measurement

`sweep.vl diff`, master `790e0d24`'s fixpoint seed (6,664,649 bytes) against this one (fixpoint,
6,664,963 bytes), over 23,995 programs:

- **23,995 same**;
- 0 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

## What is left in `emit_classify.vl`

These hand a code on or dispatch on several codes:

- `memberFieldCode`'s other consumers (`exprString`'s family and `fieldCodeIsNulLitAtom`);
- `ovnStoredAlike`, which compares a code computed from a type against an arm row's code;
- the `fieldCodeOf*` returners near `memberFieldElemTy`;
- the floor in `sFieldStoreKind`.
