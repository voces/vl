# Step 7, lane H: a piece split out of a render is graded render, 2026-11-13

`scripts/render-parse-origins.ts` graded each string a parse site received on
its own. A string was source if, ignoring whitespace, it appeared in the
program's text, in std, or among the parser's spellings. So a piece split out of
a render could pass for source when it happened to match the author's text.

Regenerated on master, the old rule moved `shapeInnerFieldSplit`'s `fieldNameOf`
and `fieldTypeTextOf` from render to source. Their witness is D14794,
`type AB = { a: i32 } & { b: i32 }`. Canon folds it into `{a:i32,b:i32}`, which
`internShapeAs` (`groupInnerOf`) and `tyTopLevelSplit` still graded render. The
pieces split out of it (`a:i32`, `b:i32`) each appear in the source text.

## The rule

Within one program, a string graded source is regraded render when it lies
strictly inside a string that a site of the same function received as a render
or synthesized. The parent's grade reaches its split pieces. The scope is the
function: the split helpers and the parse that reads their parts sit together
there (`tyTopLevelSplit` → `fieldNameOf`/`fieldTypeTextOf`).

**Control:** D14794 grades render at all four sites (`internShapeAs`
`groupInnerOf`, and `shapeInnerFieldSplit`'s `tyTopLevelSplit`, `fieldNameOf`
and `fieldTypeTextOf`).

## The regeneration

On master 31f92f78e, fixpoint seed, 24,222 programs: 47 census sites, 26 render,
7 source and 14 unclassified. No grade moves. Sixteen rows go with the functions
or calls that are gone:

- **render:** `recordClonedIsVarTy`, `annSplitParams`, `tyGroupWrapsWhole`,
  `collectShapeVariantFields`/`groupInnerOf`, `monoPinUnionName`,
  `sharedFieldArmAtomKind`, `msFreeSlicePush`, `recordUnMemTys`,
  `sTyIxOfNameTy`, `isValueUnionOfSet`;
- **source:** `asgReadNarrowTy`, `unionNameOfCall`, `anonNullFieldBox`,
  `registerCloResultUnion`, `sharedFieldArmValueBox`,
  `registerValueUnionNameTy`.

The budget does not move.

## Source on the corpus, not by construction

A (c) grade has to hold by construction. The tool cannot see where a string was
made, so these are listed by hand. Of the seven (c) census sites, four receive
text that a type render or the emitter produces; it matches the author's
spelling on the corpus only by coincidence:

| site                                              | its input                                                   |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `unionHasBoolLeafArm` → `boolLeafListDepthOfName` | arm atoms `unionTyArms` renders from the union's type       |
| `boxWidenAtomFor` → `valueAtomKind`               | member atoms of a set row, recorded from a render           |
| `ifExprNliName` → `valueAtomKind`                 | arm atoms from `nliAtomOfExpr`, a render of each arm's type |
| `cboxElemNeedsParens` → `tyTopIndexOf`            | the spelling of an annotation the emitter minted            |

These are source on the corpus, not by construction, and count as failing.
Owners: `boxWidenAtomFor` D, `ifExprNliName` G, `unionHasBoolLeafArm` G,
`cboxElemNeedsParens` F. The other three (`emitLitMemberEq`, `emitFieldLitEq`,
`emitUnionLitIs` → `nameIsQuotedLeaf`) receive a literal's own lexeme,
`TyLit.litText` quoted, which holds by construction. No (c) census site reads
`udVariants` directly. `internShapeAs`, which does, already grades render.
