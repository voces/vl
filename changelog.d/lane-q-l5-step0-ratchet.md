## Infrastructure (Track F)

- **The phase-state ratchet** (L5 step 0): `scripts/phase-state-census.vl -- --check` fails when a
  compiler module gains a hidden-argument global (188 today), a cross-phase table (593) or a
  checker import from another phase (1,166 distinct symbols), against
  `scripts/phase-state-baseline.txt`; a gate row and a CI step, with a control test.
