# IR: an element read's span over a statement-built receiver (2026-11-21, lane IR-N3)

`spans: read index` was a claimable function whose code bytes matched legacy's while its
element-read span rows did not, so a `--names` build would differ. Legacy's `emitIndexBanked`
banks one row from the receiver's first byte to the read's last. The IR builds a fused coalesce
(`SCoalBox`) or a valued `if` receiver as a statement ahead of the read, and `lowerList` banked
the row from the read's own operands, after that statement.

## The change

- The builder records, for a read whose receiver's build opened with an `SCoalBox` or a valued
  `SIf`, that node (`IrFn.irIdxRowAt`, `irRowOpens`).
- The lowering notes the buffer offset as it opens such a node (`lwRowOpenAt`), and
  `irLIndexFrom` starts the read's row there.
- A receiver whose build opens with a bounds check (an inner element read) or a `let` temp is
  written at the read's own operands, as before. Opening the row at a bounds check moved 11
  other rows, so the rule names the two statement kinds.

## Witness

`tests/ir-shadow-rows/index-read-span-statement-receiver.vl`: under the base seed all three
functions are covered with `mismatch spans: read index`; all three match after.
`tests/cases/arrays/nullable-list-unnarrowed-read-two-spellings.vl` goes from 4 to 10 matched.
`tests/cases` shadow: `mismatch spans: read index` 6 → 0 and its `fail` rows 6 → 0. The start
row `mismatch start spans: read index` (1, `modules/if-expression-arm-merge`) is a different
shape and stays.
