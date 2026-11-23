# IR: an explicit `null` record field takes its typed reference's null, 2026-11-21

After `2026-11-21-ir-field-own-null`, an explicit `null` field whose null is a typed reference's
`ref.null $heap` (no `NULL_OWN_*` code) was the named miss `object field explicitNull typed null`.
Legacy writes it through `emitOmittedFieldNull`, the same null an omitted field takes.

## The change

- `fieldTypedNullHas(si, fi)` in `wasmEmit` says whether the field's typed null has a heap that is
  fixed when emit starts: a nullable list or closure, or a nullable record, variant or ref list
  whose row is interned. `emitOmittedFieldNull` refuses (-1) any other kind except `nulmap`, which
  legacy keeps writing as before.
- A map field's null is excluded from the IR path. It takes its map shape's heap, which a later
  mint may move. Claiming it moved `map-value-layout-twin-heap-merge.vl`'s `ref.null` heap.
- New IR rhs `RFieldNull { fnRow, fnFi }`, lowered by calling `emitOmittedFieldNull` itself (the
  legacy writer, so the bytes are legacy's). The verifier requires the destination rep to be
  `RNullable`. `fieldPlainWhy` answers plain for such a field when the destination is nullable;
  otherwise the named miss stays.

## Readings (merge-base `e0b62b0d2`, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| corpus functions with no blocker | 43,613 | 43,615 (+2) |
| corpus `object field explicitNull typed null` rows (blocker) | 31 (2) | 0 (0) |
| self-compile functions with no blocker | 19,354 | 19,355 (+1) |
| armed self-shadow covered / matched | 19,354 / 19,354 | 19,355 / 19,355 |
| tests/cases armed shadow covered / matched | 60,637 / 60,629 | 60,766 / 60,758 |
| L2 self-compile fuel | 105,051,817,002 | 105,140,412,626 (+0.084%) |

The tests/cases fail rows are the base's 8, unchanged. Legacy lines deleted: 0. Moved to `@ir`: 0.
