# Step 7 L2: `structElemArrayLowerable` asks the type whether its element is declared, 2026-11-13

Closing census 5 graded `structElemArrayLowerable` (emit_shape_intern.vl) as failing. It asked
whether a list's element is a declared record with `cUserTypes[tyToNominalName(eTy)] >= 0`.
`tyToNominalName` renders a non-nominal record structurally (`{x: i32}`), so a spelling reached the
lookup. The lookup can only miss there: `cUserTypes` is keyed by declared identifiers,
generic-application memo keys (`Head<#…,`) and hidden literal-union aliases (`#luN`), and a record's
render is none of those. The question now goes to the type: `structNameOfTy(eTy) != ""`, the
declared-record test `elemTyIsNominal` already uses.

Measured on master `1efa7398`, whose fixpoint seed is 6,707,341 bytes. The population is the
sweep's 24,205 programs.

## Probe

Two scratch builds, never refreshed into `build/`, from the master seed:

- **Control:** fails loud wherever the old test answers true. It fired in 1 program.
- **Probe:** computes both tests at every call and fails loud where they differ. It fired in
  0 programs.

## Proof

- **Sweep**, both sides on fixpoint seeds: 24,205 same, 0 bytes-only movers, 0 output movers,
  0 `runs → not-runs`, 0 new compiler traps.
- Fixpoint (two refreshes byte-identical), `lint-self.sh` clean, `regress.vl` no runs lost,
  `check-filed-witnesses --strict` on both inventories 4,866 as filed, render-parse budget at or
  below its baseline.
