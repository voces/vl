# Step 7: `scalarListElemKind` is one descriptor read, 2026-11-10

This is conversion 1 of `2026-11-10-step7-vkind-census.md` §4. Base is master `61d7d912` (#7091),
with a fixpoint seed of 6,600,459 bytes.

## What changed

`scalarListElemKind` (`emit_value_sites.vl`) answers the element kind of a scalar list for 19 call
sites in `wasmEmit.vl`. It used to ask five predicates in order:

- `exprU8Array`
- `exprF32Array`
- `exprF64Array`
- `exprI64Array`
- `exprArray`

Each of those is `exprListRep(exprIx, fnIx) == <list kind>`. So a call that ended at `exprArray` or
`null` read the descriptor five times.

It now reads `exprListRep` once and maps the list kind to its element kind with
`scalarListElemOfListKind`. That is the `_`-less `match` `wasmEmit.vl` already had, moved beside its
reader and exported, so its other three callers import it. Two things are unchanged:

- The order no longer matters, because the map is total over `VKind`.
- `u8list` keeps answering as its own kind.

This removes one VKind producer from the census, and five walks become one.

## Proof

- **Seed:** 6,600,459 → 6,600,415 bytes (−44). Two refreshes are byte-identical.
- **`tests/cases`:** `sweep.vl -- record --population cases` with the base and the candidate seed, then
  `diff`. All 7,421 programs are the same: 0 module-hash movers, 0 output movers, 0 `runs → not-runs`.
- **rep-fuzz:** exact. Also green: lint-self, seed-size, late-demands (6), the dead-export,
  render-parse and pin-helper budgets, cases_wasm, the inventory tests,
  `check-filed-witnesses --strict`, scaling-shape, probe-rollback and plumb-shape-cost.
