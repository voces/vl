# A record field typed by one bare string literal is its atom in the rep tree (2026-11-21, lane IR-D1)

The `string atom` miss class: 195 const-cell occurrences in 132 programs, and functions alike. It is
one mechanism, ablated with a debug build that names the rep at the miss: every occurrence reads
`string atom str`. A field typed by one bare literal (`{ kind: "a" }`) is stored by its row as
the atom (D7440), but the rep tree built the record's kid with `rtGo` of the literal type, which
reps as `str`. So the IR's record said `str` where the row said atom.

## The change

- `rtOfObjAs` gives such a field the atom leaf, asking D7220's existing `repFieldLitAsSet`, the
  rule the row key asks, not a new predicate. It is not memoized under the literal's type, so a
  lone binding of `"a"` still reps as `str` (D15083).
- `deliver` builds a string literal that legacy writes as an atom (`strLitTakesAtom`) into an
  atom destination as that atom. `exprAt` builds a literal at its own rep, which stays `str`.

## The residual (D17040)

The row's store type is chosen at row construction from the value, not the field type alone. A
record whose literal-typed field holds a binding of the string stores the string, so no type-only
rep rule matches both rows. One function moves the other way:
`tests/cases/structs/record-lit-lone-literal-field.vl`'s `mk` (`return { f: y }`, `y: "a"`), now
`uncovered object field coercion` where it was claimed. The IR fails closed there and keeps legacy's
bytes. Coordinator ruling (2026-11-21): ship it, file D17040 as an I8 precondition, and make the rep
tree's kid follow the row's store type later.

## Measured vs merge-base 4c186c33 (fixpoint seeds on both sides)

| bar | result |
|---|---|
| `ir-identity.sh --names` | identical 9,037, differ 0; self-compile identical |
| `ir-identity.sh --cases` | identical 7,556, differ 0; witnesses same 60 |
| `ir-identity.sh --claimless` | identical 14,012, differ 0 |
| `tests/cases` + probes A/B | 7,618 same |
| `scripts/rep-fuzz-check.sh` | exact: 0 new, 0 stale |
| claimed (I8 census, distinct functions) | cases 29,722 → 29,789; probes 458 → 462; witnesses 8,661 → 8,689; self-compile 19,130 and distilled unchanged |
