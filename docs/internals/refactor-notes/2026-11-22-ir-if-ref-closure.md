# IR: a value `if` joined at a closure, 2026-11-22

Lane IR-N4, control flow. `ifRefExpr` builds a value `if` on legacy's reference join
(`emitIfExprRef`) for the kinds it names, and refused the rest as `expression if ref <kind>`. In
tests/cases that refusal was 68 functions in 30 programs, all of kind `closure`. Legacy writes the
closure join like any other reference kind: its blocktype is the closure's struct ref, which
`ifRefJoinOf` gives the lowering, and each arm is its closure value. The arm builder
(`refIfLink`, `refIfArmOf`) already writes a closure arm as itself when its plan is `plain`, and
names any other plan (`ref if arm rep`).

## Change

`closure` joins the kinds `ifRefExpr` admits.

## Ablation (the 30 programs, base seed and the change)

- `expression if ref closure`: 68 → 2. The 2 left take `ifExprAt`'s plain path, which a
  destination type or a missing join kind routes them to: a different mechanism.
- About 20 more functions build whole. Covered = matched throughout; the one start mismatch
  (`spans: read index` in `modules/if-expression-arm-merge`) is the base's own.
- The rest now name what each still needs: `ref if arm rep` 15 (an arm needing a rep coercion),
  `indirect call` 11 (IR-N5's tag argument), `argument coercion` 5, `declaration coercion` 4,
  `map callback expression` 2.

The shadow row is `tests/ir-shadow-rows/if-value-closure-arms.vl`. The run case is
`tests/cases/closures/if-value-closure-arms-capture-and-chain.vl`.
