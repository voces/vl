# Step 7 codecs, cut 2: the equality layer dispatches on the field's kind, not its code, 2026-11-11

This is cut 2 of `2026-11-11-step7-codec-field-rep-column-design.md` (#7250) for the struct and
variant equality ladders. Those were the largest code-to-code transforms.

## What changed

- **`eqRowFieldKind(row, fi)` and `fieldRowKind(r)`** (`emit_eq_rows.vl`) are the kind a field is
  stored at, from the struct or arm table. That kind is `repOfTy` of the storage type. The field
  code answers through `fieldCodeKind` only where the type is unrecorded or uncovered, or reps as
  `nulnone`. `nulnone` is a hole's record (code 15) or the `null` unit (code 37), which only the
  code tells apart.
- **The three code transforms are now kind transforms.** `nulFieldInnerCode` became
  `nulFieldInnerKind`, `eqScalarListFieldKind` became `eqScalarListKind`, and
  `eqVariantListFieldKind` became `eqVariantListKind`. `eqKindIsRecord` (`nulstruct` or
  `nulvariant`) replaces `== FC_STRUCT`.
- **Every equality ladder takes a kind.** In `wasmEmit.vl` that is `emitStructEqFieldInner`,
  `emitStructEqFieldAt`, `emitNulFieldEq`, `eqHelpFieldPaths`, `variantFieldComparable`,
  `variantFieldCodeComparable`, `emitVariantFieldsEq`, `emitVariantNulFieldEq` and
  `emitVariantFieldEqCore(At)`. In `emit_eq_rows.vl`: `eqgRowIsCyclic`, `eqgFieldNextRow`,
  `eqgStructElemFlat`, `eqgStructElemNeeds` and `shapeHasCloField`. In `emit_collect.vl`, the
  frame reservation (`leqNoteVariantFields`, `leqNoteStructRowFields`).
- **Deleted:** `eqRowFieldTypeAt`, `nulFieldInnerCode`, `eqScalarListFieldKind` and
  `eqVariantListFieldKind`.

Codes 0 and 30 both stored kind `i32`, and every ladder already took them in one arm, so the
kinds lose nothing the compares read.

## Measurement

`sweep.vl diff`, master `7d0f985f`'s fixpoint seed against this one (23,913 programs):

- **23,913 same**;
- 0 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

The first candidate lost 8 programs, all with a nullable list field. It took the non-null twin
through `listRepOrNull`, which declines the nullable list reps (`vkListClass` 2), so no null
guard opened. `nulFieldInnerKind` now asks `nulListBase` directly. The seed is 6,619,452
bytes (+759 against 6,618,693), and it is a fixpoint after two refreshes.

## What is left

`fieldCodeKind` is the floor table. It moves to `emit_list_rep.vl` beside `listRepOfFieldCode`
when cut 3's interning-time arrays need it. The other code-to-code transforms are the
nullable-list wrappers (`nulScalarListCodeKind`, `nulScalarListFieldWrapHeap`) and
`forceScalarListField`. Their callers hold interning-time codes, so they go with cut 3.
