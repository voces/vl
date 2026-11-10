# Step 7: the return-kind flag family reads the declared type's rep

Measured 2026-11-10 on master `61d7d912` (#7091). Both seeds are fixpoints (two
`refresh-compiler.sh` runs byte-identical). This is the second queue item after
[2026-11-10-step7-fnmap-annotated-cols](2026-11-10-step7-fnmap-annotated-cols.md): the
annotation readers `emit_nullable_rets.vl` and `emit_base.vl` still exported.

## The shadow

A probe compiler wrapped every reader. On each call it compared the old answer with the rep
answer: `annRepKindOf(node)`, the declared type's `repOfNode(…).rdKind`, for a flag, and
`repSlotOfKind(kind, declared type)` for an index. It logged each disagreement by reader, by
answer pair and by node kind (TypeRef, Param, expression). The population was the self-build
plus the 19,511 programs under `tests/cases`, `distilled/cells` and `distilled/named`.
The 210 hits below are its firing control.

| reader | rep answer | self-build | corpus |
| --- | --- | --- | --- |
| `retNulVariantFlag` | `nulvariant` | 0 | 0 |
| `retRefArrFlag` | `reflist` | 0 | 0 |
| `retNulRefArrFlag` | `nulreflist` | 0 | 0 |
| `retMapFlag` | `map` | 0 | 0 |
| `retNulMapFlag` | `nulmap` | 0 | 0 |
| `retUnionFlag` | `union` | 0 | 0 |
| `retNulListFlag` | `nullist` | 0 | 0 |
| `retNulStringFlag` | `nulstr` | 0 | 0 |
| `retVoidAnnFlag` | declared type is `void` or `never` | 0 | 0 |
| `retNulRefIndex` | `repSlotOfKind("nulstruct", ty)` | 0 | 0 |
| `retVariantFlag` | `variant` | 0 | 134 files: old 0, rep `variant`, TypeRef (133) and Param (1) |
| `retNulRefFlag` | `nulstruct` | 0 | 76 files: old 1, rep `nulvariant`, TypeRef |
| `retStructRowIndex` | `repSlotOfKind("struct", ty)` | 0 | 57 files: both answer a row, different rows, TypeRef |

The two disagreeing flags only ever disagree one way. `retVariantFlag` misses a variant the rep
sees; that is a structural twin of an arm, which `nodeTyIsVariant` does not mark. `retNulRefFlag`
calls a `Dot | null` over a struct that is also an arm's layout twin `nulstruct`, where the rep
says `nulvariant`.

## What moved

- **Eleven readers are deleted, and their callers read the rep kind.** The flags read
  `vtKindOfType(node) == "<kind>"` at each of their callers: `retNulVariantFlag`,
  `retRefArrFlag`, `retNulRefArrFlag`, `retMapFlag`, `retNulMapFlag`, `retUnionFlag`,
  `retNulListFlag`, `retNulStringFlag`, `retVariantFlag` and `retNulRefFlag`. `emit_list_rep.vl`
  sits below `emit_nullable_rets.vl`, so it reads `repOfNode` directly. `retNulRefIndex`'s three
  callers read `annSlotOfKind("nulstruct", node)`, the declared type's `repSlotOfKind`.
- **The disagreeing flags change no output.** All 210 files the shadow named build
  byte-identical, because each disagreeing call sits beside an arm that already answered.
  - `annValtypeSlotOf` and the annotated functype arm already took `retVariantFlag(t) == 1 ||
    kind == "variant"`. By the one-way table above, that is exactly the rep answer, and both now
    read it alone.
  - In `returnArmHeapOf`, the `nulvariant` arm runs first; the `nulstruct` override no longer
    fires over it.
- **`directArgSeedsOf`'s two tests were arms of its own `cpK` ladder.** `vtKindOfParam` is
  `vtKindOfType(parTyNode(p))`. So `nulstr` is an assignment off `cpK`, and the `nulvariant`
  row is `annNulVariantRowOf`, one kind and one read. That keeps the kind-ladder budget where it
  was.
- **Helpers stranded by the deletions are deleted:**
  - `nodeTyIsNulStruct` and `nodeTyIsStructArray` (`check_node_tys.vl`);
  - `annNulRefArrSlot` (`emit_map_value_slots.vl`);
  - `tyIsPlainStructTy` (`check_types.vl`);
  - ten imports.

## What stays, graded

| reader | grade | why |
| --- | --- | --- |
| `retStructRowIndex` | **by design** | A record-annotated function is emitted at this row (`emit_sections.vl`'s annotated functype arm). The column and every slot reader must name the row the signature was emitted at. In 57 corpus files the canonical structural row is a same-shape twin's, so #7009's row does not agree yet. It reads the type once struct rows are keyed by canonical type (D12465's slice). |
| `retVoidAnnFlag` | **kept, now a type read** | No `VKind` is "no result", so the question is the declared type itself: its body reads the recorded type (`void` or `never`). The spelling fallbacks (`tyNameOf(...) == "void"`, `retNeverAnn`) are deleted, and the shadow saw them never decide. |
| `retMapInFlight` | **not a type fact** | It is a re-entrancy guard: whether `inferredRetMapSlot` is already computing function `fe`'s map shape (`retMapFlight` is a push/pop stack of `fnStmts` positions). It reads no node. |
| `retValueExitCount` | **not a type fact** | It counts the value exits a return expression contributes: one, or one per arm of an if-expression. That count is a syntax fact about the expression, read by the union-box sink's eligibility. No type answers it. |

## Proof

- **Byte identity:** every `tests/cases` program built by the master seed and by the
  candidate (`scripts/id-shadow/run.sh --identity`): **7,699 of 7,700 same**, and all 210 of the
  shadow's disagreeing files are the same.
  - The one difference is `closures/hole-fn-generic-map-stored-through-parameter.vl`. Master
    emits one closure functype more, `(func (param structref (ref $map)))`, which nothing in
    its module references. Every other line is the same up to type numbering, so an old
    reader's walk interned a dead signature as a side effect. The program's output is
    unchanged.
- **L1 = L2:** the master seed and the candidate build byte-identical compilers from this tree.
- **Seed:** 6,600,459 → 6,599,564 bytes (−895). `seed-size.vl --check` reads +0.2% against its baseline.
- **Gates:** all pass.
  - rep-fuzz is exact.
  - `lint-self.sh` is clean, the kind-ladder budget included.
  - late demands: 6, the baseline.
  - The dead-export budget is 0, after the four stranded exports were deleted.
  - The render-parse budget is 41 / 79.
  - `cases_wasm_0..3`: 7,408 passed.
  - The inventory refs and rows tests, `budget_pin_helper_test.ts`, `vl_scaling_shape_test.ts`,
    `vl_probe_rollback_test.ts` and `vl_kind_ladder_test.ts`: 107 passed.
  - `check-filed-witnesses --strict` on both inventories: 0 output mismatches.
  - The emitter-state audit: no module-scope `let` is added.
