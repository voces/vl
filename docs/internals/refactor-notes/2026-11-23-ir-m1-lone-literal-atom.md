# IR-M1: a lone literal's atom passes verifier rule 3 (2026-11-23, lane IR-M1)

D17070: `function h(x: "a") { show({ f: x, g: 1 }) }` with `show(r: { f: "a", g: i32 })`. The
argument literal is built at the parameter's row, which keeps `f` as the atom, so `x` is delivered
as its member's id, `atom_sole` (legacy's `strToAtomSoleTail`). The temp is typed at `x`'s type,
the lone literal `"a"`, whose rep is the string a binding holds. Rule 3 ("a variable's rep is its
type's") refused the atom, and the claim fell back (`claims-fallbacks.txt`).

## The change

- `repTyIsLoneStrLit` (emit_rep) exports the rep tree's own test, `repFieldLitAsSet`, that a record
  field keeps a type as its atom though a binding of it holds the string.
- Rule 3 admits an atom-rep variable typed at such a literal (`loneLitAtom`). This is the same
  duality the tree encodes in `rtOfObjAs`. The verifier asks the tree, so no checker symbol is
  imported (the phase-state ratchet holds).
- D17070 is closed, and its line leaves `claims-fallbacks.txt`, which I8 needs empty.

The callee's `uncovered member record` is a separate gap and is not touched.

## Readings

PENDING
