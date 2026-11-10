# Step 7: a held list's record row is minted by type; `heldRepMintUnder` deleted, 2026-11-10

Base is master `1f0c88fa` (#7056), whose seed is 6,601,508 bytes; the candidate seed is 6,602,303
bytes (+0.012%). Under the ruling of one row per canonical type, mint order must not decide which
rows exist. #7020 kept `heldRepMintUnder` (a held node mints the held nodes under it first) because
record-row keying depended on that order. This PR removes the walk.

## 1. Why the rows depended on mint order

The witness is `two = [[{fs:[inc0]}], [{fs:[inc2, inc0]}]]` beside a function-local
`ls = [[{fs:[inc0]}]]`. With the walk disabled, its build was invalid wasm.

* The checker stamps both bindings with one held rep, `{fs:i32[]}[][]` (D15220 writes every
  list of a set's ids as the `i32` list it is). Both lists therefore take one ref-list slot, whose
  element is the record type `{fs:i32[]}`.
* Each record literal mints its own `#anon` row, keyed by its set GROUP (`hcRowHeldId`,
  D15560). `two`'s rows and `ls`'s row have different `slotCanonId`s and never twin.
* `annShapeIndexOf` aliased `{fs:i32[]}` to whichever `#anon` row with matching fields was
  interned first. That alias became the slot's element row.
* The read `ls[0][0].fs` resolves its row from the read's own type (`structIndexOfIndexExpr`'s
  type rung comes before the list's element row). It reads `ls`'s set row, so it agreed with the
  slot only when `ls`'s literal happened to mint first. That is what the walk arranged.

A second witness depended on the walk too: `lists = [[{fs:[[inc0]]}]]` beside
`rss = [[{fs:[inc0]}]]`. No mint other than the walk made a row for `{fs:i32[][]}`, so its slot
resolved to `{fs:i32[]}`'s row, whose layout differs.

## 2. The change

1. `collectAHeldRep` mints a held list's record element row from the rep's TYPE
   (`internShapeDeepOfTy(hr)`), ahead of the literals it holds.
2. `annShapeIndexOf` does not match an `#anon` row that `anonRowServes` refuses for the spelling's
   type. `{fs:i32[]}` is its own canonical type, so it gets its own row and never an alias
   decided by order.
3. Rows twin by a heap key, `slotHeapId`. It is `repRowId` with every tagged function leaf keyed
   as the `i32` it is stored as. `buildStructTwins`, `structLateTwinOf`, `repStructSlotRep` and
   `repStructSlotsTwin` read it. Rows apart only in the set group they hold stay apart as rows,
   so a reader that takes a set from a row's type still gets its own set. They share one wasm
   heap, so a value moves between them unconverted.

wasm-dis on `fn-tagged-records-of-two-set-groups-share-one-held-list-slot.vl` shows all three
literals at one record heap, where the base built two. The `{inc0, inc2}` read dispatches by tag
(`i32.eq` then `call`); `ls`'s one-member set calls directly.

## 3. Candidates measured

Each candidate was compiled by the base seed and graded on the witness; the last one was also swept.

| candidate | witness `fn-tagged-ids-in-records-in-nested-lists.vl` |
| --- | --- |
| walk off, no fix | invalid wasm in `local` (`#anon2` against the slot's row) |
| walk off, elem key keeps the set group (`hcRowHeldId` in the elem-mode object arm) | invalid wasm; the held rep is one type, so the slot does not split |
| walk off, `anonRowServes` gate | the first witness runs; `lists`/`rss` invalid (no `{fs:i32[][]}` row) |
| + by-type held mint | `viaRecord = [[r]]` invalid: `r`'s `#anon` row and the held row are distinct heaps |
| + heap-key twins (this PR) | runs, `4 4 4 4 4 5 4 4 4` |

## 4. Proof

The sweep diff of the base seed against the candidate, over 23,834 programs:

```
same                            23793
bytes-only movers                  41
output movers                       0
runs -> not-runs  (blocking)        0
new compiler traps  (blocking)      0
only in candidate                   2
```

The bytes-only movers are the D15220/D15296 named cells, D15220 and D15558's witnesses, and the
`closures/fn-*-written` and `fn-tagged-ids-*` cases: the held-record family, now built at one heap.
The two only-in-candidate programs are the new fixtures:
`closures/fn-tagged-records-of-two-set-groups-share-one-held-list-slot.vl` (the first witness)
and `closures/fn-tagged-records-held-lists-of-two-depths.vl` (the second, plus a bound record
that is then held). Each is invalid wasm on a walk-off compiler without the fix.
