# Step 7 codecs, cut 1: the field-code comparisons in `wasmEmit.vl` and `emit_classify.vl` ask the field's storage rep, 2026-11-11

This is cut 1 of `2026-11-11-step7-codec-field-rep-column-design.md` (#7250), for the struct-row
comparisons in `wasmEmit.vl` and `emit_classify.vl`.

## What changed

Three predicates, in `emit_classify.vl` beside `sFieldStoreKind`, read the field's storage rep:
`repOfTy(sFieldStoreTy)` through `sFieldStoreRep`. The field code answers only where no storage
type is recorded or the descriptor does not cover it.

- `sFieldIsUnionBox(si, fi)`: the storage reps as `union`. It replaces five `== FC_UNION` reads,
  in `isStrTagUnionNameOf`, `listIsStoreBackOf`, `emitIsTestArmTag`, `emitMemStructRead` and
  `emitCoalesceUnionField`.
- `sFieldIsPlainI32(si, fi)`: `i32` with no null discipline, so a number, a boolean or an atom,
  and not code 30's `K | null` niche. It replaces the two `!= FC_I32` gates, in `emitCoalesceOptListGet`
  and `emitCoalesceOptMember`.
- `sFieldIsRecordRef(si, fi)`: `nulstruct` or `nulvariant`. It replaces `rcNestedRow`'s
  `!= FC_STRUCT` test. A `nulnone` storage is either a hole's record (code 15) or the `null` unit
  (code 37), and only the code tells those apart, so it answers there.

In `emit_classify.vl`, six more convert:
- `memberUnionFieldName` (2) and `memReadBoxPlan` read `sFieldIsUnionBox`;
- `optChainStructIdxOf` and `recvFieldStructRow` read `sFieldIsRecordRef`;
- `memberReadIsLitAtom` reads `sFieldIsPlainI32`.

The other 16 `sFieldTypeAt` reads in `wasmEmit.vl` hand the code to a function that takes a
code: `emitStructFieldStoreValue`, `emitNulStrFieldRecover`, `fieldCodeNumKind`, and the `codes`
arrays of the row matchers. They are cut 2 (the transforms) and cut 3 (the arrays).

## Measurement

`sweep.vl diff`, master `82eca538`'s fixpoint seed against this one (23,912 programs):

- **23,912 same**;
- 0 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

The seed is 6,618,677 bytes (+381 against master's 6,618,296), a fixpoint after two refreshes.

## Proof

- `regress.vl`, `lint-self.sh`, `cases_wasm_*` and the export, ladder, comment, sentinel,
  render-parse and scan budgets are run before push.
- The change is identity-only, so there is no sweep label.
