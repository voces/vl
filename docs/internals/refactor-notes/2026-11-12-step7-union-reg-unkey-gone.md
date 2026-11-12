# Step 7 L6: the softened union key column is deleted, 2026-11-12

The softened key (`unKey`) was the union registry's second row identity: canon's render of a
member set, literals widened and member order kept. The plan that retired it starts at
`2026-11-11-step7-union-reg-unkey-dead-readers.md`. Its last readers with hits went in #7398
(the canonical-member fallback), #7402 (the let sites) and #7408 (the member-set-text lookup).

## Deleted

- The column and its index: `unKey`, `unKeyFirstRow`, `unKeyPush`, `unKeyAliasRow`, and their
  writers at every mint.
- Its readers: `unRowOfKeyId`, `unRowOfSoftKey`, `unKeyPushOfTy`, `softKeyOrNameKey`,
  `unRowNullLast`.
- Its producers' unused exports: `canonUnionKeyOfAnnName`, `canonUnionKeyOfText`, and
  `cukAtomsOfName` (which only the former read) with its `probe-map-classes.tsv` row.
- The A/B harness's mode 3 (the softened key's ID side), `unRowKeySame` (the `alias` bucket) and
  `unKeySweepRow` (the softened key's producer agreement).

## The licence moves to the type key

`unKeySweepPair` asks whether two rows under one key describe one union. It now compares the type
key (`unTyKey`), the key that fuses rows. Two rows under one type key that differ is the D1712
hazard. A full run over all 7,764 `tests/cases` programs finds one such pair: D15761 (filed),
record twins `Cat | Kot` and `Cat | { m: i32 }`, whose type keys are alike and whose variant
slices differ. The program prints its want today. `tests/vl_union_key_licence_test.ts` makes it
the control, pinned at its counts, and fails on any other pair. The orchestrator's ruling keys
the twins apart, by each member's exact checked type, as the tag key does (#7347). That is the
next cut.

## Proof

- **Local full sweep**, `sweep.vl record` with fixpoint seeds on both sides, against #7408 with
  master merged in:

  ```
  same                            23984
  bytes-only movers                   0
  output movers                       0
  runs -> not-runs  (blocking)        0
  new compiler traps  (blocking)      0
  only in candidate                   1   (D15761's own repro)
  ```
- **Locally, on the final merged tree:** refresh `--prove-fixpoint`, lint-self, `cases_wasm`,
  rep-fuzz, the dead-export budget, and the probe-rollback, union-key licence, inventory,
  memo-generation and state-audit tests. The format fix and the unused-import removal leave the
  seed byte-identical.
