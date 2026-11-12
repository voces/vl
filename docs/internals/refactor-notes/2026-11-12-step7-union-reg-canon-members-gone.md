# Step 7 L6: `unRowOfCanonMembers` is deleted, its last hit gone, 2026-11-12

`unRowOfCanonMembers` read the softened key (`unKey`) with the sequence of a union's canonical
member texts. It was the fallback behind the type key in `isUNameAB` and
`unRowOfKeyOrMembers`. #7261 kept it as load-bearing: its one census hit was
`maps/narrowed-map-arm-delivery-positions.vl`, which failed to validate without it.

## The census

A probe compiler, built in the scratchpad and never refreshed into a seed, recorded each row it
found. It read every `tests/cases` file and every distilled `cells/` cell (9,202) on master plus
#7395: 0 hits. The type key now finds every row it found. `narrowed-map-arm-delivery-positions.vl`
prints what master prints without it.

## Changed

- `unRowOfCanonMembers` and its private predicate `tyNestsValueUnion` are deleted.
- `unRowOfKeyOrMembers` is deleted too, now that it is the type key alone. Its three callers ask
  `unRowOfTyKey`.
- `isUNameAB` answers from the typed row and `unSiteWideHit`.

## Proof

- **Local full sweep**, `sweep.vl record` with fixpoint seeds on both sides, against master
  `cbdd0445`:

  ```
  same                            23972
  bytes-only movers                   0
  output movers                       0
  runs -> not-runs  (blocking)        0
  new compiler traps  (blocking)      0
  ```
- **Locally:** lint-self, rep-fuzz, `cases_wasm`, the memo-generation, state-audit and scaling
  tests, emitter-state-audit, capability probes (`--live-sites`, `--floor`), splice-scan,
  seed-size, late-demands, and the dead-export and render-parse budgets. The render-parse count
  fell to 16 tyToEmitName calls, and the baseline is left for the central re-baseline.
