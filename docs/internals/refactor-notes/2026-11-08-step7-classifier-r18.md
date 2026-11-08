# Step 7: classifier round 18, the box-row asker and identIsBoundClosure, 2026-11-08

Round 18 starts from master `a24577bd` with r17 (#6848) merged. Counts are calls over the 23,690-
program sweep population, read from `classifier-census.vl --callers --keep` and from
`clsCensusEnter("SH …")` shadow keys in a scratch compiler, as r16 and r17 did.

**1. The `arrLit*` family has two askers, not one.** The census splits `pre` into `passes` and
`monomorphizing`. `arrLitIsRefTpl`'s 930 pre-mono calls were 928 in `passes`, and probing
`arrLitIsRef` itself put 895 of them on one caller: `arrLitInferUnionElemName`, the box-row
registration in `collectU`. Its `arrLitNumKind` (196) came the same way, through the
`arrLitUnionElemName` rung. Only `arrLitElemName`'s 138 calls come from `monoArgTyNameRep`.

`arrLitInferUnionElemName` asked `arrLitIsRef(arrIx, -1)` whether some other rung already claimed
the literal. It now asks the literal's recorded type (`arrLitTyRefNonUnion`): a ref list whose
element is no union.

| shadow (pre-mono) | agree | disagree |
| --- | --- | --- |
| registration claim, typed vs `arrLitIsRef` | 721 (all F) | 174 (legacy T, typed F) |

All 174 have a union element (`(i32 | string)[]`, `(f64 | i32)[]`, a named union `M[]` …) that
`arrLitIsRef`'s union rung claims. The typed reader registers that box row here as well. The
row is the one the union rung names, so the sweep shows 0 bytes-only movers.

**2. `identIsBoundClosure`.** Before mono it now answers from the read's checked type
(`nodeTyInOf`) at the binding it denotes (`identBindingOfRead`, which also walks enclosing
frames for a capture). A type that still holds an inference hole (`tyHasInferHole`) is "no closure".
The ladder (`identIsBoundClosureGo`) runs only after mono, so r17's pre-mono capture branch and
`fnCapturesName` go.

| reader | agree | disagree |
| --- | --- | --- |
| checked type, no binding fact | 259 | 9 |
| + `identBindingOfRead` | 265 | 4 (`(_) => _` bindings: D14883, D14887, D14888, D15451, `bundle_copy_closure_handed`, `hand-back-to-declared-function-types`) |
| + `tyHasHole` | 269 | 2 (`(T) => T`, the `error-generic-handed-to-bare-param-*` pair) |
| + `tyHasInferHole` (shipped) | 271 | 0 |

The ladder answered F for those 4 hole-typed reads because its arena rung only looks for a `let`
that shadows a module function name. `tyHasHole` also counts declared type parameters, and that
cost the pair.

**Census** (`classifier-census.vl --callers`, 74 probed):

| tree | post-only | pre-only | both | uncalled |
| --- | --- | --- | --- | --- |
| master `a24577bd` | 53 | 0 | 21 | 0 |
| this PR | 55 | 0 | 19 | 0 |

`arrLitNumKind` (196) and `identIsBoundClosure` (271) became post-only. `arrLitIsRefTpl` falls from
930 to 2.

**Left, with the missing fact.**
* `arrLitElemName` before mono (138 calls, from `monoArgTyNameRep`; it keeps `arrLitElemNameTpl`,
  `arrLitInstElemRow` and `arrLitObjElemBoxVariant` "both"). The typed reader is
  `rlRowNameOfTy` of the literal's element at `litRepTyAt`, with `arrLitElemRender` for a closure
  element. It agrees on 132 (two shadow runs: one graded the record rung, one the closure rung). The 6 it misses are record elements whose row is nominal: an anonymous
  record with a closure field (`#anon0` against `{f:()=>boolean}`), and a layout twin (`Circle`
  against `Dot` for `{r: i32}[]`). `structRowOfRecordTy` names the twin, and every structural
  literal then disagrees (P, K, `#anonN` against `{a:i32}`). The fact that is missing is the row
  the record element builds at, which today only `arrLitCommitNameAt` and the obj-literal
  registration know.
* `arrLitRefListRow` (104, all in `passes`, from `anonFieldElemName`'s code-5 arm). Against
  `anonRefListElemKeyOfTy` it agrees on 98. 4 of the 6 misses are a nullable element whose key is
  structural on the arena (`{x:i32}|null`) and nominal on the literal (`T|null`, `P|null`). The
  other 2 are anonymous records with a closure field (`#anon5`, `#anon7`).
* `letCellSlot` is post-only on this tree, so its reflist and struct arms were not taken.

**Proof.** Both sides are fixpoint seeds: base `a24577bd` is 6,543,942 bytes, this PR 6,545,320
(+1,378). The sweep over 23,690 programs: 23,690 same, 0 bytes-only, 0 output movers,
0 `runs → not-runs`, 0 new traps.
