# COV-CALL: an atom assignment's value delivered as its id (2026-11-25)

Lane COV-CALL; census class `print operand rep` (`classes/print-operand-rep.txt`).

## Mechanism

An assignment to a literal-union place used as a value is the member written. Legacy writes the
place's re-read, the atom id, and streams it with the atom print or passes it to a `K` parameter.
The builder built the assignment at the rep of its own type, the singleton's `str`, and decoded the
atom re-read to a string (`widenTo`). The atom print arm then missed on `print operand rep`, and an
argument on `argument coercion`.

- `asgAtomRep` names the atom an assignment writes: a `K` place's atom, or the member inside a
  `K | null` niche.
- `deliver` builds an assignment at that atom when it is the destination (`assignValue` at the
  atom), so the re-read passes as the id it is.
- The print's atom arm asks `deliver` at that atom for an assignment operand.
- `atomCellRep`, which holds a global bound to an atom assignment (`const r = (k = "ww")`) at the
  i32 cell legacy declares, now takes the member atom for a `K | null` place as well.

## Proof

- **Census**, class programs on this branch: `print operand rep` 2 functions and 1 start body → 0.
  The probe and the four witnesses are fully claimed. The rest of the class's misses are other
  rows (`index element coercion`, `declaration coercion`, `atom cell local rep`,
  `compare of a joined const atom`, `assignment value re-read rep`, which is COV-UNION's). The
  positions case now reaches `assignment-value atom re-read as a compare operand`, a further
  named miss.
- **Q58:** `tests/cases/assignment/atom-assignment-value-delivered-positions.vl` prints, passes,
  binds as a list element, stores, returns, assigns from a `K | null` place, and reads in a
  closure and at module scope. On the master seed two functions and the start body miss on
  `print operand rep`. On this branch all match, and the armed run prints the `@log` list.
