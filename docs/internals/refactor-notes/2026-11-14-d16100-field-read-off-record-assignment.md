# D16100 / D16101 — reading a field off a record assignment's value (2026-11-14)

Lane B, the consumer side of D16016.

## Change

- `compiler/emit_classify.vl`: `asgPlaceRowOr`. An `=` whose struct row is otherwise none, with a
  field or element target, answers that place's row. That is the row of the cell D16016's
  `asgNonNullCell` delivers. A name target already answered through `asgCellOf`.
- `compiler/wasmEmit.vl`: `emitNulIsNullTest` folds a test of an operand the checker types `null`
  to its constant (the dead null test), beside the fold for a read narrowed to `null`.

## Measured

- New matrix `scripts/capability-probes/matrix/assignment-record-field-read.matrix.vl`: 0 of 54
  to 54 of 54 (before = the D16016 head, fixpoint), 0 silent, 0 runs → not-runs.
- Sweep against the D16016 head (both fixpoint seeds), over 24,345 programs:
  - 3 output movers, each emit reject → runs: the D16100 and D16101 witnesses and the new case;
  - 22 bytes-only movers (same outcome and output, different module bytes);
  - 0 runs → not-runs, 0 new compiler traps.
- The element, field, map and union-target matrices are unchanged at 50, 50, 50 and 52 of their graded
  cells, 0 silent.
