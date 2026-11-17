# IR claim on: the IR's bytes ship for fully matched families

Coordinator, 2026-11-17. `CLAIMED` in `compiler/ir_build.vl` goes from empty to scalar, control,
call, global and map, the families mode 3 already proved byte-identical. A function whose every
node is in a claimed family is built, verified and lowered by the IR, and legacy does not run for
it. `list` stays out: claiming it reaches about 5,700 self-compile functions, but 2 fall back
(the folded global read), and the gate now forbids any fallback.

## What else changed

- `$VL_IR_SHADOW=5` (host and guest): disarmed, as shipped, but the rows print, so the claim is
  measurable.
- `ir-shadow.vl -- --claims` builds the distilled corpus in mode 5. It prints the claimed count
  and exits 1 on any `claim fell back` row. `gate.sh` runs it as the blocking `ir claims` row.
- The shadow's corruption controls also apply on the claim path, so a verifier failure there is
  tested: `vl_ir_shadow_test` shows a corrupted claim falls back, is counted, and ships legacy's
  bytes.
- Design §10 and DECISIONS record the reversal of the morning's parking.

## Readings (master 406e47810, WIP)

- Self-build with the claim: fixpoint, byte-identical to the legacy-built seed. Mode 3 counts
  2,178 claimed and 0 fallbacks.
- `corpuscmp` against master's seed, first cut: 7,133 buildable, 9 LOST and 11 DIFFER.
  - LOST, fixed here: the IR's direct call passed no environment to a callee with a hidden env
    parameter (`envSlotShift > 0`), giving invalid modules (`expected structref`). Such a call is
    now the named miss `callee environment`. All 9 build again.
  - DIFFER, open, blocking the claim:
    1. Wrong values. f32 constant trees fold differently (`(1.5 % 0.1) / (2.5 % 0.1)` prints `1`
       under the claim, legacy `1.0000001`), along with shift-mask folds, kept constant trees, and
       a nullable-string prefix. The armed shadow DOES flag these on `tests/cases`, but the gate's
       shadow runs only over the distilled corpus, so they were never seen. The shadow's gate
       population must include `tests/cases`.
    2. Type-section growth. Building a function the claim then rejects still mints type rows, so
       the claim adds unused struct and func types. Behaviour is unchanged, but bytes are not.
       Building must not mint.
