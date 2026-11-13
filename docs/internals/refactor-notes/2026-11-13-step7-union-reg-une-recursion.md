# Step 7 L6 (lane G, cut 8b): the producer's own recursion reads the typed wrapper, 2026-11-13

The base is master `6a8ee323`, after cut 8a (#7720). Two producer-internal rungs still asked
`unionNameOfExpr` directly:

- the `??` rung of `unionNameOfExprGo`, which asks both operands;
- `letUnionNameOfGo`'s un-annotated initializer.

## Changed

Both ask `unionNameRowOfExpr`, the typed wrapper. It answers from the box type, else the node's
type, else its floor. The initializer's row is the wrapper's.

`unionNameOfExpr` keeps two callers:

- `unionNameOfExprFloor`, the function-value nullable that lane F's set-keyed contract covers,
  plus the alias spellings lane A is converting;
- `printUnionPlanCode`'s D16060 floor, which is lane H's.

## Proof

- **Seed:** fixpoint.
- **The full sweep:** CI's `sweep` label. #7720's identical sweep over the same wrapper is the
  prediction.
