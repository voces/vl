# Step 7 L6: `unionNameOfExpr` hands back the row its rung read, 2026-11-12

This is step B of the `unNames` spelling readers (`2026-11-12-step7-l2-ret-join-rows-no-anon.md`).
`unionNameOfExpr` returns a name, and 24 of its 44 call sites only turn that name back into a
row: a member set, an atom list, a null test. Converting them needs the row the name came from.

## Measured: the node type does not stand in for the hub's answer

The cheap version would have been a twin built from the expression's own node type, the row
`unRowOfTyKey(nodeTyAt(ix, fnIx))`. A probe wrapped `unionNameOfExpr` and compared, at every call
over the whole sweep, the row of the name it returned against that row.

| measure | programs with an event |
| --- | --- |
| reach | 10,201 |
| the two rows agree | 6,588 |
| the name has a row, the node type keys none | 1,516 |
| the two rows differ | 372 |
| the hub declines (""), but the node type keys a row | 322 |
| the name has no row (a value union named by spelling) | 53 |
| declines, and no row either way | 7,346 |

The hub's rungs decide unions that the node type does not record as a keyed row: a narrowed
read, an mv-slot value name, a call, index and member producer, a `??` join. That happens in
about 1,900 programs, and the 322 declines are the narrows by design. So the row has to come
from the rung that answered.

## Changed

- `unionNameOfExpr` records the row behind its answer where the rung that answered read one:
  - the `as?` arm's type-key row;
  - a call's type-key row (`callUnionRowOfTy`), its flattened-member row and its registered row
    (`registeredUnionRowOfTy`).

  `unionNameRowOfExpr` returns the name and pushes that row, or -1 for a rung that names its
  union by spelling alone.
- `unionArmAtomsOfExpr` reads the member atoms off that row (`unionMemberAtomsOfRow`), and off
  the name only where no row came back.
- `leqNoteUnionArms` (`emit_collect.vl`) and `unionArmsNeedCloEq` (`emit_eq_rows.vl`), whose
  every caller passed `unionNameOfExpr`'s answer, take the atoms instead of the name.

## Probe

The probe compared, wherever a row came back, the row against `unMemRowOfName(name)`, which is
the row the name path reads.

| measure | programs |
| --- | --- |
| reach `unionArmAtomsOfExpr` | 2,745 |
| a row came back | 6 |
| that row differs from the name's | 0 |

A row comes back rarely, because the identifier, member and index rungs still answer by name.
They are the next rungs to return a row.

## Proof

- **Local full sweep.** `--prove-fixpoint` seeds on both sides, against master `e3c63e35`:
  23,984 same, 0 bytes-only movers, 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Checks.** `rep-fuzz-check.sh` is exact. `cases_wasm` passes 7,472 with 0 failed. lint-self
  is clean. The export budget, with findings, has 0 dead exports. Render-parse is flat, and the
  baseline is not written.
