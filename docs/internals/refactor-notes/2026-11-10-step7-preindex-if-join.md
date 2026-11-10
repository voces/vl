# Step 7: an if-expression's join boxes come from the checker's record, not the pre-pass (2026-11-10)

Base: master `3de5b959` (#7033). Both seeds are fixpoints (two self-compiles, byte-identical).
The population is the sweep's 23,818 programs.

## What changed

* **The checker records every join type an if-expression or a `??` is checked at**
  (`inferIfJoinTys`, beside `inferJoinTys` in `check_inline_lit_union`, written by
  `noteInferJoin`). A `??` counts because it lowers as an if-expression.
* **`markInferredIfJoins` reads that table** and marks each join's value boxes with
  `markInferredJoinAtoms`, as the pre-pass did. It runs at the same moment, ahead of
  `collectMapFilterUse`, so the boxes are still dealt with the type indices.
* **`preIndexMintTrees` no longer has an `IfStmt` arm**, and `nodeMintOnRead` has none either.

## Why a table and not a reader

The value boxes (`{ i32 }`, `{ i64 }`, …) and the union box are allocated in `mAssignUnionHeaps`,
from flags. `uBoxIdx` is read directly at about 280 sites, frame layout among them, so a box first
asked for after the indices would need a mint-on-first-read getter at every one. The 2026-11-09
ablation lost 9 programs at `union atom has no value box` and its siblings, all for this reason. The
join's type is a checker fact, so a table of it replaces the tree walk without a reader.

`IfStmt` alone missed one program, `literal-unions/coalesce-litunion-int-default-arith.vl`. Its
`wt ?? 2.5` is a `BinExpr` to the checker and an `IfStmt` in the emitted tree. Recording every
`exprJoinsArms` node (blocks, loops, `match`) over-minted boxes in labelled-block programs, so the
table records the two forms that lower as an if-expression.

## Measured

Seed: master `3de5b959` 6,598,290 → 6,598,590 (+300).

* Sweep against base (both one-level builds by the same seed): 23,812 same, **0 runs → not-runs,
  0 new traps, 0 output movers**, 6 bytes-only movers. Each was built on both seeds and its type
  section compared with `wasm-dis`. The only difference is an unused union box and `{ i32 }` value
  box, present on one side:
  * gained (+10, +12): `functions/coalesce-bool-short-circuit-positions.vl`,
    `functions/coalesce-call-niche.vl`. The checker records a `??` at a boxing `i32 | null`
    join, and the emitter lowers it short-circuited.
  * lost (−10, −11): D14792, D15500, `generics/generic-optchain-get-null-at-boolean-instance.vl`,
    `strings/optional-builtin-method-on-nullable-receiver.vl`. The pre-pass marked an emitted
    if-expression the checker never saw as one (a desugared optional chain).
* Oracle (`cases_wasm_*`): 7,390 passed, 0 failed.
* Filed witnesses (`--strict`, both inventories): 4,680 as filed, 0 moved. D14041 and D14042
  refuse as filed.
* rep-fuzz exact. Self-lint and fmt-check clean. Late demands 6 (baseline 6). Render-parse
  41 / 82. plumb-shape cost ok. Seed size +0.1% over its baseline.

## Left in `preIndexMintTrees`

The `is K[]` arm (a record `K` with no row yet), the call arm and the signature annotations.
