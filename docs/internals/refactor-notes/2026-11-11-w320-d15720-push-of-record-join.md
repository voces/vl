# A join stamped at one record is delivered as that record where a box is recorded for it, 2026-11-11

Lane w320, stacked on #7265 (D15719). Emit only.

**The defect (D15720).** #7265 stamps a join of record literals at the one record it is delivered
as. `xs.push(join)` into a `K[]` still boxed the join as its union: the checker records a union
box for the argument (`boxOwedAtRecord`), and `emitUnionBoxAtRecord` coerced the join into its own
union. The module failed to validate.

**The change.** `emitUnionBoxAtRecord` (wasmEmit.vl) emits a value `if` stamped at a record
(`joinStampedAtRecord`) as that record, not as a box.

**Graded.**

- `record-literal-join-at-declared-record.matrix.vl`: `array_push` SILENT → runs in both faces;
  26 of 46 run, 0 SILENT (the 20 un-annotated cells are D15717's shared read, unfiled: D15717, its row is on #7242).
- Local sweep against #7265's fixpoint: 23,911 same, 2 output movers. D15720's witness goes
  compiler trap → runs, and the D15719 fixture gains its push line. 0 runs → not-runs, 0 new
  traps.
