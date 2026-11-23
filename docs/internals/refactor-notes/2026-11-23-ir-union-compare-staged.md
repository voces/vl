# IR: a union compare whose operand has effects, staged as legacy stages it (2026-11-23, lane S1)

This follows #9769 in S1's union-compare class. D17068 made legacy read an operand with effects
once, in source order, ahead of the tag test (`emitUnionEqStaged`). This PR splits that path into
pieces legacy and the IR both call, and builds it in the IR.

## Legacy refactor (byte-identical)

| piece | does |
|---|---|
| `unionEqStagedPlanOf` | the route: an operand that is not `exprEffectFree`, on the plain or stash plan |
| `unionEqStageOpen(k)` | this level's operand slot, then its box slot (legacy's order), then one level deeper |
| `unionEqStageSetBox`, `unionEqStageSetOther(k)` | park a side in the open level's slot |
| `unionEqStageClose` | closes the level |
| `unionEqStagedTail` | the plan's tails over this level's slots |

D17068's 252-program grid builds identical under the seed before and after the split.

## IR

The builder writes the steps as `RUnionStage` effects (open, then each side built and parked in
source order, then close) and the compare's value as `RUnionStagedEq`. A side's temps lower at
its park, so a compare nested inside a side lowers inside the open level and takes its own slots,
as legacy's does.

## Readings

| run | before (#9769's seed) | after |
|---|---|---|
| D17068's grid: programs with an uncovered union compare | 168 of 252 | 0 |
| tests/cases effect-operand programs | 4 with a union-compare row | 2 cleared; 2 left on other paths |
| self-compile IR misses | 0 | 0 (20,429 fns) |

## Left in the class

The coordinator has ruled these out of S1's claim; they are free, small items.

- **Null-leg call operands** (legacy's null-leg arms stage the operand and box at a level):
  `union-eq-nullable-atom-call-operand`, `union-eq-nullable-bool-call-operand`,
  `union-eq-nullable-string-atom-bool-operand`, and the start body of
  `union-compare-operand-runs-once`. This is S1's next step.
- **Operand rep:** `union-eq-narrowed-let-operand`, `union-closure-arm-equality` (a closure
  operand).
- **Box shapes:** `opt-chain-scalar-unbound-box` (an optional chain), `wide-union-forty-arms`,
  `nested-niche-all-null-inner-literal`, `inferred-nullable-mixed-litunion-return`,
  `alias-litunion-record-eq-literal-unann`.
