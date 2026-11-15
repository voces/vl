# Every quiet level goes through `quietEnter` or `quietEnterFlat`, 2026-11-15

After relate P3 (#8380), a quiet level drops the pin notes it wrote, through the `quietPinFn` slot
that `quietEnter`/`quietLeave` call. Four quiet levels still set `inferQuiet` by hand:

- three read-only asks that do not raise `quietDepth`, which called the slot directly:
  `callArgRepTy`, `callRetRepTy` and `annTyNow`;
- one that did not call the slot at all: `ifaceCallsOf` (`check_iface_shadow.vl`, L2 S0's shadow
  printer, #8370). Its substitution's pin notes were therefore kept after P3 removed the gate.
  That happens only under `$VL_IFACES`.

`quietEnterFlat`/`quietLeaveFlat` (`check_cursor.vl`) are `quietEnter`/`quietLeave` without the depth
step, so an ask made at the elaboration's own level stays at it. All four sites use them now. The
census's `inferQuiet` scopes are the two entries themselves.

## Measurements

- `inferQuiet` hidden scopes (phase-state census): 5 → 2 (`quietEnter`, `quietEnterFlat`). `--check`
  passes.
- Fixpoint: two refreshes cmp-identical.
- `probe-rollback-census.ts --fingerprint` over 20,453 programs: master's fixpoint seed at `55151b05`
  and this one's are identical. `ifaceCallsOf` runs only under `$VL_IFACES`.
- Net compiler lines: +4 (28 added, 24 removed). `emit_mono.vl` functions: 908.
