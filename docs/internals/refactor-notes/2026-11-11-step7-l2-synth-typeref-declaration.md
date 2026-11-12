# Step 7 L2 §7: a synthesized TypeRef records its declaration at mint, 2026-11-11

Lane w319 asked for this. The checker records the declaration an annotation names (`annDeclPos`,
`annUnionDecl`, from `annDeclNote`). It does that only for annotations it resolves. A TypeRef that
the emitter synthesizes reads -1, so its readers (`annDeclVariantRow`) fell back to the spelling.
See `2026-11-11-step7-famb-annot-decl-column.md`.

`synthTypeRefTy` (`emit_nullable_rets.vl`) is the one producer of a TypeRef spelled from a type
the caller holds. It now calls `annDeclNote(n, name, tyIx)`, which writes what the checker would
record for that spelling at that type. The orchestrator chose the producer over the 31 call sites
in emit_mono.

The base is #7234 merged into master, with a fixpoint seed on both sides. The population is the
whole sweep: 23,910 programs.

## Measured

The probe ran in a scratch compiler (#7119's accumulator) at `annDeclVariantRow`. It counted
the nodes that have no recorded declaration but whose spelling names a variant row.

| | programs |
| --- | --- |
| reach `annDeclVariantRow` | 447 |
| a node with no declaration whose spelling names a row, before | 208 |
| the same, after | 155 |

A mono-local variant reached the same 155: it noted only the instance parameter and result
TypeRefs. Of the 155:

- **Inline shapes** (`{r:i32}` in 118 programs, then `{r:boolean}`, `{r:string}` and others)
  account for most. A shape names no declared record, so the shape's own row is the right answer
  and there is nothing to record.
- **About 15 programs** still hold a named record with no declaration (`J` 5, `Circle` 4, `Dot`
  2, `P` 2, `A`, `B`). Every one of those nodes has a type, so it is a TypeRef minted outside
  `synthTypeRefTy`: by `synthTypeRefFb` or a cloned annotation.

## Proof

- **Byte sweep.** The #7234 seed against the candidate fixpoint: 23,910 of 23,910 are the same,
  with 0 bytes-only movers, 0 output movers and 0 runs → not-runs.
- **Locally:**
  - refresh to a fixpoint, lint-self;
  - render-parse (36 / 60), dead exports 0, late demands 6;
  - distilled `regress.vl` (no runs lost);
  - `cases_wasm_*` and `vl_probe_rollback` (7,447 passed).
