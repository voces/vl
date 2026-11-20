# IR: a reference join's `else if` chain (2026-11-20)

`ifRefExpr` built one link of a value `if` joined at a reference and refused an `else if` chain
(`ref if chain`). Legacy writes the chain along its spine (`emitIfExprRef`, `emitIfExprRefLink`).
Each link writes its condition, opens an `if` at the join's blocktype, writes its `then` arm, and
writes its `else`: the next link inside that frame, or the last arm. The blocktype is nullable from
the first link that can yield `null` inward (`chainNul`).

`refIfLink` builds that chain. Each link is an `SIf` whose `else` holds the next link, delivered to
the link's out, all outs at the head's rep and type, as the plain scalar chain is built. Each
link's arms take the accumulated nullability, as legacy's do. The lowering reads a link's
nullability per link (`ifLinkYieldsNull`), so a link whose own answer differs from the accumulated
one is a named miss (`ref if chain null inward`), as is a link whose join differs from the head's
(`ref if chain join`). An else-less link is named apart (`ref if else-less`); the self-compile has
none.

Measured at the merge-base in the PR.

Legacy lines deleted: 0. Moved to `@ir`: 0.
