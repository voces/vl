# IR cutover C3a: the numeric widening plan, 2026-11-16

Lane IR-C. This is the first step of the coercion family (I3) under the split the coordinator
approved: first share the decisions (C3a, C3b), then the op-seam slice that deletes the seats (C3c).
Before it, the three widenings `emitExprAs{I64,F64,F32}` interleaved every decision with
emission, so nothing outside them could ask which conversion a value takes. Now one pure
function decides and one writer emits. Byte-identical.

## Ambient reads, measured before splitting

A throwaway probe recomputed each widening's full decision tuple at three times: before the
function body (where a claim's builder runs), at the emit site, and after the body (where the
shadow's builder runs). The tuple was `widenClassifyExpr`, `exprIs{I64,F64,F32}`, `njBoxWidens`,
`njWidensOut`, `asgLitWidth`, `asgRadixWidePrim`, `cexLitPeel`, and `numFloorWhy` per source kind.

| population | sites | before vs at | at vs after |
|---|---:|---:|---:|
| self-compile | 857 | 0 | 0 |
| distilled corpus | 108,570 | 0 | 0 |

397 corpus sites read nodes made during emission, which the pre-body walk never saw. In the failing
control, the emitter's live `ctrlDepth` was added to the tuple, and all 857 self-compile sites
disagreed. So the decisions are already fixed for the whole function: their ambient reads are the
instance context, `numUnionMinted` and the checker's numeric-pair records. What was missing was a
function to ask. `numNote` is a shadow instrument, not a decision. The `coerceHeld` seat that
`numFloorWhy` reads is C3b's.

## What landed

- `widenPlanOf(ix, dst, fnIx): WidenPlan`, over a closed `WidenArm`:
  `instLit | floatLit | asgLit | radix | convert | plain`. `plain` carries its source kind and
  `radix` its prim. It asks each width's checks in that width's legacy order, and short-circuits
  as legacy did, because a classifier may mint on its first ask.
- `emitWidened(ix, dst, fnIx)`: a `_`-less match on the plan, one writer per arm.
  - It replaces `emitExprAsI64`, `emitExprAsF64`, `emitExprAsF32` and `emitInstLitAs`, and their 78 call sites now call it.
  - `emitExprAsKind` is now one line.
  - The start function's three global-init widenings become one.
- `WidenArm` joins the kind-ladder lint's closed sets.

## Occurrence count, before the cutover

A throwaway copy of the three legacy ladders recorded the arm each widening took, on per-call
stacks so nested widenings could not overwrite it, and compared it with `widenPlanOf`.

| population | widenings | mismatches | by arm |
|---|---:|---:|---|
| self-compile | 866 | 0 | plain 866 |
| distilled corpus | 112,567 | 0 | plain 112,200 · floatLit 352 · instLit 15 |

In the failing control, the plan answered source kind 2 for the final `plain` arm, and 34 self-compile
mismatches appeared. Neither population reaches the `convert`, `asgLit` or `radix` arms. Their
equivalence rests on the plan following legacy's order line for line, and on the corpus identity below.

## Bars

Measured against master `71ff99b4`, on fixpoint seeds.

| bar | reading |
|---|---|
| self-build | fixpoint at the second compile; the armed self-build is byte-identical |
| corpus identity, master seed against this seed, 12,193 cells | 8,914 identical, 3,279 fail under both, 0 differ |
| `ir-shadow.vl` | 12,645 of 12,645 matched |
| L2 self-compile fuel | 92,677,399,986 to 92,685,788,362 (+0.009%) |
| seed size | 6,404,406 to 6,404,745 (+339) |
| compiler lines | +177 / −211, net −34 (with `WidenArm` added to `lint.vl`'s closed sets) |
| emit refusal sites | 849 before and after |

The fuel rise is the plan record each widening now builds.

## Next

C3b makes `numFloorWhy`'s `coerceHeld` an explicit argument. C3c is the I3 op-seam slice: the
builder emits `RCoerce(plan)`, the lowering calls `emitWidened`'s per-arm writers, and the six
seats delete once every reader goes through the plan.
