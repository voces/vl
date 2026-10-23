# Render-parse residue, classified (2026-10-22)

The emitter's render-parse ratchet (`scripts/render-parse-budget-baseline.json`, refactor plan L6,
§2.4) holds **83 `ty-render`** entries (`tyToEmitName` calls) and **228 `ty-string-parse`**
entries (ten spelling parsers). That count was measured at `c1bcc6474`. L6 is done when the
ratchet reaches its floor, and the floor is not zero. A site whose spelling *is* the product stays.
This document sorts all 311 entries into what stays and what still moves. The rows are in
[`render-parse-residue-2026-10.jsonl`](render-parse-residue-2026-10.jsonl), one entry per line,
with the fields `code file line fn callee class group slice reason next text`. A row a slice has
worked carries a `status` field as well, saying what moved and why the rest stayed.

## Method

1. Run `vl run scripts/render-parse-census.vl` over `compiler/emit_*.vl` and `wasmEmit.vl`, with the
   same scope and the same eleven callees as the ratchet. The census reproduces the baseline
   exactly, file by file.
2. Read every entry in its enclosing function and put it in exactly one class:
   - **A: DECIDES.** The emitter decides a rep, kind or legality from a spelling while an arena
     type is already in hand, either as a parameter or as a banked column.
   - **B: KEY.** The spelling is the product: a registry key, a module name, a diagnostic, a
     synthesized TypeRef text, or a mangled name. This class is the floor.
   - **C: NO-TYPE.** No arena type reaches the site. The row names the upstream producer that
     would have to bank one.
   - **D: BLOCKED-ON-L6.** A legitimate A that cannot move until a registry is keyed by type. The
     row names that registry or seam.
3. Review the result adversarially, in a second pass over every B and every borderline D. The
   question each time is whether the key is parsed back, in the same function or by a caller, to
   decide something. If it is, the entry is A. Six entries moved in this pass.
4. Group the A, C and D entries by what one change would retire them. This gives the 18 slices
   below.

### Rules settled while classifying

- A render that the same function parses back is **A**, whatever the render is called. Examples
  are `recordedParamPinName` and `listUnionEmitName`.
- A diagnostic render is **B**.
- A synthesized TypeRef whose text is recorded beside its type, `synthTypeRefTy(text, -1, ty)`,
  is **B**. The readers that parse a TypeRef spelling are counted and classed at their own sites.
  An untyped `synthTypeRef(text, -1)` is A, because the type is dropped there.
- A pin spelling that feeds the mono instance key or the `monoAnnPinName` ladder is **D**. The
  seam is the mono instance being keyed by pin spelling.
- The `emit_base` mono walkers (`monoSubstAnn`, `monoBindOf` and their kin) are **C**. The
  producer is the checker's per-call bind rows (`callBindTyOf`) and L1's `monoBindCols`.
- `nameIsRefArray` with a type in hand is still **D**. The ref-list kind ladder answers through
  the struct and union tables by spelling, and its arena twin `tyElemIsRefListElem` admits more
  than it does (L6 log, 2026-10-20).
- `inferNulStructRow` and `inferNulVariantRow` are **D**, because `structIndexOfTy` disagrees with
  the spelling lookup on inline shapes (#4466).

## Totals

| class | renders | parses | entries |
| --- | --- | --- | --- |
| A: decides | 9 | 49 | 58 |
| B: key (floor) | 21 | 22 | 43 |
| C: no type | 1 | 67 | 68 |
| D: blocked on L6 | 52 | 90 | 142 |
| **total** | **83** | **228** | **311** |

**The proposed floor is 21 renders and 22 parses.** The work that remains is 62 renders and 206
parses.

### Per file

Each cell gives renders / parses.

| file | A | B | C | D | total |
| --- | --- | --- | --- | --- | --- |
| `emit_anon_fields.vl` | 0 / 0 | 1 / 0 | 0 / 0 | 1 / 0 | 2 / 0 |
| `emit_atom_kinds.vl` | 1 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 1 / 0 |
| `emit_base.vl` | 0 / 3 | 0 / 2 | 0 / 28 | 0 / 12 | 0 / 45 |
| `emit_classify.vl` | 0 / 1 | 0 / 0 | 0 / 0 | 8 / 14 | 8 / 15 |
| `emit_closure_sites.vl` | 0 / 0 | 4 / 0 | 0 / 0 | 1 / 0 | 5 / 0 |
| `emit_collect.vl` | 0 / 10 | 1 / 0 | 0 / 8 | 5 / 10 | 6 / 28 |
| `emit_field_codes.vl` | 0 / 0 | 0 / 0 | 1 / 1 | 0 / 0 | 1 / 1 |
| `emit_map_value_slots.vl` | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 2 | 0 / 2 |
| `emit_mono.vl` | 3 / 6 | 5 / 0 | 0 / 4 | 23 / 11 | 31 / 21 |
| `emit_mv_slots.vl` | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 1 | 0 / 1 |
| `emit_nullable_rets.vl` | 0 / 1 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 1 |
| `emit_obj_lit_fits.vl` | 0 / 0 | 0 / 0 | 0 / 0 | 1 / 1 | 1 / 1 |
| `emit_rep.vl` | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 1 | 0 / 1 |
| `emit_rewrite.vl` | 1 / 2 | 4 / 1 | 0 / 0 | 1 / 1 | 6 / 4 |
| `emit_sections.vl` | 0 / 0 | 0 / 0 | 0 / 0 | 1 / 0 | 1 / 0 |
| `emit_shape_intern.vl` | 1 / 1 | 0 / 2 | 0 / 15 | 0 / 1 | 1 / 19 |
| `emit_shape_rows.vl` | 0 / 14 | 1 / 17 | 0 / 8 | 0 / 25 | 1 / 64 |
| `emit_sig_tokens.vl` | 1 / 5 | 2 / 0 | 0 / 3 | 2 / 2 | 5 / 10 |
| `emit_start_block.vl` | 0 / 0 | 0 / 0 | 0 / 0 | 6 / 2 | 6 / 2 |
| `emit_ty_canon.vl` | 0 / 0 | 0 / 0 | 0 / 0 | 1 / 0 | 1 / 0 |
| `emit_union_atoms.vl` | 0 / 5 | 0 / 0 | 0 / 0 | 1 / 4 | 1 / 9 |
| `emit_union_registry.vl` | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 2 | 0 / 2 |
| `wasmEmit.vl` | 2 / 1 | 3 / 0 | 0 / 0 | 1 / 1 | 6 / 2 |
| **total** | 9 / 49 | 21 / 22 | 1 / 67 | 52 / 90 | 83 / 228 |

## The floor: class B

The 43 floor entries fall into five kinds:

- **The ref-list and mv-slot key producers** in `emit_shape_rows` and `emit_shape_intern`: 19
  parses and 1 render. Examples are `refArrElemNameGo`, `rlCanonLitUnionAtoms`,
  `shapeFieldElemName` and `rlSlotOfArrName`.
- **Synthesized TypeRef and pin texts recorded beside their type**: 10 renders. They are in
  `emit_mono` (5), `emit_rewrite` (4) and `emit_collect` (1).
- **Diagnostic renders**: 7. They are in `emit_closure_sites` (4) and `wasmEmit` (3).
- **Nominal or module spellings**: 3. They are `nominalizePartOfTy`, `nodeMapArmNominalName` and
  `anonMapValName`.
- **Others**: `nulLitUnionInnerName`, which cuts a key after its callers have already chosen the
  field code (2 parses), and `cboxElemNeedsParens`, a paren decision for a spelling being built
  (1 parse).

The floor is conditional. Once D1 and D2 key the ref-list and mv slots by type, the 18 key
producers stop being the key. They then become dead or move into the canon renderer, and the floor
falls toward the 20 diagnostic, TypeRef-text and nominal renders. Until those slices land, these
entries are the product.

## Remaining work: 18 slices

Each slice is one change and fits in one PR. In the "A / C / D" column, the counts are the entries
the slice retires.

| slice | name | entries | A / C / D | renders / parses | files |
| --- | --- | --- | --- | --- | --- |
| A1 | shape-row typed twins | 14 | 14 / 0 / 0 | 0 / 14 | `emit_shape_rows` (callers in `emit_classify`, `emit_collect`, `emit_nullable_rets`, `emit_sig_tokens`) |
| A2 | emit_mono typed tests | 9 | 9 / 0 / 0 | 3 / 6 | `emit_mono` |
| A3 | emit_collect / emit_classify typed rungs | 12 | 11 / 1 / 0 | 0 / 12 | `emit_classify`, `emit_collect` |
| A4 | nominal and signature-key twins | 9 | 9 / 0 / 0 | 2 / 7 | `emit_rewrite`, `emit_sig_tokens` |
| A5 | union-atom and atom-kind twins | 12 | 12 / 0 / 0 | 3 / 9 | `emit_atom_kinds`, `emit_base`, `emit_nullable_rets`, `emit_union_atoms`, `wasmEmit` |
| C1 | mono walkers bind by type (L1) | 17 | 0 / 17 / 0 | 0 / 17 | `emit_base` |
| C2 | instance cell signatures typed | 5 | 0 / 4 / 1 | 1 / 4 | `emit_mono` |
| C3 | shape-intern walkers take field types | 16 | 2 / 14 / 0 | 1 / 15 | `emit_shape_intern` |
| C4 | shape-text field callers thread a type | 9 | 0 / 9 / 0 | 1 / 8 | `emit_field_codes`, `emit_shape_rows` |
| C5 | name-only gates in emit_base and emit_collect | 17 | 0 / 17 / 0 | 0 / 17 | `emit_base`, `emit_collect` |
| D1 | ref-list slot keyed by type | 30 | 0 / 1 / 29 | 4 / 26 | `emit_base`, `emit_classify`, `emit_collect`, `emit_union_atoms` |
| D2 | ref-list kind ladder by type | 22 | 0 / 0 / 22 | 0 / 22 | `emit_collect`, `emit_shape_rows` |
| D3 | mono instance keyed by pin type | 23 | 0 / 0 / 23 | 15 / 8 | `emit_mono`, `emit_rewrite` |
| D4 | narrowed pins and pin unions | 11 | 0 / 0 / 11 | 8 / 3 | `emit_mono` |
| D5 | union registry by type (step 5 remainder) | 21 | 1 / 0 / 20 | 12 / 9 | `emit_anon_fields`, `emit_base`, `emit_classify`, `emit_closure_sites`, `emit_collect`, `emit_obj_lit_fits`, `emit_rep`, `emit_rewrite`, `emit_sections`, `emit_shape_intern`, `emit_start_block`, `emit_union_registry`, `wasmEmit` |
| D6 | struct and variant rows of inline shapes by type | 12 | 0 / 0 / 12 | 3 / 9 | `emit_classify`, `emit_collect`, `emit_shape_rows` |
| D7 | narrowing store banks a type | 11 | 0 / 1 / 10 | 4 / 7 | `emit_base`, `emit_classify`, `emit_shape_rows`, `emit_sig_tokens`, `emit_start_block`, `emit_ty_canon` |
| D8 | mv, closure-sig and field-companion slots by type | 18 | 0 / 4 / 14 | 5 / 13 | `emit_classify`, `emit_collect`, `emit_map_value_slots`, `emit_mv_slots`, `emit_obj_lit_fits`, `emit_shape_intern`, `emit_sig_tokens`, `emit_union_atoms`, `wasmEmit` |

Some slices have entries from more than one class. In those slices, the minority entries go to the
slice that retires them in the same change. For example, A3's one C entry is a rung of the same
`collectATypeRef` ladder.

What each slice changes:

- **A1.** The callers ask the typed twin they already have the input for:
  - `mvValKindOfNameTy` and `mapValKindLowerable` become `mapTyValKindLowerable`;
  - `genTyParamArr` and `genTyParamNulArr` read the type parameter off the arena;
  - `nulScalarListKind` takes the element type;
  - `rlElemNicheNullable` reads the `rlElemNullable` column.

  Outcome: no parse retired. Three callers moved to their typed twin, and the moves closed D2723.
  Their sites stay for callers that hold no type. The five `genTyParamArr`/`genTyParamNulArr`
  rows are class C, because a generic alias parameter is not a `TyVar` in the arena. The
  `rlElemNicheNullable` twin regressed D4721, so that row stays. Each row's `status` has the
  probe counts.
- **A2.** These `emit_mono` predicates test the type they hold instead of rendering it:
  `monoNicheNulListCheck`, `monoModuleLetTyIs`, `monoModuleDupPin`, `monoRetOfClosureCall`,
  `monoPreBindPastUnionRest` and `monoCloPinListAnn`.
- **A3.** Each typed rung of the `emit_collect` field-hint ladders and the `collectATypeRef` ladder
  reads the arena, and the `emit_classify` rung reads the rl-slot columns. Hazard: the
  `collectATypeRef` chain is order-dependent, so its rungs move together.
- **A4.** `resolveShapeToNominal` on a rendered type becomes `shapeNominalOfTy`. The
  signature-key sites that still render read `sigKeyOfTy`, which needs widening to cover them.
- **A5.** Atom-kind, closure-result-forcing, union-ref-arm and coalesce tests read the union row's
  member columns, or `valueAtomKindOfTy`, instead of `splitUnionAtoms`.
- **C1.** The checker banks per-call bind types; `monoBindCols` is L1's producer. Then
  `monoSubstAnn`, `monoBindOf` and their kin bind by type.
- **C2.** `monoSlotSig` and `monoSigFnTyName` carry the instance cell's function type, not only
  its spelling.
- **C3.** The `emit_shape_intern` walkers take the field type alongside the field text.
- **C4.** The callers of the shape-text field recorders pass the field type that the struct row
  already holds.
- **C5.** These name-only gates get a typed caller, or are proved dead and removed:
  - the `nameIsNul*` niche ladders and `annSpelledArray`;
  - the generic-alias test and `inferRetIsLitUnionAt`;
  - the remaining name-grammar tests.
- **D1.** `rlSlotByName`, `rlSlotOfArrName` and the `refListElemNameOf*` family key the ref-list
  slot by element type. This turns most of the B key producers into dead code.
- **D2.** `nameIsRefArray`, `refArrShapeKind` and the `rasRef`/`rasKind` memo answer by type.
  First the arena twin `tyElemIsRefListElem` has to agree with the spelling ladder; today it
  admits more.
- **D3.** The mono instance key and the `monoAnnPinName` ladder take the pin's type. Most of the
  slice is this one seam, and it carries 15 of the 52 D renders.
- **D4.** `monoRegisterPinUnion` and `canonUnionKeyOfName` register a narrowed pin's union by its
  type.
- **D5.** This is the L6 step-5 remainder. The union registry is asked by type at the 13 files
  that still pass a spelling.
- **D6.** `structIndexOfTypeName`, `shapeRowScanK`, `inferNulStructRow`, `inferNulVariantRow` and
  `structIndexOfLet` answer by type. The blocker is `structIndexOfTy` disagreeing with the spelling
  lookup on inline shapes (#4466).
- **D7.** `narrowVariants` banks a type for multi-member sets, where `narrowSlotTy` is `-1` today.
- **D8.** The mv-slot, closure-signature and field-companion tables are keyed by type. The
  `emit_classify` arm mint withholds its type on purpose (D34), so that entry moves only together
  with the ruling that requires it.

**Order.** The five A slices and C4 can start today. C1 waits on L1's bind columns. D1 and D2
come before C3, because C3's walkers feed the ref-list slots. D3 and D4 share the pin seam.

## Verification

Before classification, a reader read every one of the 311 entries in its function. On top of that
first read, I re-read samples of each class against the source:

| class | verified samples | of which reclassified |
| --- | --- | --- |
| A | 6 | 2 moved in from B (`listUnionEmitName`, `recordedParamPinName`) |
| B | 11 | 5 moved in from D (the `synthTypeRefTy(text, -1, ty)` renders in `emit_mono`) |
| C | 5 | 0 |
| D | 8 | 4 moved in, 3 from A (`emit_collect` 1377 / 7241 / 7383) and 1 from B (`unionParamPinName`) |

## Open questions

These were not settled by reading the code. Each needs a probe before its slice relies on it.

- **`refArrElemNameGo` is B, but its key is parsed back.** An uncounted
  `strContains(.., "=>")` in `emit_fns_scans` re-parses the key. That is an A outside the census's
  callee set, and the ratchet cannot see it.
- **`indexElemNulRefArrayName` (A)** needs an A/B probe against the `rlElemKindTbl` and
  `rlElemNullable` columns before it switches.
- **`monoNicheNulListCheck` (A)** assumes the typed binding reaches it. A control has to show
  that.
- **`unionHasCollapsedStringMapArm` (A)** is dead according to its own comment. Whether it is dead
  has not been measured; if it is, the slice deletes it rather than retyping it.
- **`pushIndexMapComplement` (D)** may be an A that an A/B can move without the registry.
- **The census is blind to other parsers.** It counts eleven callees. A spelling parsed by any
  other helper, such as `strContains`, `mapSpellKeyName` or `strIndexOf` on a rendered type, is
  invisible to it. Reaching the floor means these eleven callees are retired, not that the emitter
  is spelling-free.
