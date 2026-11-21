# IR: a bare block mid-body (2026-11-20, lane IR-N2)

`drwBareBlock` rewrites a bare `{ … }` statement into `if true { … }` (D1253). It mints the `true`
after the checker has run, so the node has no recorded type. `exprAt` asked `exprRepOf` for its
rep, got none, and missed at `rep ?`. The self-compile's `collectVariantFields` stops there. Legacy
writes the block's statements in place, as it does for a written `if true`: the builder's decided
condition already writes that shape, and a written `if true` was covered and matched.

## The change

`exprAt` (`ir_build.vl`): a `BoolLit` with no recorded type is the bool immediate. A boolean
literal is a bool whatever its context, so this reads the tree, not a checker fact.

A bare block as a function's last statement, `{ return x }`, moves on to `valued tail if`, a
class of the control family.

## Witness

`tests/cases/scope/bare-block-mid-body-builds.vl` has a block with its own local, a nested block,
and a block in a loop body. Under the merge-base seed all three functions stop at `rep ?`. After,
all are covered and matched. Shadow row `BARE_BLOCK_MID`.
