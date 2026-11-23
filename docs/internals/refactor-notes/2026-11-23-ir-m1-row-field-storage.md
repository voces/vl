# IR-M1: a bare-literal record field reps at its row's storage (2026-11-23, lane IR-M1)

The rep tree answered the atom for every record field typed by one bare string literal
(`repFieldLitAsSet`). Legacy's row for such a record can keep the string instead: an anonymous
literal `{ f: x }` built from a binding `x: "a"` mints a row whose field stores a string, unless a
declared record of the same type already owns an atom row that the literal then shares. The IR
built these fields as atoms and missed them as `str>atom` field coercions.

## The predicate

`rowFieldStorage(ty, name)` (emit_shape_rows) is `structRowFieldStoresAtom(structRowOfRecordTy(ty),
name)`, legacy's own answer for the row a record type is stored at, not a restatement of it. Its
answers are 1 (the atom), 0 (the string) and -1 (no row, or another code; the type default
stands). `rtOfObjAs` reps a bare-literal field as the string only on a 0. Variant records are
not asked. emit_rep reaches the predicate through the slot `rowFieldStorageFn`, which
`emitProgram` installs, because importing emit_shape_rows directly would be an import cycle. The
slot's signature already exists in the compiler.

## Order (coordinator condition 1)

Measured with scratch probe compilers over the 8,719 files of the `--cases` list. Each probe was
validated against a control that fires and one that stays silent.

- A family re-lay after the family's rep was built: 0. A re-lay at all: 2 programs, both before
  any rep.
- A row minted after its type's rep was built: 123 programs, most storing what the rep says.
- A row disagreeing with the type-keyed rep for a bare-literal field: 1 program, minted before the
  rep. For a function field stored as an `i32` id: 128 programs, 14 minted after the rep. In 3
  programs one record type has two rows that store the function field differently. That half is
  D17069. The coordinator ruled it a legacy change (one storage per record type), in its own PR.

The ordering is enforced rather than just measured. Every answer the tree used is recorded, and
`rowFieldAsksCheck` re-asks the predicate after every row mint and re-lay and at the end of
`emitProgram`. A changed answer fails the emit with an internal message. The failing control is a
scratch compiler whose `famRelayStructRow` builds the row's rep and then re-lays the field from
string to `i32`; on the witness it fires that message.

An earlier control forced every family row's rep to be built before the real family re-lays
(`layout-family-literal-set-beside-string.vl`, `discriminant-set-beside-base-alias-arm.vl`), and it
did not fire. That is correct, not a blind guard. Those re-lays move literal-SET fields
(`K = "circle" | "round"`), which the tree answers through the union path (`URC_ATOM`), so this
predicate is never asked about them and no recorded answer can change.

## Readings

PENDING
