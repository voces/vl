# Step 7 L6 (lane G, cut 10b): the union registry A/B harness's report side is retired, 2026-11-13

The base is master `a7479725`. After cut 10a (#7739) deleted the last writer of the A/B tally
(`unABProbe`), the harness's report side measured nothing. The coordinator ruled that an
instrument that tallies nothing is dead code.

## Deleted

In `emit_union_registry`:

- `unionRegistryABSweep` and its tables: `unABCnt`, the `UNAB_*` outcome codes, `unABSiteName`
  and `unABKindName`.
- The atom-test retry `unABAtomRetry` and its counters (`unRetryHit` / `unRetryMiss`).
  `unABMode` is the constant 0, so the retry always answered -1 and only tallied.
- What only the sweep's A/B half reached: `unionRowOfTyRaw` and `unionRowOfSpellingTy`.

Elsewhere:

- The sweep's one caller (`emit_sections`).
- Its entry in `lint.vl`'s pass list.
- A comment in `emit_nullable_rets` that named it.

No test or script reads the `unionAB/`, `unionSweep/` or `atomRetry/` keys. Only
`docs/internals/registry-by-type-id.md`, the harness's design note, describes them.

## Kept: the type key's licence

The sweep's pair compare (`unKeySweepPair`, with `unRowSetSameNullBlind`, `unRowVariantsSame` and
`unRowHasSlice`) is not A/B tallying. It asserts that two rows the type key would fuse carry
the same member set and variant slice, and `tests/vl_union_key_licence_test.ts` reads its
`keySweep/*` buckets under `$VL_REP_SHADOW`. It now runs as its own pass, `unionKeySweep`.
The first head of this PR deleted it, and the licence test caught that in CI
(`ci-native (4)`: `want keySweep/pair-keyed >= 1, got 0`).

## Kept

`unABOn` and `UNAB_N` stay. The per-site seam (`unSiteOnKey`, `unRowOfTyAB`) and other
lanes' armed instruments still read them.

## Proof

- **Seed:** fixpoint; 355 lines deleted.
- **Locally:** lint-self, the dead-export scan (0), regress (no runs lost), rep-fuzz (exact),
  check-filed-witnesses `--strict` (4,867 graded, 0 moved), late-demands (8, baseline 8), seed-size
  (+1.6%, down from +1.8%), and the comment, ladder, sentinel and scan budgets.
- **The full sweep:** CI's `sweep` label. Unarmed, every deleted path was a no-op, so the
  expectation is identity.
