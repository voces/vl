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

Fixpoint seeds, head on master ff34a69e, base master ff34a69e.

| check | result |
| --- | --- |
| `$VL_IR_SHADOW=6` | distilled corpus 82,105 rows, 0 `prepost differs`; tests/cases 66,548 rows, 0 not the program's own refusal |
| `rep-fuzz-check.sh` | exact |
| `ir-identity.sh --cases` | identical 7720, differ 0 |
| `ir-identity.sh --claimless` | identical 14044, differ 0 |
| `ir-identity.sh --names` | identical 9037, differ 0; self-compile identical |
| L2 self-compile fuel per PR | +0.01% on 120,866,344,591 |
| armed shadow A/B | covered 76,389 → 76,389, start covered 6,706 → 6,706, mismatch and fail 0 → 0 |
| ir claims | 21,979 functions over 5,007 witnesses; `ir-shadow: ok` with D17070's fallback line gone |

No tests/cases program moves; the change is D17070's own witness and its spellings.
