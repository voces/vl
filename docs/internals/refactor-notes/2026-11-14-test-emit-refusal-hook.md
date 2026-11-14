# The `--test-emit-refusal` hook: a stable witness for the instance-position guard, 2026-11-14

Lane E. This builds the proposal in `2026-11-14-instance-position-witness.md`, which the
orchestrator approved under two conditions. It differs from the proposal in one respect: it is not
a new intrinsic but a reserved function name that only the flag gives meaning, so no checker rung
or kind-ladder arm is needed.

## What it is

- `vl check --test-emit-refusal` (compiler/cli.vl) sets `gTestEmitRefusal` (compiler/emit_state.vl)
  for the compile and clears it after.
- While it is set, `emitCall` (compiler/wasmEmit.vl) refuses a call to a function named
  `__vl_test_emit_refusal__` with `emitFailAt(TEST_EMIT_REFUSAL_MSG, <the call>)`. That covers the
  bare name in one file and the `$m<id>`-suffixed name a module build gives it.
- The test declares the function itself, as an ordinary empty function. Without the flag it is just
  that, and the program compiles and runs.

## The two conditions

1. **No user program can reach it.** Only `--test-emit-refusal` gives the name a meaning, and only
   the harness passes it. The flag is not in `vl check --help`, `std:`, the docs, LSP completions or
   the playground. A user program that happens to declare `__vl_test_emit_refusal__` compiles and
   runs as written.
2. **It is never counted.**
   - `scripts/emit-refusal-sites.vl` skips a call whose argument is `TEST_EMIT_REFUSAL_MSG`. Its site
     count stays at master's 840.
   - The message matches none of `scripts/goal-scoreboard.vl`'s phrases.
   - No probe passes the flag, so `scripts/capability-probes.vl` (`live-sites.json`) never reaches
     it.

## The guard

`tests/vl_emit_diag_position_test.ts`'s `INSTANCE_WITNESS` now calls the hook inside `take`'s
body on line 7 and passes the flag. All five shapes anchor at exactly `lib.vl:7:28`, which the test
now asserts down to the column: one file, a later function, a wrapper call, imported, and imported
through a generic instance. No capability fix can move it.

D15155 and D15157 keep their repro, D2467's `as?`. The inventory witness grader passes no flags, so
a row cannot use the hook. When D2467 closes, those two rows should be retargeted or closed onto
this test rather than moved to another gap.

## Proof

- Without the flag the hook program compiles and runs (`vl check --codegen` clean; `vl run` prints
  the hook's body). With it, the refusal fires once, at the call, in one file and through an import.
- The emitter-state audit is clean (`NEVER 0`).
- Sweep with fixpoint seeds on both sides: SWEEP.
- `scripts/gate.sh`: all rows pass.
