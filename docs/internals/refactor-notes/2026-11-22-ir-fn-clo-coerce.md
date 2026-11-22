# IR: a function delivered to a declared function type (fnClo), 2026-11-22

Lane IR-N4. This is stacked on `2026-11-22-ir-map-unbox.md`. A function value delivered to a
closed function type, such as a generic handed to `(x: i32) => i32` or a tagged set at a typed
field, is coerced by legacy after the value is built: the value's id names the member, and the
member's closure at the destination's instance replaces it (D14884). For a set, one arm per
member dispatches on the id. The IR's node-keyed coercion route did not admit the kind, so the
node missed with `pre-path coercion fnClo`.

## Change

- **One instance.** `fnCloFeOf(exprIx)` (`wasmEmit.vl`) reads `monoCloCoerceFe` at the node or
  its source, -1 when there is none. Legacy's `emitCoerced` asks it, where it used to look it up
  inline.
- **One tail.** `fnCloTail(exprIx, fe, fnIx)` drops the value and writes the instance's closure,
  or the dispatch over `monoCloCoerceSetFes`. It is legacy's arm, and `coerceTail`'s new `fnClo`
  arm (`fnCloTailAt`) writes it after the value. The no-instance failure is one function
  (`fnCloNoInstance`).
- **The IR.** `coerced` admits `fnClo` where `fnCloFeOf` names an instance, and otherwise misses
  as `pre-path coercion fnClo instance`. The delivered type is `fnCloCoerceAtNode`'s, the
  checker's recorded destination, held at this instance. `RCoerce`'s lowering already calls
  `coerceTail`.

New admission predicates (R8): `coerced`'s `fnClo` arm calls `fnCloFeOf` (legacy's instance,
split out) and `fnCloCoerceAtNode` (the checker's destination type, which legacy's
`coerceKindAt` keys the kind on). It restates nothing.

Compiler lines +48 / −23 (`wasmEmit.vl` +41 −22, `ir_build.vl` +7 −1). The shadow row
`tests/ir-shadow-rows/fn-to-closed-fn-type.vl` hands a generic to a closed `i32` and a closed
`string` function type.

## Readings (base: fixpoint seed of `ir-map-unbox` merged with master `b77be8fd`; candidate fixpoint)

| reading | base | this step |
| --- | ---: | ---: |
| armed `tests/cases` covered = matched + 1 pre-existing | 66,902 | 66,920 |
| armed `tests/cases` start covered = matched + 1 pre-existing | 5,448 | 5,448 |
| `tests/cases` `pre-path coercion fnClo` (any) | 21 | 0 |
| corpus covered = verified = matched | 44,798 | 44,798 |
| corpus IR claims | 44,652 | 44,652 |
| self-compile covered = matched | 19,644 | 19,644 |
| L2 self-compile fuel per PR (vs `b77be8fd`) | | +0.01% |

No file loses a covered, matched or start-covered function. The fail and mismatch rows are the
same on both seeds. The one start body the class held now stops at `global read coercion`.
`ir-identity.sh --cases`: 7,602 identical, 0 differ. `--claimless`: 14,017 identical, 0 differ.
