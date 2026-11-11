# Step 7 slot layer, family B: `structIndexByName`'s 27 sites and the struct name producers graded, 2026-11-11

This is the second cut of Family B's remainder, after `variantIndexOf` (#7269). It grades
`structIndexByName`'s 27 call sites by where the name comes from (a grep count over `compiler/*.vl`,
comment lines left out). It also probes the two typed producers in this lane that fall back to a
name, `structRowOfNameTy` and `structRowOfAnnTy`. Since #7214, `structIndexByName` answers a name's
canonical row. Base is master `bb40b26e` (#7259), whose fixpoint seed is 6,618,693 bytes.

## Method

The probe is the one #7269 used. A `fambNote` tag is noted once per program, and an override at
the end of `emitProgram` reports it. The probe compiler was built from base by the base seed and
never refreshed into `build/`. Each site's reach tag fired in the population, which is its control
(`q1.vl`, a record-returning function, fired the `retStructRowIndex` tag by hand). The sweep
covered 23,913 programs. Counts are **programs**.

## `structIndexByName`, by where the name comes from

| group | sites | grade |
| --- | --- | --- |
| a literal's `#anonN` handle | `monoSubstAnonShapes`, `monoAnonRowListTy`, `anonPinRow`, `anonRowTyOfName` | BY DESIGN: the handle is the row's own key |
| a mint reading its own key | `annSameTypeRowOf` (the spelling being minted), `gaeEnsure` (2, the application name it interns under), `iisPushFieldElem` (2, the field text it records) | BY DESIGN while the shape interner mints under a spelling |
| another name producer's body | `structRowOfSpelling`, `spellingHasStructRow`, `structIndexOfTypeNameGo`, `structIndexOfTypeNameTy`, `structRowOfNameTy` | goes with that producer, below |
| an annotation's declaration | `retStructRowIndex` | LEFT, a named floor: 109 programs |
| the type's first name | `monoArgTyNameProjected`'s nullable-receiver rung | LEFT: no program reaches it |
| a mono pin's spelling | `monoArgTyNameProjected` (2: the receiver's pin, a field's element name) | the instance lane, while a pin is a spelling |
| a type parameter's name | `monoElabCompositeTy` (a parameter a declared record's name shadows) | BY DESIGN: a scoping question |
| a ref-list bank's spelling | `rlElemLitStructRow`, `rlElemStructRow`, `rlElemVariantRow`, `refArrShapeKindGo` | the ref-list bank's cut, w311 |
| a field element's spelling | `rowCanonIdOfName` (for `emit_field_codes`, `emit_join_records`) | the field codes, w314 |
| a spelling classifier | `elemNameIsNominalAt` | goes with the ref-array spelling ladder, w311 |
| a union key atom | `utkAtomText` | the union registry, w316 |
| a debug dump | `rowDumpBuild` | BY DESIGN |

## The probes

| producer | question | reached | answer |
| --- | --- | --- | --- |
| `retStructRowIndex` | is the annotation's name row its type's row (`recordStructRow`)? | 14,892 | **109 differ**; 214 more name an `#anon` handle |
| `monoArgTyNameProjected` | is `structIndexByName(structNameOfTy(t))` the type's row? | **0** | — |
| `structRowOfNameTy`, typed callers | is the name's row the type's row, where the name has one? | 596 | 0 differ |
| `structRowOfNameTy`, without its by-name rung | is the answer unchanged? | 596 | **0 differ** |
| `structRowOfNameTy`'s arm test | is "the name is an arm" the same as "the type is a declared arm member"? | 596 | 6 differ, 5 in the answer |
| `structRowOfNameTy`, type-less callers | reached? | **0** | — |
| `structRowOfAnnTy`, the name fallback | does the fallback answer a row the type does not? | 3,516 | 5 |

## Grading

- **`retStructRowIndex`'s name rung is a floor.** In 109 programs the name answers a row that the
  type's canonical row is not. The largest part is the newtype brands `I32View` and `F32View`
  (`std:buffer`). They are identically shaped on purpose, so the type cannot tell them apart.
  The rest are same-shape declarations (`B`, `S`, `R`, `Intent`, `Circle2`). This is declaration
  identity the type does not carry, which is the case the `annDeclPos` column already answers by name.
  It goes when struct rows key by `(type, declaration)`.
- **`structRowOfNameTy`'s by-name rung is deleted.** For a typed caller, the name's row is the
  type's row in every program that has one. That is #7214's canonical row, so the rung decided
  nothing. A type-less caller (`ty` -1) keeps the spelling's row, which is what the old function
  answered there. No program reaches that case.
- **`structRowOfNameTy`'s arm test stays on the name.** A typed test disagrees in 5 programs
  (`tests/cases/maps/narrowed-map-place-object-value.vl`, `null-guarded-map-place-read.vl`,
  `unions/struct-holding-arm-with-record-map-value.vl`, `unions/struct-holding-self-recursive-arm.vl`
  and `D15151`'s witness). In each, an inline shape
  such as `{m: i32}` is spelled at a type that a declared arm also has. The spelling names no arm,
  and the value is stored as a struct. The type's answer would refuse it a struct row. This is the
  union-membership rule's edge, the declaration identity w321 found carries across a union store.
- **`structRowOfAnnTy`'s name fallback is a floor of 5.** All 5 are recursive records (`N` with a
  `next: N | null` field, `D5282`'s witness, `structs/recursive-record-eq*.vl`). The row is asked
  during its own record's mint, before the type has a row, and the spelling finds the in-flight row.
  It goes when a mint records its row against its type before it codes the fields.
- **The unreached rung** in `monoArgTyNameProjected` is left in place; deleting it needs a ruling.

## What changed

`structRowOfNameTy` no longer reads `structIndexByName` for a typed caller. Its answer there is
the type's row, unless the name is a registered arm. `structIndexByName` keeps 27 sites: the one in
`structRowOfNameTy` now serves only the type-less case.

## Proof

- Refresh ×2 is a fixpoint at 6,618,686 bytes (−7 on base).
- Local sweep, fixpoint seeds on both sides: 23,913 same, 0 movers. `regress.vl`, `lint-self`, `cases_wasm`, seed size, late demands, plumb-shape cost, ladder sets and the dead-export budget pass.
