# IR S1c: init functions claimed, 2026-11-18

Lane IR2, stage 1 step S1c of `2026-11-18-ir-s1-start-design.md`, after S1b (#9055). No emitted
byte moves.

## What landed

- A module set split into init functions (`gInitMods` non-empty) runs each module's top level in
  its own init function `k`, the same body as the single start over its window
  (`startWalkWindows`), with no pool fill. Its body is now shadowed and claimed as the start's is:
  `irShadowStart` and `irClaimStart` take `poolFill`, true only for the single start, and the
  lowering opens with the pool fill only when the IR function says so (`IrFn.irPoolFill`), not
  for every function at `irAt` -1.
- The start entry of such a set (the pool fill, then one call per init function) stays legacy's:
  it is a fixed prologue and call list, no top-level code.
- The string accumulator scan runs once over the whole top level, in the start entry, so an init
  function reads the whole program's answer; any accumulator anywhere keeps every init body a
  named miss, as before. The progress cell stays a whole-body named miss.

## Readings (master `a472ea60` against this branch, fixpoint seeds both)

- Start-order matrix: `multi-module-init/` now covered and claimed (three init bodies); the
  per-module init cases `modules/start-init-per-module/entry.vl` and `entry2.vl` claim 2 and 3.
  Corpus oracle: `modules/` 205 passed, `start-order/` 9 passed.
- `ir-identity.sh --cases`: `identical 7472, fail under both 69, differ 0`.
- Identity, distilled cells and self-compile: `identical 9032, fail under both 3267, differ 0`,
  plain and `--names`; self-compile identical.
- Armed shadow over `tests/cases`, the probes and the corpus: 0 mismatch, 0 fail; start bodies
  (single starts and init functions) 4,572 covered = matched of 17,019, up from 4,199 of 15,157;
  functions 66,334 covered = matched.
- Mode 3: self byte-identical; corpus `claimed start` 2,856 (from 2,676); identity `differ 0`.
- `--claims` 30,511, `ir-shadow: ok`, none fell back.
- L2 fuel 97,684,388,142 against master's 97,683,371,730 on the same box (+0.001%).
- Pin helpers 904; phase-state census flat; ladder sets ok; lint clean; IR tests 27 passed.
- Net lines in `compiler/`: +40 -30, net +10.
