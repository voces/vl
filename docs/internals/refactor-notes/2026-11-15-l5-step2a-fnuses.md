# L5 step 2a: the per-function frame flags are one `fnUses` record, 2026-11-15 (lane Q)

The first slice of step 2 of `2026-11-14-phase-products-design.md` §3 (an explicit `FnCtx` in the
emitter). The 24 `fnUses*` module flags in `emit_state.vl`, one per scratch frame a function may
reserve, become the fields of one `fnUses: FnUses` record, built by `fnUsesNone()`.

## What changed

- **The function builder:** `resetFnScratchFlags` (`emitFuncCode`'s side) reset 22 flags line by
  line. It now does `fnUses = fnUsesNone()`. The two flags it never reset, `unionSink` and
  `unionLetSink`, are set by every caller right after it, so clearing them too changes nothing.
- **The start builder:** `startFnDetectFrames` reset 20 flags by hand. It now does
  `fnUses = fnUsesForStart(fnUses)`, a fresh record that copies the four fields this builder never
  cleared: `packedPush`, `mapVals`, `unionSink` and `unionLetSink`.
  - The asymmetry D1006/D1007 describes is kept as it was. It is now a named, four-line function
    instead of a missing line in a hand-kept list.
  - Closing it moves bytes (a stale `true` reserves an unused frame in the start function), so it
    is a row's change, not this refactor's.
- **Call sites:** the 296 references in 7 modules become `fnUses.<field>`. `fnUsesMap` is renamed
  to `mapFrame`, so that the field does not read as a `.map` call. Each import clause loses its
  flag names and gains `fnUses`.
- **The audit:** `scripts/emitter-state-audit.vl`'s frame-builder table reads the record's fields
  from `export type FnUses` and works out what each side clears:
  - every field at `fnUses = fnUsesNone()`;
  - every field a helper does not copy at `fnUses = HELPER(…)`;
  - each field `fnUses.F = …` writes.

  It reports the same table as before: 2 of 24 asymmetric, `packedPush` and `mapVals`.
  `tests/vl_emitter_state_audit_test.ts` names them `fnUses.packedPush` and `fnUses.mapVals`.

The seats `emitCoerced` coordinates, and `body: u8[]`, are later slices. Both need the context
threaded as an argument through `emitExpr`, and this slice does not do that.

## Gate

- **Seeds:** A is a fixpoint built from `git archive c607b893c`; it took three rungs from the
  stale fetched seed. D is a fixpoint built from this branch (two refreshes `cmp`-equal, sha256
  `a373bc84…`).
- **Identity:** `probe-rollback-census.ts --fingerprint` over `tests/cases`, `distilled/cells` and
  `distilled/named` gives **20,173 programs, 0 different**.
- **L2:** the L2 build of A's tree is identical under A and D. Guest fuel 87,148,042,216 (A) and
  87,150,271,615 (D), +0.003%, the cost of a field read in place of a global read.
- **The comment trim:** after one comment block was trimmed to the 4-line budget, the refreshed
  seed is `cmp`-equal to D.
- **Tests:** `tests/vl_emitter_state_audit_test.ts` and `tests/vl_instance_state_leak_test.ts`
  (one program after another on one instance), 18 passed. `regress.vl`: no runs lost.
  `lint-self.sh`: clean.

## Lines and ratchet

- **Lines:** the compiler is **+249 / −309, net −60** over 7 modules.
- **Ratchet:** `phase-state-census.vl` `cross` goes from 593 to **587**, with `emit_state.vl` going
  from 281 to 275; the baseline is rewritten. `hidden` is unchanged, because a frame flag was a
  per-function table, not a hidden argument.
