# IR-N3: a `??` chain's untyped inner link (2026-11-24, lane IR-N3)

Legacy lowers `a ?? b ?? d` re-associated, as `a ?? (b ?? d)` (`coalChainMint`). It types the
minted inner link only for a struct-bearing or number-apart chain, or where `d` already has the
chain's type; otherwise the link carries no type and reps as its chain (`coalLinkChains`, inner to
outer). Legacy's classifier reads it so (`exprIsLitAtom`), and its bytes do too: the inner link's
null-test `if` is `(if (result (ref $7)))`, the chain's own box. The IR asked the link's own type and
missed (`rep ?`), at the link itself (`@binary ??`) or at its `holeMap` null test (`@if`).

## The shared decision (`coalLinkChainOf`)

`emit_state` exports `coalLinkChainOf(ix)`, the chain minted link `ix` reps as, or -1. Legacy's
`exprIsLitAtom` and the IR both call it (R8).

## The IR (`exprTyOf`, `chainLinkTy`, `ibLinkIfTy`)

An untyped `??` node that `coalLinkChainOf` names is of its chain's type (`exprTyOf` of the outer
link), so its rep and its temps follow. Along the `holeMap` arm, a minted link's null-test `if`
with no type of its own is noted at the link's type (`ibLinkIfTy`) before it is built. A minted
link that reaches any other arm builds as before and misses by that arm's own sentence.

## Grading — the position matrix (fixpoint seeds, base master b8dcfc1ba in its own tree)

MEASUREMENTS

## Legacy tails the IR calls

None new: `coalLinkChainOf` is a shared decision, not a tail.

## Measured (fixpoint seeds on both sides)

PROOF
