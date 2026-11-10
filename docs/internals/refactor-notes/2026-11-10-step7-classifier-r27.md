# Step 7: classifier round 27, the storage readers ruled out and two list-literal classifiers typed, 2026-11-10

Round 27 starts from master `ce2f9fbb` (#7026), where `classifier-census.vl` reads 42 probed
classifiers, all post-only. It applies DECISIONS.md §"How step 7's classifier half finishes" and
tries the accounting's next leads (`2026-11-09-step7-classifiers-remaining.md`, groups 1, 7, 10
and 11). The method is round 26's. A scratch compiler runs each classifier beside a typed twin
and counts `SH <fn> <tag>` under `$VL_CLS_CENSUS=1` over the 23,816-program sweep population.
Counts are post-mono calls.

**Group 1: the eight storage readers.** Their probes are removed and they are listed in the
census's new `STORAGE_READERS`, each with its reason: `globalReadStructIndex`,
`capturedStructIndex`, `memberUnionFieldName`, `armFieldUnionName`, `readIndexStoreKind`,
`fnRetStructIndexSid`, `memberIsClosure` and `recBuildRowOf`. Their bodies are unchanged.

**Group 10: the six list-literal classifiers.**

| classifier | typed twin | agree | disagree |
| --- | --- | --- | --- |
| `arrLitObjElemBoxVariant` | the literal's recorded element is a union: the lead record literal's adopted arm (`litArmRowOf` at `litRepTyAt`), `""` when every element is that one arm (shipped) | 18,578 | 0 |
| `arrLitInstElemRow` | the lead literal's build row (`structRowOfRecordTy(litRepTyAt(e0, fnIx))`), less the template's row (shipped) | 14,881 | 0 |
| `arrLitInstElemRow` | the same, excluding the template's row only inside an instance | 13,883 | 998 (all outside an instance) |
| `arrLitIsRefTpl` | `tyIsRefArray(nodeTyIxOf(arrIx))` | 82,027 | 11,201 |
| `arrLitNumKind` | the width of `litRepTyAt`'s element | 72,517 | 6,118 |
| `arrLitNumKind` | the width of `nodeTyAt`'s element | 72,199 | 6,436 |
| `arrLitElemNameTpl` | `rlRowNameOfTy` of `nodeTyIxOf`'s element | 5,365 | 1,682 |
| `refListElemNameOfExprRaw` | `rlRowNameOfTy` of `nodeTyAt`'s element | 3,698 | 3,897 |

What the disagreements are:

* `arrLitIsRefTpl` (typed says ref list, legacy says not, 11,117): the element is a function in
  5,546. Of these, 4,628 lead with a tagged set's leaf, whose list is the i32 list of ids. The
  element is a map in 3,494, a record in 1,280, a union in 370, a list in 258 and a nullable in
  169. Legacy says ref and the typed twin does not in 84: 47 have no element type, 9 a list and
  28 another kind. The template answer is one half of `arrLitIsRef` (`|| arrLitFrameRefTy`), so
  the non-function rows may be answered by the frame half. That was not graded.
* `arrLitNumKind`: the recorded rep is `i64[]` where the element scan reads no width (4,806) or
  `f64[]` (907). Legacy reads a width where the rep's element is a box union (336), a niche (63)
  or elsewhere (6). Not ablated.
* The two name classifiers: 398 and 437 calls name the same row under another spelling. The rest
  are the function-value list family (`fn-tagged-ids-in-records-in-nested-lists.vl`,
  `hole-fn-*`) and nested niche lists (`nested-niche-all-null-inner-literal.vl`).

**Switched.** `arrLitObjElemBoxVariant` reads the literal's recorded union and the lead's adopted
arm. The D361 one-arm gate asks every element's adopted arm, so `arrLitObjElemsOneVariant` is
deleted. `arrLitInstElemRow` reads the lead literal's build row. Both read the arena (the
literal's elements) and leave the probe set.

**`structIndexOfExpr`, re-shadowed** against `structRowOfRecordTy(nonNullTy(nodeTyAt))`. It
agrees in 3,452,888 calls, and 3,736 name a layout twin (one heap type, so no consumer can notice).
The rest are not twins:

* typed only, 23,843: 17,111 are a union arm value whose layout is `exprVariantIndex`'s (D34). By
  design that is -1 in the struct table. The other 6,732 include `variant-nested-struct-field.vl`
  and `struct-holding-self-recursive-arm.vl`.
* legacy only, 12,488, and distinct rows, 4,186: a record built wider than its binding's type
  (`nested-record-built-wider-beside-own-binding-runs.vl`,
  `relayed-call-built-wider-stored-beside-declared-row-runs.vl`). The classifier names the build's
  row, and the type names the declared one. The literal's own `litRepTyAt` row covers only 431 of
  these.

So the canonical-row ruling settles the 3,736 twins and nothing more. The missing fact is the
row a value was built at, per read (the read rep of group 6), plus a variant-table answer for an
arm value. It stays probed.

**Group 11.** `captureValStructIdx` follows `letCellSlot` and `forInVarStructIdx`. Neither moved,
so it stays.

**Census** (`classifier-census.vl`):

| tree | probed | post-only | pre-only | both | uncalled | warnings |
| --- | --- | --- | --- | --- | --- | --- |
| master `ce2f9fbb` | 42 | 42 | 0 | 0 | 0 | 0 |
| this PR | 32 | 32 | 0 | 0 | 0 | 0 |

**Proof.** Both sides are fixpoint seeds (two `refresh-compiler.sh` runs, byte-identical). Master
`ce2f9fbb` is 6,597,010 bytes and this PR is 6,596,277 (−733). Late demands are 6 (the baseline).
