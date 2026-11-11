# Step 7 slot layer, family B, PR 2: a cast's arm tag reads the declaration the cast names, 2026-11-11

This PR follows #7139 (the annotation column) and closes D15670, which #7139 filed from its
probe's control. Base is master `f50936aa` (#7141).

## The defect

`emitAsUnionCast` asks `unionArmTagsOfTy` for the target's tags. A record arm's tag is
`uTags[variantIndexOf(name)]`, and the name was `nominalStructNameOfTy(armTy)`, the first record
declared at that type. Take the arm `Circle` with a same-shape standalone `CircleC` declared
before it. The lookup reads `CircleC`, which is no arm, and every spelling of the cast refuses
(`as`, `as?`, `as!`). A sub-union target refuses the same way: `p as Shape` over
`Circle | Sq | E`. Declare `CircleC` second, or drop it, and both run.

## What changed

- **The checker records the union declaration an annotation names.** `annUnionDecl`
  (`check_node_tys`) holds its statement index, or -1. It is sparse, reset with `nodeTyIx`, and
  written by `annDeclNote` beside `annDeclPos`.
- **`annArmDeclPosOf(ann, armTy)`** answers the record declaration the annotation names for
  an arm of type `armTy`:
  - the record itself, when its type is `armTy`;
  - else the member of the named union whose type is `armTy`, through member unions. These are
    the union declaration's own names.
- **`unionArmTagsOfTy` takes the node whose annotation names the arms.** The cast passes its
  own node. The `is` chain and the shared-field fit pass -1 and keep today's answer.

## Proof

- `tests/cases/unions/as-arm-beside-same-shape-standalone.vl` runs. It covers `as!`, `as?` (both
  arms), `as` and a sub-union target, each with `CircleC` declared first, and the standalone
  record beside them.
- `tests/cases/unions/as-struct-arm.vl` prints its full `@log`, including the ARM2 cast.
- Refresh ×2 is a fixpoint at 6,614,659 bytes on base `f50936aa`. On #7139's tree, the change
  cost +957 bytes.
- The `sweep` label re-proves the population. Expected movers are D15670's class: emit reject
  to runs.
