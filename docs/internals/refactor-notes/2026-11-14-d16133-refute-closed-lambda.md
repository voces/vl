# D16133: a set whose member the elaboration closed is refuted after it — D16133's ruling, stage 3

**Change.**
- `emit_elab.vl`, D16077's two parts from `i-d16077-hole-param-maker`, kept as far as the close
  needs: `elabValueCalls` follows an argument into the callee's calls of the parameter by name
  (`elabParamNameCalls`), and `elabLamHoleTysClose`, called from `elabEnqueue`, closes a
  hole-result lambda's type at its returned generic's delivery. New: it notes each lambda it
  closes (`mintLamClosedNote`).
- `check_mint.vl`: `mintLamClosedNote` / `mintLamClosed`, reset by each `elabRun`, since the
  notes are made during the elaboration, before `mintReset`.
- `check_fn_tag.vl`: `ftPlan`, after the elaboration, declines a set with such a member. A set the
  check tagged is dropped through `ftLateRefused` (D15484's path), so the next round builds the
  closure the instance takes.

**Taken out of the prototype.** Its row rewrite (`elabRowByLamGenResults`) and its mono pin arm
(`monoElabPin`) were ablated one by one: the witness, D16077's witness and the template grade the
same without them.

**Why (ii) and not (iii).** The refute arm uses the existing drop path. A program with no such
lambda runs no extra round; `tests/vl_scaling_shape_test.ts` passes.

**Measured.** `generic-returned-by-maker-through-hole-param.matrix.vl`, master `73e949088`
fixpoint against this branch's fixpoint: 0 runs → not-runs, 0 silent; `hole_param_inline` and
`hole_param_two_calls_one_type` move from an emit reject to runs.

**Size.** +249 net compiler lines (3 files), almost all of it D16077's elaboration; pin-helper
delta 0.

**Left.** D16079, D16130, D16131.
