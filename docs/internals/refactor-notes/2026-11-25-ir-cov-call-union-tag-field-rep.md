# COV-CALL: a union's tag field read at the rep legacy stores it at (2026-11-25)

Lane COV-CALL, class `print operand rep`. The coordinator split the class after COV-START's #10133.
This PR takes the two field-read rows: D17072 (`discriminated-union-tag-read`) and D1461 (the
`litunion-mixed-arm-with-base-partner` probe). The kept-maker `union got null` row is another
mechanism, and gets its own PR.

## Mechanism

Legacy decides per field whether a literal-union tag is held as an atom or as a string
(`exprIsLitAtom`, `strReppedLitUnionAt`). The IR typed both reads by their checked type instead.

- **A lone literal tag on every arm** (`{kind: KC} | {kind: KC}`, `KC = "circle"`): the read's
  joined type is the literal `"circle"`, which reps as a string. Every arm stores the atom
  (`sharedUnionFieldPlan`). `sharedFieldAtomTy` names the arms' set
  (`sharedFieldPlanLitTy`, or the alias registered at its texts when that type is a lone literal).
  `exprTyOf` takes it.
  - The shared plain read accepts that rep.
  - A `let` cell holding the read is declared at it (`letSharedFieldAtomTy`).
- **An alias field beside its base's arm** (`{kind: K1} | {kind: string}`, D1461): the row stores
  the string, but the type `K1` reps as an atom. `exprTyOf` takes `str`, and the narrowed field
  read accepts it (`strRowAtomRead`).

On master, a claimed `return s.kind` at `KC` off the lone-literal union produced a module that
failed validation, and the legacy fallback rescued it. That program is pinned in the sweep
(`back`).

## Census (`CENSUS_CLASS=classes/print-operand-rep.txt`, rows)

| row | before | after |
|---|---:|---:|
| `print operand rep` | 9 | 5 |

The 4 cleared are D17072's test and witness and D1461's probe and witness. The 5 left are the
kept-maker pair (2) and three rows in the atom-assignment files COV-START owns, unchanged here.

## Proof

- **Q58 sweep:** `tests/cases/unions/union-tag-field-storage-rep-positions.vl` covers each read at:
  print, compare, `let`, concatenation, interpolation, argument, return and value `if`.
  - Every function is claimed and matches, except one.
  - That one is the string-to-atom tower over a field read (`one(x.kind)`), which stays a named
    miss (`atom tower place`).
- **Byte identity**, default build against the merge-base seed:
  - `ir-identity.sh --cases`: 8,306 identical, 0 differ, 4 expected divergences.
  - The two-seed run: 9,433 identical, 0 differ, and the self-compile is identical.
