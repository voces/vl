# A field read at one scalar of a box holding one wider scalar unboxes and converts, 2026-11-11

Lane w320, stacked on #7242. Emit only.

**The gap.** A binding of a call built at a record that boxes its number wider (`i64 | null`) reads
its field back at its own `i32` by narrowing the box (D3006): `emitBoxAtomRetagTys` rebuilt the
box at the own set `{i32}` before unboxing it. No `i32` value box is registered when nothing else
in the program boxes an `i32`, so the read was refused (D15716, master too).

**The change.** At the field read (wasmEmit.vl), `boxNarrowScalarKinds` answers the stored and own
kinds when the box holds one non-null scalar and the own type is one other scalar the conversion
table reaches. The read then unboxes the stored kind and converts (`atomConvOp`), with no box
rebuilt. Any other pair keeps the retag.

**Graded.** `kept-maker-delivery-width.matrix.vl`: 122 of 125 → 125 of 125, plus 3 owed. Its
`f64 | null` spelling also runs 125 of 125. D15716 closes; fixture
`tests/cases/soundness/binding-of-call-built-at-wider-number-read-at-own-type-runs.vl`.
