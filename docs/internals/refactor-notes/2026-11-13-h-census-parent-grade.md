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
| emit_classify `memReadBoxPlan` ×2     | `boxNarrowAtomFor` kinds and the narrowing choice               | A     |
| wasmEmit `boxNarrowScalarKinds` ×2    | `valueAtomKind` → the conversion opcode                         | A     |
| wasmEmit `emitBoxAtomRetagTys` ×2     | the retag arms                                                  | A     |
| emit_collect `riuMemberTys`           | registry member types, deduped by canon spelling (changes rows) | G     |
| emit_union_registry `msFreeSliceOfTy` | registry atoms and literal flags                                | G     |

The budget rises by exactly these eight `ty-string-parse` entries: emit_classify
0 → 2, emit_collect 4 → 5, emit_union_registry 0 → 1, wasmEmit 3 → 7 (total 14 →
22, then 18 once the two floored `ty-string-parse` sites move to `ty-carried-floor`).
The rise is a correction, not a regression. The render→parse itself is the walk's
dedupe (`canonUnionMembersWalk` in check_program, owner A), which the emitter-only census
cannot see; `riuMemberTys` reads only the member types and stands in for that one walk site, so
the count is the walk plus the seven callers that read the returned names.

## The regeneration

On master 27b27b681, fixpoint seed, 24,224 programs: 40 census sites, 22 render,
6 source and 12 unclassified. Apart from the eight added, rows go only with
removed code. No surviving site changes grade.

## Source on the corpus, not by construction

A (c) grade has to hold by construction. The tool cannot see where a string was
made, so these are listed by hand. Three of the six (c) census sites receive
text that a type render or the emitter produces:

| site                                              | its input                                                   | owner |
| ------------------------------------------------- | ----------------------------------------------------------- | ----- |
| `unionHasBoolLeafArm` → `boolLeafListDepthOfName` | arm atoms `unionTyArms` renders from the union's type       | G     |
| `ifExprNliName` → `valueAtomKind`                 | arm atoms from `nliAtomOfExpr`, a render of each arm's type | G     |
| `cboxElemNeedsParens` → `tyTopIndexOf`            | the spelling of an annotation the emitter minted            | F     |

They count as failing. The other three (`emitLitMemberEq`, `emitFieldLitEq`,
`emitUnionLitIs` → `nameIsQuotedLeaf`) receive a literal's own lexeme,
`TyLit.litText` quoted, which holds by construction.

## 3. Carried floors are counted apart

A site a filed row carries past step 7 as a floor counted as an ordinary
`ty-render` or `ty-string-parse`, so the close draft could not tell it from a
failing one. Its only marking was a comment at the site. Now
`scripts/render-parse-floors.txt`, kept by hand, lists each such site as
`D<id>\t<site key>`, with the key as `--sites` or `--render-sites` prints it.
The census counts a listed site as `ty-carried-floor`, a code of its own in the
baseline. The census dies on a row whose site no longer exists, or whose `D<id>`
has no inventory row (both checked: exit 1), so the list cannot go stale or cite
nothing.

The list starts with the two rows filed so far:

- **D16022:** `monoArgTyNameRep`'s `arrElemSuffixed` and `nameToTy`, emit_mono.
- **D16032:** `arenaEmitName`'s `canonEmitNameOfTy`, emit_collect.

A lane carrying another floor adds its row here in the PR that files it.
