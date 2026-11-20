# IR: an element store into a reference list (2026-11-20)

`store element` blocked 34 self-compile functions alone. A probe naming `idxStorePlainWhy`'s
refusing flag split them: 28 a plain reference list (`isRef`, `xs[i] = record`), 5 a union element
list, the rest a byte list or a nested row. For a plain reference list legacy's element store is
the scalar and string lists' own: receiver, index, the value as itself (`emitIdxStoreValue`'s last
arm), then `idxStoreTail`; the IR's store and its lowering (`irLowerRefListSet`) already write
that, so the refusal of `isRef` was the only gap.

## The change
- `idxStorePlainWhy` refuses a byte list, a nested row and a union element list, no longer a plain
  reference list. Its other refusals (a seed, an atom, an arm unbox) stand.

## Measured on fixpoint seeds: master `b78f12c2f` against this branch

| | master | this branch |
|---|---|---|
| self-compile functions claimed | 17,813 | 17,839 |
| self-compile `store element`, alone | 34 | 6 |
| distilled functions claimed (`--claims`), all matched armed | 39,911 | 39,915 |

- **`ir-identity.sh`:** plain and `--names`, 9,037 identical, 0 differ, self-compile identical.
  `--cases`: 7,516 identical, 0 differ.
- **Mode 3:** cells and run cases byte-identical, and the self-compile identical.
- **L2 fuel**, same box against master's seed: 102,583,841,377 → 102,565,229,057 (−0.02%).
- **Lines:** +3 / −4 in `compiler/`.

## What is left
- `store element` 6: a union element list (`emitUnionBoxAtRecord`), a byte list, a nested row.
- `store element seed` 4: a literal-union, `boolean | null` or `string | null` element list.
