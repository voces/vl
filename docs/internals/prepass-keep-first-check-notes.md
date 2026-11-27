# Return-inference pre-pass: keeping the first check (fix A), parked

Coordinator ruling 2026-11-27: parked. Measured on master's self-compile (after #10501).

## Cost
`inferReturnsPrePass` costs about 7.1G of the ~141G L2. COV-START took it as inclusive guest fuel of
the stacks that contain the function, using `VL_FUEL=1 VL_PROFILE_GUEST_FUEL=1` on a `--names` seed.
Most of that is 374 pending first checks (COV-START counted 383) of cycle members, and the main pass
checks each of those bodies again.

## Why the cheap version does not exist
* Only 34/374 first checks read no pending return (`pendRetCalls` unchanged, no cycle break, no
  tentative push). A recursive function's self-call reads its own provisional return
  (`check_calls.vl`, the `inferStack` top arm).
* A relaxed rule admits 264/374, about 3.5% of L2: the only pending reads are self-calls whose
  provisional type equals the final return, there is no other pending read, and there is no cycle break.
* Cleanliness is known only after the check, so the loud check would have to be speculative. A
  speculative loud check rolled back with `checkRollback(m, RB_ALL)` and redone quietly, keeping
  none, changes 5 self-compile functions: `rawEff`, `imm`, `litArmsAt`, `cboxYieldRets` and `mapOp`.
  `rawEff` folds a node-kind compare to a constant. The leak is the ~120 `!inferQuiet` write sites
  that no rollback family covers, for example the lit-union return publish in
  `check_inferred_return.vl` (`tyIsLitUnion(inferred)`).
* Splitting the pre-pass into one quiet run per pending member (`quietRunEnd` + `quietRunDrop`
  around each `preInferOne`) is byte-identical on its own, so segmenting is not the problem.
* Skipping pass 2 for a body whose first check read its own provisional return breaks the build:
  `slotFreshLitOf`'s if-expression keeps a `TY_ERR` stamp.

## What would unblock it
An exact rollback of loud-only checker state, or a predictor of a clean first check that runs
before the check. Either is a restructure of the checker's ambient state, not a pre-pass change.
Compare seeds against a FIXPOINT of the same source: the shared `build/vl-compiler.wasm` may not be one.

## Second look (COV-START, 2026-11-27, after #10520): what the quiet checks are
- The pre-pass checks 3,699 bodies quietly. None is a lambda or nested function: all are top-level declarations.
- Only 840 are cycle members. The other 2,859 are non-cycle callees a cycle member reaches, inferred on
  demand (checkCallOnFuncTy > checkFuncDeclNode), rolled back (RB_RETURNS keeps the returns) and checked
  loudly again in pass 2.
- By exclusive checkNode visits (293,009 quiet): cycle members 44%; non-cycle callees reading a module let
  42%; movable non-cycle callees (params annotated, no module let, no pending read) 14%, about 0.76% of L2.
  Parked as under 1%.
- Design limit: a non-cycle callee can't move ahead of the pre-pass. Pass 2 keeps source order on purpose.
  An un-annotated callee's parameter holes are solved by its callers' calls, and a module let is narrowed
  by the top-level code before a call (eagerCheckable). Neither fact exists before the pre-pass.
- On the self-compile every such callee annotates its parameters, so the hole limit costs nothing there;
  the module-let limit costs 42%.
- The CLI stable-sorts diagnostics by position, so moving a loud check changes the printed order only for
  ties at one position.
