# Step 7 L6: the direct typed lookups ask the canonical type key, and `unRowOfKey` is retired, 2026-11-11

#7232 put every A/B site but the two one-list readers on the canonical type key. Nineteen other
callers asked the softened key directly through `unRowOfKey(ty)` (`emit_rep.vl`), without the
A/B seam: the anonymous-field rows, the classifier's union reads, the shape interner's field
codes, the rep tree's element rows, `unRowOfRecordTy`'s first rung, `unRowOfKeyOrMembers` and
the type-key adopt. This PR moves all of them to `unRowOfTyKey` and retires `unRowOfKey`.

The base is #7232 on master `1d517770`.

## Changed

- **Every direct `unRowOfKey(ty)` call is now `unRowOfTyKey(ty)`**, in 9 files.
- **`unRowOfSoftKey`** (`emit_rep.vl`) is the softened key's one typed reader. Only `unRowOfTyAB`
  asks it, for sites 27 and 28 and harness mode 3.
- **The type-key adopt** (`unNameAdoptTyKeyRow`, `emit_union_tykey.vl`) compared the canonical
  key's row with the softened key's and kept the softened one when their record atoms differed.
  Both lookups are now the same call, so that branch is gone. Gone with it are the code that
  aliased the softened key to the canonical row, `utkNameStructText`, `utkRowStructText` and
  `utkStructText`.

## The reading

Every `tests/cases` file and every distilled `cells/` cell (9,202) was built with #7232's L1
seed and with this candidate's L1 seed:

| | programs |
| --- | --- |
| byte-identical | 9,200 |
| bytes-only, same output | 2 |

The two are `unions/deep-is-json-shape-walk.vl` (17,789 → 17,800 bytes, the same 37 lines) and
`unions/print-if-expression-join.vl` (the same size and the same 5 lines). Both hold a recursive
alias or a record union whose row only the canonical key finds, the census's "canon-only"
class. The adopt's simplification and the dead-code removal are byte-identical over the same
9,202 programs.

## What still produces a softened key

The key column `unKey` remains, minted by `unKeyPushOfTy` and aliased by each spelling bind. A
probe over the same population counted every key-producing call of `canonUnionKeyOfName`:

| caller | keys | programs | floor |
| --- | --- | --- | --- |
| `canonUnionKeyOfTy` (`unRowOfSoftKey`, `unRowOfRecordTy`, the mint, the `own` fallback) | 271,855 | 4,392 | sites 27 and 28, D4320's one-list collapse; `unRowOfRecordTy`'s rungs |
| `softKeyOrNameKey` | 12,863 | 4,118 | a name-only seam that holds a spelling and no type |
| `unKeyPushOfTy` | 3,982 | 2,713 | the mint of the `unKey` column itself |
| `canonUnionKeyNullAtOfTy` | 3,901 | 87 | `unRowOfRecordTy`'s `null`-position rung |
| `unRowOfSetText` | 3,092 | 312 | a member set's own text, with no type behind it |
| `isUNameDeclAB`, for a name no declaration types | 2,623 | 377 | the same: a spelling only |
| `unRowOfRecordTy`'s spelling rung | 1,375 | 64 | a recorded box type whose key misses |
| `unNameBindRow` | 121 | 103 | aliases a spelling to its row |
| `unRowOfCanonMembers` | 3 | 3 | a nested value union's member sequence |

`isUNameKeyAB` with no type, `unNameShareTyKeyRow`, the key-row adopt, the box-destination
shadow and the key sweep are not reached in this population. The last two run only under the
shadow harness. So `canonUnionKeyOfName` cannot be deleted yet. Its floor is the name-only
readers, which hold a spelling and no type, plus sites 27 and 28 and `unRowOfRecordTy`.

## Proof

- **Bytes**, as above. CI's sweep grades the whole population.
- **Locally:** one refresh, lint-self (clean), rep-fuzz, distilled `regress.vl`, seed-size,
  late-demands, the dead-export and render-parse budgets, and `cases_wasm`.
