# IR: a record literal on legacy's layout path (2026-11-19)

`expression object` was the builder's catch-all for an object literal: no arm built one. Split by
legacy's own ladder (a probe seed naming the arm, not committed), the corpus functions it blocked
alone were the standalone-struct arm, 740, and the variant arm, 27; the self-compile's 227 were
mostly variant literals (134) and fields whose layout order differs from the rep's kid order (65).

Legacy's decisions are shared and consumed:
- `objLitArmOf` is `emitObjLitNode`'s ladder (variant row, standalone struct, union box);
- `objLitLayoutRowOf` and `objLitVariantLayoutOf` name the row `emitObj` / `emitVariantStruct` build
  by their layout loop alone: every field written, none dropped, outside the row or stashed for
  source order (D1510, D1696);
- `structFieldArmOf` and `variantFieldArmOf` are the per-field ladders (`plain` is the value as
  itself); `objStructNewTail` and `variantStructNewTail` the `struct.new`.

The IR builds `RMakeRec` (the record family) over each field's `plain` arm, owing no recovery,
delivered at its kid's rep. `mrLayout` records the kid each layout position writes, so fields build
and lower in layout order whatever the rep's kid order; the verifier checks it is a permutation. A
field after the first may not hold a valued `if` (`ifBelowLead`).

Covering record literals exposed one divergence the armed shadow caught: a void lambda's discarded
`({ r: 7 })` tail. Legacy writes nothing for a discarded inert literal or bare function name; that
rule is now `stmtWritesNothing`, consumed by `emitStmt` and asked by the builder.

Measured on fixpoint seeds against master (functions with no blocker, blocker census):
see the PR for the final base; on master 93c5fe0f with #9132's stack, self-compile 13,327 → 13,402
and corpus 31,207 → 31,558. Remaining classes alone: `object field armDelivery` 82,
`explicitNull` 41, `union` 24, `f64` 22 (corpus); `object layout` 34, `variant field box` 12
(self-compile).

Legacy lines deleted: 0. Moved to `@ir`: 727, the decisions the IR now asks
(`objMatchesVariantIdxOmit` 68, `objVariantRowCtx` 52, `variantFieldKindFits` 51, …).
