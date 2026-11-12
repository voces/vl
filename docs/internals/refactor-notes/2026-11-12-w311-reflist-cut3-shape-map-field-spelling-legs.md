# Step 7 L2: the shape-text recorder's map-field spelling legs are deleted, 2026-11-12

Lane F's cut 3. `shapeFieldElemName` (`emit_shape_rows.vl`) records a field's element or value row
name. For a map field (code 19) or a nullable one (code 29), it read the name off the field's type
(`shapeFieldElemNameOfTy`, via `fieldElemRowName(tyMapValOfHeld(fty))`). Where the type left the
name empty, it fell back to the spelling: `mapValNameOf(ftxt)` and
`mapValNameOf(nulMapInnerName(ftxt))`. Stacked on cut 2
(`2026-11-12-w311-reflist-cut2-closed-type-keys-nominal-mints.md`).

## Measured

Validated `emitFail` probes over the sweep population (24,170 programs), counted as the first
marker per program:

| probe | programs |
| --- | --- |
| control: `shapeFieldElemName` called with a map code | ≥ 653 |
| a map code reaches either spelling leg | 0 |

Both legs are replaced by a loud floor: an invariant `emitFail`, "a shape field of map type
recorded no type to name its value row".

## Sweep

Fixpoint seeds, cut 2 (with master `89552a4a` merged) against cut 3, the whole population: same
24,170, bytes-only 0, output movers 0, runs → not-runs 0, new compiler traps 0.

| measure | before | after |
| --- | --- | --- |
| emitter type-string parses (render-parse census) | 36 | 34 |
| `emit_shape_rows.vl` parses | 11 | 9 (5 in the refArr* cluster, which cut 4 deletes, and H's 4) |

The render-parse baseline is lowered in this PR.

## Proof

Refresh to a fixpoint, at 6,735,818 bytes. `lint-self.sh`, `regress.vl` (no runs lost),
`rep-fuzz-check.sh` (exact), `check-filed-witnesses --strict` (4,847 as filed), late-demands,
seed-size (+2.2%), plumb-shape-cost and the render-parse budget (written) pass.
