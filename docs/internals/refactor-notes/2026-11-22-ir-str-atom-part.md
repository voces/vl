# IR: a narrowed literal-union read as a string part (string atom part route), 2026-11-22

Lane IR-N4, the self-compile tail. A string op's part that legacy widens as an atom
(`exprIsLitAtom`) had to have an atom rep at its node's type, or it missed as
`string atom part route`. A read narrowed to one member (`"literal member " + a` in the last
`else` of a ladder over `a`'s members) has a single-literal type, whose rep is no atom, while its
binding's cell is the atom. Legacy decodes the cell (a stash, then the member's string). This was
the self-compile's `memberEqLits`, `coalNiche` and, beside `pre-path atom hook`, `objLitAt`.

## Change

`buildStrBin` admits a widened part whose node rep is no atom when the part is a read of a binding
whose cell legacy holds as the plain atom (`partReadsAtomCell`: `letBindIsAtom` and not
`letBindIsNulAtom`). The delivery's existing atom decode then builds it. Every other disagreement
between `exprIsLitAtom` and the node rep is still the named miss.

The first cut admitted every widened part, and the proof caught it:
`type-param-write-literal-union-coalesce-default.vl`'s `widened` mismatched. Its part reads a
`K | null` cell, whose decode legacy writes with its null arm, so the niche is excluded.

New admission predicates (R8): `partReadsAtomCell` calls `letBindIsAtom` and
`letBindIsNulAtom`, legacy's binding storage column, which `letCellSlot` lays the cell out from.

The shadow row is `tests/ir-shadow-rows/string-part-narrowed-atom.vl`.

## Readings (base: fixpoint seed at master `a00578d1`; candidate fixpoint)

| reading | base | this step |
| --- | ---: | ---: |
| self-compile `blockers none` | 19,711 | 19,713 |
| self-compile `string atom part route` (any) | 3 | 0 |
| self-compile `pre-path atom hook` alone | 5 | 6 |
| self-compile covered = matched | 19,711 | 19,713 |
| armed `tests/cases` covered = matched + 1 pre-existing | 67,472 | 67,474 |
| corpus covered = verified = matched | 44,857 | 44,857 |
| L2 self-compile fuel per PR | | +0.00% |

The fail and mismatch rows are the same on both seeds. Self-compile identity: identical.
`ir-identity.sh --cases`: 7,606 identical, 0 differ. `--claimless`: 14,018 identical, 0 differ.
