# Step 7 L6: the let readers' registry membership asks the canonical type key, 2026-11-12

Sites 27 and 28, the two `isUNameAnnAB` tests in `emitLetDecl`, were the last typed lookups on
the softened key (`unKey`). They were kept for D4320's one-list collapse, a rep question said to
be decided before any row exists. #7379 added the type key as their fallback on a miss.

The base is #7400 (the `unRowOfCanonMembers` deletion).

## The census

A probe compiler, built in the scratchpad and never refreshed into a seed, recorded each
softened-key hit at these sites beside the type key's row. It read every `tests/cases` file and
every distilled `cells/` cell (9,202): 1,542 hits in 420 programs.

| | hits |
| --- | --- |
| the type key finds the same row | 1,448 |
| the type key finds another row | 94 |
| the type key finds none | 0 |

Both sites ask membership only (`isUNameAB` answers `d >= 0`), so a different row gives the same
answer. All 94 are a `string`-typed annotation, where the softened key finds one literal-union
alias row and the type key another.

## Changed

`unSiteOnTyKey` covers 27 and 28. `unRowOfSoftKey` is now read only by the A/B harness's mode 3.
