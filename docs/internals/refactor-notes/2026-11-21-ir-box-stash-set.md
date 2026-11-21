# IR: an order-stashed record boxed under its own arm (2026-11-21, lane IR-N2)

The self-compile class `box of a stash-set record` (4 functions on 94356c86). It sits on the box
ladder's record rung.

A record literal whose later field is a valued `if` sets its fields into the order stash in
source order (#9371, `RStashSet`), then reads the slots back into the record (`mrSet`). Boxed
under its own arm (`rec`, `obj`), legacy writes the tag first, then the literal: the tag sits on
the stack under the field sets. The IR wrote the sets as statements, then the box with its tag,
so the builder missed it.

## The change

- `stashSet` (`ir_lower.vl`) writes the head of the box that boxes this literal under `rec` or
  `obj`, at the literal's first set, ahead of the field's value. It records that in
  `lwBoxHeadAt`.
- Where the literal's first source field is a valued `if`'s value, in either stash form
  (`RStashSet`, or an `RMakeRec` with `mrSrc`), `stashIfBoxHead` writes that head ahead of the
  `if`, which the builder writes before the set. That is legacy's order. `mkBinary` is that
  shape.
- `boxOp` skips the head for such a literal. `boxTempAt` (`ir_build.vl`) admits the literal
  boxed itself (`setRecAt`).

Self-compile: covered = matched 19513 → 19516, the class's 4 functions. tests/cases: no new fail
rows.

This also closes D17042, a literal of that shape returned into a union directly. Master failed
to lower it (`unlowered: operand above a valued if's value`), and the claim fell back. It now
builds and matches, and so does its bound spelling.

Row file `tests/ir-shadow-rows/stash-set-record-boxed.vl`; witness
`tests/cases/unions/stash-set-record-boxed-under-its-arm.vl`.
