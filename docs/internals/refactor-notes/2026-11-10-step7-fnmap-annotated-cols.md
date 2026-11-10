# Step 7: `buildFnMap`'s annotated return columns are read off the declared type

Measured 2026-11-10 on master `4e03e7db` (#7082). Both seeds are fixpoints (two
`refresh-compiler.sh` runs byte-identical). The closing census
([2026-11-10-step7-closing-census](2026-11-10-step7-closing-census.md)) graded these columns LEFT.

## What moved

`buildFnMapRowOfRetAnn` used to classify an annotated function's return with one annotation
reader per column. It now reads the declared type, the way #7001 reads an un-annotated
function's columns off its recorded result:

| column | before | after |
| --- | --- | --- |
| `fRetKind` | `vtKindOfType(ann)` | unchanged; it was already `repOfNode(ann).rdKind` |
| `fRetVoid` | `retVoidAnnFlag(ann)`, which has a name fallback | the declared type is `void` or `never` |
| `fRetStructIdx`, struct and nulstruct | `retStructRowIndex(ann)` | unchanged (below) |
| `fRetStructIdx`, variant and nulvariant | `retStructIndex(ann)`, which looks up the name first | `repSlotOfKind(kind, ty)` |
| `fRetStructIdx`, other kinds | `retStructIndex(ann)` | -1 |
| `fRetRArrElem` | `retRefArrElemName(ann)` | the element name of `repSlotOfKind("reflist", ty)`'s row |
| `fRetBool` | `retBoolFlag(ann)`, a scalar-name test | the declared type is `boolean` |

`retStructIndex`, `retRefArrElemName` and `retBoolFlag` had no other callers and are deleted.

The annotation's rows are still minted at the annotation, its first reader (`arrLitMint(ann)`),
ahead of the reads. The old elem reader minted them on its way (`annRefArrSlot`). It did that for
every bare TypeRef annotation and never for a `| null` one, and the new mint keeps exactly that
set. Two wider sets were tried, and each moved the type indices of
`maps/nullable-closure-value-map.vl`:

- every annotation;
- only a `reflist`.

The new code adds no mint on a miss.

## The shadow

The probe compiler ran both answers for every annotated row and logged each disagreement by
column, in both rounds: before mono, and at `buildFnMap#2`. The population was the compiler's
self-build plus the 7,699 programs under `tests/cases`.

| column | disagreements |
| --- | --- |
| void, kind, elem, bool | 0 |
| slot, nulvariant | 179 (the compiler's `BinExpr \| null` among them) |
| slot, variant | 10 |
| slot, struct and nulstruct | 19 |
| slot, i32 | 1, before mono (an open `T`) |

Three things the shadow found along the way:

- **The first elem disagreements were the probe's own order.** The old reader mints the
  annotation's row before it looks. Once the new read also follows the mint, elem agrees
  everywhere.
- **Variant, nulvariant and i32 slots of an annotated function have no reader.** Every reader of
  `fRetStructIdx` is in one of two groups:
  - gated to `fn.fnRet < 0`: `emit_classify.vl:1110`, `inferredRetVariantIdx`, the
    signature-token variant arm, `fRetNulHeapOf`, and the inferred arm of the functype;
  - gated to struct and nulstruct: `fnRetStructIndexSid`, the field-closure row, and the
    field-code collapse.

  The new value is the variant index, the convention the un-annotated half already writes.
- **Struct and nulstruct keep `retStructRowIndex`, by design.** A function annotated with a
  record is emitted at `retStructRowIndex(fn.fnRet)` (`emit_sections.vl`, the annotated
  functype arm). The column has to name the row the signature was emitted at, and that is the
  emitter's own storage. The 19 cells are same-shape twins. The annotation names one row and
  the structural type keys another, for example `Dot` beside an arm of the same shape. They
  read the type once struct rows are keyed by canonical type, which is D12465's slice.

## Proof

- **Byte identity:** every `tests/cases` program was built by the master seed and by the
  candidate, and the wasm compared by sha256. Result: **7,699 of 7,699 identical**.
- **Seed:** 6,598,659 → 6,598,597 bytes (−62). `seed-size.vl --check` reads +0.1% against its baseline.
- **Gates:** all pass.
  - rep-fuzz is exact.
  - `lint-self.sh` passes after `vl fmt -w`. Its arena-scan fall (25 → 24) is in
    `emit_rewrite.vl`, which this change does not touch.
  - late demands: 6, the baseline.
  - The dead-export budget is 0.
  - The render-parse budget is 41 / 82.
  - `cases_wasm_0..3`: 7,407 passed.
  - The inventory refs and rows tests, `budget_pin_helper_test.ts`, `vl_scaling_shape_test.ts`
    and `vl_probe_rollback_test.ts`: 107 passed.
  - `check-filed-witnesses --strict` on both inventories: 4,691 as filed and 0 moved.
  - The emitter-state audit: no module-scope `let` is added.

## What `buildFnMap` still is

- the `fnIndexBySid`/`nestedNameBySid` index;
- the row loop that calls the function above;
- the resume machinery mono arms.

`buildFnMap#2` still runs after `synthVoidTwins`, `synthExternValues` and `synthRecEqCores`,
because those passes add `fnStmts` entries after mono's last resume.
