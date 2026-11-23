# A reference join's inner link opens at the chain's nullable type (2026-11-23, lane IR-N5)

`ref if chain null inward` was 9 corpus programs on master 4982aa4a, all in `distilled/named/`
(`ug_d3365_*`): a string `else if` chain whose head arm reads a hole instantiated nullable, so the
head link yields `null` and its inner links do not.

Legacy carries the chain's nullability inward (`emitIfExprRef`'s `nul`, `emitIfExprRefLink`'s
`chainNul`), so every link opens at the nullable blocktype. The builder already carried the same
fact (`refIfLink`'s `nulAcc`, written as `siJoinNul`), and the lowering opens a decided join at
`siJoinNul`. The miss on a link whose own `ifLinkYieldsNull` disagreed with the chain dated from
#9293 and guarded nothing.

## The change

`refIfLink` drops the miss. No legacy byte moves: only the IR builder changes.

New test case: `conditionals/else-if-chain-nullable-head-arm-then-non-null-links.vl`.

## What it unblocks

The 9 corpus cells cover and match, each a single function.
