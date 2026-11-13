# Step 7 P3: the shape walk's union arms are decided by type, 2026-11-13

This is lane E's work. `internShapeArms` (emit_shape_intern) walked a split union's arms. For
each one it peeled the recorded spelling's trailing `[]`s with `arrLeafNameOf`, tested for a
leading `{`, and otherwise stepped the arm's type down the same run with `tyStepArrRun` to ask
whether the leaf was a function.

## Changed

Each arm is decided by `arrSpineLeafTy` of its type:
- a record or map leaf interns through `internShapeDeepTy`;
- a function leaf walks through `internFuncTypeShapesTy`.

`arrLeafNameOf` (emit_base) and `tyStepArrRun` lose their last callers and are deleted.

## Probe

The probe used a scratch compiler with a distinctive `emitFail` on disagreement. A control (the
probe forced on) fired at all 1,488 reaches, over the sweep's 24,209 programs.

| candidate | disagreements |
| --- | --- |
| an undeclared record leaf, or a function leaf | 149 old-only: map arms (`{[K]:V}` starts with `{`) and declared records spelled inline |
| any record or map leaf, or a function leaf | 897 new-only: declared records spelled by name (`A`, `Circle`) |

No type-side test reproduces the spelling's choice between a declared record's name and its
inline form, because the same type takes either. The second candidate interns a declared
record's arm too, and that intern finds the row the declaration already has. So it was taken as
the change itself and graded by the sweep.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, parent commit against the candidate: 24,212 same,
  0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- Render-parse budget, `emit_base.vl` only: `ty-string-parse` 8 → 7.
- `scripts/gate.sh`: all rows pass.
