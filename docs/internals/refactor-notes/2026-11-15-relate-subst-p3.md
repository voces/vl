# Relate P3: pin notes are dropped by the quiet level that wrote them, 2026-11-15

Step P3 of `2026-11-15-subst-pure-design.md`, on lane Q's `RB_ELAB_PIN` mark (L5 step 3b, #8350).

## Change

- `notePinnedHole` and `elabHolePinNote` no longer test `inferQuiet`. The pin notes they write, and
  `elabPinBindingIs`' register, are now undone by the quiet level that wrote them.
- `elabPinQuiet` (`check_elab_cap.vl`) does the undo. A quiet level that turns pin notes from kept
  to dropped marks the family on opening (`elabPinMark`) and rolls it back on leaving
  (`elabPinRollback`). "Kept" means `elabCapLive() || !inferQuiet`. So a level opened inside the
  elaboration's capture, at its own depth, keeps what it notes, as today.
- `quietEnter`/`quietLeave` reach `elabPinQuiet` through the `quietPinFn` slot, installed by
  `check_program` beside `checkerForceFn`. `check_cursor` cannot import the elaboration module.
- Six brackets now call `quietEnter`/`quietLeave` instead of setting `inferQuiet` and `quietDepth` by
  hand: `fitsExpr`, `assignableExprIn`'s rep-stamp re-ask, `dstTyParamAdapts` ×3 and
  `binCstrPairRefusal`. The six saved flags they left unread are gone. The two brackets that do not
  raise `quietDepth` (`callArgRepTy`, `callRetRepTy`) and `annTyNow` call the slot directly, since
  raising the depth there would change where the elaboration's capture is live.
- No `RB_*` site set changes: every quiet level now passes through the slot.

## What it pays back

The substitution's pin notes no longer depend on the mode. That was the largest of the three
`inferQuiet` dependences the design found under `substTyDeep`: 1,115,994 notes in 9,636 programs.
P1's lint note and P2's annotation types were the other two. What it unblocks:
- P4: `shMemo` drops its quiet key.
- P5: the `callArgRepTy` and `callRetRepTy` brackets.

## Measurements

- `inferQuiet` hidden scopes (phase-state census): 10 → 4. The rest are `quietEnter` itself, the
  two no-depth brackets and `annTyNow`. `--check` passes.
- Fixpoint: two refreshes cmp-identical, 6,369,035 bytes.
- `probe-rollback-census.ts --fingerprint` over 20,434 programs (`tests/fixtures`, `tests/cases`,
  the distilled `cells/` and `named/`): master's fixpoint seed at `d31ab444` and this one's are
  identical.
- L2 self-compile fuel, each fixpoint seed compiling its own tree: master 89,534,934,239, this tree
  89,549,606,944. That is +14,672,705, or +0.016%. A prototype measured before the bracket
  conversion gave +0.027%, with a median-of-10 self-compile CPU of 36.9 s against master's 37.15 s.
  The `quietPinFn` call is inside both numbers.
- The gate turned away 28,917 notes on the corpus (28,848 at `notePinnedHole`, 69 at
  `elabHolePinNote`). Those are now written, then dropped.
- The hook's three states are reset per program beside `elabPinsClosed`
  (`emitter-state-audit.vl --check` holds at 0).
- Net compiler lines: +29 (67 added, 38 removed). `emit_mono.vl` functions: 908.
