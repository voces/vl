# Step 7: variant rows choose their fields by the arm's type; the spelling is a position label, 2026-11-13

This is lane E's work, on the coordinator's ruling. D16030 is filed and closed here.

## The canonical-key test, and the grade

Lane A's instrument ran over the sweep's 24,140 programs. Type equality is `tySame` with
`tyEq`; every pair of minted variant rows was checked, with one drain message per program and
the control live. The arm's spelling (`uVariants[i]`) fails as a key in both directions:

| check | programs or pairs | what they are |
| --- | --- | --- |
| one type, two spellings | 358 pairs | aliases of one structural type (`Dot` / `Circle` = `{r: i64}`) |
| one spelling, two types | 2 programs | numeric-tag twins softened to `{k:i32,n:i32}` (D14540) |
| a declared-name lookup at another type | 0 | |

Both failures are by design. A variant's identity is its position in its union (D14552), so
the spelling is a per-union position label, not a lookup key. Nothing reads the table by name
since #7737. **The table grades as floor.** The one decision the spelling made that the type
contradicts was which arms are struct variants and where their fields come from. It disagreed
on the 5 intersection programs of D16030.

## Changed

- `mintVariantRows` mints a variant row for an arm whose type is a record (`TyObj`), not for
  one whose spelling is a struct name or `{…}`. `isStructAtom` and `isDeclaredStructName` are
  deleted.
- `collectVariantFields(stmts, ty)` decides by type. A declared struct records its
  `TypeDecl`'s fields, found by `structNameOfTy(ty)`. Any other record (inline, or an
  intersection) records its type's fields: `collectShapeVariantFields(ty)` reads
  `objFieldNames` / `objFieldTypes` in canonical order and no longer splits the spelling.
- `unRowVariantsSame`, the variant half of the union key's licence (D1492), compares two rows'
  slices by each position's type (`tySame` on `uVarTyIx`) instead of their spellings. A full
  `tests/cases` scan with the compare forced false found no program where two rows share a
  type key, so the compare is never reached today; `vl_union_key_licence_test` stays green.

## A render traded for a parse, graded failing

The variant field identity column (`armFieldTyText`, written through `variantFieldIdText`) still
holds text. For a record arm it is now `tyToNominalName(fldTy)` instead of the spelled field
text. A probe of the nominal render against the spelled text differed in 10 programs (8 of them
a union alias spelled out structurally), and the sweep shows no output change. The emitter
render (`tyToEmitName`) differed in 43, so it was not used.

The render is **failing**: its readers parse or compare the text. It goes when they read the
field's type:

| reader | what it does with the text | owner |
| --- | --- | --- |
| `valueAtomKind(sFieldTyText[...])` (emit_obj_lit_fits) | parses it | G (P2) |
| `emit_variant_sig` / `emit_obj_lit_fits` `== "string"` | compares it to a spelling | E |
| positional `==` (emit_collect twin test, emit_map_twins, emit_shape_rows, wasmEmit) | compares two rows' texts | E |

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, step 1 against steps 1 and 2: 24,215 programs,
  24,210 same, 5 bytes-only movers (exactly D16030's grading list), 0 output movers,
  0 `runs → not-runs`, 0 new compiler traps.
- `scripts/rep-fuzz-check.sh`: exact, 0 failures.
- Render-parse budget, emit_collect only: `ty-string-parse` 6 → 5, `ty-render` 12 → 13 (the
  failing render above, accepted by the coordinator).
- `scripts/gate.sh`: all rows pass.
