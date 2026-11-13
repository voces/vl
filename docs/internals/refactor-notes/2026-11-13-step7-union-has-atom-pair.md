# Two `unionHasAtom` sites ask the member set, 2026-11-13

Lane A. These are two of the five render-origin sites in lane G's set that G handed to lane A.
The render-parse census graded both `unionHasAtom` calls as render-origin: each tests a
rendered member-set spelling for one atom.

**`emitUnionCoerceValueAtom`.** It asks whether the coerce target holds the plain scalar atom
of a map read's box kind (`scalarAtomNameOfKind(mrk)`). It now asks the target's member set,
held as `uSet` or read from `uTy` with `msSetOfTyAny`, through `msHasPlainValKind`. A literal
riding the kind's tag is excluded, as it is from the spelling test.

**`unionSetHasNullTy`.** The rung after the member-set and declared-name rungs parsed the set's
spelling for `null`. It now answers from the held type (`tyAdmitsNull`).

**Verified.** A probe computed both the old spelling answer and the new typed answer over the
sweep population (24,223 programs):
- `emitUnionCoerceValueAtom` is reached in 298 programs, and the two answers agree in all of
  them;
- the `unionSetHasNullTy` type rung is reached in 1 program and agrees;
- its name rung (`ty < 0`) is never reached, so it is deleted.

**Left for the next PR.** The three `valueAtomKind` arm sites (`emitUnionUnionNumCross` ×2 and
`unionBoxEqColumns`) wait for lane G's `unionArmBoxKind` to land on master. They will use it,
rather than a second copy of the literal-arm rule.
