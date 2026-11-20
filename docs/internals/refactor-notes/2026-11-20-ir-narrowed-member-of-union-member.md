# Fix: a narrowed field off a union member record (2026-11-20, lane IR6; D17025)

`if r.d is A { return r.d.ov }`, with `r: R`, `R.d: A | B` and `R` a member of some union, was
check-clean and wrote a module that does not validate: `struct.get A.ov` straight off the field's
union box.

## The mechanism

`boxedArmOfMember(r.d)` names a record read at its own type out of the union field it is held in,
and inside the `is` arm `r.d` is that read. `exprUnion` answers false for it, so `memReadArmOf`
reads `r.d.ov` on its record arm, and the field read owes the arm's unbox cast.
`structUnionBoxTail`, a field read off a struct receiver, writes it (`emitArmUnboxCast`). Once
`R` is a union member, `r` is a variant receiver and its field read ends in
`variantUnionBoxTail`, which did not: the field stayed the box.

`variantUnionBoxTail` now writes the same unbox cast `structUnionBoxTail` does. Both writers read
the field through that shared tail (legacy's `emitMem`, the IR's `fieldTail`), so both are fixed.

A first attempt instead had `boxedArmOfMember` decline every narrowed read. Its bytes were the
same, but it sent `r.d.ov` off a plain record receiver to the `narrowed` member arm, which the IR
covers only over a local: the corpus's `member record` blocker rose from 12 to 123 functions. The
tail fix leaves the decision as it was and moves no claim.

## Witnesses

- `tests/cases/narrowing/narrowed-field-of-a-union-member-record.vl`: the narrowed field in each
  position (a return, a binding, an argument, a string field, a local receiver, the else arm).
- `tests/cases/narrowing/narrowed-field-of-a-union-member-record-row.vl`: D17025's repro verbatim,
  its early-return spelling and its call through a `U` narrowed to `R`.

Both fail to validate on master's seed and run with the fix, in legacy and with every function
claimed by the IR (`$VL_IR_SHADOW=3`).

## Lines

| | lines |
|---|---|
| compiler | +4 |
