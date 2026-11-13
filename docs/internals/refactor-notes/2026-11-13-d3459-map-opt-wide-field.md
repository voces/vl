# D3459: `m[k]?.f ?? d` reads an f64, i64 or f32 field at the field's blocktype, 2026-11-13

Lane E. The coordinator approved it as the next open clause-2 refusal with a common witness: a map
of records read with `?.` and a default.

## Defect

`(m["a"]?.v ?? 0.0) / 2` over a `{[string]: D}` with an `f64` field was a loud emit refusal
(`` `?.` over a map read supports only i32/boolean fields ``) after a clean `vl check`. The same
held for i64 and f32 fields, and for i32-keyed maps. i32, boolean, string, list and record fields
ran. So did `?.` without `??`, and the read through a binding.

## Mechanism

`emitCoalesceOptMapField`, the fused probe-then-field lowering of `m[k]?.f ?? d`, opened its `if`
at a fixed i32 blocktype (`fbIf(127)`) and refused any field whose numeric kind was not 0. The
nullable-record and nullable-variant arms beside it already take the blocktype from the field.

## Changed

`emitCoalesceOptMapField` computes `optLeafKindOf(omNum, false)`, opens the `if` with
`fbIfForOptLeaf`, and emits the default with `emitOptLeafDefault`, which widens an integer
literal to the field. Kind 0 still opens `fbIf(127)` and still emits the default with `emitExpr`,
so every field that ran before emits the same bytes. A kind with no blocktype keeps a loud refusal
that names the rep.

## Proof

- D3459's witness moves from `emit_reject` to runs, printing `3.5` (`check-filed-witnesses
  --strict`). The row is closed.
- `tests/cases/maps/optional-field-default-wide-scalars.vl` has sixteen cells:
  - f64, i64 and f32 fields, hit and miss, string and i32 keys;
  - integer-literal defaults widened to f64 and i64;
  - i32, boolean and string fields as controls.

  On the base seed the file is refused at emit.
- Sweep with fixpoint seeds on both sides, master `8dbcac16` against the candidate:
  - 24,240 same;
  - 0 bytes-only movers, so every field that ran before emits the same bytes;
  - 2 output movers, the D3459 witness and the new test file, both `emit_reject` → runs;
  - 0 `runs → not-runs`, 0 new compiler traps.
- Render-parse census: within budget. The change adds and removes no entry.
- `scripts/gate.sh`: all rows pass.
