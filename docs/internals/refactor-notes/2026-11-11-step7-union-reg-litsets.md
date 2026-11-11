# Step 7 L6: the literal-set sites ask the canonical type key, 2026-11-11

The union registry census (`2026-11-11-step7-union-registry-census.md`, cut order item 3) found
1,131 typed lookups where today's softened key (`unRowOfKey`, which renders the type and softens
a literal to its base) and the canonical key (`unRowOfTyKey`) find rows of two different types.
All of them are literal sets, at sites 79, 87, 102 and 103. The softened key hands back the first
literal set's row (`K = "a" | "b"`) for the second set's type (`L = "c" | "d"`). This PR switches
those four sites to the canonical key, so each set's type finds its own row.

The base is master `98b73ba7`, with a fixpoint seed on both sides.

## Changed

- **Sites 79, 87, 102 and 103 join `unSiteOnTyKey`** (`emit_union_registry.vl`):
  `monoAnnPin/union` (`isUNameDeclAB`), `markValueUnionAtoms`, `markMapUnionArms` and
  `markRefArrayArms` (each through `unionSetArmTysAB`).

## What moved, and why no bytes did

The census measured the answers that change on these sites:

- **1,131 answers: another literal set's row becomes the set's own.** At site 79 only whether a
  row exists is read, and both keys find one. At 87, 102 and 103 the row's arms are read, to mark
  value atoms, map arms and ref-list arms. Two literal sets of one base record the same softened
  member types and atoms (`string`), so they mark the same arms.
- **19,498 answers at site 102: one type, the alias's row becomes its expansion's** (D14742's
  pairs, `dupkey` in the census). In each pair the two rows record the same variant slice and the
  same arm types, so `markMapUnionArms` marks the same arms.

Both readings hold over the whole population: no module moves.

## Proof

- **Byte sweep.** `sweep.vl record` over the whole population with the master fixpoint and with
  the candidate fixpoint: 23,877 of 23,877 are the same, with 0 bytes-only movers, 0 output
  movers and 0 runs → not-runs.
- **Literal unions still never mint.** D14041 and D14042 still refuse as filed
  (`check-filed-witnesses --strict`).
- **Locally:** refresh ×2 byte-identical, rep-fuzz (exact), lint-self (clean), seed-size,
  late-demands (6, the baseline), the dead-export, render-parse and pin-helper budgets,
  cases_wasm, inventory refs/rows, `check-filed-witnesses --strict` on both inventories,
  `vl_scaling_shape`, `vl_probe_rollback` and plumb-shape-cost (fuel).
