# Step 7 codecs: the small-file code-column reads ask the storage, and the tag-assignment compares stay on codes, 2026-11-12

This is group 1 of `2026-11-11-step7-codec-field-rep-column-design.md` (#7250), batched across
the small files. It stacks on #7455.

## What changed

- **`rowsStoreAlikeIn`** (`emit_atom_kinds.vl`) is the cut 3c "stored alike" rule over any two
  tables: the same kind and null discipline, or the same code where either side has only its
  code. `fieldRowsStoreAlike` now uses it, and **`armStageRowStoredAsField(a, b)`** compares a
  staged arm row with a struct-table row.
- **`fieldRowIsClosure(r, nul)`** is new.
- **The converted reads:**
  - `emit_obj_lit_fits.vl`: `structIdxMatchesVariantIdx`, and `structIdxConvertsToVariantIdx`,
    whose widening test now reads `fieldRowNumKind`. That leaves the decoder `fieldCodeNumKind`
    with no reader, and it is deleted;
  - `emit_collect.vl`: `armFieldStructRowMinted`'s record test;
  - `emit_union_atoms.vl`: `variantRowFieldsMatch` and `stagedFieldsLayOn`;
  - `emit_struct_order.vl`: `structRowPrefixCheap`;
  - `emit_sig_tokens.vl`: `structFieldIsClosure` and `drwFieldClosure`.

## The tag-assignment compares stay on codes

The first candidate also converted the arm-row comparisons that serve tag assignment:

- `variantRowsTagEqual` and the `litFieldRow*` predicates (`emit_variant_sig.vl`);
- `variantFieldTysEq` (`emit_collect.vl`);
- `variantLitRepMismatch` and `variantFirstLayoutDisagreeField` (`emit_map_twins.vl`).

It lost two programs, D15315 and its distilled cell `named/d15314_d315`. Both moved from runs to
`a record type's rep changed during emit, from a union arm to a plain struct: H`. Reverting
`variantRowsTagEqual`'s comparison alone brings them back.

A probe on `armRowsStoreAlike`, validated by a control that fires on every call, found no row
pair where the rep answer differs from the code answer. So the loss is not a wrong answer. The
likely cause, inferred and not traced: `repOfTy` records the rep it hands out, and the
"rep changed during emit" check fires when a later answer differs. These comparisons run while
the arms are being tagged, before H's arm status is decided, so asking the storage rep there
pins H as a plain struct too early. All five tag-phase comparisons keep comparing codes.
`armRowsStoreAlike` is deleted with them. They are typed in cut 5, together with the floors.

`structFieldCodesEq` (`emit_rep.vl`) stays as well. `emit_atom_kinds.vl` imports `emit_rep.vl`,
so the predicates cannot be imported there. `monoArgTyNameProjected` (`emit_mono.vl`) belongs to
w305, and `cloTailRefusal` reads `memberFieldCode`'s plan vocabulary.

## Measurement

`sweep.vl diff`, #7455's fixpoint seed merged with master (6,671,471 bytes) against this one
(fixpoint, 6,671,428 bytes), over 24,010 programs. That seed predates deleting the then-unread
`fieldCodeNumKind`:

- **24,010 same**;
- 0 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

The probe compiler never reached a refresh. After it, `build/vl-compiler.wasm` was restored from
the base seed and refreshed, and it carries no probe string.
