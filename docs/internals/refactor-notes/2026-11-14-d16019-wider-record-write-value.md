# D16019 — a wider record written into a narrower place, used as a value (2026-11-14)

Lane B, the last value-position residue of the D16015 family.

## Change

`compiler/emit_rewrite.vl`, D2398's `assignValueSpill`:
- `asvPlaceRecordMoves` accepts a plain write into a field or an array element where the value is a
  named record and the place's record (nullable peeled) is another closed record. Literals,
  map entries and open types are excluded.
- `asvMovePlace` moves such a write ahead of its statement through D2171's `spillWrite`, which
  spills the receiver, index and value in source order. Only operands passed before the target
  bound it, and it does not move past a write its right-hand side moved first.
- The pass's gate also opens on such a write (`asvAnyPlaceRecordWrite`), since the checker's
  wider-store record notes only name targets.

## Measured

- New matrix `scripts/capability-probes/matrix/wider-record-write-value.matrix.vl`: 8 of 54 to
  54 of 54 (before = the D16016 head, fixpoint), 0 silent, 0 runs → not-runs.
- Sweep against the D16100 head (both fixpoint seeds), over 24,356 programs:
  - 2 output movers, each emit reject → runs: the D16019 witness and the new case;
  - 0 bytes-only movers, 0 runs → not-runs, 0 new compiler traps.
- The record-field-read, union-target, element, field and map matrices are unchanged at 54, 52,
  50, 50 and 50, 0 silent.
