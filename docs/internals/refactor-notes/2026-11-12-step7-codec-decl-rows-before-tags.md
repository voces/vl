# Step 7 codecs: the declared rows `collectS` will mint are known while the arms are tagged, and the tag-phase compares read the storage, 2026-11-12

This meets cut 5's precondition recorded in D15880 (#7471). It then converts the five tag-phase
arm compares that #7469 had to leave on codes.

## The hazard

`assignTags` runs at the end of `collectU`, and `collectS` mints the declared struct rows after
it. The rep layer decides that a record is not a union arm only when its declared row exists
(`repSlotOfTyDecl`). So a record that will get a declared row, but has an arm's shape, reads as
a union arm during tagging and as a plain struct afterwards. `rvsAnswerNote` refuses that change,
correctly, since one type laid out under two reps is invalid wasm. Nothing asked the question
during tagging until #7469's first candidate did. That candidate lost D15315 and its distilled
cell.

## What changed

- **`repDeclRowsPending(tys)`** (`emit_rep.vl`) records the arena types `collectS` will mint
  declared rows for. `repTyHasDeclRow` counts them as rows, both in `repVariantShapeRowOf` and in
  `repVariantShapeHas`. Setting the set moves the shape-answer memo generation and drops the rep
  tree.
- **`collectU`** clears the set on entry. After the variant table is complete and before
  `assignTags`, it records `declRowTysOf(stmts)`.
- **`collectS`** mints by the same predicate, now `typeDeclMintsRow`, so the two cannot disagree.
  It clears the set once its declared rows exist.
- **The five tag-phase compares read the storage rep:**
  - `variantRowsTagEqual` and the `litFieldRow*` predicates (`emit_variant_sig.vl`);
  - `variantFieldTysEq` (`emit_collect.vl`);
  - `variantLitRepMismatch` and `variantFirstLayoutDisagreeField` (`emit_map_twins.vl`), through
    `armRowsStoreAlike`, which is back.

## Proof

- **D15880's ablation:** with all five on the rep, D15315 and
  `distilled/named/d15314_d315.vl` print `4`. Disabling only the pending lookup brings back the
  loud emit reject. That is the control.
- **Local gates:** refresh, `lint-self.sh`, `regress.vl`, `rep-fuzz-check.sh` (the rep layer
  changed), `emitter-state-audit` (new module state), `cases_wasm_*`, `ladder-sets.vl`, and
  `check-filed-witnesses.vl --strict`. Results are in the PR body.
- **The sweep** is CI's, under the `sweep` label, per the 2026-11-12 process change. This can
  move output: a record answered as an arm before `collectS` now answers a struct from the first
  question.
