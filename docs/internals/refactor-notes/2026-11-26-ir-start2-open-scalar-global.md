# START-2: an open-typed scalar global (2026-11-26)

`generics/nullable-record-field-read-in-each-position.vl` was regeneration 9's third `global
initializer rep` program. It reduces to `const s = q.a * 2`, where `q = g(su, { a: 3, b: 4 })`
leaves `T` unfixed, so `q` and `s` are typed `_`. Legacy gives `s` an `i32` cell.

`openListCellRep` (#10298) becomes `openCellRep`. Beside the `i32` list of a `list` or `nullist`
cell, a scalar cell kind (`i32`, `i64`, `f64`, `f32`) names the rep of a global whose type has none,
at its initializer and its reads. The program is fully claimed. `ir-parity --behaviour-only` is
byte-identical on it and on the new sweep, which misses `global initializer rep` and `rep unsup of
read` on the earlier probe.

The `f64` field's spelling (`const f = q.b * 2.0`) builds an invalid module on master's own
legacy compiler: its cell kind is `i32` and it is handed an `f64`. That is a clause-1 defect, not
this class, and it was reported to the coordinator for SOUND.
