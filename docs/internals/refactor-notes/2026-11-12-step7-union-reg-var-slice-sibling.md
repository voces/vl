# Step 7 L6: the variant-slice key-sibling adopt is deleted, 2026-11-12

A step toward retiring the softened key (`unKey`). `unVarSliceAdoptKeySibling` was the last
reader of the column that could change a module: it pointed a one-member declaration's empty
variant slice at the first earlier row minted under the same softened key (D1492).

## The census behind it

A probe compiler, built in the scratchpad and never refreshed into a seed, recorded each entry to
the function and, when either one qualified, the sibling the softened key named beside the one
the type key (`unTyKey`) named. It read every `tests/cases` file and every distilled `cells/`
cell (9,202): 7 entries in 6 programs, and no sibling qualified by either key. D1492's repro does
not reach the function, and it still prints `3`.

## Changed

- `unVarSliceAdoptKeySibling` and its call in `emit_collect.vl` are deleted. D1492's row says so.

## What still reads `unKey`

- `unRowOfSetText` behind `unionRowOf`: `unionRowOfAB` (the `mvValUnionRow` floor) and five
  callers of `unionMemberTysOf` that hold only text.
- `unRowOfCanonMembers`, which is load-bearing.
- `unRowOfSoftKey`, D4320's one-list sites 27 and 28.
- The diagnostics: `unRowKeySame` in the A/B probe, `unKeySweepRow` and `unKeySweepPair`.
