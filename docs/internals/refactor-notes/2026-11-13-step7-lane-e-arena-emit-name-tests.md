# Step 7 P3: `arenaEmitName`'s test-only callers ask the type, 2026-11-13

This is lane E's work. `arenaEmitName` (emit_collect) renders a type with `tyToNominalName` and
then runs `canonEmitNameOfTy` over it. Six emit_collect callers used it. Three of them never kept
the name; they only tested it:

- `markInferredJoinAtoms` declined on an empty render;
- `collectTyReachCloSigsArm` interned an arm's closure signature only on a non-empty render;
- `funcRetUnrepresentable` (TyObj arm) asked `nameIsShapeOpen` of the render.

The other three (`registerInlineUnionOfChild`, `registerCloResultUnion`, `reachRegisterName`)
use the render as a union-registry key and are not touched here.

## Changed

- The two emptiness tests become `tyReachesHole(ty, 64)`. The nominal render is empty exactly
  when the type reaches an inference hole, a type variable, or an unresolved (`-1`) part.
- `funcRetUnrepresentable`'s TyObj arm asks:
  - is the type not a declared struct or generic application (`structNameOfTy`, `genAppNameOfTy`);
  - does it reach no hole;
  - is its first member not an index operator (`objLeadsWithIndexOp`, since an operator-bearing
    object renders `{[]:…}`, which `nameIsShapeOpen` rejects).

## Probe

The probe used a scratch compiler, never refreshed into a seed, with a distinctive `emitFail` on
any disagreement between the render test and its candidate. A control (the probe forced on)
fired. A reach probe showed the emptiness tests are live: the render is empty in 432 of 520
reaches of the first and 1,089 of 1,106 of the second.

| candidate, over the whole sweep | disagreeing programs |
| --- | --- |
| empty render ⇔ `tyHasTyVar` | 17 (all `_` parts) |
| empty render ⇔ `tyHasTyVar ∨ tyHasHole` | 17 (all `-1` parts) |
| empty render ⇔ `tyReachesHole(ty, 64)` | **0** of 24,209 |
| `nameIsShapeOpen` ⇔ not declared, no hole, not index-operator-led | **0** of 24,209 |

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `32ab5241` against the candidate: 24,209 same,
  0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- Render-parse census, regenerated: `ty-string-parse` 61 → 60 (the `nameIsShapeOpen` site). `ty-parse-unclassified` 52 → 50 is lane B's #7758, merged in.
- `scripts/gate.sh`: all rows pass.
