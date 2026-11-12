# A union `==`'s frame reservations read the operand's arms by type, 2026-11-12

Lane A, for lane G's step-7 L6 slice. Emit only; stacked on the wide-arm change
(`2026-11-12-step7-wide-retag-arms-by-type.md`).

**The change.** `leqNoteUnionArms` (emit_collect) and the union leg of `cloEqNoteBin`
(emit_fn_scans, through `unionArmsNeedCloEq` in emit_eq_rows) used to take the operand's arm
spellings from the union it names (`unionArmAtomsOfExpr`) and turn each into a variant row with
`variantIndexOf`. They now ask `unionArmRowsOfExpr` (emit_classify): for a union value
(`exprUnion`), the arms of its box type (`unionBoxTyIxOfExpr`) as atoms beside variant rows picked
by member type (`armRowsOfUnionTy`, now shared with wasmEmit's wide-arm box); where that type's arms
do not resolve, the named union's spellings. `unionArmsNeedCloEq` takes the rows beside the atoms.
`unionArmAtomsOfExpr` is no longer exported.

**Census** (probe compiler, the full sweep population of 24,196 programs; compares the frames
each path reserves: list-core kinds of the atoms and the field types of each arm's row):

| site | agree | differ | gate differs, nothing reserved by either |
|---|---|---|---|
| `leqNoteUnionArms` | 3,629 sites / 1,878 programs (+ 20,889 non-union) | 0 | 2,008 / 950 |
| `cloEqNoteBin` union leg | 25,494 / 4,888 | 0 | — |

The gate rows are operands the name path called a union and `exprUnion` does not (or the
reverse, 3 sites); neither path reserves a frame for any of them.

**Sweep** (fixpoint seed of the wide-arm branch vs candidate, same tree): 24,201 same, 0
bytes-only movers, 0 output movers, 0 runs → not-runs, 0 new traps.
