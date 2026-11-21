# IR: a `??` chain builds from links minted ahead of the bodies, 2026-11-21

`a ?? b ?? d` parses as `(a ?? b) ?? d`. Legacy's `emitCoalesceGo` re-associates it to
`a ?? (b ?? d)`, minting and typing the two links each time it lowers the chain. An IR claim
cannot mint, because a claim-time plan is read-only. So the IR's `coalesce` stopped at the named
miss `coalesce chain`.

## The change

- **`coalChainMint`.** This is legacy's chain arm lifted out of `emitCoalesceGo`, unchanged: the
  two `mkBinary` links, `coalLinkChains`, the struct-bearing or numbers-apart union typing,
  `coalLinkTyAt`, and `numDeliverStamp`.
- **`coalChainsPrime(n)`.** `emitModule` calls it right before `buildCodePayload`. It walks each
  `fnStmts` body in source order, inside that function's `nodeTyInstEnter` frame. It mints each
  chain's links and then walks the outer link in the chain's place, the way lowering reaches it.
  It skips nested `FuncDecl`s. The table maps chain node → `[fnIx, outer link, ...]`.
- **`coalChainLinkOf(exprIx, fnIx)`.** Both sides read the table through this one reader.
  `emitCoalesceGo` mints as before on a miss. A miss covers the start and init bodies, and any
  chain lowered under a per-arm read override (`luOvOn`). A for-in over a union of lists lowers
  the same `??` once per arm at different types, so a per-(node, fnIx) entry would be wrong there.
- **IR.** The builder's `coalChain` builds the outer link through the existing `??` builder, at
  the chain's own rep. A table miss is the named miss `coalesce chain unminted`, never a mint.

Minting earlier renumbers the minted nodes, but no output byte moves (readings below).

## Cost

The pre-pass is one recursive source-order walk over every emitted body: +0.23% L2 fuel.

- A per-function flag set in `arrNewFrameWalk` cost +0.05%, but it is state written in a rewrite
  pass and read in emit: phase-state `cross` 272 → 273 in `emit_state.vl`.
- An allocation-free stack walk (`nodeChildrenPush`) cost +0.38%.

The baseline is not rewritten; the queue keeps drift refreshes.

## Readings (master `4b5d638ec`, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| corpus functions with no blocker | 43,944 | 43,961 (+17) |
| corpus `coalesce chain` (alone) | 68 (67) | 0 (0) |
| self-compile functions with no blocker | 19,400 | 19,401 (+1) |
| armed self-shadow covered / matched | 19,400 / 19,400 | 19,401 / 19,401 |
| L2 self-compile fuel | 105,397,354,342 | 105,641,681,635 (+0.23%) |

The corpus gain is smaller than the class. Chains whose links reach a later arm now stop there:
`coalesce mapJoinIf` 20 → 33, `niche nulBoolJoin` 12 → 18, `holeMap` 12 → 15.

Legacy lines deleted: 0. Moved to `@ir`: 0.
