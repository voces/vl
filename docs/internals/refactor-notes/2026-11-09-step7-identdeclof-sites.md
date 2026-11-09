# Step 7: by-name binding sites onto `identDeclOf`, first slice

Measured 2026-11-09 on a 4-core box. The base is master `d4901c70`. Both seeds are fixpoints
(two `refresh-compiler.sh` runs byte-identical).

| | base (fixpoint) | candidate (fixpoint) |
| --- | --- | --- |
| seed bytes | 6,589,101 | 6,589,386 (+285, +0.004%) |
| distilled corpus (`regress.vl`) | | no cell changed class, no runs lost (batches 2 and 3) |
| emitter by-name call sites (census below) | 178 | 155 |

## The census

The Status row's "49 by-name sites" has no derivation in the tree, and this count does not
reproduce it. What is counted here: a call, in `emit_*.vl` and `wasmEmit.vl` outside
`emit_mono.vl`, to one of 41 emitter functions that answers a question about a BINDING by
matching a name against parameters, captures, scopes, globals or an arena scan. Intrinsic
name classifiers (`nameIsMemStoreIntrinsic` and the like), `mkIdent` and the monomorphizer's
renaming are not binding lookups and are not counted. A site is `ident-arg` when the name it
passes is an `Ident`'s own `.identName`, so the read is in hand at the call.

| family | call sites before | after | ident-arg after |
| --- | --- | --- | --- |
| parameter by name (`paramIndexOf`, `paramStructIndex`, `paramRefArrayName`, `paramMapShape`, `feParamTyName`, `fnHasParamNamed`, `bundleParamNamed`) | 23 | 7 | 1 |
| `is K[]` tested set (`listIsTestedName`) | 7 | 1 | 0 |
| capture tables (`capturedKindOf`, `capturedIsUnionBox`, `capturedRefListSlot`, `identIsEnvCapture`, `captureHomeOf`, `captureLoop*`, `capturedBindingFrameOf`, `liftedFnCaptures`) | 43 | 43 | 19 |
| frame and scope chain (`parentBinding*`, `fnIndexOfInScopeAt`, `scopeSlotOf`, `outerFrameBinds`, `moduleLoopEnclosing`, `identNameIs*`, `nestedFnReadsDisjoint`, `liftedFnReadsDisjoint`) | 67 | 67 | 20 |
| globals (`globalIndexOf`) | 12 | 12 | 7 |
| `is K[]` arm tables (`listFit*`, `listIsRecvTysIn`, `listOpRecvNarrowedUnion`, `narrowReadsName`, `identReadsUnionBox`, `calleeAnnRetRefListSlot`) | 26 | 25 | 16 |
| total | 178 | 155 | 63 |

The census is a regex over call sites, so a call spread over several lines can be missed in
either column; it is a lower bound.

## What moved

* `paramPosOfDecl(fnIx, d)` and `paramPosOfRead(fnIx, atIx)` (`emit_query.vl`) find a
  function's parameter by the read's declaration. They are `paramTypeNodeOfRead`'s matcher,
  factored out: an instance's parameter matches the template's through its original or its
  source position. A read with no recorded declaration (-1) matches by name, as before.
* `paramStructIndex`, `paramRefArrayName`, `paramMapShape` and `feParamTyName` take the read
  instead of a name. `fnHasParamNamed` and `bundleParamNamed` are deleted; their sites ask
  `paramPosOfRead` and `bundleParamOfDecl`. Six `paramIndexOf(fnIx, x.identName)` sites ask
  `paramPosOfRead`.
* `listIsTestedIdent(ix)` (`emit_base.vl`) answers the `is K[]` prefilter by declaration. The
  scan keeps a sparse map of tested declarations, filled on first ask like the name set it
  sits beside. A read or a test with no recorded declaration falls back to the name. Six of
  the seven sites take it; `listFitGrowRow` takes the receiver `Ident` for its prefilter.

Where a read's declaration and its name disagree (a `let` shadowing a parameter, two
variables of one name in different functions), the answer narrows to the read's own binding.
The corpus has no cell where that changes an outcome.

## What stands, and why

* **Capture tables** are keyed by name end to end: `captureNamesOf(fe)` is a list of names,
  and the env layout, `capturedKindOf` and the lifted-parameter maps index it by name. A read
  in hand does not help until the capture list itself records declarations. That is a change
  to the capture analysis, not to its readers. `emit_lift.vl`'s `listIsTestedName(caps[ci])`
  is the one tested-set site left, for this reason.
* **Frame and scope chain** lookups walk `fnStmts` frames for the nearest one binding a name.
  The binder already resolved that, so `identDeclOf` could answer which frame declares the
  binding. But the frame is reached through `fnStmts` positions, and no table maps a
  declaration to its frame position. The ruling forbids building a per-node index for it.
* **Globals**: `globalIndexOf` scans the globals by name. A declaration-keyed answer needs
  a declaration column on the globals table, written where globals are collected.
* **`is K[]` arm tables**: `fitGrow*` and `fitSh*` record receivers by name per function. The
  prefilter is now by declaration; the tables are next, with a declaration column in place of
  the name one.
* `paramIndexOf`'s seven remaining sites hold a name with no read (frame walks,
  `bindingHomeOf`), or sit inside the scope-chain family.
