# Step 7 L2: the annotation ladder answers from the pin's type, 2026-11-12

`monoAnnPinName(name, ty)` is the one home for "which annotation can pin an instance". It used to
be a ladder over `name`, the caller's spelling of the pin, with these rungs:

- `isSName(name)`, and the same on `arrElemNameRaw(name)`;
- `isUNameKeyAB`, or by name `isUNameDeclAB`, on the name and on its element;
- `variantIndexOf(name)`, and the same on the element;
- `nameIsShapeSpanEnds`;
- the composite-list span tests;
- the literal-union alias list rung;
- `arrElemIs(name, "boolean")`;
- `tyIsBareMap(ty)`;
- a scalar-name list;
- the nullable rung.

After #7606 and #7611 the ladder held no ratcheted parse. It was still `emit_mono.vl`'s largest
spelling reader: 27 of the file's 42 spelling reads.

This PR answers the question from the type alone. `monoAnnPinName` echoes `name` when
`monoAnnPinOkTy(ty)` holds. The new predicate is a `_`-less match over the eleven `Ty` kinds:

| kind | has a pin when |
| --- | --- |
| any | the registry keys a union row for it (`unionRowKeyAB(79, ty)`, the ladder's own key) |
| `TyObj` | it is inline (spelled by its shape), or a struct row or a variant row (`uVarTyIx`, by `tySame` and declared name) holds it |
| `TyNullable` | its inner has a pin |
| `TyPrim` | `i32`, `i64`, `f32`, `f64`, `boolean`, `string` or `v128` |
| `TyMap`, `TyUnion` | `tyIsBareMap` (a map, its alias, or a union of twin maps) |
| `TyArray` | the element is a keyed union (`unionRowKeyAB(80, e)`), a record with a row, a list, a union, a nullable or a function (the spellings it groups in parentheses), or `i32`, `i64`, `f32`, `f64`, `boolean`, `string` or `u8` |
| `TyFunc`, `TyLit`, `TyVar`, `TyErr`, `TyNeg` | never |

An empty `name` is no pin, which is what the ladder answered for the empty spelling.

## Measured

The probe was a scratch compiler, never seeded. It held the predicate above beside the ladder. It
ran on #7611's tree over the sweep population and recorded 24,070 programs, counting decisions.

- **Typed calls.** 5,814 decisions across 15 reached call sites. 5,813 agree. The one that
  disagrees is at `monoAnnPinNameOfTy` in `generics/record-binding-adopts-generic-union-field.vl`:
  the naming rule cannot spell that record, so the ladder was handed `""`. That is the empty-name
  case above.
- **Untyped calls, given a candidate type.** The probe gave each untyped call a candidate type and
  asked the predicate:
  - `monoNarrowedNominalPinName`, `(nom, -1)` → `nt`: 30 decisions (6 programs), all agree.
  - `monoArgTyNameRep`'s literal-arm variant row, `(uVariants[v], -1)` → `uVarTyIx[v]`: 39
    decisions (19 programs), all agree.
  - In no program did passing the type change the old ladder's answer.
- **Unreached.** Nine call sites are not reached in the population:
  - the main and literal narrowed-pin rungs;
  - `monoLoopVarRecordPin`;
  - `monoNicheWidenedPinName`;
  - `monoElemlessNulListPinName`;
  - two of `monoArgTyNameRep`'s variant rows;
  - the nullable-field rung;
  - `monoNarrowedNulRecPinName`'s typed call.

  They now answer from the same predicate.

## Changed

- `monoAnnPinName(name, ty)` is `name` when `monoAnnPinOkTy(ty)`, else `""`.
- Added `monoAnnPinOkTy`, `monoListPinOk`, `monoRecordPinOk` and `monoPrimHasRep`.
- Deleted `monoStructAnnName`, `monoScalarAnnName`, `monoCompositeListAnnName` and
  `monoNulAnnName`. Five imports leave the file: `arrElemIs`, `nameIsParenSpanEnds`,
  `nameIsShapeSpanEnds`, `isUNameKeyAB` / `isUNameDeclAB` and `variantIndexOf`.
- The untyped callers pass their type: `nt`, the walk's `t` and `uVarTyIx[v]`.

## Counts

- `emit_mono.vl` spelling reads, by the grep of the helpers listed in
  `2026-11-12-step7-l2-mono-narrowed-pin-by-type.md`: 42 → 15.
- render-parse: unchanged at 13 / 31. `emit_mono.vl` was already at 0 / 0.
- pin-helper: 911 → 910 on the merged tree (master removed one); this PR deletes four functions and adds four; the new list
  predicate is a match the kind-ladder rule requires.
- kind-ladder budget: 0.

## What stays

These are the 15 remaining spelling reads, each a floor or another lane's:

| reads | where | owner or reason |
| --- | --- | --- |
| `unionArmsOf` ×3 | `monoArmsNarrowFrom`, `monoWideArmsHoldBrace`, `monoArmCount`: the wide pin's arms by registry name | the union key by type (w316) |
| `isSName` ×2, `structIndexByName` ×1, `listElemNameOf` ×1 | `monoArgTyNameProjected`: a struct field's element name and a list argument's element spelling | the struct name producers (w324) |
| `structIndexByName` ×2 | `monoAnonRowListTy`, `monoElabCompositeTy` (a type parameter shadowing a struct name) | w324 |
| `arrElemNameRaw` ×1 | `monoNameIsGroupedList` | the pin-text readers below |
| `nameIsBraceSpanEnds` ×2, `listElemNameOf` ×1 | `monoInstanceFor`, `monoSlotPinAnn`, `monoPinAnnotatedParam`: the parameter and binding pin text | the body-rewrite readers |
| `normTypeAtom` ×2 | `monoCellLamTakeAt`: a lambda cell's pins compared by spelling | the body-rewrite readers |

The body-rewrite readers are the "40 + 18" of `2026-11-10-step7-l2-mono-key-census.md` §3, and
the next cut.

## Proof

- **Locally:**
  - refresh to a fixpoint;
  - `lint-self.sh` clean;
  - kind-ladder 0;
  - pin-helper 911;
  - late demands 8;
  - seed 6,724,839 bytes (+2.1%);
  - `mono-tyaram-grid.sh` 252 OK, 0 BAD;
  - `regress.vl`, no runs lost;
  - `check-filed-witnesses --strict` on both inventories: 4,849 as filed.
- **The sweep** is CI's (`sweep` label).
