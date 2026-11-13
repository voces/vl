# Step 7 (lane D, D16032 step 1): a value union's read names its row by type, 2026-11-13

D16032's design item is the `unNames` table looked up by label text. Its readers get their name
from `unionNameOfRead` / `unionNameOfExpr`. Both already resolve through the read's type and carry
that type's row out (`unReadRowOut`, `unNameRowOut`), but `regUnionRowOfTy` answered -1 for a value
union. A value union's name is its key text, so every value-union read fell back to looking that
text up in `unNames`. `regUnionRowOfTy` now answers the row its type keys for a value union too.
The consumers (`msSetOfRowOr`, `unionMemberSetOfRow`) take the row and no longer reach the name.

## Measurement

Four MPROBE builds over the 24,070-record population:

| question | same | key only | label only | differ |
| --- | --- | --- | --- | --- |
| label row vs type-key row at the binding guards (all sites) | — | — | 64 (a1427) | 58 (k225 52, c8714 5, a2582 1) |
| the same at `monoPinMintedUnion`, against the annotation's type `wt` | 665 programs | 363 | 0 | 0 |
| producers: carried row vs the returned name's row | 710 + 1 + 1 | 0 | 1,563 + 168 + 168 | 0 |
| value-union arm: `unRowOfTyKey(ty)` vs the key text's row | 1,563 programs, 6,482 decisions | 23 | 0 | 0 |

The producers' label-only rows are the value-union arm. Where a carried row exists it never
differed. The 23 key-only programs are where the key finds a row the key text does not.

The binding guards' differ rows are numeric literal unions (lane G's half of D16032). The label-only
rows at `pushValueUnionRow` are the label folding an alias (`F32x4` → `v128`), a brand (`NtI32` →
`i32`) or a literal set that the key keeps apart. A first probe of `monoPinMintedUnion` against
the pinned argument's type reported 7 label-only programs; against the annotation's type there
are none.

**Byte comparison:** master vs this change, 1,580 of 1,580 programs reaching the value-union arm
build identical, the 23 key-only programs among them.

## Proof

- **Seed:** fixpoint (`cmp`).
- **Locally:** lint-self, `scripts/gate.sh`, `mono-tyaram-grid.sh`.
