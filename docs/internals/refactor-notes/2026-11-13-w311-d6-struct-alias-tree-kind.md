# Step 7 D6: a union member's record spelling is read off its spelling tree (2026-11-13)

`unionDeclStructAlias` (`emit_collect.vl`, #7829) asks, for a member canon did not rewrite, whether
it is written as one inline record. It needs this to tell a record from an unfolded recursive
intersection (D14162), which resolves to a record type as well. #7829 answered with
`nameWrittenAsShape`, a parse of `udVariants[0]`, graded source. H's census graded it render: the
slot holds the parser's composed spelling, not the source text. D3278's
`(fn: i32, rcx: i64) => i32` reaches it as `(i32,i64)=>i32`, and a generic function handed to a
parameter reaches it as `{k:(i32)=>i32}`.

## The change

`memberWrittenAsRecord(sx, vi)` reads the member's banked spelling tree (`udTsRootAt`), past any
single grouping parenthesis, and answers whether its root is `TS_OBJ`. Canon drops a slot's tree only
when it rewrites that slot, and that case is decided by type already, so every slot this predicate
sees keeps its tree. A map spells `TS_MAP`, an intersection `TS_ISECT`, a function `TS_FUNC`.
`nameWrittenAsShape` is deleted, and its two `source` lines leave `render-parse-origins.txt`.

## Measured

- **Decision probe** (both predicates at every unrewritten slot, master `d9c9e163`, 24,235
  programs): 3,449 programs reach it, and the two agree in all 3,449, 0 disagreeing.
- **Sweep:** master fixpoint → this branch, see the PR.
- **Render-parse census:** `ty-source-parse` falls from 5 to 3, the two `emit_collect` sites.
