# Step 7 L6: the identifier and ref-list index rungs hand back their rows, 2026-11-12

This is step B, part 2, of the `unNames` spelling readers. Part 1 (#7411) gave `unionNameOfExpr`
a row channel for its `as?` and call rungs, and part 1's slot fix made each call save and restore
it. Two more rungs now record the row behind their name. In part 1, a row came back in 6 of the
2,745 programs reaching `unionArmAtomsOfExpr`; it now comes back in 1,240.

- **The identifier read.** `unionReadTyOf` is the type `unionNameOfRead` names a read by: the
  read's union type, or a nullable box's inner union, or the hole marker. `unionNameOfRead`
  names it, and the hub's `Ident` arm records `regUnionRowOfTy` of it, which is the row
  `regUnionNameOfTy` names it by where its type keys one. The value-union key-text rung and
  the spelling-bound rung record none. `unionNameOfRead`'s other 19 callers are unchanged.
- **The ref-list index read.** `rlElemUnionRow` is the row `rlElemUnionName` names a slot's
  element union by. `rlElemUnionName` now reads it too, and the index rung records it.

The base is master `e3c63e35`, with a fixpoint seed on both sides. The population is the whole
sweep, 23,984 programs. The candidate includes #7411 and its slot fix.

## Probe

The probe compared each row that came back against `unMemRowOfName(name)`, which is the row
the name path reads.

| measure | programs |
| --- | --- |
| reach `unionArmAtomsOfExpr` | 2,745 |
| a row came back | 1,240 |
| that row differs from the name's | 7 |

The 7 are member-order twins: the type's row and the name's row hold one member set in two
orders (`string|i32` against `i32|string`, `i64|i32`, `i32|null`). Among them are D5714,
`match/int-lit-set-dispatch.vl`, `match/litunion-mixed-type-member-dispatch.vl` and
`operators/union-eq-reversed.vl`. Both consumers are order-blind. `leqNoteUnionArms` notes a
compare frame per member kind, and `unionArmsNeedCloEq` asks whether any member is a closure. So
no byte moves, and the sweep confirms it.

## Proof

- **Local full sweep.** `--prove-fixpoint` seeds on both sides: 23,984 same, 0 bytes-only
  movers, 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Checks.** On the tree with master merged in: `emitter-state-audit --check` is clean,
  `rep-fuzz-check.sh` is exact, `cases_wasm` passes 7,481 with 0 failed, lint-self is clean, and
  the export budget, with findings, has 0 dead exports. Render-parse is flat.
