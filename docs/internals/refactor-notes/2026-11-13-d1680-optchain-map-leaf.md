# D1680: a standalone `?.` map leaf is the field's map struct's own nullable ref, 2026-11-13

Lane E. The orchestrator assigned it as the neighbour of D3459, inside the approved `?.` lowering,
and chose to land the arm on its own (option b). The `mapShapeOfExpr` half waits for the step 7
close regeneration, because the close census grades exactly that kind of reader.

## Defect

`const v = b?.y` with `y: {[string]: i32}` was a loud emit refusal (``a standalone `?.` has no rep
for a map or closure leaf field``) at both faces. The row's open half, whether `{[K]: V} | null` is
a rep at all, is settled on master: a nullable map return, field and `let` all run.

## Changed

`emitOptMemberValueGo` gains a map arm beside the list arm, with the same shape: a null receiver
chain yields `ref.null $map`, a live one reads the field. The heap is
`mapTypeIdxOf(sFieldMapShape(osi, ofi))`, which calls the existing field reader and does not
change it. An open (`-3`) shape refuses loudly. The closure leaf keeps its refusal, now naming only
the closure.

## Proof

- **Position matrix:** `scripts/capability-probes/matrix/optchain-map-leaf.matrix.vl`, whose proof
  reads a value back out of the map.
  - String-keyed: **0 → 66 of 66**, both faces, 0 `runs → not-runs`, 0 silent, 0 traps.
  - An i32-keyed variant: 0 → 56 of 66, 0 silent, 0 traps. The 10 left are loud: 8 un-annotated
    bindings are D16035, and the 2 `return_inferred` cells are D1108.
- **Test:** `tests/cases/expressions/optchain-standalone-map-leaf.vl`, seven cells:
  - an empty map, both faces, and a null receiver;
  - a nested chain, a `Set` field, and an annotated i32-keyed map;
  - a `?.` argument.

  The D1676 fixture `optchain-standalone-leaf-reps.vl` is unchanged.
- **Inventory:** D1680 is closed and its witness prints `0`. Filed:
  - **D16035:** `mapShapeOfExpr` answers nothing for an `OptMember`, and the fused `?? d` has no
    map arm. Deferred, with (a) pre-approved after the regeneration.
  - **D16036:** the function-value leaf.
- Sweep with fixpoint seeds on both sides: SWEEP.
- Render-parse census: CENSUS.
- `scripts/gate.sh`: all rows pass.
