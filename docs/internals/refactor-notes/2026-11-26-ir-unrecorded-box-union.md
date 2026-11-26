# IR: a box with no recorded union boxes into its destination rep's union (2026-11-26)

Lane COV-IS, regen-9 class `box ladder`.

A record literal stored into a map whose value row is widened later (`const g: {[string]: J} = m`)
has no box record at its field: `holeBoxTyAt` gives -1, so `holeBoxPlanOf` returned the ladder
and `boxTempIn` missed. `boxTempIn` now plans such a value against `repTyOf(dst)`, the union its
destination rep holds.

Measured:

- Legacy writes `{ f: 4 }`'s field there as `struct.new $14 (i32.const 0, struct.new $13 4)`. A
  probe build showed the fallback picks the plan the recorded path picks for `const r: J = { f: 4 }`
  (`atom`, kind 0, the same union type and destination rep), and that path claims
  byte-identical (`VL_IR_SHADOW=2` `matched`).
- Of every regen-9 `box ladder` and `box into another union` row (cases and distilled), only three
  move: `records/built-record-field-read-stored.vl`, `built-record-join-binding-read.vl` and
  `built-record-stored-into-nullable-field.vl`. Each start body moves on to
  `global initializer coercion`, the map widening.
- The sweep `tests/cases/records/built-record-literal-boxed-at-later-row-positions.vl` covers a
  map set, a field store, a list push, an argument and top level. On master, 4 functions and
  the start body miss with `box ladder`. With the change, none do; they move on to
  `declaration coercion`, `argument coercion` and `global initializer coercion`, COV-CALL's map
  widening. No function in it claims end to end yet, so `ir-parity` has nothing new to grade.
- Shared plan unchanged (`holeBoxPlanOf` untouched), so legacy bytes do not move.
