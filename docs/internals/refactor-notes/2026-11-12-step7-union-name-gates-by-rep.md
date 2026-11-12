# Step 7 L6: five `unionNameOfExpr` gates ask the receiver's rep; the name read leaves them, 2026-11-12

Lane I's half of `unionNameOfExpr`'s callers is the is-test, equality and print readers, as lane G
split them on 2026-11-12. This is the first batch: five callers that used the name only as a gate
(`nm == ""`) before reading the box's arms by type through `unionTyArms(unionBoxTyOfRead(..))`.

| caller | gate before | gate now |
| --- | --- | --- |
| `unionBoxLacksTag` | `unionNameOfExpr(recv) == ""` | `!exprUnion(recv)` |
| `isPatUnionArmTy` | the same | the same |
| `mapSoftTwinTagFail` | the arms read only when named | the arms read only for a box |
| `emitListIsAcrossReps` | `nm == ""`, beside an earlier `!exprUnion` | the `exprUnion` test alone |
| `emitListEmptyFitArms` | `nm == ""` inside its `exprUnion` branch | the branch alone |

**How the gate was chosen.** A probe compared the name gate with each candidate at all five sites,
reporting the first disagreement per program. It was built by the master seed into scratch.

| candidate | programs that disagree |
| --- | --- |
| the receiver's type is union-like | 126: a nullable with no box (`i32[] \| null`) has no name |
| `unRowOfTyKey(unionBoxTyIxOfExpr(..)) >= 0` | 43: the declared type is not the box the name names (`V \| null` against `i32\|string\|null`) |
| no gate at all, leaving it to the typed arm read | 21 programs went runs → compiler trap: `unionTyArms` over a non-box |
| **`exprUnion(recv)`**, the receiver's rep is a union box | 19, nearly all `mapSoftTwinTagFail` on one-list twins (`i32[] \| i32[]`), which have a name and no box |

The `exprUnion` gate moves **no output**: 24,192 programs the same. For a one-list twin,
`mapSoftTwinTagFail` read the arms of a value that is not a box. That has no effect, because only
a box's arms can hold two map twins.

## Proof

- **Sweep:** both sides on fixpoint seeds (base: this branch's merge base), 24,192 programs, all
  the same: 0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- **Gates:** fixpoint; `lint-self.sh` clean; `regress.vl` lost no runs;
  `check-filed-witnesses --strict` at 4,859 as filed.
- **Left in lane I's half,** for the next batch: nine callers that hand the name to a registry
  reader. They are `exprIsUnionStrEq` ×2 and `printUnionPlanCode` (emit_fn_scans),
  `emitIsTestArmTag`, `emitUnionUnionEq` ×2, `emitUnionLitIs`, `emitScalarMapReadBoxEq` and
  `emitPrintValueUnion`.
