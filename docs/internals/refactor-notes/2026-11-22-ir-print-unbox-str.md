# IR: an unbox to the string kind reads at `string` (2026-11-22, lane IR-N8)

`print operand rep` was blocked by one mechanism, which an instrumented census (a throwaway seed
naming the print arm and the operand's rep at the miss) splits out: the arm is `str` but the
operand is an atom, in 50 functions and 2 start bodies on master 43cc7022.

A union box such as `K0 | f64` stores a literal-union member as its string. Legacy's narrowed read
(`identUnboxAtomOf`, `unionFieldNarrowUnboxOf`) unboxes to value-atom kind 2, which leaves the
string, and `printArmOf` takes `str` for it. The IR built the same unbox but typed the temp at the
read's own rep, `K0`'s atom.

## The change

- `irBUnboxKindRep(k, rep)`: an unbox to kind 2 read at an atom rep reads at `string`.
- `unboxAtomTemp`: a local's and a global's narrowed read (`RBoxNarrow` with `bnAtom`) take it.
- A union-box field read (`RGetField` on the `own` arm) takes it with the kind from
  `unionFieldUnboxKindOf`, a new legacy query.
- R8: `unionFieldUnboxKindOf` is called by legacy's `emitUnionFieldNarrowUnbox` (atom arm) and
  `emitUnionFieldStoredUnbox`, by the builder, and by the verifier's `RGetField` rule, which now also
  accepts a `string` destination where the type's rep is an atom and the kind is 2.

## Not in this change

- `print operand rep union got null` (2 functions, 2 starts): `print(z.f)` with `f: null`.
- `print operand rep atom got str` (1): a shared read of a literal-union field across variants.

## Readings

See the PR body.
