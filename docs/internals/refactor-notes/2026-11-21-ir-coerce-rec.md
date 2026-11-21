# IR: a record copy that reads its value once, through RCoerce, 2026-11-21

Lane IR-N4. This is the `recCopy` kind of `pre-path coercion`, the first of the three kinds
(`recCopy`, `fnClo`, `mapUnbox`) that wait on IR-N2's `RCoerce`/`coerceTail`. It builds on that
shape and adds no parallel Rhs.

## Legacy's two copies

`emitRecCopyFields` reads its source one of two ways, decided by `rcReReadable`:

- **(i) Once.** A source that is not pure (`exprReReadable` false), copied into more than one
  field or with a nested record, is emitted once and `local.set` into `variantReboxSlot`. Each
  field is then read off the slot.
- **(ii) Per field.** A pure source, or a single flat field, is re-emitted once per field read.

This PR builds (i). Case (ii) follows, stacked, as `RRecCopyPure` (`2026-11-21-ir-reccopy-pure.md`).

## The change

- **One copy entry.** `emitRecCopyInto(…, built)` takes the value already on the stack when
  `built`: the slot store, then the per-field copy. Legacy's own path passes `false`, and
  `coerceTail`'s new `recCopy` arm passes `true`. `emitRecCopy` and `emitRecCopyFields` thread the
  flag. A `built` call on a source that re-reads is an internal `emitFailAt`.
- **One decision.**
  - `recCopyReReads(exprIx, fnIx)` (exported) answers legacy's own `rcReReadable`. It reads the
    copy's shape from `recCopyShapeOf`, the source row, destination heap and fields that
    `emitRecCopyInto` used inline. The shape is factored out and not copied.
  - `variantFieldSpanOk` is `guardVariantFieldSpan`'s condition, so the shape asks it without
    emitting.
- **Builder.** `coerced` sends `recCopy` to `recCopied`:
  - a struct-row destination whose copy reads its value once builds the value past the coercion,
    then `RCoerce`, at the destination record's rep (`recCopyDstTyAt`, `emit_plan_coerce.vl`);
  - a variant row is the named miss `pre-path coercion recCopy variant`;
  - a re-read source is the named miss `pre-path coercion recCopy re-read`.

Compiler lines +152 / −30 (`wasmEmit.vl`, `emit_plan_coerce.vl`, `ir_build.vl`). Legacy lines
deleted: 0. The shadow row is `tests/ir-shadow-rows/record-copy-value-once.vl`.

## Readings (base and candidate are fixpoint seeds; merge-base `41144724`)

| reading | base | this PR |
| --- | ---: | ---: |
| self-compile covered = matched / claimed | 19,516 / 19,403 | 19,516 / 19,403 (seed hash identical) |
| corpus functions with no blocker (covered = matched) | 44,449 | 44,450 (+1) |
| corpus claims | 44,309 | 44,310 |
| `tests/cases` armed shadow covered / matched | 64,246 / 64,245 | 64,249 / 64,248 |
| `tests/cases` start covered / matched | 4,801 / 4,800 | 4,807 / 4,806 |
| `tests/cases` fail or mismatch rows | 3 | 3, the same list |
| L2 self-compile fuel | 106,901,431,984 | 106,926,543,427 (+0.023%) |

Byte identity:
- Mode 3 and mode 5 self-builds equal the plain build.
- `ir-identity.sh --names`: 9037 identical, 0 differ.
- `--cases`: 7589 identical, 0 differ.
- `--claimless`: 14014 identical, 3267 fail under both, 0 differ.
- tests/cases A/B: 7303 identical, 0 differ.

Late tag rows: 307, the baseline. `ir-shadow.vl -- --claims`: ok.

After the proof, the fast gate caught two problems:
- `phase state`: a direct `recCopyTyOf` import raised `ir_build.vl`'s checker surface 8 → 9. The
  destination type now comes through `recCopyDstTyAt`, and the surface is back to 8.
- A comment-block merge.

Both fixes are restructures with no behaviour change, re-checked with `gate.sh --fast` and
`--cases`.
