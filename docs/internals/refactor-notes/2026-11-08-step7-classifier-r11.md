# Step 7: classifier round 11, the pre-mono askers, 2026-11-08

Round 11 takes the two pre-mono askers r10 named (`2026-11-08-step7-classifier-r10.md`) and
switches each to a typed fact or reorders it, so the classifiers behind them run post-mono only.
Counts are over the 23,656-program sweep population. Shadows are r6's method
(`clsCensusEnter("SH …")` in a scratch compiler, read from `classifier-census.vl --keep`).

**Mono's lambda pin reads the call's checked type.** `monoLamPinRetAnn` asked `fnRetExprOf`, whose
tail test `stmtIsTailValue` decides a tail call's voidness from the callee's shape (extern,
closure binding, `$fnsig` key), and that reached the closure classifiers. It now asks
`fnRetExprOfChecked`: a tail call is the value exactly when its checked type is not `void`; every
other tail still asks `stmtIsTailValue`. Shadow, per call of the pin:

| agree | disagree | the disagreement |
| --- | --- | --- |
| 2,442 | 37 | the old test took a call the checker typed `void` as the value; the new one reads the checked signature instead |
| | 8 | the old test called a closure-field or per-instance member call a statement (`() => z.f()`, `() => x.push(5)`); the checker types it |

The sweep moved no byte for either class.

**`dispatchRewrite` asks `drwDispatches` before `exprIsClosure`.** The shadow at
`drwWalkMemberCall` found `drwDispatches` false at all 153 calls where `exprIsClosure` was asked.
The closure test only matters for a call a `self`-function can take, and both tests are pure
lookups, so the order is free. The typed readers r10 tried, the callee's checked type (`TyFunc`)
and the checker's recorded declaration (`drwSelfDeclAt`), could not be graded: no call in the
population reaches the test now.

**`letRefListElemName` is post-only.** Shadowed at both callers against `letRefListElemTy`. At
the name site, the typed name (`rlElemName[rlSlotOfTy(…)]`) agrees on 14 of 14 calls. At the
existence site (`!= ""` against `>= 0`) it agrees on 38 and disagrees on 72. Kept.

**`exprIsStrConcat` ablates to a per-instance member call, not to `+` over a type parameter.**
All 155 disagreeing calls are post-mono: the classifier says concat, `repOfNode` says not `str`,
and neither the template's type nor `nodeTyAt` at the frame is `string`. The minimal witness:

    type C = { r: f64 }
    function nm(self: C): string { "c" }
    function loose<T>(x: T): string { "<" + x.nm() }
    print(loose({ r: 1.0 }))

Bind `x.nm()` to a local first and the two agree. The missing fact is the type of a `+` whose
operand is a per-instance member call (D2517), at the instance's frame. Kept.

**Census probe.** `bindingIsNulLitUnion` returns the binding cell's rep (`letBindIsNulAtom`,
`nodeRepIsNulAtom`), and `readNulVKind` is a string-to-`VKind` table. Neither is type-blind. The
census listed them only because their bodies carry no ARENA tell. Both probes are removed, and
`classifier-census.vl`'s `NOT_BLIND` holds them with `vkNonNullRefTwin` (r6), so no warning
asks for a probe back.

**Census** (`classifier-census.vl`, no `--callers`):

| tree | post-only | pre-only | both | probed |
| --- | --- | --- | --- | --- |
| r10 (#6799) on master `266e085f`, old probe set | 21 | 0 | 66 | 87 |
| the same seed, this PR's probe set | 21 | 0 | 64 | 85 |
| this PR | 32 | 0 | 53 | 85 |

Eleven turn post-only: `cloArrElemSelfKey`, `cloPinnedListElemKey`, `cloValueCallRetKind`,
`captureValStructIdx`, `capturedRefListSlot`, `exprNulStrArray`, `forInElemKind`,
`letRefListElemName`, `letTailRowSlot`, `readIndexStoreKind`, `refListElemKind`. None is deleted
in this round. Each one needs its own shadow against a typed reader.

**Proof.** Both seeds are fixpoints: base 6,500,877 bytes, candidate 6,501,064 (+187).
Sweep: 23,656 same, 0 bytes-only, 0 output movers, 0 `runs → not-runs`, 0 new traps.
