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
- `structIndexOfLet`'s nullable rung is **D**, because every typed struct lookup disagrees with
  the spelling on inline shapes; `structRowOfTy` comes closest (D6).

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
| A1 | shape-row typed twins (landed: 0 retired, 14 left; re-probed at 2401febe6: callers with no type, typed rungs that differ, and the class C alias parameter; mv slots typed: 5 files still reach with no type, func and lit-union rungs listed as the next rep change) | 14 | 14 / 0 / 0 | 0 / 14 | `emit_shape_rows` (callers in `emit_classify`, `emit_collect`, `emit_nullable_rets`, `emit_sig_tokens`) |
| A2 | emit_mono typed tests (landed: 3 retired, 1 to B, 5 left) | 5 | 2 / 3 / 0 | 0 / 5 | `emit_mono` |
| A3 | emit_collect / emit_classify typed rungs (landed: 7 retired, 5 left) | 12 | 11 / 1 / 0 | 0 / 12 | `emit_classify`, `emit_collect` |
| A4 | nominal and signature-key twins (done: 7 retired, 2 to B, 0 left) | 9 | 9 / 0 / 0 | 2 / 7 | `emit_rewrite`, `emit_sig_tokens` |
| A5 | union-atom and atom-kind twins (landed: 4 retired, 3 deferred to after C1, 5 left) | 12 | 12 / 0 / 0 | 3 / 9 | `emit_atom_kinds`, `emit_base`, `emit_nullable_rets`, `emit_union_atoms`, `wasmEmit` |
| C1 | mono walkers bind by type (L1) (landed: 5 retired, then 4 at site A, 13 left; composite renderer measured, different-type rows ablated, no site swaps; step 3: sites A, B, C and D bind by type, `monoBindFromAnn` deleted) | 13 | 0 / 13 / 0 | 0 / 13 | `emit_base` |
| C2 | instance cell signatures typed (attempted; waits on C1) | 5 | 0 / 4 / 1 | 1 / 4 | `emit_mono` |
| C3 | shape-intern walkers take field types (landed: 9 retired, 7 left, probed: keys and no-type producers) | 16 | 2 / 14 / 0 | 1 / 15 | `emit_shape_intern` |
| C4 | shape-text field callers thread a type (landed: 6 retired, 3 left; re-probed at 7dfbcfa6d: the no-type reaches come from resolver callers that hold only a name) | 9 | 0 / 9 / 0 | 1 / 8 | `emit_field_codes`, `emit_shape_rows` |
| C5 | name-only gates in emit_base and emit_collect (landed: 6 retired, 11 left; probed: the niche ladders wait on the grammar entries' D2, D8 and emit_mono callers; typed: the string-list callers that hold a type) | 17 | 0 / 17 / 0 | 0 / 17 | `emit_base`, `emit_collect` |
| D1 | ref-list slot keyed by type (landed: 11 retired, 19 left) | 30 | 0 / 1 / 29 | 4 / 26 | `emit_base`, `emit_classify`, `emit_collect`, `emit_union_atoms` |
| D2 | ref-list kind ladder by type (landed: 7 retired, 15 left; the rest waits on D1 and D8) | 22 | 0 / 0 / 22 | 0 / 22 | `emit_collect`, `emit_shape_rows` |
| D3 | mono instance keyed by pin type (landed: key by type, hole-function, written-let and coerce-caller pins typed, site B carries `tvT`, and every site-B producer reads its argument's type, a nullable field receiver finds its record by type; 5 retired, 18 left as the instance TypeRef text and spelled key) | 23 | 0 / 0 / 23 | 15 / 8 | `emit_mono`, `emit_rewrite` |
| D4 | narrowed pins and pin unions (probed: blocked on D3 and D5) | 11 | 0 / 0 / 11 | 8 / 3 | `emit_mono` |
| D5 | union registry by type (step 5 remainder) (landed: 13 retired, 8 left) | 21 | 1 / 0 / 20 | 12 / 9 | `emit_anon_fields`, `emit_base`, `emit_classify`, `emit_closure_sites`, `emit_collect`, `emit_obj_lit_fits`, `emit_rep`, `emit_rewrite`, `emit_sections`, `emit_shape_intern`, `emit_start_block`, `emit_union_registry`, `wasmEmit` |
| D6 | struct and variant rows of inline shapes by type (landed: 2 retired, 10 left) | 10 | 0 / 0 / 10 | 3 / 7 | `emit_classify`, `emit_collect`, `emit_shape_rows` |
| D7 | narrowing store banks a type (landed: 6 retired, 1 to B and since deleted, 4 left) | 11 | 0 / 1 / 10 | 4 / 7 | `emit_base`, `emit_classify`, `emit_shape_rows`, `emit_sig_tokens`, `emit_start_block`, `emit_ty_canon` |
| D8 | mv, closure-sig and field-companion slots by type (landed: 5 retired, 13 left; every mv slot banks a type, the mint classifies by it, 0 retired) | 18 | 0 / 4 / 14 | 5 / 13 | `emit_classify`, `emit_collect`, `emit_map_value_slots`, `emit_mv_slots`, `emit_obj_lit_fits`, `emit_shape_intern`, `emit_sig_tokens`, `emit_union_atoms`, `wasmEmit` |

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

  Re-probed at 2401febe6, still no parse retired. Every site is still reached by a caller with no
  type: `mvValKindOfNameTy` in 7 files, `nulRefMapValInnerOfTy` in 3, `mapValKindLowerable` in 1,
  and `nulScalarListKind` through `forceAnnLeafReps`. Where the callers are typed, two of the
  `mvValKindOfNameTy` rungs do not agree with the arena. Its func rung differs in 31 files, on
  hole and generic fn values stored in maps, and its lit-union rung differs in 1. Moving those
  rungs changes the rep, so it is not a refactor. The next step is the producers: the mv slot
  and the generic-application arguments need to bank a type.

  The mv slot side is now done (D8's step 5): every mv slot banks a type, every slot reader is
  typed, and the mint classifies by the slot's type when its caller has none. Still no parse
  retired. `mvValKindOfNameTy` and `nulRefMapValInnerOfTy` are reached with no type in 4 files
  through `mvValNamesCompat`'s shape-text query, and `mapValKindLowerable` in 1 under the D34 arm
  mint. The function and literal-union rungs are listed in the ledger's `next` as the deliberate
  rep change, with the rep each one moves.

  Re-probed at 7dfbcfa6d with C4, still no parse retired. `mvValNamesCompat`'s value name is
  cut from shape text inside `structIndexOfTypeName` and `variantIndexOfTypeName`. The callers
  that reach it hold only a name: `nameIsRefArrayGo` and `refArrElemNameGo` in 2 files each,
  and `isSName`, `anonHandleTyIx`, `anonRowKindsAgree`, `shapeElemDeclaredStructIdx` and
  `monoSpelledShapeStaysAnon` in 1 each. The one that holds a type, `mintUnionFieldObjRow` (1
  file), gets a different row from `structIndexOfTypeNameTy` in 12 of 128 files. So threading
  types through C4's field-code walkers does not reach these rows. The callers above have to
  carry the shape's type first.
- **A2.** These `emit_mono` predicates test the type they hold instead of rendering it.
  - Done, byte-identical: `monoModuleLetTyIs` and `monoModuleDupPin` compare the site's type
    with `tySameSpelled`, and `monoPreBindPastUnionRest` asks the parameter's type whether it
    is a union. That retires 2 renders and 1 parse. `monoCloPinListAnn` now records its text
    beside `mkArrayTy(ety)`, so its render moves to B.
  - Left: `monoNicheNulListCheck`'s two annotation parses stay A. The arena keeps a type
    parameter that shadows an alias where the canon spelling has erased it, so the typed test
    refuses a fixture that runs. Its two bound-pin tests and `monoRetOfClosureCall` are C. The
    pin there is text, or `-1` for an un-annotated hole parameter, until C1 binds by type.
- **A3.** Each typed rung of the `emit_collect` field-hint ladders and the `collectATypeRef` ladder
  reads the arena, and the `emit_classify` rung reads the rl-slot columns. Hazard: the
  `collectATypeRef` chain is order-dependent, so its rungs move together.
  - Done, byte-identical: `indexElemNulRefArrayName` reads the slot's kind and nullable
    columns. The arm-pin map walk is `mapLeafValTy` over the annotation's arena type, so
    `mapLeafValName` and `armPinAnnName`'s cut are gone; `alcCommitName` now returns the
    annotation node, so `alcNamesArm` asks the same walk. The `??` field atom reads the
    operand's `TyObj` field type, which retires `anonLeafAnnAtomOf`, `anonLeafAtomAdmits`
    and `anonLeafAtomOfText`. That is 7 parses.
  - Left: `fieldElemHintOf` and `collectARefArrayAnn`'s nullable reject disagree with the
    arena on a probe (one-literal and spaced spellings, and `A | B | null` as a nullable
    union), and the reject's message names the inner spelling. `dstPinMapValue`'s gate is
    typed, but its cut is the pin name it pushes. `internArmShapeAt` needs a declared-vs-inline
    answer the arena does not give, since both are a `TyObj`. Each row's `status` has the
    probe counts.
- **A4.** Done: all 9 entries are closed, 7 parses retired and 2 renders moved to B.
  - `cboxElemName` tests `TyArray`, and `recordedParamPinName`'s nullable arm resolves under
    the null on the arena, which moves its render to B (2 parses). The arena names two
    witnesses' `{r:i32}|null` pin `Circle|null` where the name path did not, with the emitted
    wasm byte-identical over every `tests/**/*.vl` and the distilled corpus.
  - C5 retired `cloNameSigKeyTy`'s nullable-closure cut and its arrow test (2 parses).
  - `resolveShapeToNominal` is deleted (1 parse). Its two `emit_rewrite` callers ask
    `shapeNominalOr(ctxTy, ctx)`, which keeps the render unless `declNominalOfTy` (the
    arena's `shapeNominalOfTy`, less a literal's `#anon` row) names a declaration.
    `listUnionEmitName` asks `declNominalOfTy` of each member and renders only a member it does
    not name, so that render is the product and moves to B. A probe of old against new over
    16,634 files found 3 where the arena names a declared `P[]` / `Circle[]` that the name path
    left as `{x:i32}[]` / `{r:i32}[]`; the emitted wasm is byte-identical over 16,523 files.
  - `unionArmSigKeyTy` and `cloNameSigKeyTy` drop their `annArrowAt` guard (2 parses). Each
    guarded a call to `annSigKeyTy`, whose `annFnDecompose` already answers `""` with no
    top-level arrow, so the guard repeated the parse. The name fallback that remains is
    `annFnDecompose`'s own entry (C1). Its callers in `emit_collect`, `emit_classify` and
    `emit_lit_atoms` still pass no type there.
- **A5.** Atom-kind, closure-result-forcing, union-ref-arm and coalesce tests read the union row's
  member columns, or `valueAtomKindOfTy`, instead of `splitUnionAtoms`. Landed for 1 render and
  3 parses. The coalesce element kind asks `valueAtomKindOfTy` of the operand's non-null type.
  The two ref-array arm tests ask the element union row's `unionMemberTysOf` members.
  `unionHasCollapsedStringMapArm` is deleted with its caller block, which an armed probe reached
  in 0 files. A probe over every `tests/**/*.vl` and the distilled corpus found 0 differing
  files for each retired site. The three `emit_base` entries wait until C1 lands. Five stay:
  - `valueAtomKindOfTy`'s fallback answers declined shapes, and some of those no file reaches.
  - `mapAnnShape`'s value spelling also keys the D8 mv-slot lookups.
  - The two closure-result walkers intern by spelling (`mvShapeOfMapName`, `ensureRefElem`),
    and a closure position inside one TypeRef has no node, so a typed walk would need a render
    to rebuild the key. They wait on D8's mv slot and D1's ref-list slot keyed by type.
  - `monoStaticIsResult`'s typed compare answers differently in 2 files.
- **C1.** The checker banks per-call bind types; `monoBindCols` is L1's producer. Then
  `monoSubstAnn`, `monoBindOf` and their kin bind by type. Landed for the 5 parses of the two
  pre-bind predicates. `monoAnnIsOpenUnion` and `monoUnionLeavesOpenFree` are gone, and
  `monoPreBindPastUnionRest` asks `monoDeclIsOpenUnion` and `monoDeclLeavesOpenFree` of the
  generic's declared parameter type and the argument's exact pin type. A probe agreed on 391 of
  391 and 392 of 393 events. The one disagreement already had its type argument bound
  explicitly. difftree `--identity` found 0 of 16,437 files differ.

  The other 12 entries are in `annFnDecompose`, `monoTyParamOf`, `monoAnnHasTyParam`,
  `monoSubstAnn` and `monoBindFromAnn`. These walkers PRODUCE spellings: the `tvV` binding,
  and the substituted annotation that becomes the instance's TypeRef text and key. The typed
  answer exists beside each one. The probe compared it at each site over `tests/**` and the
  distilled corpus, rendering it with `tyToEmitName`; a spelling that did not match was
  re-tried with the renderers listed below.

  | site | agree | agree only by another renderer | disagree | type `-1` | type has a TyVar |
  | --- | --- | --- | --- | --- | --- |
  | `tvV` vs `monoBindCols` (`letBT`) | 7,305 | 1,239 | 13 | 96 | 13 |
  | `tvV` vs argument-only `monoBindCols` | 6,880 | 1,116 | 120 | 520 | 30 |
  | `tvV` vs `callBindTyOf` | 7,112 | 1,291 | 222 | 1,280 | 122 |
  | param pin vs `monoSubstInst` of its annotation | 7,356 | 1,497 | 167 | 0 | 517 |
  | return `rs` vs `monoSubstInst` (`sub2`) | 1,788 | 389 | 100 | 0 | 5 |
  | let annotation vs `monoSubstInst` (`s2`) | 685 | 178 | 22 | 0 | 4 |

  The other renderers are `tyToNominalName`, `arenaEmitName`, the `=>` signature key and the
  `#anon` row handle. The binding is there: `letBT` misses 13 of 8,666. No single renderer
  reproduces the spelling, though. A walker spells a declared record by its name or by its
  structure, depending on what the source wrote. So none of the 12 can leave while its product
  stays a spelling.

  The rest of the plan:
  1. Mint the instance from `letBN`/`letBT`, with `monoSubstInst` for the parameter, return and
     let types.
  2. Key the instance by type (D3).
  3. Render a spelling only for the TypeRef text, once per instance.

  Step 2 changes instance identity, so it is an `--allow-diff` change. After step 1,
  `monoSubstAnn`'s 18 call sites and `monoBindFromAnn`'s 4 in `emit_mono` move off the spelling, and the
  walkers' 12 entries leave with them.

  **Step 1 cannot be byte-identical, and the typed column is not yet right.** A second probe
  (2026-10-22, master `ba14205a8`, the same population) rendered each typed product three ways:
  `tyToEmitName`, `tyToNominalName` and `arenaEmitName`.

  | site | all three match | only nominal or arena matches | spelling is a handle | same type, other spelling | different type |
  | --- | --- | --- | --- | --- | --- |
  | `tvV` vs `letBT` | 7,859 | 1,151 | 277 | 7 | 3 (+ 93 `letBT` misses) |
  | param pin vs `monoSubstInst` | 8,591 | 1,563 | 2,084 | 67 | 19 |
  | return `rs` vs `sub2` | 2,481 | 374 | 59 | 88 | 12 |
  | let annotation vs `s2` | 680 | 165 | 80 | 8 | 17 |

  A handle is a `=>` signature key, an `#anonN` row, a `#luN` literal union or an `X$m<hash>`
  name. Same type, other spelling covers union member order, kept grouping parentheses, an
  alias inside a union and literal members. Those are spelling-only: the typed form is the
  normal one, so the instance's TypeRef text and key would change. Step 1 needs a composite
  renderer (signature key, then row handle, then `tyToNominalName`), and it is still an
  `--allow-diff` change.

  Ablation found typed-side defects among the different-type rows, so step 1 cannot just swap
  the column in:
  - D10520: an inline record argument's map binding is stale across calls.
  - D10521: a generic body's inferred `T[] | i32[]` loses its `i32[]` arm.
  - `monoSubstInst` keeps a duplicate member. `f<i32 | string>` at `T | string` gives
    `i32|string|string`, and `type-param-list-join-storage-apart.vl` gives `i32|i32|null`.
  - The arena collapses same-shape records (`Rec`/`Rec2`). This is the structural-records
    ruling, but the spelling keeps them apart.
  - An inferred `f(s)` at `T | string` leaves `T` unbound in `letBT`.

  The probe also found a live clause-1 defect that is unrelated to C1, D10522. Revised order:
  first fix the typed column (D10520, D10521, the duplicate member and the `letBT` misses), then
  build the composite renderer, then do step 1 graded on behaviour.

  **The typed-column fixes.** The emitted output is unchanged. difftree `--identity` found 1 of
  16,437 files with a different module, `value-join-at-the-pin.vl`, and that file prints the same
  output. There `h("x", null)` now binds `U` to `null` in `letBT`, so `u ?? t` is a nullable
  local. A third probe ran over the same population with the same probe in both columns:

  | class | before | after |
  | --- | --- | --- |
  | `tvV` vs `letBT`, different type | 7 | 6 |
  | param pin vs `monoSubstInst`, different type | 7 | 6 |
  | return vs `sub2`, different type | 4 | 3 |
  | `letBT` misses | 93 | 54 |
  | param type still holds a TyVar | 70 | 30 |
  | return type still holds a TyVar | 5 | 2 |
  | param type with a duplicate member | 7 | 0 |
  | return type with a duplicate member | 5 | 2 |
  | let type with a duplicate member | 18 | 12 |

  - D10520 is fixed: `monoMakeInstanceParams` keeps the argument's record type when its layout's
    first row renders differently. Its three rows fell to 0.
  - The duplicate member is fixed. When a type parameter is bound to a union that shares a member
    with the rest of the union, `substUnionRebuild` splices the bound union's members in. It also
    drops a second copy of the same map. A bound union that shares nothing stays one member,
    because splicing `T | "err"` at `T := "a" | "b"` built invalid wasm.
  - The `letBT` misses fell from 93 to 54. `monoBindCols` now binds three things as the
    spelling does: a union parameter's one bare type parameter, a function result's union, and
    `T | null` at `null`.
  - D10540 is fixed, and the `letBT` misses fell from 54 to 43. `monoBindCols` had left 11
    bindings unbound: each one held a Set or a boolean map, and binding one made `is` test the
    box tag the two share. `is` now reads the clone's recorded type. The typed column takes the
    true row where a pin spelling softened a Set to its map. The guard is gone.
  - D10521 is not a typed-column defect. The typed `f64[]` is the checker's type for the call,
    and the spelling is the instance's rep union. Step 1 takes a let's rep from the apart-join
    knowledge, not from `substTyDeep`.
  - The duplicates that remain are kept apart on purpose: D3357's nesting (`i32|i32|null`) and
    D3504's `Rec[]`/`Rec2[]`. The spelling holds them too.
  - The other 43 misses are other families: nested-generic shadowing, `flat-generic-rows`, a phantom
    type parameter, a newtype brand, function-typed bindings, and a literal-union alias arm.
  - The other disagreements were there before: the `monoUnionRestPin` argument, exact-key nested
    set maps, `void`, an `i64|i32` element row, and a `mapIndexed` literal union.

  **The composite renderer, measured (2026-10-23, master `98345931c`).** The renderer gives a
  function type its `=>` signature key, an anonymous record its `#anonN` row handle, and any
  other type `tyToNominalName`. A fourth probe compared it with each walker spelling over
  16,508 files: `tests/cases`, with one `entry.vl` per module directory, plus the distilled
  `cells/` and `named/`. 4,076 of those files mint an instance.

  | site | composite exact | another renderer exact | handle or grouping | member order | literal arm | different type | type `-1` or holds a TyVar |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | `tvV` vs `letBT` | 8,549 | 50 | 9 | 0 | 3 | 3 | 44 + 14 |
  | param pin vs `monoSubstInst` | 8,972 | 489 | 36 | 4 | 3 | 30 | 0 + 17 |
  | return `rs` vs `sub2` | 2,124 | 42 | 11 | 23 | 53 | 12 | 0 + 2 |
  | let annotation vs `s2` | 817 | 43 | 10 | 2 | 2 | 8 | 0 + 4 |

  The other renderers are `tyToEmitName`, `tyToNominalName` and `arenaEmitName`. "Handle or
  grouping" also counts the 9 rows where the typed side renders as an empty string.

  **No call site can swap to the renderer.** The renderer matches 93.7% of `rs` and 98.6% of
  `tvV`. The misses are a property of the SOURCE, not of the type:
  - A function type is spelled as a `=>` key when a hole binding carried it, and
    structurally (`(i32)=>i32`) when the source wrote it. Both spellings occur at the same
    site, so no fixed choice per site matches. This is most of the 489 param rows that
    another renderer matches.
  - An anonymous record is spelled the same way, `#anon2` or `{x:i32,y:i32}`, depending on
    where it came from.
  - The arena orders a union's members canonically, with `null` last. The spelling keeps the
    source's order (`K|null|i32`). Box tags are positional, so this is not cosmetic.
  - The arena folds a subsumed literal arm (`string|"err"` becomes `string`). The spelling keeps
    it, and `monoPinUnionName` softens it later.

  The 53 rows of different type are the clause-1 risk. Which side is right has not been
  established by ablation for any of them. Most of them are the first family below:
  - The typed side loses a nominal name to a structural row. Examples are `Dot[]` and
    `Circle[]` at `{r:i32}[]`, the `flat-generic-rows` `Rows<Node>` family, the
    `generic-returned-record-param.vl` records, and D3504's `Rec[]`/`Rec2[]`.
  - The literal-delivery join: `union-member-widened-delivery.vl` pins `string|i32` where the
    typed side has `i64|string`.
  - The bindings of `pin-inferred-from-union-argument.vl` (`i32|null` against `boolean|string`)
    and `nullable-litunion-arm-of-box-prints.vl` (`string` against `i32|AB|null`).
  - `type-param-shadows-alias-funcdecl-constructors.vl`: `Inner<string>` against `{w:i32}`.
  - D10521's apart join at a let (`f64[]|i32[]` against `f64[]`).

  The probe was a scratch build, and nothing in the compiler changed.

  **The revised plan.** Step 1 moves the CONSUMERS of the spelling, not its producers. Each
  consumer of a substituted spelling (the instance's TypeRef text, its key, `rsC`) takes the
  typed product, and the composite renderer spells it only where text has to stay. The
  walkers' 12 entries leave once no consumer reads them.

  Before step 1, ablation has to settle the 53 different-type rows, one family at a time. A
  family whose typed side is wrong is a typed-column fix. A family whose spelling is wrong is a
  filed row. The member-order and literal-arm rows need the consumer to key on the type, which
  is D3's instance key.

  **The 53 rows, ablated (2026-10-23, master `ad71da511`).** A fifth probe was a scratch build
  over 16,619 files. It changed the comparison in two ways:
  - It resolves the spelling and compares types (`tySameSet`, `tyEqSoftLits`), so a spelling
    that names the same type is no longer a different-type row.
  - It compares a parameter pin with `monoSubstInst` of the DECLARED signature
    (`monoDeclParamTys`), not with the annotation node's type.

  Its control file tripped every site. 32 events in 16 files still differ in type. No family
  showed a program misbehaving, so no defect row was filed.

  | family | files / events | which side is right | verdict |
  | --- | --- | --- | --- |
  | instance parameter holds the argument's type: `b._u`, `first._u`, `k<i32>("b")`'s `p`, `recv.v`, and `mid.a1:F` where `F` is bound from another parameter | 7 / 13 | the spelling, by design (D2734, D2974, D6092) | the typed product that agrees is `pinTys`/`pinnedTyIx`, not the substituted declaration |
  | `pin-exact-key-union-box-is.vl`: a `Set<i32>` argument spelled as its boolean map | 1 / 1 | the type; the spelling is lossy but has the same rep | D2720's exact key compensates; a type key retires that |
  | nested-record argument whose `#anon3` row reads `{inner: _}` | 1 / 2 | the type | the row is degraded in `anonHandleTyIx`; left to the shape-row lane |
  | `never` result spelled `void` | 2 / 3 | both: `void` is the rep (D1972) | a typed consumer maps `never` to the `void` rep |
  | flow-pinned instance whose `F` binds to the `()=>_` placeholder | 2 / 6 | the spelling; the typed side is degraded | left; see below |
  | apart join at a let, `T[] \| i32[]` | 3 / 7 | D10521, already ruled | the let's rep comes from the apart-join knowledge |

  The other #4545 rows are the same type under resolution. That covers the nominal-against-
  structural families (`Dot[]`, `Rows<Node>`, `Rec`/`Rec2` under the structural-records ruling),
  alias names, member order, subsumed literal arms and `K` against `"x"|"y"`. The probe counted
  them in five sites:

  | site | files | events |
  | --- | --- | --- |
  | return | 73 | 105 |
  | parameter | 50 | 107 |
  | `tvV` | 31 | 58 |
  | let | 10 | 18 |
  | annotation | 2 | 3 |

  Member order and literal arms change box tags, so they wait on D3.

  `type-param-shadows-alias-funcdecl-constructors.vl` disagreed only against the node type.
  Inside `appI<Id>` beside `type Id = i32`, the annotation node resolves `Id` as the alias. The
  first instance's keep-node arm in `monoMakeInstanceParams` also records its own type on the
  template's node. Against the declared signature the row agrees.

  What step 1 takes from this:
  - **A parameter's typed product is `pinnedTyIx`** (the argument's type), not
    `monoSubstInst` of the declaration.
  - **A consumer that substitutes a declaration reads `monoDeclParamTys`**, never
    `nodeTyIxOf(p.parType)`.
  - **The flow table's typed pins come next.** `monoNoteBindDeliveryCall` and
    `monoRenameInitAt` call `monoInstanceFor` with `monoSigPins(sig)` and `expTy` `-1`, so
    `pinTys` is `-1` and `recordClonedNodeTyFb` binds `F` to the placeholder. Each one has to
    hand `monoInstanceFor` the pin types the flow table already resolves
    (`fnFlowDeclPathPinTysOf`, `monoPinFnParamTys`). That is a new parameter on all eight
    callers, and no program misbehaves today.

  **The flow table's typed pins, landed (2026-10-23).** The two callers named above were not
  where the placeholder came from. A probe recorded, at every instance minted for a `=>` pin,
  whether its parameter type was a closed function type. It showed that the placeholder came
  from `monoCoerceFnValueName`, which flow-table sites call with `expTy` `-1`:
  `monoPinListElems`, `monoPinNestedListElems`, `monoPinRecordField` and `monoStoredSlotFnTy`.
  - Each of those sites now passes `monoPinFnParamTys` of its slot through
    `monoCoerceFnValueTys`, `monoCoerceWrittenLetTys` and `monoCoerceNamedGenericTys`.
  - `monoInstanceFor` takes those types (`deliveryTys`) when neither the value nor `expTy`
    gives a parameter type. The other seven callers pass `[]`.
  - A sig pin's key now carries the type's canon (`=>ii>i=(i32, i32) => i32`).
  - `monoReachSlotTy` had read a pinned slot as already typed and returned without typing the
    callees it reaches. A callee the checker left open now takes the pin. Without that, a hole
    generic held by a reassigned `let` in a record field, called with a function
    (`written-let-first-fn-in-record-field-called.vl`), refused at its call.

  The probe ran over 16,619 files before and after. The control,
  `hof-written-let-in-record-field-called-with-fn.vl`, disagreed before.

  | site | files before: agree / disagree | files after | events after: agree / disagree |
  | --- | --- | --- | --- |
  | `monoCoerceFnValueName`'s instance | 0 / 18 | 7 / 11 | 13 / 38 (was 0 / 51) |
  | call-driven `=>` pin | 216 / 31 | 216 / 31 | 2,015 / 91 (unchanged) |
  | cell take | 0 / 6 | 0 / 6 | 0 / 21 (unchanged) |

  Left: in the 11 coerce files and the other two rows, the delivered value is itself a hole
  function, or the slot is called at two types (`hole-fn-if-join-*`,
  `hole-fn-join-called-at-two-fn-types*`, `hole-fn-list-handed-hole-param`). The pin there has
  no closed type, so `monoPinFnParamTys` answers `[]`. Typing it needs the delivered hole
  function's instance type. **Step 1 moved no consumer.** No `=>` pin site has zero
  disagreement, so the instance's TypeRef text, its key and `rsC` stay on the spelling there.

  **The seed call's instance types, landed (2026-10-23).** In all 11 coerce files the delivery
  came from a call through a binding (`monoCallIfBound`, `monoCallIfValue`, `monoCallWrittenLet`).
  Each takes its signature from `monoSeedCallSigTys` (formerly `monoSeedCallSig`), which mints
  the seed's instance for the call. It now also returns that instance's parameter types when
  each `=>` pin among them is a closed function type, and the three callers pass them as
  `deliveryTys`. A probe over `tests/cases/closures` (1,077 files), with the control
  `hole-fn-list-handed-hole-param.vl` disagreeing:

  | site | files before: agree / disagree | files after | events after: agree / disagree |
  | --- | --- | --- | --- |
  | `monoCoerceFnValueName`'s instance | 5 / 11 | 11 / 6 | 30 / 29 |

  difftree `--identity` found 5 of 16,509 files with a different module: the five of the 11 that
  now type the instance (`hole-fn-if-join-result-handed-hole-fn`,
  `hole-fn-join-called-at-two-fn-types` and its `-in-function` twin, and
  `hole-fn-list-handed-hole-lambda` and `-param`). Each module loses one function. That function
  was a second instance at the same signature, minted because a key with an open type did not
  match the typed one. All five print what they did before.

  Left: in the other 6 files the seed instance's own parameter is open. Its TypeRef text is a
  `=>` key and its type is `(_, _) => _`. A second probe, at every `=>` pin `monoPinHoleParam`
  pushes, found 67 open pins in 17 files: the six, plus the `listed-hole-fn-*`,
  `hole-copy-chain-*` and `module-fw-binding-*` families. All 29 the report lists came from one
  arm, the `monoArgPinName` pin. There the argument is a hole function, and `monoArgTyName` keys
  it by its REP signature (`fnSigKeyOf` or `sigKeyOfTy`), with each hole at its `i32` default.
  No arena type stands behind that key.
  Typing it needs the hole function's instance keyed by type (D3), or a checker bind of the
  hole at that call. Until then no `=>` pin site has zero disagreement. The TypeRef text, the
  key, `rsC`, and the member-order and literal-arm rows stay on the spelling. D3 has since
  typed that arm in all but 4 files.

  **Step 3 at `monoBindFromAnn`'s four callers, measured and not converted (2026-10-23, master
  `5b5ba6918`).** Plan: drop the spelling binder, bind with `monoBindArenaWalk` (`bindGenWalk`
  over the declared parameter type and the argument's pin type), and retire the walker's 4
  entries. The probe ran both binders on copies of `tvN`/`tvV` at each caller: A
  `monoInstanceFor`, B `monoPreBindPastUnionRest`, C `monoPreBindNonArrowArgs`, D
  `monoPinTyParamComposite`. It ran over `tests/**`, the distilled corpus and the compiler,
  16,624 files with 0 uncompared and a reach set of 703 files. "Same type" compares each
  binding's `nameToTy`, which only the probe calls.

  | site | typed actual | files | events | exact disagree | same-type disagree |
  | --- | --- | --- | --- | --- | --- |
  | A, `vty` resolves | `monoFnValueParamTys` / `deliveryTys` | 250 | 1,786 | 10 | 9 |
  | A, no `vty` (A0) | none; the probe read `nameToTy(pin)` | 191 | 2,356 | 11 | 10 |
  | B | `decl[j]` / `ats[j]` | 14 | 33 | 7 | 2 |
  | C | `monoArgPinTyIx` | 28 | 266 | 1 | 0 |
  | D (the walk already follows the spelling bind) | `monoArgPinTyIx` | 411 | 1,738 | 370 | 286 |

  Two findings block the swap:
  - **`bindGenWalk` is not the spelling binder's twin.** Every D disagreement in the report is
    the typed walk binding nothing where the spelling binds the right type. The arms it lacks:
    - union rest (`T|string @ i32|string`, `T[]|i32[] @ string[]`, the map-open
      `{[string]:V}|{[string]:string}`, `T|AB|null @ i32`);
    - arrow results and parameters (`()=>T @ ()=>void`, `(U)=>U @ (i32)=>i32`,
      `((U)=>U)[]`);
    - generic heads (`Bare<A>`, `Inner<Id>`, the record arm of `Rows<R,A>`);
    - a literal-union alias argument (`T|i32 @ K`).

    A typed twin needs each of `monoBindFromAnn`'s arms on arena types, union-rest subtraction
    by `tyEq` included.
  - **Site A has no typed pin in production.** In 191 files its pins arrive as text from the
    fn-flow signature pipeline: `monoSigPins(sig)` from `monoSlotSig`, `annFnDecompose` of a
    delivered annotation, and `monoCbFnListRowSpell`. In the probe, A0 agrees once
    `nameToTy` parses the pin, so its gap is a missing type, not a different answer. Typing
    those callers is D3's `mono-pin-key-by-type` work on the signature table.

  **Sites B, C and D bind by type (landed 2026-10-23).** The typed twin is `bindGenWalkFull`
  (`check_relate_core.vl`): `bindGenWalk` with two arms added at every depth, behind a flag,
  so the checker's own calls are unchanged.
  - The union arm: one open member binds the argument's members that no other member `tyEq`s.
    It binds the whole argument when every member or none is covered, and otherwise pairs
    members by position when the counts are equal. A map member is never paired with `null`.
  - The generic-application arm binds the arguments pairwise under one head.
  - The checker's `bindGenUnionArm` is not reused. It covers by assignability and declines a
    member that holds a type variable, but an exact pin needs equality.

  Arrow parameters and results were already walked. Their disagreements came from the actual
  type, not the binder.

  `monoBindArenaFull` (`emit_mono.vl`) binds with the twin. Three things about its inputs:
  - **Pattern.** It takes the declared signature type where the instance's own type has no
    type variable (`monoParamPatTy`), so an alias shadowed by a type parameter (`Inner<Id>`)
    binds.
  - **Spelling.** It spells a pin nominal-first (`monoPinNominalSpelling`). A structural
    render of a declared record made a second instance (`Tbl<{w:i32}>` beside `Tbl<Tex>`,
    an invalid module) and lost a `@flat` row's layout. Lists and literal unions keep
    `monoPinAnnSpelling`.
  - **Open arguments.** Where the argument's own type is still open, the binder reads the
    `let` annotation that `monoPinListElems` pinned (`monoLetAnnTyOf`) and each closed
    element of a list literal (`monoBindListLitElems`).

  `monoArgBindSpelling` is deleted, along with its entry.

  The probe before the swap counted bindings that disagree with the spelling binder, as
  events. Only the 56 files that still disagreed were re-run with the final twin, so their
  "with twin" figures do not sum to the 16,624-file totals. The probe is not committed.

  | site | `bindGenWalk` (16,624 files) | twin (16,624 files) | twin (56 files) | after the swap |
  | --- | --- | --- | --- | --- |
  | B | 7 of 33 | 2 of 33 | 2 of 12 | binds by type |
  | C | 25 of 266 | 24 of 266 | 0 of 63 | binds by type |
  | D | 140 of 1,738 | 6 of 1,738 | 2 of 401 | binds by type |

  - The residue left after the swap had two parts:
    - nominal-against-structural spellings, which the nominal-first spelling closed;
    - the `((U)=>U)[]` list literal and the push-written list, which `monoBindListLitElems`
      and `monoLetAnnTyOf` closed.
  - `difftree --identity` over the 411-file reach set: 7 files differ, every one printing the
    same output as master.
    - Four keep their size and differ only in instance or type order.
    - One builds a single `h` where master built two for the same `T`.
    - The others are within 8 bytes.

  **Site A binds by type, and `monoBindFromAnn` is deleted.** `monoInstanceFor` binds through
  `monoBindArenaFullTys`, and the result must satisfy `tyEq` after `substTyDeepOf`. A binding
  that leaves a TyVar declines. The coerce callers now pass typed pins:
  `monoSlotPinNameTys`, `monoPlacePinNameTys`, `monoCellPinNameTys`, an instance's parameter
  types, and `monoFnTyParamTys` of the destination type. A caller that holds only a spelling
  falls back to `nameToTy`. The probe compared site A's typed binding with `monoBindFromAnn`
  over the reach set, counting files.

  | step | files compared | agree | disagree |
  | --- | --- | --- | --- |
  | typed pins at the hole-function and written-let callers | 250 | 248 | 4 (6 events) |
  | plus the `nameToTy` fallback | 330 | 326 | 4 (7 events) |
  | typed pins at the coerce callers | 328 | 328 | 0 |

  The 4 disagreeing files were run on both compilers. Each builds byte-identical to master and
  prints its expected output. So the disagreement does not reach the output. The 4 files are
  `closures/generic-fn-as-list-callback-result.vl`,
  `closures/hof-written-let-in-record-field-called-with-fn.vl`,
  `closures/hole-fn-list-to-hole-param-calling-element.vl` and
  `generics/generic-fn-to-hole-param-instanced-at-its-calls.vl`.

  **Blocked: pins with no typed producer.** About 443 events still reach site A as a spelling
  and resolve through the `nameToTy` fallback. Site B produces 275 of them, from its
  `tvN`/`tvV` spellings: the `monoHandWrittenLet` prefix (130 events, 4 files) and
  `monoPinTyParamComposite` (145 events, 17 files). Choice bindings that key by a cell name
  account for 100 events in 4 files. The other 68 are scattered across ten small paths,
  among them `monoSlotSigName` (21 events, 14 files) and wide `monoTysFnName` pins (4 events,
  1 file). The other 8 walker entries are blocked on the same spellings. Retired at site A: 4
  (`monoBindFromAnn`, C1). Retired: 1 (`monoArgBindSpelling`, D3).

  **Site B carries types (C1 step 3).** Each `tvN`/`tvV` binding now has its arena type in
  `tvT`, index-aligned through `monoTvTyLast`. The written-let and composite coercions deliver
  the slot's parameter types under those typed bindings. A probe over the self-compile and
  16,896 fixture and corpus files counted the fallback events: **583 before, 381 after**, in
  90 and 71 files. The written-let prefix fell from 28 to 0 and the composite coercion from
  174 to 0. The tallies differ from the 130/145 above because this probe tags by the call that
  was on the stack. Of the 2,281 pins answered by a delivered type, all 2,281 agree with
  `nameToTy` of their spelling. The `T[]` arm of `monoPinAnnotatedParam` decides by the closed
  argument type wherever one exists, and agrees with `nameIsArray` in all 1,218 of those
  decisions. The other 145 have an open type (`_`, for example
  `generics/loop-var-forwarded-through-generic.vl`) and keep the spelling.

  **The three spelling-only producers carry a type.** `monoArgClosedTyIn` reads an argument's
  type inside the calling instance: its pin type where closed, else the instance parameter's
  pin, else the node's type at the instance's bindings. The same probe, over the same 16,897
  files, counted the following:
  * Later-argument bindings (`monoBindFromLaterArg`): 3 of 3 closed, and all 3 agree with
    `nameToTy` of their spelling.
  * Softened literal type arguments: 2 of 2 carry their literal type, and both agree.
  * Open `T[]` arguments: 135 of 145 closed, and all 135 agree.
  * The other 10 stay open, in 4 files. Seven are an empty `[]` at an open `T[]`, which pins
    at its literal default (`generics/tail-join-locals-and-empty-list-arg.vl`). Three are a
    hole-typed function list at `((_) => _)[]`
    (`closures/hole-fn-list-row-index-alias-and-generic-arg.vl`). No instance closes their
    element, so it still binds by the pin's spelling.

  List-ness is now decided by the type's shape (`monoTyIsArrayShaped`), and an open `T[]` is
  shaped too, so both `nameIsArray` entries retire (D3 leaves 19, down from 21). Site A's fallback count did
  not move: **398 before and 398 after** on this probe, which also tags the self-compile. These
  three producers were not where those events come from.
- **C2.** Attempted and not converted. A probe found `expTy` at `-1` on hundreds of fixture
  sites whose cell spelling is a function type. Every producer of that spelling is text
  (`monoSlotSig`, `monoSubstAnn`, `monoSlotPinName`, `monoSeedCallSigTys`), so the change cannot
  stay inside `emit_mono`. It follows C1.
- **C3.** The `emit_shape_intern` walkers take the field type alongside the field text. A probe
  over the self-compile and 16,820 fixture and corpus files compared each site's spelling
  answer with a typed twin. Counts are files.
  - Done: 4 parses. `funcTypeShapeLowerable` takes the shape's type, and its nested-leaf test is
    `tyIsNestedScalarLeafArray` of the field type (12 files, 0 differ). The name walker it
    replaced is gone, and with it 2 parses. A closure field in `internNonLowerableFieldShapesTy`
    is `tyIsFuncArena` of the field type (23 files, 0 differ). The literal-union gate in
    `iisPushFieldElem` asks the field row it projects (669 files, 0 differ). Two grids of
    closure results, 34 nested-leaf cells and 11 closure-field cells, built the same output on
    both seeds, and difftree --identity found 0 of 16,451 files differ.
  - Done in a second landing: 5 parses, over 16,864 files. `internShapeArms` tests
    `tyIsFuncArena` of the arm's type, and finds an uncovered row's arms by `setTy`'s key
    (`unionMemberTysOfAB`): 990 agree, 0 differ, and the 2 that reach with no type build
    byte-identical modules. The value-union arm loop in `internShapeDeepTy` tests the covered
    arm's type the same way (59 agree, 0 differ, 1 with no type builds the same module).
    `shapeFieldsRideTyParam` reads the field's arena type, a type parameter as its element's
    spine leaf or as a nullable element's inner, which retires its three parses: 499 agree,
    and all 201 with no type answered false by spelling too. The 1 that differs,
    `error-param-shadow-tyaram-nullable-elem.vl`, keeps the `RLK_UNION` guard. A `T[]` field
    whose `T` shadows a declared record no longer mints that record's shape, so its module
    differs and its output does not (`param-shadow-tyaram-array-elem.vl`). Three clause-2
    refusals the type-parameter grids met are D10880, D10881 and D10882.
  - Left: 7. Three differ: `internShapeDeepTy`'s paren-closure and nullable peels in 206 and
    234 files, and `internFuncTypeShapesTy`'s nullable peel in 11. The other four produce a
    name the walk keys: the `internShapeDeepOfTy` render, the arm split (2 files differ), the
    map-value name (1 differs), and `structElemArrayLowerable`'s base name.
  - Probed again and still left: 7, over the self-compile and 16,758 files, counting files. No
    entry can move without a new type producer, which this slice does not add:
    - The typed answers are not better. `tyIsFuncArena` disagrees with the paren-closure test
      in 131 files. In 130 the TypeRef is named by a closure-signature mangle (`=>i>i`), and in
      the other the name has lost its grouping parens. The typed `| null` peel differs in 232
      and 11 files. Nearly all are an `A|B|null` that the arena holds as a nullable over a
      union, while the walk keys the three-member set, so a typed peel would change the key.
    - The no-type reaches come from two producers by design. `collectAnnShapes` gives no type
      to a TypeRef that names a generic-alias parameter. `gaeInternAppFieldShapes` passes field
      text that only exists after substitution. Between them they reach the paren-closure test
      in 17 files, the nullable peel in 40 and the map-value recursion in 140, where the
      spelling still answers.
    - The keys cannot become renders. A render expands a declared record (`Circle` renders
      `{r:i32}`) and softens a literal union (`K` renders `string`). It differs from the peeled
      spelling in 1,334 files at the nullable recursion and 1,390 at the map value. The arena
      also holds `Circle[]` and `{r:i32}[]` as one shape, while `structElemArrayLowerable`
      admits the two differently.
- **C4.** The callers of the shape-text field recorders pass the field type that the struct row
  already holds. Landed for 1 render and 2 parses: `elemIsLitUnion` became `tyIsLitUnion` of
  the row's element column, `variantIndexOfOwnRender` matches arms on the arena with a literal
  field kept apart from its base, and `gaeArgIsTyParam` asks the declared-type test its
  `base[]` spelling stood for. A probe over every `tests/**/*.vl` and the distilled corpus
  found 0 differing files for each. A second landing gave `nameFieldCode` and
  `shapeFieldElemName` the field's arena type, which every caller holding one now passes; an
  arm mint passes the arm's type to its fields alone (`internInlineShapeFieldsTy`). Over the
  self-compile, `tests` and the distilled corpus (16,824 files) the typed answer differed in 0
  files at each site, and `shapeFieldElemName`'s literal-union arm retired: 3,746 files agree,
  and the 96 reached with no type answered false by spelling too. The other 5 stayed.
  - Probed again and still left: 3, over the self-compile, `tests` and the distilled corpus
    (16,872 files, counting files; two controls trip every tag):
    - The three field-code arms agree wherever a type came: 0 differing files of 856 (literal
      union), 753 (array) and 1,115 (function). They still reach with no type in 2,663,
      2,312 and 4,246 files, and there the spelling answers true in 41, 752 (mostly `i32[]`)
      and 62. So the spelling half is live and cannot be dropped.
    - Most no-type reaches come from `shapeFieldTypeCompatK`, in 1,521 to 3,091 files. Its
      text is a field split from the key of `structIndexOfTypeName` or
      `variantIndexOfTypeName`, and those resolvers hold no type. The next producer is the arm
      mint, in 683 to 1,686 files. It holds the arm's type but reads `tyFieldTyOf(tyIx)`, and
      for an arm mint `tyIx` is -1. Passing the arm's type instead changes the code in 52
      files, all on the expanded `{c2:i32}|{s2:i32}` field, so it is not a free substitute.
      That fix belongs to `emit_shape_intern`'s owner. The rest are synthetic member-set texts
      with no arena type: the anon-leaf poly set (250 to 268), the fold (24) and
      `anonRowServesLeafSet` (23). Also `internShapeAs` (40), `gaeEnsure` (11) and
      `nameFieldCodeTy` called with -1 (62 to 107).
    - `fieldCodeOfSpelling` is the name-only caller that C5 waits on.
  - Re-probed at 7dfbcfa6d by the call site that asks the resolver, still 3 left (16,635
    files, 0 uncompared; counts are files where the spelling answers true):
    - The arm mint has 18, 39 and 2 (literal union, array, function). The rest come from
      resolver callers that hold only a name. These include `nameIsRefArrayGo` and
      `refArrShapeKindGo` (D2), `refArrElemNameGo`, `isSName`, `anonHandleTyIx`,
      `anonRowKindsAgree`, `monoSpelledShapeStaysAnon` (22 array files) and
      `rlElemVariantRow`. Each status lists them all.
    - Two callers hold a type:
      - `mintUnionFieldObjRow` (D6): `structIndexOfTypeNameTy` gives a different row in 12
        of its 128 files, so swapping it changes output.
      - `structIndexOfIndexExpr`: the typed resolver agrees in all 29 files (1,622 events).
        It is the next swap, but it removes only 7 function-arm files.
    - So these arms retire when the resolvers' callers carry the shape's type, not in the
      field-code walkers. That is D2's and D6's work.
  - Done: 2 parses, the rendered rung 3 of `rlSlotByNameTyK`. The 35 unhinted call sites
    pass the element type they hold to `rlSlotByNameTwin`: the two name rungs, then
    `rlSlotOfTyTwin`. Keying rung 2 by that type instead moved the slot in 80 files, because
    an initialiser's literal type is not the annotation's. Old and new ladders ran side by
    side over the self-compile and 16,761 files, and a control that drops the rung tripped in
    23. Only `annRefListSlot` differs, in 20 files, and all 20 build byte-identical modules.
    `arrLitFrameLeafRow`'s two scalar-leaf callers stay untyped; the rung never answered a
    `string[]`, `f64[]` or `i64[]` leaf.
- **C5.** These name-only gates get a typed caller, or are proved dead and removed:
  - the `nameIsNul*` niche ladders and `annSpelledArray`;
  - the generic-alias test and `inferRetIsLitUnionAt`;
  - the remaining name-grammar tests.

  A probe ran over the self-compile and 16,554 fixture and corpus files. Counts are files.
  - Done: 2 parses. `inferRetIsLitUnionAt`'s fallback for an entry with no row was reached by
    no file, so that entry now answers false. `internCloResultSpine` asks `tyStepRet` whether a
    level's result is a closure. It was reached in 87 files and differed in 0.
  - Done: 1 parse. `annSpelledArray` asks `tyIsArray` of the node's type where the parser's tree
    was dropped. A re-probe over the self-compile and 16,852 files found the fallback in 6,034
    files. Two differed, both a type parameter shadowing an array alias (`i32[]` against `f32`
    and against the bound `Ids`); their modules are byte-identical either way. The 54 files
    with no type all spelled a non-list, so both answers were false. They are inline union-arm
    field and canon-rewritten annotations that the checker never types. An alias-to-list
    union-arm field also has no type, and it builds byte-identical with the answer false.
    `difftree --identity` found 0 of 16,483 files differing.
  - Done: 2 parses. `cloNameSigKeyTy` keys a nullable closure by its type alone. Its name
    fallback was reached in 1 file of 16,852, where the type was present and the spelling
    keyed `""` as well. `collectCloSigs` asks `nodeTyIsNulClosure`, which agreed with the
    spelling in all 3,655 files that reach it.
  - Done: 1 parse. `nullClosureArrElem` and `cloArrElemNameOf` are deleted. Both
    `collectCloSigs` passes intern a closure-array element's `$fnsig` from the element type
    (`cloArrElemFuncTyOf`). The TypeRef pass, reached in 281 of 16,855 files, keyed differently
    in 2 files, where the spelling keyed `""` and the type keyed the element. Both build
    byte-identical modules with the same output, because another pass already interns that
    signature. The union-arm pass (13 files) agreed in every file. `exprNulClosure`'s
    `calleeCloRetName` rung is deleted too: it was reached in 1,859 files and in the
    self-compile, and never answered true.
  - Done: 1 parse. `forceNestedCloSigReps` walked a TypeRef's spelling to reserve the reps a
    closure field's result and parameters need. `forceNestedCloSigRepsOfTy` walks the
    TypeRef's arena type instead, and `forceAnnLeafRepsOfTy` reserves each leaf from its type.
    A probe compared the flags each walk reserves, over the self-compile and 16,864 files. The
    self-compile reached the gate 0 times; 26 files reached it. The flag sets differed in 6
    files, and in 2 of them the type reserved a flag not already held. In all 6 the spelling
    reserved nothing and the type reserved the string backing: generic applications
    (`Pair<(i32) => i32, …>`, `R<string>`) and a parenthesised function arm whose result is a
    shape. All 6 build byte-identical modules with the same output. No file had a spelling
    that reserved where the node had no type. The D1092 fixture is the control that trips it.
  - Left: `nameIsNulClosure`. `nameFieldCode` was reached in 4,805 files. Where it held a
    type, the typed answer agreed in every file. It held only a name and answered true in 2
    (`generic-function-into-nullable-function-slot.vl` and
    `map-closure-return-nulclosure-field-struct.vl`), so the name leg is live.
  - Left: `gaePeelWrappers` and `collectGenAliasShapes`. They produce the application spelling
    `gaeEnsure` keys on, and the arena has no node for a generic application.
  - Converted, no parse retired: every caller of the niche ladders and the name-grammar tests
    that holds a type. A probe compared the name and type answers at each converted site, over
    the self-compile and 16,880 files. 11,957 of the files compile, and a file the compiler
    refuses reports nothing.
    - `inferNicheNullByName` asks `tyNulInnerIsPrim` and `tyIsNulStringRep`. It was reached in
      4,139 files and answered true in 4 (boolean) and 17 (string). It differed in 0.
    - Collect's array-literal and closure-result `nameIsNulString` gates were reached in 3 and
      8,624 files, and differed in 0.
    - `calleeCloRetName` and `cloArrSlotRetName` are deleted. `exprNulBool` and
      `exprNulLitUnion` ask the callee's function type (`cloCallRetTy`) instead. The boolean
      rung was reached in 3,024 files and never answered, because the node-type test answers
      first.
    - The literal-union Ident rung was reached in 3,273 files and differed in 3. In each, a
      nullable literal-union alias spells as its own name, which the spelling test missed.
    - The literal-union Index rung (41 files) and wasmEmit's `retNulLitUnion` (4,136 files)
      differed in 0.
    - Collect's two map-member-union sites ask the type. They were reached in 101 and 1 files
      and differed in 1, `{[string]: f32}[] | f64`, where the spelling's `{[` read an
      array-of-maps arm as a map.
    - `annNulListKind` asks `tyIsNulI32List` of the type its callers hold. It was reached in
      4,411 files and differed in 0.

    The 4 differing files, and the 27 the compiler traps on, build byte-identical modules
    with the same output under the master seed and the candidate.
  - Done: 1 parse. `nameIsNulI32List` is deleted. `fieldCodeOfSpelling` asks `tyIsNulI32List`
    of the type it holds: the annotation node's, or the caller's `fty`. A probe over the
    self-compile and 16,621 files compared the two answers. Counts are files.
    - The node path was reached in 1,715 and differed in 0.
    - The node-less path held a type in 545 and differed in 1,
      `closure-result-nullable-scalar-list-field-null.vl`, where the spelling `i32[] | null`
      kept its spaces and the name test missed it. It held no type in 1,009, and there the
      name never answered true.
    - `forceAnnLeafReps`'s arm was reached in 191 and answered true only in the control,
      where both flags it sets were already set, so the arm is deleted too.

    The 2,556 files the probe reached build byte-identical modules.
  - Converted, no parse retired: `fieldCodeOfSpelling`'s string, boolean and literal-union
    arms ask `tyNulInnerIsPrim` and `tyIsNullableLitUnion` where a type came, and differed in
    0 files. Where no type came (`nameFieldCode` with `fty` -1, about 1,000 files) the name
    answered true in 9 (string), 7 (boolean) and 38 (literal union), so those legs are live.
  - Left: every niche ladder and grammar test keeps a caller in a file another lane owns, or
    a caller with no type.
    - `nameIsNulString`, `nameIsNulBool` and `nulLitUnionScan` keep `fieldCodeOfSpelling`'s
      no-type leg. They are also grammar-internal: `nameIsI32Array` reaches `nameIsNulBool`
      and `nulLitUnionScan` through the nullable-list tests, and `parenUnionArrElemName`
      calls all three. `forceAnnLeafReps` still holds `nameIsNulString` for
      generic-application arguments, which have no type.
    - `nameIsStrLitSet` falls with `nulLitUnionScan` and `nameIsLitUnionArray`, so it falls
      only with the name grammar.
    - `nameIsMap` is held by emit_shape_rows, emit_mv_slots and emit_shape_intern.
    - `nameIsMapMemberUnion` is now called only by `nameIsBareMap`. That is held by
      emit_shape_rows, emit_map_value_slots and emit_mono.
    - `annRetNameOf` is held by emit_mono, `collectATypeRef`, emit_union_atoms and
      emit_start_block. Those callers hold stored names.
  - Blocked, measured: `nameIsNulString`, `nameIsNulBool` and `nulLitUnionScan`. A probe
    tagged each caller of the three grammar entries (`nameIsI32Array`, `nameIsStringArray`,
    `parenUnionArrElemName`) and recorded where a nullable arm answered true, over the
    self-compile and 16,623 files. Counts are files. No code changed.
    - The predicates answered true in 231 (string), 65 (boolean) and 121 (literal union).
    - `nameIsStringArray`'s `(string | null)[]` arm, 219 in all: `collectATypeRef` (206),
      `tyAnnRefListKind` (205), `scalarListRepOfName` (22), `refArrShapeKindGo` (10),
      `rlElemStoredName` (9), `refArrElemNameGo` (8), `nulScalarListKind` (2) and
      `mvShapeOfValNameArmTyGo` (2).
    - `nameIsI32Array`'s `(boolean | null)[]` arm (29) and `(K | null)[]` arm (70):
      `checkArrName` (21 and 62), `collectATypeRef` (11 and 43), `genTyParamArr` (9 and
      41), `scalarListRepOfName` (9 and 12), `nameIsI32ListArray` (3 and 9) and
      `rlElemStoredName` (0 and 7).
    - `parenUnionArrElemName`'s three niche exclusions (boolean 24, string 87, literal union
      64): `refArrShapeKindGo`, `refArrElemNameGo`, `letWidensAtomToStr` and
      `monoPinMintedUnion` in emit_mono (3, 12 and 5).
    - No emit_classify caller reached a true nullable arm, and `tyAnnRefListKind`'s own
      `nameIsNulBoolList` and `nameIsNulLitUnionList` legs never answered true.
    - `mvValKindOfNameTy`'s niche leg answered true in 43 files, and every one held a type.
      Its name leg still serves the -1 callers of `mvValKindOfName` (A1).

    The three entries are the ref-list kind ladder (D2), the mv slots (D8) and emit_mono's
    pin union. They fall when `nameIsI32Array`, `nameIsStringArray` and
    `parenUnionArrElemName` lose their name-only callers, not before. `nameIsStrLitSet`
    falls with them.
  - Landed: the string-list callers that hold a type ask it. `tyScalarListKind` (in
    `emit_struct_order`) answers `nameIsI32Array`'s and `nameIsStringArray`'s question from an
    array type. A probe compared the typed and the name answer per caller over the
    self-compile and 16,629 files. Counts are files, with events in brackets.

    | caller | agree | disagree | no type | outcome |
    | --- | --- | --- | --- | --- |
    | `tyAnnRefListKind`, string list | 10,649 (557,974) | 0 | 0 | typed |
    | `collectATypeRef`, closure-return rung | 1,026 (10,538) | 0 | 0 | typed |
    | `mvShapeOfValNameArmTyGo`, string list | 604 (2,613) | 0 | 0 | typed |
    | `tyAnnRefListKind`, niche-list name legs | 10,593 | 0 | 1 | deleted |
    | `collectATypeRef`, TypeRef rung, string list | 11,843 | 15 (23) | 180 | name |
    | `checkArrName` (`nameIsI32Array`) | 1,587 | 36 (136) | 1 | name |
    | `rlElemStoredName`, i32 list | 4,495 | 5 | 2,885 | name |
    | `rlElemStoredName`, string list | 4,403 | 1 | 2,797 | name |

    - `tyAnnRefListKind`'s `nameIsNulBoolList` and `nameIsNulLitUnionList` legs are deleted.
      Every `(boolean | null)[]` and `(K | null)[]` spelling returns earlier, at every
      position a witness tried (parameter, return, field, global, closure, nested function,
      generic body, alias). The legs never answered true in 547,962 events. Their three
      untyped events spell `#anon0[]|i32[]`.
    - The TypeRef rung's typed answer says string list on type-parameter arrays (`T[]`)
      where the name declines.
    - `checkArrName` disagrees only on numeric literal-union arrays (`D[]`, `type D = 1 | 2`),
      which render `i32[]` but have no scalar list kind by type.
    - Untouched by constraint: emit_mono (9595) calls the grammar entries.
  - Landed: the five emit_classify callers ask the type. The same probe, over the
    self-compile and 16,633 files:

    | caller | agree | disagree | no type | now asks |
    | --- | --- | --- | --- | --- |
    | `exprNullableList`, map read (`nameIsI32Array`) | 1,947 (3,351) | 0 | 0 | `tyScalarListKind(mvValTyIxAt)` |
    | `letIsArray`, uncovered annotation | 92 (269) | 0 | 0 | `tyScalarListKind` of the annotation |
    | `exprNulStrArray`, narrowed binding (`nameIsNulStrList`) | 148 (1,392) | 0 | 0 | `tyScalarBackedListKind` of the narrowed node |
    | `letIsStringArray`, uncovered annotation | 98 (294) | 0 | 9 (363) | `tyScalarListKind` of the annotation |
    | `letIsStringArray`, `(K \| null)[]` reject | 98 (294) | 0 | 1 (3) | deleted |

    - Every no-type event is a synthesized `#anon0[]`/`#anon1[]` (or `#anon0[]|i32[]`)
      annotation where the name also answered false.
    - The `(K | null)[]` reject repeated `annIsNulLitUnionArray` four lines above it, so it is
      deleted rather than retyped.
    - No ledger row retires and the census stays at 64 / 150: the removed calls were of the
      `nameIs*` wrappers, which keep name-only callers in `emit_base`, `emit_shape_rows`,
      `emit_collect`, `emit_mv_slots` and `emit_sig_tokens`.
    - `genTyParamArr`, `scalarListRepOfName`, `refArrShapeKindGo` and `refArrElemNameGo` read
      type-parameter grammar or name-keyed ladders, and their callers hold names only.
    - The census count is unchanged (154). The removed calls were of the `nameIs*` wrappers,
      not of the parsers the census counts.
- **D1.** `rlSlotByName`, `rlSlotOfArrName` and the `refListElemNameOf*` family key the ref-list
  slot by element type. This turns most of the B key producers into dead code. A probe compared
  the spelling's name with the row that `rlSlotOfTy` keys by the node's element type, at fifteen
  sites, over the self-compile and 16,794 fixture and corpus files. Counts are files that reach a
  site.
  - Done, 0 differing files: 3 parses. The `refListElemNameOfMember` and `refListElemNameOfIndex`
    narrowed-place arms, and the un-narrowed `(S[] | null)[]` cell read, return
    `refListElemNameOfNodeTy`.
  - Done, 1 differing file each: 2 parses. These are the nullable ref-array parameter arm and the
    outer cut. The parameter arm names `#anon0` where the spelling said `{x:i32}`, which is the
    same slot. The outer cut answers "" for a closure element whose spelling had no row either.
    Both modules build byte-identical.
  - Done, 2 differing files: 1 parse. The narrowed ref-array arm (`raN`) keys the row by the
    node's element type at the mono instance's pins (`instanceTyOf`). A generic body's `P[]`
    names its pinned row, and those 4 files build byte-identical. In the 2 Json fixtures the
    spelling had named a row under the expanded `Json` union. The type names the `Json` row.
    Those modules declare fewer scratch locals, have the same code, and run the same.
  - Done, 0 differing files: 3 parses, the `outer` and `nOuter` gates of `refListElemNameOfIndex`.
    The outer row's inner-row rung stays first, since closure elements and nullable records have
    no type-keyed row. The fall-through then returns `refListElemNameOfNodeTy` when the receiver's
    element type is itself a ref list, raw or at the instance's pins. Both legs are needed. The
    gate asks for a list element, not a row, so it declines where the spelling did, in
    `narrowed-place-arm-delivery.vl`. 220 files reach it, and the self-compile builds
    byte-identical.
  - Done, 0 differing modules: 1 render. The `__array_new__` destination (`anDst`) is keyed by
    the destination's element type at the instance's pins. 13 of the 40 files that reach it
    answer differently in some emit pass, either a shape-spelled duplicate row or the same slot
    under another name. All 13 build byte-identical modules and run the same.
  - Left in `emit_classify`: the arms where the typed lookup misses or names another row.
    - Some rows do not exist yet, because the caller interns them under the name: `fill` and
      the `.map` result (`mfListResultElemName`).
    - The struct-list mv arm finds the same slot under a structural name in 24 of 206 files, and
      callers intern under that name.
    - Taken whole, `refListSlotOfExpr`'s answer differs from the typed slot in 1,475 of the
      4,319 files that reach it. The spelling does not stand for one type-keyed row.
  - Done, 0 differing files: 1 parse. The nullable ref-array parameter arm's gate in
    `refListElemNameOfIdent` asks `annNulRefArrSlot` of the annotation node, so a mono
    instance's grouped `(i32[][]|null)` needs no peel. 21 files reach it, the spelling's gate
    never declined, and the typed gate agreed in all 21.
  - Moved, no entry retired yet: four of `refArrElemNameIf`'s five callers
    (`fnAssignCellElem`, `letRefListElemName`, `paramRefArrayName`, `retRefArrElemName`) read
    `annBareRefArrElemName(node)`, the stored name of the row keyed by the annotation's element
    type. Over the self-compile and 16,872 fixture and corpus files, they reach 1, 244, 1,287 and
    8,022 files. The names differ in 5, 34 and 181 of the last three, almost all the same slot
    under another name. The slot differs at 5 site-file pairs, and at 6 only one side found a
    row. The identity diff over 16,500 files finds one differing module,
    `memory/newtype-struct-reflist-key-population.vl`: two locals of the top-level function
    are declared in the other order, with the same types and code, and it prints the same output.
  - Left: the fifth caller, `unionClosureArrElemUnion`, holds split union atoms with no node. It
    is reached in 61 files and answers "" in all 61, and its originating fixture is now served
    by an earlier arm, so no program shows what a typed answer must equal. In 19 of the 61 the
    name has no recorded member set. `refArrElemNameIf`'s D2 entry goes with this caller.
  - Left elsewhere:
    - `synthEmptyListAnn`'s `string|null` element has no ref-list row (3 of 4 files).
    - `rlMapElemValSlot`'s fall-through is live in 115 files.
    - The producers (`collectARefArrayAnn`, `ensureRefElemTy`, `forceCloListTypeOf`) mint the
      rows the typed lookup reads.
    - The nine `emit_base` grammar predicates go when their name-only callers in D2 and C5 take
      a type.
- **D2.** `nameIsRefArray`, `refArrShapeKind` and the `rasRef`/`rasKind` memo answer by type.
  `tyElemIsRefListElem` admits more than the spelling ladder by construction: it answers true for
  every record and every nested list, with no row. So the slice added a narrower twin,
  `tyIsRefArray`, which asks for the record's own struct or arm row. A probe put both answers side
  by side at eleven sites, over the self-compile and 16,678 fixture and corpus files. Counts are
  files reaching a site, not calls.
  - Done, byte-identical: 5 parses. `synthEmptyListAnn`, `collectARefArrayAnn`'s nullable test,
    `arrLitNulRefGrouped` and `nulRefElemNameOfArrTy` ask the type, with 0 differing reaches.
    `checkArrName`'s ref-list rung was dead, because its only caller's earlier rung already
    claims every name it accepted.
  - Done, one differing file: 2 parses. The twin was too narrow at three sites, always the same
    way. An inferred record that only adopts into a declared row (`[{ r: null }]` beside
    `{ r: i32 | null }`) has no row of its own, while the spelling reaches the row through
    `structIndexOfTypeName`'s lenient passes. `tyObjHasRefRow` now also takes the declared row
    the record adopts into, through `structRowOfObjFieldSet`, the existing field-set scan over
    `declRowFieldAdopts`. A probe over 16,438 fixture and corpus files then disagreed in 1 file,
    down from 49. `arrLitShapeElemName` and `arrLitNestedElemName` ask the type.
    - The remaining file is `anon-struct-declared-row-capture-containers.vl`. There, `{p: 7}`
      fits two union-box rows equally, so the field-set scan finds no unique claimant, where the
      spelling took the first row. The module differs by 13 bytes, prints the same output, and
      still runs with the two rows swapped.
    - Adding the variant field-set scan as well added 3 new disagreements, so the bridge stops
      at struct rows.
  - Left: `mvValKindOfNameTy`'s list arm. With the bridge, every file where the spelling said
    ref list agrees with the type. Still apart: 8 files where the spelling is empty (closure and
    generic-fn map values), and 136 with no type. Its callers pass `-1` through
    `mvValKindOfName`, and two of those hold no type by construction.
  - Left: `collectATypeRef`'s rung also disagrees in the other direction. A generic original's
    spelling (`T`, `C<i32>[]`) carries the instance's canon type, and 411 reaches have no type.
    Two map-value sites agree but have callers passing `-1`. `refArrElemNameIf`'s callers are in
    other slices' files. The ladder internals stay while any of these keep a name caller.
  - Re-surveyed at 5a834bcfe: none of the 15 can retire yet, and each `.jsonl` row names its
    current callers. They fall into three groups:
    - The three mv-kind sites are reached through `mvValKindOfName` with no type. One of the
      callers, `mapValKindLowerable`, is called from `emit_shape_intern`, which holds no type.
      These wait on D8. After D8's typed slot finds, the untyped reaches are the shape-text
      query (77 files), the arm mint (47), 8 map-name finds, `mapValKindLowerable` (4) and 1
      inner slot.
    - `refArrElemNameIf` and every caller of the ladder want an element name to key the
      name-keyed ref-list slot. D1 has since moved four of `refArrElemNameIf`'s five callers to
      the type, leaving `unionClosureArrElemUnion`. `refArrElemKind` also derives its kind from
      the spelling, so it matches the annotation side. This group waits on D1.
    - `refArrShapeKind` is also called from `emit_shape_intern` 663.

    So the ten ladder-internal entries (`refArrShapeKindGo`, `nameIsRefArrayGo`,
    `refElemArrName` and `nameIsNulRefList`) are the last of D2 to go.
- **D3.** The mono instance key and the `monoAnnPinName` ladder take the pin's type. Most of the
  slice is this one seam, and it carries 15 of the 52 D renders.
  - Done: the instance is keyed by type as well as by spelling. When the spelled key misses,
    `monoTypedInstKey` rebuilds the key with each pin as its kind and the `tyCanonKey` of the
    type the clone resolved it to. A typed hit reuses the instance already minted and drops the
    clone's staged writes. `monoAnonPinDiscrim` keys an `#anon` pin by `tyCanonKey`. One render
    retired. This was step 2 of the C1 plan, landed before step 1: it needs only the resolved
    pin column `monoMakeInstanceParams` already fills, not the `letBN`/`letBT` mint.
  - Measured first: a side-by-side probe recorded each new instance's spelled and typed key
    over 16,801 programs (the self-compile, `tests/**/*.vl` and the distilled corpus). Keying
    by type merges 19 instance pairs in 14 programs and splits none. The merges fall into five
    groups:
    - union member order (`i32|f64` and `f64|i32`), in 5;
    - an alias and its members (`Animal` and `Cat|Dog`), in 2;
    - a literal-union alias list (`KC[]` and `"circle"[]`), in 1;
    - grouping parentheses on a closure type, in 4;
    - an `#anon` handle and its inline record, in 7.

    The landed key keeps the argument-type discriminators, so the last group stays apart.
  - Result: difftree --identity found 9 of 16,443 files differ, all in `tests/cases`, every one
    smaller and printing its `@log` lines. The compiler's own fixpoint is unchanged. One file
    gained an instance from the `#anon` discriminator: a declared-record argument now keys
    apart from the literal it came from.
    `tests/cases/generics/union-pin-member-order-shares-instance.vl` pins the merge.
  - Left: 22 entries. Each one produces a pin spelling: the `monoAnnPinName` ladder,
    `monoArgTyName`, the lambda and closure pin names, and `unionParamPinName`. The spelling is
    still the instance's TypeRef text and its spelled key. These entries go with C1 step 3,
    which renders one spelling per instance, for the TypeRef text only. D4's blocker was that
    taking a row found by type under another name changed the instance key. The typed key
    should absorb that, but D4 has not been re-probed against it.
  - Done: the hole-function pin (the `monoArgPinName` arm of `monoPinHoleParam`) has a type.
    `monoHoleFnPinTy` fills the argument's holes, `i32` or `f64` in parameter position and
    in the result, and keeps the closed fill whose `sigKeyOfTy` is the pin's `=>` key.
    `monoInstanceFor` fills a `=>` pin's open value type the same way. A probe compared each
    `=>` pin's type before and after, over the self-compile and 16,621 fixture and corpus files.
    The control was `listed-hole-fn-called-at-two-types.vl`. Counts are files, then events.

    | site | open before | open after | closed after |
    | --- | --- | --- | --- |
    | `monoArgPinName` arm | 33 files, 100 events | 4 files, 6 events | 100 files, 869 events |
    | every `=>` pin `monoPinHoleParam` pushes | 17 files, 67 events (closures only) | 4 files, 6 events | 200 files, 2,576 events |
    | `monoCoerceFnValueName`'s instance | 6 files, 29 events (closures only) | 1 file, 5 events | 17 files, 59 events |

    difftree `--identity` found 1 differing file:
    `tests/cases/functions/generic-fn-value-hole-type-param-at-two-types.vl`. Its module is 10
    bytes smaller, and it prints what it did before.
  - Left: no `=>` pin site reaches zero, so no consumer moved and no entry retired. Four files
    still pass an argument whose type is not a function type, so no fill applies. Three are
    `fn-value-param-copied-into-*` and `generic-fn-value-param-copied-into-*`, where the
    argument is a parameter typed `F`. The fourth is `hole-field-function-passed-to-hole-param`,
    whose argument is a hole record's field. In
    `alias-of-written-let-called-with-hole-function`, `monoInstanceFor` gets no value type at
    all.
  - Done: a lambda written to a let is typed by the call instance that receives it. At the
    written-let call, `monoInstParamPinTys` reads the instance's parameter types, and it used
    to decline whenever a parameter had no annotation node. A parameter pinned at plain `i32`
    has none, so every lambda written beside an `i32` argument got no delivery types, and its
    `=>` pin in `monoInstanceFor` stayed open. The parameter column the clone resolved
    (`monoMakeInstanceLetTyCol`, which takes the argument's typed pin at a function pin) is now
    kept per instance in `monoInstParamTyCol` and read first. The probe compared the `=>` pin's
    closed type at `monoInstanceFor` with its `=>` key, over the self-compile and 16,623 files.
    The control was `written-let-hole-lambda-generic-typed-by-write.vl`.

    | site | before | after |
    | --- | --- | --- |
    | `monoInstanceFor` `=>` pin | 4 files, 15 events open | 24 files, 85 events closed, 0 open |
    | argument `=>` pin (`monoPinHoleParam`) | | 201 files, 2,582 events, all closed |

    The four files were `let-hole-lambda-reassigned-fn-param`, `hole-lambda-typed-by-callee-call`
    and the two `written-let-hole-lambda-generic-*`. Emitted code does not change: difftree
    `--identity` found 0 differing files (full sweep in the PR).
  - Left, measured: the clone's TypeRef text cannot yet be produced from the typed pin, so no
    entry retired. A probe at each parameter `monoMakeInstanceParams` pins compared the pin's
    spelling with renders of its type (the argument's typed pin, else the resolved pin):
    `tyToEmitName`, the `=>` sig key, the struct row handle and `tyToNominalName`. Every pin had
    a type. Counts are files, then events.

    | outcome | files | events |
    | --- | --- | --- |
    | some render reproduces the spelling | 5,233 | 19,671 |
    | of those, `tyToEmitName` alone | 4,308 | 15,216 |
    | of those, only another render (sig key, row handle, nominal) | 1,501 | 4,455 |
    | no render reproduces it | 417 | 947 |

    The 947 fall into four groups, by whether the spelling parses back to the rendered type:
    - the argument is narrower than the pin, so the pin is not the argument's type (`i32|string`
      from `i32`, `string|null` from `null`): 135 files, 338 events;
    - the spelling names the same type another way: a declared record or alias pinned from its
      inline literal (`Circle` from `{r:f64}`, `K` from `string`), or grouping parentheses
      (`{[string]:((i32)=>i32)}`): 141 files, 231 events;
    - neither: mostly an `#anon` row handle, whose name is the shape interner's mint order
      (`#anon0` from `{f:(i32)=>i32}`), plus map-in-union pins wider than their argument:
      141 files, 296 events;
    - the argument's type still holds a hole or renders empty: 39 files, 82 events.

    The first and the last need the pin's own type rather than the argument's, which is C1
    step 3's per-instance render. The other two would change the instance's spelled key, so
    each would move a registry row and its box tags (see D4). The 22 entries keep their status.
  - Measured, the sharing risk: keying an instance by its ARGUMENT's type alone would split
    instances. A probe compared the spelled key with the argument's type at every key lookup
    over 16,634 files plus the self-compile: in 1,546 files (8,178 events) one key held one
    argument type, and in 51 files (98 events) one spelled key was shared by arguments of
    different types. So the typed key stays the clone's resolved pin type, behind the spelled
    lookup, and no sharing changed in this step.
  - Done: `monoArgTyNameProjected`'s field-argument rung finds a nullable receiver's record from
    its recorded type's non-null part, at the instance's pin when the type names a parameter,
    instead of peeling `|null` off the receiver's spelling. It agreed with the spelled peel in
    8 of 8 files that reach it (15 of 15 events) over the 1,680-file reach set and the
    self-compile, with `tests/cases/inference/hole-param-nullable-self-ref-field-arg.vl` as the
    control. One parse retired; difftree --identity found 0 files differ.
  - Left, measured: the indexed-element rung (`nameIsArray(arrTy)`) is not the typed element's
    pin. The element's recorded type, spelled as a pin, disagrees in 121 of 140 files: the rung
    names `#anon` rows and record names where the type renders the inline shape.
    `unionParamPinName`'s render agreed with the literal `string` in only 2 events in 1 file,
    and no control reaches it, so it stays. 18 entries are left.
- **D4.** `monoRegisterPinUnion` and `canonUnionKeyOfName` register a narrowed pin's union by its
  type.
  - Probed and blocked: no entry retired. A side-by-side probe read the spelling and the type at
    each site over 16,797 files (the self-compile, `tests/**/*.vl` and the distilled corpus).
  - The five registry renders: at every site some files find no row by type, so the render is
    the name a new row is minted under. That happens in 243 files at `monoMakeInstanceRetChecked`
    and in 5 to 30 at each of the other four. Another 4 to 12 files per site find a row by type
    under a different name: `i32|string` for `string|i32`, `P|i32` for `{x:i32}|i32`, or an
    alias `U`. Box tags are positional and the name is the instance's TypeRef text, so taking the
    row's name changes the instance key. Minting by type is D5, and the key is D3.
  - The six narrowed-pin entries: `wide` is the `monoArgTyName` ladder's spelling and has no
    type. A type read off the binding is missing in 2,483 files and renders differently in 955.
    Where the spelling answered, a typed top-level membership test disagreed in 5 files, because
    a narrowed pin can be a sub-union (`string|null` out of `string|i32|null`,
    `tests/cases/unions/hole-param-pinned-at-narrowed-string-niche.vl`). The answer is the pin
    the instance key and `monoAnnPinName` read, so it moves with D3's ladder.
- **D5.** This is the L6 step-5 remainder. The union registry is asked by type at the 13 files
  that still pass a spelling.

  A probe compared the spelling's answer with the type's at every entry, over the self-compile
  and 16,803 fixture and corpus files. Counts are files, and a file can hold both an agreeing and
  a differing case.
  - Done: 1 render and 2 parses. `registerSharedReadUnion` registers under
    `valueUnionKeyTextOfTy`, the key's own text when the type is a value union: the gate differed
    in 0 of 73 files and the name in 0 of the 5 that register. `nulCloMixedUnionUnregistered`
    takes the arm's type and asks `tyIsLitUnion` of each atom's member type: 0 differ in 40, and
    the 2 with an untyped atom answer false both ways. `unionParamPinName` passes over a row with
    no type; no file reaches its loop. difftree `--identity` found 0 of 16,448 files differ.
  - Done: 3 renders. The value-union name readers in `emit_start_block` take
    `unionSpellingOfTy` (`emit_union_atoms`), a typed spelling that widens a literal member to
    its base, keeps the render's member order and declines on a hole, the way `tyToEmitName`
    names `9000000000 | 1` as `i64|i32`. The key text had differed from the render in 13 files at
    `coalesceResultUnionName`, 10 at `ifJoinUnionName` and 12 at `valueUnionRenderOfTy`. Over
    the self-compile and the 3,095 files a probe event reaches, the spelling differed in 0 of
    1,337 files at `coalesceResultUnionName`, 0 of 344 at `ifJoinUnionName` and 0 of 2,309 at
    `valueUnionRenderOfTy`, which is deleted; holes decline on both sides. A function member is
    spelled by the structural render the closure-signature slot keys on (`cloSigNameOfTy`): the
    nominal atom names a declared record (`T[]` for `{f:boolean}[]`) and differed in 1 file.
    `ifJoinUnionName`'s row rung is gated by `tyEmitNameNonEmpty`, which a recursive record
    cannot send into a loop. difftree `--identity` found 0 of 3,095 reach-set files differ.
  - Done: 1 render. `ifJoinUnionNameIn` names its value-union rung by `valueUnionKeyTextOfTy`,
    which agrees with the render in all 5 files that reach it, and its nullable-box fallback by
    the row `unRowOfKey` finds. No file reaches that fallback with a box, nor do six hand-written
    generic joins, because `ifJoinUnionName` names them first. `ifJoinUnionName` itself passes
    its row rung no name, and its nullable-box fallback takes the row's name too: 1 of 153 files
    differs by string (rv3310), where neither name finds a row. Its value-union rung still
    returns the render. difftree `--identity` found 0 of 16,510 files differ.
  - Done: 1 render. `anonUnionFieldName` names a value-union field by `valueUnionKeyTextOfTy`,
    which agreed with the render in all 72 file and union pairs that reach it. A record or list
    field takes the name of the row `unRowOfKey`, `unRowOfCanon` or the softened key finds.
    difftree `--identity` found 0 of 16,486 files differ. A string field no longer reads as a
    union where a one-literal string alias registered a row that the set text `string` finds, so
    it stores the string directly instead of in a box.
  - Done: 2 renders and 1 parse. The probe for these covered the self-compile and 16,622 files.
    - `unionNameOfExpr` names an `as` result in one of three ways:
      - a value union by `valueUnionNameOfTy`, which agrees with the render in all 28 files;
      - a literal-only union as one atom, "";
      - any other union by the row its key or canonical member sequence finds
        (`unRowOfKeyOrMembers`). These are the rows `isUNameAB` site 3 accepted.

      The name changed in 6 of 696 files. In 4 of them, a structural render became the declared
      `Shape` or `NodeKind`. In `as-opt-record-union-field-read.vl`, the render became the row's
      own `A$m…|B$m…|null`.
    - `scanPrintUse` registers only a value union, by that same spelling. In the 17 of 44 files
      where the result was not a value union, the old call only adopted the render onto the key
      row. `unionNameOfExpr` now answers with that row's own name, so no reader asks for the
      render.
    - `unionStrArmCountOf` counts over the row's member types. A row with an untyped member
      answers -1: the payload caller treats it as possibly holding a string, and the tag-compare
      caller refuses it. 1 file reaches it, and it agrees.

    difftree `--identity` found 0 of the 699 reach-set files differ.
  - Left: the atom tests. `isVariantBoxUnionAtoms` (2 entries) and the uncovered-row fallback of
    `markRefArrayArmsOf` need the spelling where an atom has no arena type (69, 25 and 1 files).
    `pushIndexMapComplement` differs at literal-alias members in 4 files (D8120).
  - Done: 2 renders. `cloCallParamUnionName` no longer has a render rung: past the alias and
    nominal rungs the lifted lambda's own pin answers. 5 files reach the old rung, all with an
    empty render that already fell through to that pin. `njStash` names the union by
    `valueUnionKeyTextOfTy`; no file reaches it. About 40 hand-written callee shapes and
    numeric-union operands reached neither with a name. difftree `--identity` found 0 of 16,483
    files differ.
  - Left: `shareFieldUnionRow`, where the render is the registered key. 26 files reach it, and in
    13 of them the render differs from the canon row's own name (`{x:i32}[]|i32[]` against
    `P[]|i32[]`). That is the alias D4930 needs, because readers look the structural spelling up
    by name.
  - Left, not probed: the registry's own `recordUnMemTys`, `unionSetAtomsOf` and `unionSetMemberCount`, which go
    when rows mint from types.
- **D6.** `structIndexOfTypeName`, `shapeRowScanK`, `inferNulStructRow`, `inferNulVariantRow` and
  `structIndexOfLet` answer by type.

  A probe compared the spelling's row with each typed lookup's at every entry, over the
  self-compile and 16,816 fixture and corpus files. Counts are files. `structIndexOfTy` still
  disagrees with the spelling on inline shapes after #4466 (48 files at `structIndexOfLet`).
  - Done: 2 parses. `inferNulStructRow` asks `structRowOfTy` of the non-null part of the banked
    return type: 2,140 files reach it with a type and 0 differ (`structIndexOfTy` alone differs in
    3). `inferNulVariantRow` asks `variantRowOfShapeTy`, which is `variantRowOfTy` and then the arm
    whose own render and type are the record's: 2,141 and 0 (`variantRowOfTy` alone differs in 1,
    an arm adopted by shape, D4668). The 8,273 files with no banked type have no row by spelling
    either. difftree `--identity` found 0 of 16,450 files differ.
  - Left: `structIndexOfLet`'s nullable rung. It differs from `structRowOfTy` in 5 files, from
    `structIndexOfTy` in 48 and from `repRowOfTyStruct` in 59: the type finds a row for a variant
    arm (`Circle | null`) the spelling does not, picks a twin row, and finds none for a
    literal-field shape.
  - Left: the 3 renders. `internJoinedRecordRow`, `mintUnionFieldObjRow` and `internArmShapeRow`
    key the shape interner, which interns by spelling (D34 also withholds the arm's type).
    `mintUnionFieldObjRow`'s `structIndexOfTypeName(nm) < 0` test differs from `structRowOfTy` in
    14 files and from `repRowOfTyStruct` in 6, so not even its decision moves.
  - Left: the 6 parses in `mvValNamesCompat` and `shapeFieldTypeCompatK`, inside the name-keyed
    resolver. They go with `structIndexOfTypeName`, not one by one.
  - Banked, nothing retired: the callers that hold the shape's type ask the field-set scan over
    field TYPES. `structIndexOfTypeNameTy(name, ty)` is the declared-name lookup, then, for a
    whole-span shape whose type is a record, `joinRowScanOfTy` (memoised per type and
    generation). `mvValArmOfShapeTy` is the variant twin, scanning arms with `jrFieldFitsAt`.
    - Moved: 16 sites. `emit_sig_tokens`: `letAnnIsUninternedShape`, `annParamKindTy` (2),
      `annRetKindTy`. `emit_classify`: 5 annotation and node finds, among them the covered
      member's row in the union-member walk. `emit_ref_list_kinds`: `letAnnStructIdx`.
      `emit_union_atoms`: the map-value struct row and 3 arm finds. `mvValKindOfNameTy`: its
      struct rung and its arm rung.
    - Probe: old and new answers side by side at every moved site, over the self-compile and
      16,762 files, with a control that trips in 2,533. All agree but 7 files, and each of
      those builds the same module bytes and output on the master seed and the candidate.
    - Done: a shape with a literal-union field takes the typed scan too (`jrHasLitUnionField`
      is gone). `jrWantOf` codes an alias or lone-literal field as the atom (code 0), as the
      declared row does, and an inline set as the string slot. A probe over the self-compile and
      16,880 files found the typed and name answers differ in 7 files, each building the same
      module bytes and output on the master seed and the candidate.
      `closures/generic-returned-record-param.vl`, the control, trips with the guard removed
      and the old coding.
    - Both scans now refuse, for a string-literal or literal-union field, a code-0 or code-3
      row whose own field type is known and is neither (`rowFieldTakesLit`). A 36-cell
      literal-union-field matrix found 12 cells where an inline `{k: K}` or `{k: "z"}` adopted a
      declared `{k: string}` or `{k: i32}` row (D11030, present on master): 24 to 36 run.
    - Left, measured: `mintUnionFieldObjRow`'s test. The typed scan answers differently from
      the name in 12 files and changes the mint decision in 7. Converting it moved
      `generics/gradual-type-parameter-union.vl` from runs to `field access receiver is not a
      struct`, and changed the module in 4 more files with the same output. The mint keys the
      shape interner by spelling, so it waits for rows minted from types.
    - Left: 39 plain `structIndexOfTypeName` and `variantIndexOfTypeName` calls, most holding
      only a spelling (element, member and variant names, shape-text walkers). Not probed:
      `emit_collect`'s function-return rung, which renders a `TyObj` it holds with `tyToStr`,
      and the 4 in `emit_mono`, which this step did not touch.
    - Reach after the change, in files of the same 16,762: `shapeFieldTypeCompatK` 3,042 to
      691, and its map-value query (`mvValNamesCompat` with no type) 262 to 12. The
      self-compile reaches the first 918 times, down from 4,064, and the second 0 times,
      down from 74.
- **D7.** `narrowVariants` banks a type for multi-member sets, where `narrowSlotTy` is `-1` today.

  No new column was needed for the two sites that moved: the slot's member set already holds the
  member types. A probe compared the spelling with the type at each reader, over the self-compile
  and 16,803 fixture and corpus files. Counts are files.
  - Done: 2 parses. `narrowedNulStructArm` asks `narrowSlotNulArmTy`, the non-null member of an
    `X | null` slot. It was reached in 769 files and differed in 0. `narrowedRefArrayOf`'s second
    rung asks `tyIsRefArray` of the banked type. It was reached in 1,180 files and differed in 0.
    The render it returns is the row's name, so it moves to B.
  - Banked, nothing retired: the two niche narrows in `pushIndexNicheNarrow` now push the peeled
    element type beside the spelling. This closes the first rung's no-type leg: 976 of the
    2,002 reaching files have no banked type, and the old answer is "" in all of them. All 16,451
    identity files compile exactly as before.
  - Done: 1 parse, and the render that had moved to B. `narrowedRefArrayOf` became
    `narrowedIsRefArray`, a boolean. Every caller only compared the returned name with `""`, so
    no consumer needed a spelling or a row name. It answers from the banked type alone. A
    second probe (2026-10-23) ran over the self-compile and 16,879 files: `tests/**/*.vl` plus
    the distilled `cells/` and `named/`. The function was reached in 2,017 files and the
    boolean differed from the old name test in 0. The self-compile reached it 221 times.
  - Done: 1 parse. `setAtomSpelling` is deleted. The struct complement subtracts the spelling the
    receiver resolves to. When neither that spelling nor `msSubTy` clears a member, a third rung
    in `pushNarrowComplement` does. `msSubTyAlike` clears the first record or list member that
    `tyEqSoftLits` calls equal to the tested type. The site was reached in 1,269 files. The
    resolved spelling differs from `setAtomSpelling`'s in 6 of them.
    - Without the new rung, the pushed set differs in 2 files. This was the control. In
      `nullable-value-map.vl`, `{f:K1[]}` is tested against a set row spelled `{f:K0[]}`. In
      `rolled-unrolled-arm-one-tag.vl`, a rolled arm is tested against its unrolled member.
    - With the rung, the set differs in 0 files. The rung fires only in those 2.
    - The rung is gated to records and lists. Ungated, `tyEqSoftLits` matched a literal test
      (`is "a"`) to its base-scalar member, and the set differed in at least 15 files. Across all other `pushNarrowComplement` callers, the rung
      fires in 0 files.
  - Done: 2 parses. The niche producers stop writing a spelling. `pushIndexNicheNarrow` pushes
    the marker `NARROW_TYPED` beside the banked peeled type for a nullable ref-array cell and a
    nullable scalar-list cell, and `indexElemNulRefArrayName` is deleted. Its gate in
    `refListElemNameOfIndex` tests the slot. Every `narrowVariantFor` reader was classified
    (below), and no reader of a niche slot needs its text: they test presence, or read the
    banked type (`narrowedIsRefArray`).
    - A probe over the self-compile and 16,620 files compared the old spelling with the banked
      type's rendering, and the old gate with the slot test. The ref-array leg was reached in
      19 files, the scalar-list leg in 6, and the gate in 224. All three differed in 0, and no
      reach had a -1 type.
    - The identity sweep is the instrument that shows the text is unread. With all four typed
      producers writing a placeholder, 9 files of 16,508 differed. With only the niche
      producers writing it, 0 differed.
  - Done: 1 render. `pushIndexMapNullNarrow` pushes `NARROW_TYPED` beside the value type and
    the union's set id (`msSetOfTy`). Its four member-set readers take a typed slot's set
    first: `pushIndexMapComplement` asks `msIsValueUnion`, `pushNarrowLess` subtracts with
    `msRemoveAtomId` and pushes the survivor's set, `indexCellCurSlot` counts the set
    (`msMemberCount`, new), and `printNarrowKeepsBox` / `printNarrowLiveAtoms` read the set.
    - A probe over the self-compile and 16,622 files compared each old text answer with the
      set's answer, 0 uncompared. The producer-side set, count, gate and atom answers agreed in
      all 13 files that reached them. The value-union and null tests disagreed only in the
      control, `tests/cases/maps/narrowed-alias-union-value-print.vl` (20 events): over alias
      `U` the text test reads `isValueUnionName("U")` false while the set is a value union.
      The print readers were reached in 1 file and agreed; the complement, less and cell
      readers were reached in 0.
    - Identity sweep with the typed producer: 16,509 files, 11,651 built, 0 differ.
  - Left: one producer whose text readers still read, and one retired below.
    - `litElseSurvName`'s render. With a placeholder for the value-atom arm, 0 of 16,509
      files differ, but the closure survivor still reads the text:
      `tests/cases/literal-unions/else-survivor-non-literal-arm.vl` (new; the sweep population
      had no such case) fails with `call to unknown function`, through `narrowedValueAtomOf`
      → `narrowedClosureOf` → `annSigKeyTy`. With a placeholder for the whole render, 3 files
      lose their struct row (`field access receiver is not a struct`): `variantIndexOf` in
      `emit_atom_kinds`, `memberIsClosure` and `emitNarrowedMem` read it as a row identity.
      It moves when those ask `variantRowOfTy(narrowSlotTy(i))` first, and the closure reader
      takes the slot's type.
      - Measured 2026-10-23: the closure reader cannot take the type without
        `narrowedValueAtomOf` (`emit_start_block`) answering from the type too. With
        `identIsBoundClosure`, `exprIsClosure` and the callee's signature key reading the
        slot's type, the new case gets past `call to unknown function` and then builds invalid
        wasm, because the ident read's unbox in `wasmEmit` asks `valueAtomKind` and
        `unionSetHasAtom` of `narrowedValueAtomOf`'s spelling. The "an atom kind" readers
        below have to take a kind or a type first. `emit_start_block` was the D5 lane's.
    - Retired: `removeAtomFromGo`'s spelling fallback. Before this, `removeAtomRestOf`
      reached it in 74 files, where the complement had no member-set id, and it changed the
      spelling in 55 of them. A typed slot no longer reached it (`pushNarrowLess`'s typed arm).
      - Done: `mvUnionIsScalarNull`'s tail takes the non-`null` atom of its two-member set
        instead of subtracting `null` from the spelling, so `removeAtomRestOf` is the
        fallback's one caller. Identity sweep: 0 differ.
      - Callers, from a probe tagged per call site over the same 74 files. Counts are files
        that reach the fallback, then files where it changes the spelling: `narrowIsElse`'s
        struct-complement ident arm 32 / 15, its value-union ident arm 29 / 29,
        `narrowValueNonNull` 5 / 4, `narrowStructNonNull` 4 / 3, `narrowIsElseIndex` 4 / 4,
        `narrowIsElseMember` 3 / 2, `pushIndexMapComplement` 1 / 1, and `emit_ty_canon`'s
        `indexCellCurSlot` 1 / 0. The other 14 tagged call sites, `wasmEmit`'s four among
        them, reach it in 0.
      - Why there is no id: the set ADT is a mask over a union ROW, and these sets have none.
        Most are value unions and list unions an instance result or join produced
        (`i32|string`, `i32[]|i32`, `string[]|i32[]`). Neither the declared type nor the
        node's type has a row by key (`unRowOfKey` is -1), and neither does `X|null` over a
        scalar or a record union. The rest are slots pushed without a set, which then
        subtract again (`i32`, `f64`, `{v:i32}|{w:string}`).
      - Done: the fallback is deleted (`removeAtomFromGo`, `removeAtomFrom` and their memo).
        `msSetOfTyAny` answers for every type: a registered row's set when a row carries the
        key, else a row-less set over the type's own members as `canonUnionMembersInto`
        spells them (one member for a type that is no union), never reordered or deduplicated.
        A row-less set stores row `-2 - k` for slice `k`, so it never lends a box tag. The
        callers pass the type they hold (the slot's banked type, the declared union type, or
        the node's type). When no key covers the spelling, `removeAtomRestOf` renders that set
        less the removed atom. The id stays key-only (`removeAtomIdOf`), so a set built from a
        type is never banked on the narrowing stack: its row need not be the row the rendering
        names.
      - Probe, over 16,621 files and the self-compile, 0 uncompared, with the control
        `tests/cases/unions/generic-join-record-pin-is-arm.vl`. Files, then events:

        | Caller | Files agree / disagree | Events agree / disagree |
        | --- | --- | --- |
        | `narrowIsElse` value-union arm | 29 / 0 | 109 / 0 |
        | `narrowIsElse` struct-complement arm | 14 / 6 of 17 | 70 / 25 |
        | `narrowValueNonNull` | 4 / 0 | 19 / 0 |
        | `narrowStructNonNull` | 2 / 1 | 13 / 8 |
        | `narrowIsElseIndex` | 4 / 0 | 21 / 0 |
        | `narrowIsElseMember` | 3 / 0 | 4 / 0 |
        | `pushIndexMapComplement` | 0 / 1 | 0 / 2 |
        | `indexCellCurSlot` | 1 / 0 | 8 / 0 |

        No caller reached the subtraction without a type. The disagreements: a record union
        spelled structurally where the old text was nominal (`P` / `{x:i32}`,
        `{v:i32}|{w:string}` / `A|B`); in `else-complement-after-then-call.vl`, `string`
        where the text kept `string|null` that an outer `!= null` had already removed; and an
        `is` whose removed atom is spelled apart from the slice's atom (old `i32`, new
        `Err|i32`), where the new path declines and keeps the set. Identity sweep on 08819f550:
        0 of 16,511 files differ, so no disagreement changes a module.
      - The callers that passed no type were reached in 0 of those files and are reachable
        outside them. With the fallback deleted and those callers untyped, the filed witness
        D3151 refused: its write `c = null` then `c = 4` subtracts `null` from `i32|null`
        through `pgAssignIdentNarrow`. Every caller of `removeAtomRestOf` and
        `removeAtomFromSet` now passes a type, and
        `tests/cases/unions/narrowed-null-reassign-subtracts.vl` holds the witness. Its
        member-field face is an older master defect, filed as D11160.
  - `narrowedMapOf`'s render is the mv slot's key, so it goes with D8. `emit_mv_slots`' `cnVariant`
    copies the text too; that file is the shape-row lane's.

  The `narrowVariantFor` readers, by what they need from the slot:

  | Need | Readers |
  | --- | --- |
  | presence, or the `null` pin | `indexPlaceNonNull`, `refListElemNameOfIndex`, `nullPinnedKey`, `narrowedToNullKey`, `narrowExcludesNull`, `narrowDropsNull`, `narrowedIsRefArray`, `emit_fn_ret_kinds`, `memIsNarrowed`, `wasmEmit`'s null test |
  | an atom kind | the four `valueAtomKind(narrowVariantFor(..))` tests in `emit_classify`, the `string` test, `nameIsNulStrList`, `narrowedValueAtomOf` and its closure case |
  | a row identity | `variantIndexOf` in `emit_atom_kinds`, `memberIsClosure`, `emitNarrowedMem` |
  | a member set | `currentNarrowSetAt`, `currentStructNarrowSetAt`, `narrowSlotAtomsInto`, `printNarrowKeepsBox`, `printNarrowLiveAtoms`, `indexCellCurSet`, `indexCellCurSlot`, `pushIndexStructComplement`, `pushIndexMapComplement`, `pushIndexMapNullNarrow`, the `narrowIsElse` readers, `forInElemKind`, `njMembersOf`, `njBoxHoldsNull`, `narrowedNicheAtomOf`, `narrowedNulLitAlias` |
  | real text | none |
- **D8.** The mv-slot, closure-signature and field-companion tables are keyed by type. The
  `emit_classify` arm mint withholds its type on purpose (D34), so that entry moves only together
  with the ruling that requires it.

  A probe compared the spelling with the type at nine sites, over the self-compile and 16,803
  fixture and corpus files. Counts are files.
  - Done: 3 parses. `annRetKindTy`'s closure rung asks whether the type is a `TyFunc`: reached in
    2,769 files, differed in 0. `fnRetNulRefArrayNameSid` reads the return type and names the
    element's ref-list row: 5,248 and 0. Outside that population it closes D3508, where the
    spelling `Rec2[] | Rec[] | null` hid that the type is one nullable list. `emitArrRef`'s variant fallback asks `variantRowOfTy` of
    the slot's element type: 398 and 0.
  - Done: the arrow scans in `annParamKindTy` and `annIsTopLevelFunc` ask whether the type is a
    `TyFunc`. A parenthesized function spelling, `((i32,i32)=>i32)`, read as no function while
    its type is one, in 4 and 8 files. Neither answer reached the module: difftree --identity
    found 0 of 16,460 files differ. A user-written parenthesized annotation keeps its tree and
    already ran.
  - Left: the field companion. `sFieldElemTyIx` already banks its type, but the readers key by
    the name. `anonFieldElemName`'s inline arm returns a member set in 0 of 16,715 files.
    `memReadBoxNames` is reached in 1,089, and its render is not the member-set text in 421.
    Comparing member-set ids there decides differently in 166.
  - Left: `annRefListSlot`. `rlSlotOfTy` misses the slot the spelling finds in 72 files at the
    parameter call and 6 at the result call: nested ref lists, lists of map-valued records, and
    inline records the spelling adopts. That waits on D1.
  - Left: the two closure-signature keys in `emit_collect`. The key agrees with `sigKeyOfTy`
    everywhere but one generic template, and there `nulCloMixedUnionUnregistered` rejects the
    atom by its spelling. The guard and the result spine's whole-span disjunct still read it.
  - Left, not probed: the products. These are the signature-ladder
    renders, the mv mint key in `mvShapeOfMapNameTys`, `cloArmTagOfTy`'s render, which the link
    step reads as the `clo:` key, and the two D34 entries. The mv slot stays keyed by spelling,
    so D2's `mvValKindOfName` callers do not move with it.
  - Banked, nothing retired: the map-value slot's kind questions take the type where the caller
    holds one. `mvSlotOfValNameFindK`, the entry side of `mvValNamesCompat` and
    `objMapFieldCompat` pass the value's arena type to `mvValKindOfNameTy`.
    `funcTypeShapeLowerable` asks `mapTyValKindLowerable` of the field type when the walk has
    one: 56 reaches, 0 differ, and the spelling leg is reached in no file. `fieldCodeOfSpelling`'s
    nullable-map arm also reads a node-less caller's `fty`: 26 reaches in 6 files, 0 differ.
    A probe over the self-compile and 16,763 files compared the spelling and the type at the
    three `nameIsRefArray` rungs. Lines 447 and 698 agree wherever they are reached (3 and 23
    files), always with a type. Line 742 disagrees in 8 files, where the spelling is `""`.
    Switching it there fails 7 of them at run time and traps the compiler on the eighth. All
    16,500 identity files compile exactly as before.
  - Banked, nothing retired: the third `nameIsRefArray` rung asks the type first, and every
    map-value slot find passes one where its caller holds it.
    - `mvValIsRefList` answers `tyIsRefArray(ty) && tyEmitNameNonEmpty(ty) != 0` when it has a
      type. The 8 `""` files are lists whose type has no emitter name, and they stay
      unsupported as before. Over the self-compile and the same population, the typed answer
      differs from the spelling in 1 file: a generic template's `((T)=>void)[]` value
      (`generic-function-stored-through-parameter-inferred-local-and-map.vl`) no longer mints a
      slot. Its module loses one unused type, its disassembly is otherwise identical, and the
      output is the same on the master seed and the candidate. difftree --identity: 11,643
      built, that 1 differs.
    - `mvSlotOfMapName`, `mvSlotOfMapValNameOrMono` and `mvSlotOfMapValNameOrMonoK` are gone.
      Their callers, the four slot wrappers and `jrMapValFits`, pass `tyMapValOf` of the banked
      slot type or the field's type. `mvValNamesCompat` passes both sides' types to the slot
      find too.
    - Untyped reaches of `mvValKindOfNameTy`, in files, after the change: `shapeFieldTypeCompatK`'s
      query spelling 77 (the self-compile among them), the arm mint with `kindTy` -1 47,
      map-name finds whose caller banked no type 8 (`(i32)=>i32` index-hook maps, `{x: i32}`),
      `mapValKindLowerable` 4, `mvValInnerMvSlot` with no `mvValTyIx` 1.
  - Plan for the map-value slot, revised.
    1. Done: the `""` values are asked of the type (`mvValIsRefList`).
    2. Relabelled. The plan's "row side" already passed `elemTy`, and the probe reached it
       untyped in 0 files. The untyped side is the QUERY: `shapeFieldTypeCompatK` compares a
       field type cut from a shape-text spelling by `shapeFieldParse`, inside the name-keyed
       resolvers `structIndexOfTypeName` and `variantIndexOfShapeK`. It holds no type by
       construction, and gets one only when those resolvers' callers move to the typed scan
       (`jrFieldFits`). That is the largest group, 77 files.

       Partly done (D6, `structIndexOfTypeNameTy`): the callers that hold the shape's type
       moved. The untyped map-value query is now reached in 12 files, down from 262, and not
       by the self-compile; the 12 are not yet attributed to a caller. Shapes with a
       literal-union field moved too (D11030's PR). Untyped `mvValKindOfNameTy` reaches remain
       in 75 files, so none of C5's spelling tests, D8's map-value rungs, A1's
       `mapValKindLowerable`, C4's field-code arms or `mvValKindOfName` retire yet;
       `fieldCodeOfSpelling`'s spelling legs are still reached with no type.

       Partly done (map-value producers): 75 files down to 37, over 16,620 files, with the
       control (`unions/anon-arm-map-value.vl`, 98 typed events) tripping. difftree
       --identity: 11,651 built, 0 differ. Nothing retires, because the name leg is still
       reached. The moves, by caller tag, with files untyped before and after:

       | caller | before | after | how |
       | --- | --- | --- | --- |
       | `forceCloResultMapTypes` result mint | 18 | 0 | `collectATypeRef` passes the node type; the closure arm's `TyFunc` gives the result map's value |
       | `ensureRefElemKindTail` map-element mint | 13 | 1 | `ensureRefElemTys` holds the classifying type apart from the key hint, so the literal side and `forceCloListTypeOf` hand over the element type and keep the key unhinted |
       | `mvShapeOfMapNodeTy` hole value | 10 | 0 | an unconstrained `Map()` value answers `-3` from `nodeMapValTyIx` < 0; 10 of 10 files agreed with the name answer |
       | `objMapFieldCompat` hole value | 6 | 0 | the same guard answers true; 6 of 6 files agreed |

       Partly done (map-value producers, second slice): 37 files down to 7, over 16,621
       files, with the control tripping (98 typed events). difftree --identity: 11,652 built,
       7 differ, each dropping one unused function type (the `>m` signature key an index-hook
       record `{"[]": ...}` minted); run output is identical on both seeds. Nothing retires,
       because the name leg is still reached. By caller tag, files untyped before and after:

       | caller | before | after | how |
       | --- | --- | --- | --- |
       | `synthTypeRefTy` pin, through `structIndexOfTypeName` | 7 | 0 | `pinKindOfNameTy` asks the typed row scan |
       | `paramStructIndexRaw` | 1 | 0 | passes the parameter's node type outside a generic original |
       | `collectATypeRef` orphaned TypeRefs | 7 | 1 | a node with no arena type mints nothing; its owner's field-table pass mints it |
       | `annRetKindTy` map arm | 7 | 0 | `annRetIsBareMap` asks `TyMap` of the type, so an index-hook record is not a map |
       | union map arm, uncovered row (`mapReadMvSlot`) | 4 | 0 | `unionMapArmValTyOf` reads the receiver's own type |
       | `mvShapeOfValNameRowTy` hole row | 4 | 0 | an empty value name with a hole row answers `-3` |
       | `mvValInnerMvSlot` on `i64}\|nul` | 1 | 0 | the inner-slot reader peels a nullable map (the former `mvValNulInnerMvSlot`) |

       Left, by file:
       - `generics/pin-nullable-set-and-literal-map-is.vl`: `collectATypeRef`'s map-name arm
         with an `i32` value and no node type.
       - `closures/closure-result-array-of-map-closure-field-structs.vl`,
         `closures/closure-struct-elem-list-map-fields.vl`: D2's ref-list ladder
         (`forceCloListTypeOf` → `nameIsRefArray` → `refArrElemNameGo` →
         `structIndexOfTypeName`).
       - `generics/anon-record-arg-to-record-pattern.vl`: `monoStructAnnName` (C1's lane).
       - `literal-unions/coalesce-map-read-joins-atom.vl`: `mintUnionFieldObjRow`. A typed scan
         there disagreed with the name answer in 12 files; not taken.
       - `arrays/array-new-generic-pin-element-grid.vl`: `ensureRefElemKindTail` in a mono
         instance whose fill is a `TyVar` (C1's pin types).
       - `maps/map-value-layout-twin-heap-merge.vl`: `nameFieldCodeTy` through the arm mint
         `internInlineShapeFieldsTy(..., -1, aty)`. Passing the field types there disagreed in
         52 files (`-1` became 16); not taken.
    3. Done: the slot finds pass a type. 8 files still have none, because their caller banked
       no `mvValTyIx`/`rlElemTyIx`.
    4. Thread `fty` through the 4 files where `nameFieldCode` passes -1. Its callers are in
       `emit_collect` and `emit_shape_intern`.
    5. Done (mv slot types): `mvShapeOfValNameArmTyGo` classifies a caller with no type by the
       type the slot banks (`mvValTyIxOfNameRow` of the value name and row), so the kind and
       the key agree. Its no-type reach was 2 files by then (14 reaches,
       `generics/pin-nullable-set-and-literal-map-is.vl` and
       `arrays/array-new-generic-pin-element-grid.vl`) and is 0 now. difftree --identity:
       11,665 built, 0 differ, fixpoint identical.

    Mv slot types, measured over the self-compile and 16,634 files: every mv slot banks a type
    at its mint (10,486 mints in 2,329 files, 0 with `mvValTyIx` -1), and every slot read
    through `mvSlotNullable` and `mvValTwinCanonId` is typed (32,322 reaches, 0 untyped). The
    readers left with no type are queries, not slots:
    - `mvValNamesCompat`'s value name cut from shape text by `shapeFieldElemName`, and the
      `mvSlotOfMapValNameOrMonoKTys` find it feeds: 4 files, 19 reaches (the step 2 query;
      the four files in "Left, by file" other than the two step 5 closed and the arm mint).
    - `mapValKindLowerable` under the D34 arm mint: 1 file, 5 reaches.

    So no parse retires yet. `nulMapInnerName` and the mv mint key in `mvShapeOfMapNameTys`
    stay too: the first is a string utility with name-only callers, and the slot is still found
    and minted under the spelling. The two typed rungs of `mvValKindOfNameTy` that disagree with
    the spelling are the next deliberate change, each a rep change rather than a refactor:
    - the function rung: in 31 files (2,465 reaches) a hole or generic fn value arrives spelled
      with grouping parens (`((i32)=>i32)`), the arrow scan misses it and the call answers
      unsupported, while `tyIsFuncArena` answers a closure fat-pointer vals list (kind 14).
      Switching finds or mints a closure slot under the grouped spelling, a second slot unless
      `mvCanonValNameTy` folds the parens first;
    - the literal-union rung: in `maps/one-literal-map-value-delivery.vl` the spelling
      `"circle"` says atom (the mono i32 map) where canon has softened the type to `string` (a
      string vals list), and the other way in 6 reaches. Switching moves that map's vals
      between the two reps, so the producer that softens the type moves first (D7446 says the
      value is the atom).

    After steps 2 and 4 and the arm mint, nothing calls `mvValKindOfNameTy` without a type.
    The three rungs, `mapValKindLowerable` and `mvValKindOfName` can then go. That retires the
    D2 entries at 450, 709 and 649 and the A1 entry at 469. Keying `mvValName` by type, and the
    mint key in `mvShapeOfMapNameTys`, come after that.

**Order.** The five A slices and C4 can start today. C1 waits on L1's bind columns. D1 and D2
come before C3, because C3's walkers feed the ref-list slots. D3 and D4 share the pin seam, and D4 lands after D3 and D5.

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
- **`monoNicheNulListCheck` (A)** assumes the typed binding reaches it. A control has to show
  that.
- **`unionHasCollapsedStringMapArm` (A)** is dead according to its own comment. Whether it is dead
  has not been measured; if it is, the slice deletes it rather than retyping it.
- **`pushIndexMapComplement` (D)** may be an A that an A/B can move without the registry.
- **The census is blind to other parsers.** It counts eleven callees. A spelling parsed by any
  other helper, such as `strContains`, `mapSpellKeyName` or `strIndexOf` on a rendered type, is
  invisible to it. Reaching the floor means these eleven callees are retired, not that the emitter
  is spelling-free.
