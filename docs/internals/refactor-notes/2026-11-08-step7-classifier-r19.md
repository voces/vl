# Step 7: classifier round 19, the `arrLit*` family and the pre-mono hubs, 2026-11-08

Round 19 starts from master `9f4d1ded` with r18 (#6851) merged. Counts are calls over the 23,695-
program sweep population, read from `classifier-census.vl --callers --keep` and from
`clsCensusEnter("SH …")` shadow keys in a scratch compiler, as r16 to r18 did. Pre-mono chains were
read off a `--names` scratch compiler whose classifiers trap before `monomorphized` (r17's method).

**1. `arrLitElemName` before mono.** It now answers from `arrLitElemNameTy`, which reads in this order:
a closure element's key, the lead element's committed annotation (`arrLitCommitNameAt`), the row a lead
object literal builds at (`structIndexOfObjCtx`), the recorded nominal record element
(`arrLitNominalElemName`), and otherwise the recorded element's row. `arrLitInstElemRow` and
`arrLitElemNameTpl` run only after mono.

| reader (pre-mono, 87 calls) | agree | disagree |
| --- | --- | --- |
| `rlRowNameOfTy` of `litRepTyAt`'s element (r18's) | 76 | 11 (`#anon0`, layout twins, `S`) |
| + commit name, lead object literal's row | 83 | 4 (`Circle$m…`, `Dot$m…` over an `Ident` element) |
| + `arrLitNominalElemName` (shipped) | 87 | 0 |

The layout twin is the record solve's row for `[c]`, where `c = { r: n }` is built at `Circle`.
`shapeNominalOfTy` names that row, and `rlRowNameOfTy` does not.

**2. `arrLitRefListRow` is deleted.** The code-5 field key (`anonRefListFieldKey`) reads the recorded
element type. When the element is a record or its `| null`, and the list leads with an object literal,
the key is that literal's row, with `|null` kept. Otherwise it is `anonRefListElemKeyOfTy`.
`anonRefListElemKeyOfTy` alone agrees 99 / 105. This reader agrees 105 / 105.

**3. The hubs that reached the rest.** Every chain enters through a mono pin
(`monoArgTyNameRep`, `monoArgTyNameCascade`) or `scanArrLitCommit`, and the hub answers from the checked type:

| hub, before mono | typed reader | agree | classifiers it took off "both" |
| --- | --- | --- | --- |
| `exprNullableVariant` | `nodeRepIs(ix, "nulvariant")` | 18 / 18 | `nulVariantIdxOfExpr` |
| `exprVariantIndex` | variant rep → `variantIndexOf` of its type | 275 / 275 | `mapReadMvSlot` |
| `exprIsClosure`'s `Member` arm | `tyIsFuncOrNulFunc`, no inference hole | 7 / 7 | `memberIsClosure`, `memberUnionFieldName`, `armFieldUnionName` |
| `identNameIsUserBound`'s capture rung | capture membership (`fnCapturesName`) | 2 / 2 | `capturedKindOf` |

Only the `Member` arm of `exprIsClosure` changes. Its `Ident` arm disagrees on 622 of 2,751 calls
and its `FuncDecl` arm on 279 of 1,139, at hole-typed templates.

**4. Census hygiene.** `exprListRep` counts only its post-mono ladder; before mono it reads the column.
`listOfColumn`, `vkNulKindOf` and `nulNicheOrNull` are fixed lookups over a typed kind.
`coalTyIsStr`, `exprIsStrConcat` and `arrLitElemNameTy` read the checked type through readers the
arena tells do not list. All six go to `NOT_BLIND`. Six type-blind functions had no probe and now
have one, and `identIsBoundClosureGo`'s probe carries its own name; all seven are post-only. The probes on `readCellKind`, `arrLitIsF32` and
`compositionMapReadSlot`, which read the arena, go. The census now prints no consistency warnings.

**Census** (`classifier-census.vl --callers`):

| tree | probed | post-only | pre-only | both | uncalled |
| --- | --- | --- | --- | --- | --- |
| master `9f4d1ded` | 73 | 54 | 0 | 19 | 0 |
| this PR | 73 | 68 | 0 | 5 | 0 |

**Left: the closure-return family, asked of a generic template.** The five rows are `fnSigKeyOf`
(20), `cloRetKindOf` (20), `cloRetValKind` (24), `blockTailIsClosure` (25) and
`exprIsClosureNoLocal` (25). They have two roots, both mono pins in `emit_mono.vl`:
`monoArgTyNameCascade` → `fnSigKeyOf`, and `monoArgFnTypeName` → `cloRetTypeName`. A typed
`fnSigKeyOf` (the parameter tokens, then `repSigKindOfTy(cloRetResultTy)`) agrees on 2 of 17 calls.
The 15 it misses are templates whose result is a type parameter or a hole, with no rep. The ladder
keys them `i>i` from `vtKindOfType`'s i32 default. The missing fact is the instance binding of the
template's type parameter, which does not exist until mono picks the instance.

**Proof.** Both sides are fixpoint seeds: base `9f4d1ded` is 6,551,165 bytes, this PR 6,552,097
(+932). The sweep is in the PR body.
