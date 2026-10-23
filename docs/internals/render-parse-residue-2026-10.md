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
| A1 | shape-row typed twins | 14 | 14 / 0 / 0 | 0 / 14 | `emit_shape_rows` (callers in `emit_classify`, `emit_collect`, `emit_nullable_rets`, `emit_sig_tokens`) |
| A2 | emit_mono typed tests (landed: 3 retired, 1 to B, 5 left) | 5 | 2 / 3 / 0 | 0 / 5 | `emit_mono` |
| A3 | emit_collect / emit_classify typed rungs (landed: 7 retired, 5 left) | 12 | 11 / 1 / 0 | 0 / 12 | `emit_classify`, `emit_collect` |
| A4 | nominal and signature-key twins (landed: 2 retired, 1 to B, 6 left) | 9 | 9 / 0 / 0 | 2 / 7 | `emit_rewrite`, `emit_sig_tokens` |
| A5 | union-atom and atom-kind twins (landed: 4 retired, 3 deferred to after C1, 5 left) | 12 | 12 / 0 / 0 | 3 / 9 | `emit_atom_kinds`, `emit_base`, `emit_nullable_rets`, `emit_union_atoms`, `wasmEmit` |
| C1 | mono walkers bind by type (L1) (landed: 5 retired, 12 left) | 17 | 0 / 17 / 0 | 0 / 17 | `emit_base` |
| C2 | instance cell signatures typed (attempted; waits on C1) | 5 | 0 / 4 / 1 | 1 / 4 | `emit_mono` |
| C3 | shape-intern walkers take field types (landed: 4 retired, 12 left) | 16 | 2 / 14 / 0 | 1 / 15 | `emit_shape_intern` |
| C4 | shape-text field callers thread a type (landed: 4 retired, 5 left) | 9 | 0 / 9 / 0 | 1 / 8 | `emit_field_codes`, `emit_shape_rows` |
| C5 | name-only gates in emit_base and emit_collect (landed: 4 retired, 13 left) | 17 | 0 / 17 / 0 | 0 / 17 | `emit_base`, `emit_collect` |
| D1 | ref-list slot keyed by type (landed: 10 retired, 20 left) | 30 | 0 / 1 / 29 | 4 / 26 | `emit_base`, `emit_classify`, `emit_collect`, `emit_union_atoms` |
| D2 | ref-list kind ladder by type (landed: 7 retired, 15 left) | 22 | 0 / 0 / 22 | 0 / 22 | `emit_collect`, `emit_shape_rows` |
| D3 | mono instance keyed by pin type (landed: key by type, 1 retired, 22 wait on C1 step 3) | 23 | 0 / 0 / 23 | 15 / 8 | `emit_mono`, `emit_rewrite` |
| D4 | narrowed pins and pin unions (probed: blocked on D3 and D5) | 11 | 0 / 0 / 11 | 8 / 3 | `emit_mono` |
| D5 | union registry by type (step 5 remainder) (landed: 6 retired, 15 left) | 21 | 1 / 0 / 20 | 12 / 9 | `emit_anon_fields`, `emit_base`, `emit_classify`, `emit_closure_sites`, `emit_collect`, `emit_obj_lit_fits`, `emit_rep`, `emit_rewrite`, `emit_sections`, `emit_shape_intern`, `emit_start_block`, `emit_union_registry`, `wasmEmit` |
| D6 | struct and variant rows of inline shapes by type (landed: 2 retired, 10 left) | 10 | 0 / 0 / 10 | 3 / 7 | `emit_classify`, `emit_collect`, `emit_shape_rows` |
| D7 | narrowing store banks a type (landed: 2 retired, 1 to B, 8 left) | 11 | 0 / 1 / 10 | 4 / 7 | `emit_base`, `emit_classify`, `emit_shape_rows`, `emit_sig_tokens`, `emit_start_block`, `emit_ty_canon` |
| D8 | mv, closure-sig and field-companion slots by type (landed: 5 retired, 13 left) | 18 | 0 / 4 / 14 | 5 / 13 | `emit_classify`, `emit_collect`, `emit_map_value_slots`, `emit_mv_slots`, `emit_obj_lit_fits`, `emit_shape_intern`, `emit_sig_tokens`, `emit_union_atoms`, `wasmEmit` |

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
- **A4.** `resolveShapeToNominal` on a rendered type becomes `shapeNominalOfTy`. The
  signature-key sites that still render read `sigKeyOfTy`, which needs widening to cover them.
  Landed for 2 parses: `cboxElemName` tests `TyArray`, and `recordedParamPinName`'s nullable
  arm resolves under the null on the arena, which moves its render to B. The arena names two
  witnesses' `{r:i32}|null` pin `Circle|null` where the name path did not, with the emitted
  wasm byte-identical over every `tests/**/*.vl` and the distilled corpus. The other 6 stay,
  and each row's `next` says why: `listUnionEmitName` renders a scalar list member as its
  product, `resolveShapeToNominal` keeps `setAtomSpelling` as a name caller, and the four
  signature-key parses serve callers in `emit_collect`, `emit_classify` and `emit_lit_atoms`
  that pass no type.
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
- **C2.** Attempted and not converted. A probe found `expTy` at `-1` on hundreds of fixture
  sites whose cell spelling is a function type. Every producer of that spelling is text
  (`monoSlotSig`, `monoSubstAnn`, `monoSlotPinName`, `monoSeedCallSig`), so the change cannot
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
  - Left: 12. Four reach with no type: `internShapeArms` in 264 files, and
    `shapeFieldsRideTyParam`'s three in 201 (its nullable peel also differs in 1). Three
    differ: `internShapeDeepTy`'s paren-closure and nullable peels in 206 and 234 files, and
    `internFuncTypeShapesTy`'s nullable peel in 11. `internShapeDeepTy`'s arrow test agrees but
    1 file has no type. The other four produce a name the walk keys: the `internShapeDeepOfTy`
    render, the arm split (2 files differ), the map-value name (1 differs), and
    `structElemArrayLowerable`'s base name.
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
  and the 96 reached with no type answered false by spelling too. The other 5 stay. The three
  `fieldCodeOfSpelling` and `nameFieldCode` arms still reach with no type in 2,290 to 4,230
  files, mostly from `shapeFieldTypeCompatK` and `nameFieldCodeTy` called with -1. Rung 3 of
  `rlSlotByNameTyK` differs from its arena twin in 47 files, in both directions.
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
  - Left: `nameIsNulClosure`. Only `nameFieldCode` (3 files) still holds only a name.
  - Left, not probed: the niche ladders, the name-grammar tests and the spelling walkers. Their
    callers hold only a name.
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
  - Left: the value-union name readers in `emit_start_block` and `unionNameOfExpr`. The key text
    differs from the render in 13 files at `coalesceResultUnionName`, 10 at `ifJoinUnionName`
    and 12 at `valueUnionRenderOfTy`, mostly a union the arena does not call a value union
    (`i64|i32` with a literal member) and holes. The type-keyed row's name differs more, because
    a row's member order is its first mint's. `ifJoinUnionNameIn` agrees in all 5 files at its
    value-union rung, but its nullable-box fallback returns the render, which no file reaches.
  - Done: 1 render. `anonUnionFieldName` names a value-union field by `valueUnionKeyTextOfTy`,
    which agreed with the render in all 72 file and union pairs that reach it. A record or list
    field takes the name of the row `unRowOfKey`, `unRowOfCanon` or the softened key finds.
    difftree `--identity` found 0 of 16,486 files differ. A string field no longer reads as a
    union where a one-literal string alias registered a row that the set text `string` finds, so
    it stores the string directly instead of in a box.
  - Left: `scanPrintUse` adopts a row by the spelling `{v:i32}|{w:string}|null` in 1 file
    (`as-opt-record-union-field-read.vl`), and the key text does not name it. Readers look that
    spelling up by name 103 times, and `{v:i32}|{v:string}|null` 119 times. Without the binding,
    `u.w` refuses. The call retires along with those readers. `unionNameOfExpr` agrees at the
    value-union rung, but its record rung still returns the render (9 files differ).
  - Left: the atom tests. `isVariantBoxUnionAtoms`, `unionStrArmCountOf` and the uncovered-row
    fallback of `markRefArrayArmsOf` need the spelling where an atom has no arena type (69, 25
    and 1 files). `pushIndexMapComplement` differs at literal-alias members in 4 files (D8120).
  - Done: 2 renders. `cloCallParamUnionName` no longer has a render rung: past the alias and
    nominal rungs the lifted lambda's own pin answers. 5 files reach the old rung, all with an
    empty render that already fell through to that pin. `njStash` names the union by
    `valueUnionKeyTextOfTy`; no file reaches it. About 40 hand-written callee shapes and
    numeric-union operands reached neither with a name. difftree `--identity` found 0 of 16,483
    files differ.
  - Left, not probed: `shareFieldUnionRow` (the render is the registered key), and the
    registry's own `recordUnMemTys`, `unionSetAtomsOf` and `unionSetMemberCount`, which go
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
  - Left: `narrowedRefArrayOf`'s first rung. With a type, returning the spelling still differs in
    4 files, where it is an alias the program wrote (`VArr`, `JsonArr`) or `(readonly i32[])[]`.
    Both typed renderings do worse: `tyToEmitName` differs in 46 files, because a record renders
    by shape, and the ref-list row name differs in 37.
  - Left: `setAtomSpelling`. The struct narrow set's member-set id does not cover the spelling in
    23 of 87 files, which are generic pins, unions of maps and an alias. In 1 more file, a rolled
    recursive arm, the typed gate answers differently.
  - Left: the producers (`removeAtomFromGo`, `indexElemNulRefArrayName`,
    `pushIndexNicheNarrow`, `pushIndexMapNullNarrow` and `litElseSurvName`). They write the
    spelling that the two readers above and the `narrowVariantFor` callers still read.
    `removeAtomFromGo`'s spelling fallback is live: `removeAtomRestOf` reaches it in 74 files,
    where the complement has no member-set id, and it changes the spelling in 55 of them. `narrowedMapOf`'s render is the mv slot's
    key, so it goes with D8.
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
