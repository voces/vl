# Step 7 L6 (lane G, cut 6a): the box-path union names come from the box's type, 2026-11-12

The base is master `8eddd05c`. Ten emit sites named the union a value is boxed into either by
`unionNameOfExpr` (the expression's union by spelling and rungs) or by `tyNameOf` (the annotation
rendered). Every one of them passes the name on to `emitUnionBoxOwed` / `emitUnionBoxArg` together
with the box's type. `boxDstName(name, ty)` already prefers the row or the value-union key that
`ty` names, and reads `name` only where `ty` names neither, or where `name` spells the same row
differently. So at these sites the name is decided by the type wherever the type decides anything.

## The census

A probe compiler, built in the scratchpad and never refreshed into a seed, recorded at each site
the old name against `boxTyName(ty)`, where `ty` is the type the site already passes on. It ran
over the sweep list (24,170 programs, 4,406 reaching a site).

| site | eq | same row, other spelling | other |
| --- | --- | --- | --- |
| `emitUnionBoxAtRecord`, `boxOwedAtRecord` | 2, 2 | 0 | 0 |
| `emitFnTagDispatch` | 17 | 0 | 0 |
| `emitCoalesceBoxRuntime` | 9 | 0 | 0 |
| `emitOptCoalesceBoxLeaf` | 41 | 0 | 2 type-only, both with `exprUnion` false |
| `emitCoalesceCallStash` | 706 | 2 | 0 |
| `emitCoalesceNullableRefs` | 57 | 7 | 0 |
| `retFlagsSeedResult`, annotated | 28,158 | 788 | 12 other spelling, type names a row |
| `retFlagsSeedResult`, inferred | 588 | 50 | 15 other spelling, type names a row |
| `directArgSeedsOf` (`cUNm`) | 7,404 | 423 | 834 other spelling; 4 with no param type |
| `emitLetDeclStmt` (`letAnnNm`) | 1,227 | 145 | 3 other spelling |

"Other spelling" is a member-order or alias-render difference (`f64|i32` against `i32|f64`,
`{[string]:{r:i32}}` against `{[string]:Circle}`). There the type names a row or a value-union key,
so `boxDstName` already ignores the old name.

## Changed

- `emitUnionBoxAtRecord`, `boxOwedAtRecord`, `emitFnTagDispatch`, `emitCoalesceBoxRuntime`,
  `emitOptCoalesceBoxLeaf`, `emitCoalesceCallStash` and `emitCoalesceNullableRefs` name the box by
  `boxTyName` of the type they box at. `emitOptCoalesceBoxLeaf` keeps its `exprUnion` gate, which
  answers the census's two type-only cells (a literal `0 | 1` result, no box).
- `retFlagsSeedResult` names `retUNm` by `boxTyName(retUTy)` on all three of its arms, so
  `monoPinSpellNoAnon` leaves `wasmEmit`.
- `directArgSeedsOf` names `cUNm` by `boxTyName` of the parameter's declared type. The parameter's
  instance type (`cUTy`) is -1 in the census's four cells, and the declared type never is.

## Left

- `emitLetDeclStmt`'s `letAnnNm` also reaches `emitUnionWideArmBox`, which reads the name past the
  box, so it waits for the let path's own cut.
- `unionNameOfExpr` keeps 20 callers: lane I's 13, and lane G's emit_classify producers.

## Proof

- **Seed:** fixpoint. The four comment rewords riding here (`nameIsMapMemberUnion`, deleted by
  #7656) are byte-identical on their own.
- **Locally:** lint-self, regress (no runs lost), rep-fuzz (exact), check-filed-witnesses `--strict` (4,860 graded, 0 moved), late-demands (8, baseline 8), seed-size (+1.9%), the comment, ladder, sentinel and scan budgets.
- **The full sweep:** CI's `sweep` label. The census predicts identity, except where a same-row
  spelling reaches a reader past `boxDstName`.
