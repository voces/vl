# The `popDropTail` and `emitStaticLitAtom` re-entries (2026-11-19)

The two smallest of §10.1(a)'s `emitExpr` re-entries (`ir-design-2026-11.md`), shaped as the seam
template's table names them (`2026-11-19-ir-seam-frame-model.md`).

## `popDropTail`: a receiver-in-local half only
`popDropTail` wrote the condition and element through `pushTakeCond`/`pushTakeElem`, whose `.get`
arm emits the index expression; the IR only ever passed `-1`, but the call graph reached
`emitListGetIdx`. `.pop`'s element read is now its own `pushPopElem`, and `popDropTail` is the
length, `if`, `pushPopElem`, `drop`, `end` over the local: no expression is read, so it cannot
re-enter. `pushTakeElem` keeps calling `pushPopElem` for its `.pop` arm. The lowering's
`pop tail` miss, which could not fire, is gone.

## `emitStaticLitAtom`: the IR owns a non-literal static side
An atom compare's side typed as one string literal is the member's interned id. Legacy evaluates
a non-literal spelling of that side for its effects and drops it. The builder used to miss it
(`atom compare static operand`); it now builds the side as an operand in source order, and the
lowering writes it, its `drop`, then `staticAtomId(lex)`, the id half `emitStaticLitAtom` also
ends with. A `StrLit` side stays an unread immediate, and a side that builds as an immediate or
with no value stays the named miss.

## Measured
See the PR body.
