# D1680 and D16035: a standalone `?.` map leaf is the field's map struct's own nullable ref, 2026-11-13

Lane E. The orchestrator assigned it as the neighbour of D3459, inside the approved `?.` lowering.
The arm (option b) came first. The `mapShapeOfExpr` half (option a, D16035) waited for the step 7
close regeneration (#7886), because the close census grades exactly that kind of reader. Both land
in this PR.

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

D16035, after the regeneration:
- `mapShapeOfExpr` (compiler/emit_classify.vl) answers a standalone `recv?.f` over a map field with
  `sFieldMapShape` of the chain's struct, so an un-annotated binding takes the field's shape, not
  the string-keyed fallback.
- `emitCoalesceOptNulRecord` hands a map leaf to the nullable-map `??` core (`emitCoalesceNulRef`)
  at that shape, so `recv?.f ?? d` with a map default runs.

## Proof

- **Position matrix:** `scripts/capability-probes/matrix/optchain-map-leaf.matrix.vl`, whose proof
  reads a value back out of the map.
  - String-keyed: **0 → 66 of 66**, both faces, 0 `runs → not-runs`, 0 silent, 0 traps.
  - An i32-keyed variant: 0 → **64 of 66**, 0 silent, 0 traps. The arm alone reached 56; D16035's
    reader arm adds the 8 un-annotated bindings. The 2 `return_inferred` cells left are D1108.
- **Test:** `tests/cases/expressions/optchain-standalone-map-leaf.vl`, seven cells:
  - an empty map, both faces, and a null receiver;
  - a nested chain, a `Set` field, and an annotated i32-keyed map;
  - a `?.` argument;
  - an un-annotated i32-keyed binding, and `??` with a map default, hit and miss, at both key kinds
    and as `Map()`.

  The D1676 fixture `optchain-standalone-leaf-reps.vl` is unchanged.
- **Inventory:** D1680 is closed (its witness prints `0`), and so is D16035 (its witness prints
  `s`). Filed D16036, the function-value leaf. D15155, D15157 and `vl_emit_diag_position_test`'s
  `INSTANCE_WITNESS` had read a map leaf through a standalone `?.`. They now read a function-value
  field, refused at the same `lib.vl:7:16`, so the position guard keeps measuring.
- Sweep with fixpoint seeds on both sides: SWEEP.
- Render-parse census: CENSUS.
- `scripts/gate.sh`: all rows pass.
