# IR: a bare block mid-body (2026-11-20, lane IR-N2)

`drwBareBlock` rewrites a bare `{ … }` statement into `if true { … }` (D1253). It mints the `true`
after the checker has run, so the node has no recorded type. `exprAt` asked `exprRepOf` for its
rep, got none, and missed at `rep ?`. The self-compile's `collectVariantFields` stops there. Legacy
writes the block's statements in place, as it does for a written `if true`: the builder's decided
condition already writes that shape, and a written `if true` was covered and matched.

## The change

`exprAt` (`ir_build.vl`): a `BoolLit` with no recorded type is the bool immediate. A boolean
literal is a bool whatever its context, so this reads the tree, not a checker fact.

**A start body's bare block stays legacy's** (`top-level bare block`). Claimed, the start body of
`tests/cases/closures/sibling-fn-blocks-module-level.vl` (`{ const g = () => 1.5 … }` at module
level) minted its closures' two globals ahead of the constant ones where legacy mints them after.
The shadow matched it, and `ir-identity.sh --cases` found the difference. Global mint order under
a claimed start body is the start lowering's to settle; it is unreached on master.

**`spanClose` is linear in the nesting.** With bare blocks building, the scaling-shape guard's
6,000-deep nest of blocks, loops and `if`s reached the lowering whole. `spanClose` (`ir_lower.vl`)
scanned and rebuilt the whole open-span stack at every node, so its cost was quadratic in the
depth: ratio 10.6 against the 2.5 bar. Each function now counts the spans ending at each node
(`irSpanEnds`, filled by `irSpanNoteKind`). `spanClose` returns at once where none ends, and
otherwise scans down from the top only until those spans are closed, rebuilding just that
suffix. The guard passes, and the 1,200-deep nest costs the merge-base's fuel.

A bare block as a function's last statement, `{ return x }`, moves on to `valued tail if`, a
class of the control family.

## Witness

`tests/cases/scope/bare-block-mid-body-builds.vl` has a block with its own local, a nested block,
and a block in a loop body. Under the merge-base seed all three functions stop at `rep ?`. After,
all are covered and matched. Shadow row `BARE_BLOCK_MID`.
