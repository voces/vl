# START-2: `field store shared arm value` (2026-11-26)

Regen-10 lists 2 units: `unions/shared-litunion-field-write.vl` (`g`, `n.k = s` with two arms'
atom sets) and `soundness/union-shared-record-field-runs.vl` (`@start`, `u.h.f = 7` into an `i32`
arm and an `i32 | null` arm).

A shared field write with one value per arm (`sharedFieldStorePlan` 1) writes each value inside its
arm, after the receiver and its cast. The builder took only a name or a constant there, because
nodes built ahead of the write would run before the dispatch. These arms' values need a
conversion of their own, built as temps (`SLet` of a temp, the last one the value). The lowering
writes a temp's right side where it is read (`tempRhsWrite`), which is inside the arm, where
legacy writes the conversion. `armTempsOnly` admits exactly that.

So the per-arm statement node first planned for this (a new `SSharedFieldSet` with prelude blocks)
is not needed. `RSharedFieldSet` is unchanged.

`ir-parity`: byte-identical on both programs. Each is already a position set: a parameter, a list
element and a binding in the first; depths two and three in the second.
