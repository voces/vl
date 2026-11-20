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

Measured on fixpoint seeds at merge-base `b0da3ce35` (functions with no blocker): self-compile
18,828 → 18,846 of 19,343; corpus 41,682 flat. `ref if chain` 20 → 0 alone, plus 7 in combinations.
18 build, 2 stop at `ref if chain join`, and the rest at their other blockers
(`string operand after another`, `if into an element store`, `rep novalue`,
`object variant field i64`, `coalesce chain`).

Legacy lines deleted: 0. Moved to `@ir`: 0.

`ifRefExpr` admits the str, list, strlist and reflist kinds. A step that admits `struct` must
honour `joinCloSigSplitField`, which legacy's `emitIfExprRef` reads for a closure-signature split.
