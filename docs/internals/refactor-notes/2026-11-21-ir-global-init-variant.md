# IR: a bare-arm global's initializer (2026-11-21)

`startInitArmOf` names a global whose cell is one union arm `variant`. Legacy writes its
initializer with `emitVariantCoerce(globalCellStructIdx(gst), init)`: the arm's struct, whatever
builds it, as a local of that type is. The IR missed the arm (`global initializer variant`). It now
delivers the initializer at the cell's rep with the cell's type as the destination
(`globalInitVariant`), so a literal or a value built at another row takes the variant coercion arm
`deliver` already has. The arm unbox check (`globalInitArmUnboxes`) applies as on the plain arm;
legacy runs `emitGlobalInitArmUnbox` after both. A value that still arrives at another rep misses
as `global initializer variant coercion`.

**Not taken: `global initializer coercion`.** Its 81 tests/cases start bodies split into 41 plain
values, 24 `Map()` constructors and 11 closures (the split was taken from a scratch build that names
the three sites apart). The values are records (24) and lists (17) built at another rep than the
cell's, plus 5 boxes read at a number. That is a conversion, not a delivery gap: passing the cell's
type to `deliver` moves none of them. Holding a `Map()` at the cell's type moves all 24 to
`open temp type`, because their cell types still carry type variables (hole-function maps). Both
attempts were reverted. The family overlaps IR-D1's constant cells (I8a), which call
`globalInitValue` as is.

Measured on fixpoint seeds at merge-base `c8fb4410`: `tests/cases` armed shadow start covered
4,000 → 4,013, matched 3,999 → 4,012, the same 6 fail or mismatch rows; self-compile 19,292 and
corpus 43,431 unchanged and all matched. Of the 37 start bodies the arm blocked, 11 now match and
the rest stop at other classes, one at `global initializer variant coercion`.

Legacy lines deleted: 0. Moved to `@ir`: 0.
