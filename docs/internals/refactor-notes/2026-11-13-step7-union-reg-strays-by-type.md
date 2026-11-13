# Step 7 (L6, lane G #13 P2 strays): box kinds read off types; the if-let atom fallback deleted, 2026-11-13

Five render-parse sites stop parsing a type's spelling.

- **`memReadNarrowOp`** (emit_classify) reads `boxTagOfTy(ty)` for its `i32` or `f32` primitive. This
  is exact: a `TyPrim`'s tag is its name's `valueAtomKind`.
- **`spreadSrcBoxAtom`** (emit_if_arm_values) reads `boxTagOfPrim` of the source's element `PrimName`,
  newly exported from emit_rep, where it was `btOfPrim`. Also exact.
- **`nulScalarBoxAtomOf`** (emit_rep) reads `boxTagOfTy(inner)` instead of parsing `repOfTy(inner).rdKind`.
- **`nliInferIfLet`** (emit_collect) keeps only the checker's `inferLetNameOf`. Its fallback,
  `ifExprNliName`, never yielded a name, so it is deleted together with `ifExprCollectAtoms`,
  `collectArmAtom`, `nliAtomOfExpr` and the function-name index that only they used.

## Probe (24,020 corpus and witness files)

| site | programs | calls | disagreements |
| --- | --- | --- | --- |
| `nulScalarBoxAtomOf`, typed against `rdKind` | 976 | 2,972 | 0 |
| `nliInferIfLet` reaching the fallback | 594 | 1,287 | every one answered "" |

The render-parse baseline loses these five entries: ty-string-parse 22 → 21, ty-source-parse
7 → 6, ty-parse-unclassified 14 → 11.
