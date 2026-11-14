# D16104 / D16103 — a wider record write after an operand its right-hand side changes (2026-11-14)

Lane B. D16104 is clause 1 (check-clean invalid wasm); D16103 is its field-target twin.

## Change

`compiler/emit_rewrite.vl`, D2398's walk (`assignValueSpill`):
- Each passed operand records the slot it was read from: a binary left, an element's receiver or
  index, a field's receiver, or a list or argument entry. The slot is kind 0 when the walk does
  not rewrite it.
- An operand that is not a name, in a rewritable slot, no longer ends the walk. It is recorded
  as `ASV_OPAQUE`, and any later move must spill it.
- When a type-moving write is held back by the operands passed before it, `asvSpillPassed`
  spills them ahead in source order, points each slot at its spill, and the write moves. This
  covers a name the right-hand side may write, the target's own name, and an opaque operand.
  It applies only when the right-hand side moved nothing first. A top-level binding takes it too.
- A `const` read counts as a spill: no write reaches it.

`compiler/emit_classify.vl`, `assignTargetReReads`: a name target holding a named record at
another record (`asgNameHoldsOtherRecord`) is not re-read, so a write no move delivers is refused
loudly (D16105) instead of validated as the wrong record.

## Measured

- New matrix `scripts/capability-probes/matrix/wider-record-write-after-read.matrix.vl`: 0 of 54
  to 54 of 54 (before = the D16102 head, fixpoint). Before, 52 cells were silent, check-clean
  invalid modules. 0 silent, 0 runs → not-runs.
- Sweep against the D16102 head (both fixpoint seeds):
  - output movers: D16103 emit reject → runs, D16104 compiler trap (invalid module) → runs, the
    new case emit reject → runs;
  - D16105 compiler trap (invalid module) → emit reject: clause 1 becomes clause 2;
  - 3 bytes-only movers: D2512, `assign-value-keeps-evaluation-order.vl`,
    `assign-value-widened-call.vl`. These are numeric widening writes that now move ahead with
    their operands spilled, instead of re-reading the name and narrowing back. Same output;
  - 0 runs → not-runs, 0 new compiler traps.
- The other seven value matrices are unchanged, 0 silent.
