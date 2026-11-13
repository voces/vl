# Step 7, lane H: the render-parse census grades a split piece by its parent, and sees the canon member walk, 2026-11-13

Two blind spots in `scripts/render-parse-origins.ts` and
`scripts/render-parse-census.vl` are closed.

## 1. A piece split out of a render is a render

The probe graded each string a parse site received on its own: source if,
whitespace ignored, it appeared in the program's text, in std, or among the
parser's spellings. So a piece split out of a render could pass for source. On
master 31f92f78e the old rule moved `shapeInnerFieldSplit`'s `fieldNameOf` and
`fieldTypeTextOf` from render to source. Their witness, D14794
(`type AB = { a: i32 } & { b: i32 }`), canon folds into `{a:i32,b:i32}`; its
pieces (`a:i32`) each appear in the source.

**Rule:** within one program, a string graded source is regraded render when it
lies strictly inside a string that a site of the same function received as a
render or synthesized.

**Control** (on 31f92f78e): D14794 graded render at all four sites,
`internShapeAs` `groupInnerOf` and `shapeInnerFieldSplit`'s
`tyTopLevelSplit`/`fieldNameOf`/`fieldTypeTextOf`. E's #7813 has since deleted
both functions, so those rows leave the file.

## 2. The canon member walk the emitter calls

`canonUnionMembersInto` and `canonUnionMembersLitsInto` (check_program) take a
type, render each leaf with `tyToNominalName`, and parse the render with
`canonEmitNameAt`. The census listed `canonEmitName` but not these, so it did
not see the parse at their emitter callers. They join `EXTRA_PARSERS`. Because
they take a type, the origins probe records each reach without reading an
argument and grades it render: the text they parse is a render made inside them.

Eight emitter sites are added. Each is graded by what the output feeds, and all
eight feed a decision, so all are failing:

| site                                  | what the output feeds                                           | owner |
| ------------------------------------- | --------------------------------------------------------------- | ----- |
| emit_classify `memReadBoxPlan` ×2     | `boxNarrowAtomFor` kinds and the narrowing choice               | D     |
| wasmEmit `boxNarrowScalarKinds` ×2    | `valueAtomKind` → the conversion opcode                         | D     |
| wasmEmit `emitBoxAtomRetagTys` ×2     | the retag arms                                                  | D     |
| emit_collect `riuMemberTys`           | registry member types, deduped by canon spelling (changes rows) | G     |
| emit_union_registry `msFreeSliceOfTy` | registry atoms and literal flags                                | G     |

The budget rises by exactly these eight `ty-string-parse` entries: emit_classify
0 → 2, emit_collect 4 → 5, emit_union_registry 0 → 1, wasmEmit 3 → 7. The rise
is a correction, not a regression.

## The regeneration

On master b00182da7, fixpoint seed, 24,224 programs: 47 census sites, 26 render,
7 source and 14 unclassified. Apart from the eight added, rows go only with
removed code. No surviving site changes grade.

## Source on the corpus, not by construction

A (c) grade has to hold by construction. The tool cannot see where a string was
made, so these are listed by hand. Four of the seven (c) census sites receive
text that a type render or the emitter produces:

| site                                              | its input                                                   | owner |
| ------------------------------------------------- | ----------------------------------------------------------- | ----- |
| `unionHasBoolLeafArm` → `boolLeafListDepthOfName` | arm atoms `unionTyArms` renders from the union's type       | G     |
| `boxWidenAtomFor` → `valueAtomKind`               | member atoms of a set row, recorded from a render           | D     |
| `ifExprNliName` → `valueAtomKind`                 | arm atoms from `nliAtomOfExpr`, a render of each arm's type | G     |
| `cboxElemNeedsParens` → `tyTopIndexOf`            | the spelling of an annotation the emitter minted            | F     |

They count as failing. The other three (`emitLitMemberEq`, `emitFieldLitEq`,
`emitUnionLitIs` → `nameIsQuotedLeaf`) receive a literal's own lexeme,
`TyLit.litText` quoted, which holds by construction.
