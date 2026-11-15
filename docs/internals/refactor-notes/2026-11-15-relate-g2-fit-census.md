# L2 S2 prerequisites, group 2 (flow and bindings): where each judge decides, 2026-11-15

Lane G's S0 census (`2026-11-15-g77-l2-s0-judge-coverage.md`) lists group 2, "flow and bindings":
`holeFlow`, `holeBind`, `holeDecl`, `holeAssign`, `holeChoice`, `holeBinds` and `holeName`. It is the
second S2 prerequisite, and the split with lane G gives it to the relate lane. This note answers the
question lane G asked first: which of those judges decide inside a fit question, and which only at a
binding. A judge that decides inside a fit question is the one whose decision has to become a row first.

## Method

The g77 probe was restricted to group 2, on a scratch copy of `compiler/` at master `55151b05`
(never pushed; the patch is kept in the session scratchpad):
- **Instrumented:** the 48 functions whose names start with a group-2 prefix
  (`grep -E "^(export )?function (holeFlow|holeBind|holeDecl|holeAssign|holeChoice|holeName)"
  compiler/check_*.vl`), in 7 files.
- **Recorded per entry:** the judge, its owner (the top of `cstrOwnerStack`, else `curFnDeclIx`;
  owned or not), and its mode. The mode is `fit` (`inferQuiet` with `quietDepth > 0`), `flat`
  (quiet at depth 0) or `loud`.
- **Read through:** `probe-rollback-census.ts`, over g77's population rebuilt from the tree:
  `tests/cases` programs marked `// @run` with a named function that has an un-annotated
  parameter. That gives 1,463 programs (g77 had 1,464; 10 more with relative imports are skipped).

No entry was `flat`, so every quiet entry was inside a fit question.

## Result

**41 of the 48 judges are entered inside fit questions; 7 only at a binding.** A program counts once per
judge and mode; "progs" is the largest per-owner count.

| judge | fit progs | fit runs | loud progs | loud runs |
| --- | ---: | ---: | ---: | ---: |
| `holeBindHeldSet` | 721 | 25289 | 1254 | 19003 |
| `holeChoiceArmCstrsAt` | 592 | 5670 | 463 | 3166 |
| `holeChoiceWaits` | 592 | 5670 | 447 | 2872 |
| `holeChoiceArms` | 584 | 16459 | 1254 | 55175 |
| `holeNamesDecl` | 522 | 4463 | 0 | 0 |
| `holeChoiceArmsOf` | 497 | 3768 | 375 | 2587 |
| `holeBindInsts` | 166 | 2368 | 496 | 6756 |
| `holeBindOwner` | 166 | 2368 | 454 | 6329 |
| `holeBindAt` | 166 | 2711 | 454 | 8321 |
| `holeBindCallsHole` | 165 | 6889 | 434 | 19587 |
| `holeBindInstance` | 164 | 1974 | 389 | 3573 |
| `holeBindNoteCall` | 157 | 3496 | 397 | 8999 |
| `holeBindCallInst` | 157 | 3485 | 397 | 8957 |
| `holeBindPush` | 157 | 3485 | 397 | 8957 |
| `holeNameIsParamOf` | 142 | 2225 | 181 | 1671 |
| `holeBindForward` | 134 | 3398 | 364 | 10578 |
| `holeBindForwardTo` | 133 | 3305 | 364 | 10654 |
| `holeBindArgListsHole` | 132 | 3810 | 361 | 11726 |
| `holeBindValueDecl` | 129 | 3060 | 333 | 8197 |
| `holeFlowTruncate` | 112 | 292 | 1419 | 22044 |
| `holeBindDeliveryMisfits` | 97 | 766 | 163 | 1188 |
| `holeNameOfDecl` | 76 | 646 | 75 | 551 |
| `holeDeclOfFnTy` | 47 | 370 | 134 | 1079 |
| `holeBindCalled` | 37 | 215 | 96 | 549 |
| `holeBindRowTy` | 37 | 532 | 14 | 261 |
| `holeAssignOk` | 35 | 303 | 173 | 921 |
| `holeBindArgIsHole` | 27 | 776 | 150 | 4612 |
| `holeChoiceArmDecl` | 25 | 4205 | 70 | 6168 |
| `holeBindRenamed` | 24 | 246 | 41 | 922 |
| `holeDeclValueCstrsAt` | 23 | 1378 | 497 | 3968 |
| `holeDeclCstrsAt` | 17 | 1172 | 401 | 4013 |
| `holeDeclCstrsBind` | 17 | 1172 | 401 | 4027 |
| `holeDeclChecked` | 17 | 111 | 88 | 715 |
| `holeBindsOnly` | 14 | 76 | 32 | 112 |
| `holeNameOnlyForwardedUnread` | 6 | 66 | 206 | 4607 |
| `holeBindSelfForward` | 5 | 96 | 5 | 136 |
| `holeBindNamesParam` | 2 | 7 | 3 | 18 |
| `holeBindLitCallee` | 2 | 5 | 3 | 9 |
| `holeBindLitForward` | 2 | 4 | 3 | 8 |
| `holeFlowsToTwoFns` | 1 | 1 | 25 | 71 |
| `holeDeclCallInst` | 1 | 1 | 2 | 6 |
| `holeNamesTpJoin` | 0 | 0 | 1396 | 9170 |
| `holeBindOpenInsts` | 0 | 0 | 86 | 492 |
| `holeChoiceJudge` | 0 | 0 | 31 | 451 |
| `holeDeclName` | 0 | 0 | 15 | 60 |
| `holeChoiceDisagreeMsg` | 0 | 0 | 10 | 14 |
| `holeBindOwnerNode` | 0 | 0 | 6 | 21 |
| `holeBindCalls` | 0 | 0 | 6 | 21 |

- **Only inside fit questions:** `holeNamesDecl`. Its decision is never made at
  a binding, only while a delivery is asked about.
- **Only at a binding:** `holeNamesTpJoin`, `holeBindOpenInsts`, `holeChoiceJudge`, `holeDeclName`, `holeChoiceDisagreeMsg`, `holeBindOwnerNode`, `holeBindCalls`.

## What group 2 writes

From the compiler's call graph, these are the only module states the 48 write directly:

| writer | writes | kind |
| --- | --- | --- |
| `holeBindHeldSet` | `holeBindHeld` | a register set around a call check: a hidden argument |
| `holeFlowTruncate` | `holeFlowSrc`, `holeFlowDst` | a rollback of the `holeFlow` rows |
| `holeBindInsts`, `holeBindForward` | `holeBindSeen`, `holeBindOpen` | a walk's counters, read by its caller |
| `holeBindNoteCall` | `holeBindFollowLit`, `holeBindOnlyCall` | the walk's modes, set and restored |
| `holeBindSelfForward` | `holeBindSelfSeen` | a walk's visited set |
| `holeBindLitForward` | `holeBindLitFollowed` | a walk's counter |

None is read outside `check_relate_core.vl` / `check_hole_rows.vl`. **No group-2 judge records a
product.** Each answers from the checker's state at the time it is asked, and is asked again on the
next delivery.

## What it decides for S2

- **The rows record answers, not writes.** A group-2 prerequisite records the answer the binding
  would give as a row keyed by the binding: the decl, the parameter and the call. S2 then reads the
  row instead of re-asking.
- **The fit-question entries are the ones that change.** A fit question that re-asks a judge (721
  programs for the `holeBindHeld` register path, 592 for `holeChoice*`) must read the binding's row,
  not recompute against the half-built state of the question.
- **`holeNamesDecl` comes first.** It is asked only inside fit questions (522 programs). Today it has
  no binding-time answer at all.
- **The out-channels and modes become arguments where their caller is in group 2.** That is the
  relate lane's systematic step for the hidden registers (`holeBindHeld`, `holeBindFollowLit`,
  `holeBindOnlyCall`), done in the same PRs.
