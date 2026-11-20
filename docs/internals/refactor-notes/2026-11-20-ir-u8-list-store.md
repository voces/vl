# IR: an element store into a byte list (2026-11-20)

`intrinsic none + store element` blocked 337 distilled functions together, every one a byte
buffer filled by `bs[i] = b` into a `u8[]` and handed to `__str_from_bytes__` (a probe naming
both refusals). The store half is storage: legacy writes a byte list's element store as the
receiver, the index, the value as a plain i32 (`emitIdxStoreValue`'s last arm) and
`idxStoreTail`, whose `array.set` on the packed backing truncates it, exactly as a push onto a
`u8` list (#9221) and a packed list literal take their values.

## The change
- `idxStorePlainWhy` no longer refuses a byte list; a nested row and a union element list stay
  refused.
- The builder delivers the value at `i32` for a `u8` element, and the verifier's element-write
  rule takes an `i32` value for a packed list, as its push rule already does.

## Measured on fixpoint seeds: #9239's head `0519711d1` against this branch

| | before | this branch |
|---|---|---|
| distilled `intrinsic none + store element` (pair) | 337 | 0 |
| distilled `intrinsic none`, alone | 19 | 356 |
| self-compile functions claimed | 18,088 | 18,089 |
| distilled functions claimed (`--claims`), all matched armed | 39,923 | 39,923 |

- **`ir-identity.sh`:** plain and `--names`, 9,037 identical, 0 differ, self-compile identical.
  `--cases`: 7,516 identical, 0 differ.
- **Mode 3:** cells and run cases byte-identical, and the self-compile identical.
- **L2 fuel**, same box against the base's seed: 102,871,877,477 → 102,876,930,736 (+0.005%).
- **Lines:** +11 / −14 in `compiler/`.

An enabler: the 337 functions now wait on `__str_from_bytes__` alone (`intrinsic none`, DEAD's
lane), and claim when it lands.
