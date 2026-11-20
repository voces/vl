# Fix: a narrowed field off a union member record (2026-11-20, lane IR6; unfiled: D17025)

`if r.d is A { return r.d.ov }`, with `r: R` and `R` a member of some union, was check-clean
and wrote a module that does not validate: `struct.get A.ov` straight off the field's box.

## The mechanism

`memReadArmOf(r.d.ov)` takes `narrowed` when the receiver is a box (`exprUnion(r.d)`) narrowed to
one variant. `exprUnion` answers false for a member read `boxedArmOfMember` names: a record built
into a union field and read at its own type, which the code holds as the record. Inside the `is`
arm the read `r.d` is typed `A` by the narrowing, and once `R` is a union member its row passes
`boxedArmAtRow`'s variant-row check, so the narrowed read was taken for a built record; the
member read fell to `variant` and read the field off the box.

`boxedArmOfMember` now declines a read the checker narrowed out of its storage
(`readNarrowedStoreAt >= 0`): that read's type is its arm's, not what was built there. The
decision is shared, so legacy's `emitMem` and the IR's member reads both take `narrowed`.

## Witness

`tests/cases/narrowing/narrowed-field-of-a-union-member-record.vl` reads the narrowed field in
each position (a return, a binding, an argument, a string field, a local receiver, the else
arm). On master's seed it does not validate; with the fix it prints its `@log` lines, in legacy
and with every function claimed by the IR (`$VL_IR_SHADOW=3`).

## Lines

| | lines |
|---|---|
| compiler | +2 |
