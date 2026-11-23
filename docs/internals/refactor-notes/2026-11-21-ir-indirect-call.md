# IR: closure calls by any expression, captured direct calls, their arguments, 2026-11-21

Lane IR-N6, steps 4 to 6, stacked on step 3 (`2026-11-21-ir-env-cache.md`).

## Step 4: a direct call of a nested function that captures

A nested function that captures through its environment and is called by name is written by
`emitCapturedCall`: its closure over a fresh environment, stashed, then `call_indirect` at its own
`$fnsig`, with legacy's call-ref head and tail. The builder refused it (`callee environment`).

- `capturedArgArmOf` (`wasmEmit.vl`) is `emitCapturedCall`'s argument ladder as one decision, a
  closed set (`CapturedArgArm`): a union parameter's box by table or floor, a widening, a literal
  union, an atom's string, an arm unbox, or plain. `emitCapturedCall` dispatches on it with an
  exhaustive `match`. The IR builds the `plain` arm only.
- `capturedCallRhs` builds an `RMakeClo` over `cloEnvOf`'s environment, then an `RCallRef` at
  `fnSigIdxOfFn`. A generic nested function's call site has no closure rep (`captured call
  closure rep`), and an argument on any other arm misses.
- `liftCaps` also passes on a capture of the calling frame when that frame is lifted: the
  capture is its own parameter (`liftCapVar`). An environment field would be written ahead of
  the callee's null environment, so it stays a miss (`callee captures env`).

## Step 5: a call through any closure expression

A call whose callee is no name or field (`fs[0](x)`, `mk(2)(x)`, `(pick(c))(x)`) missed as
`indirect call`. `emitCallCore` sends such a callee to `emitCallRef` when it is a closure.
`exprCallRefPlainHead` is `callRefPlainKey`'s head for it: a closure, no bundle and no held record.
The shared tail and legacy's armed agreement record (`callRefLegacyPlainKey`) cover it as they
cover a binding's call.

Compiler lines +197 / −53 over step 3 (`wasmEmit.vl` +98 −45, `ir_build.vl` +89 −8, `lint.vl`
+10). Rows: `tests/ir-shadow-rows/captured-direct-call.vl`,
`lifted-capture-passed-on.vl` and `indirect-closure-call.vl`, each covered and matched.

## Step 6: a closure call's widened and reference arguments

`callRefArgPlain` was the IR's test for a closure-call argument it writes as legacy does, and
`emitCallRefArg` kept its own copy of the plain test for the armed agreement record. Census of the
`call of a non-declaration` rows in `tests/cases`, by the condition that declined (a scratch
instrument, not committed), over 481 files: a bundle 336, an `i32` argument widened into an `f64`
parameter 136, a tagged set 98, a general-arm argument of a closure, list, record-arm or map
parameter about 150, a held record 45.

- `emitCallRefArg`'s record asks `callRefArgPlain` itself, so the two cannot drift.
- `callRefArgPlain` admits the three widenings, and the general arm at a non-null closure, list or
  map parameter (`emitNonNullParamRecover` writes nothing there).
- `closureCallRhs` delivers a widening at its parameter's number (`deliver`, legacy's
  `widenPlanOf`; its literal arms stay named misses), and checks a reference argument's rep
  against the parameter's kind (`closureArgRepIs`).

A bundle (D14841) reads the closure out of a record of closures that the parameter's own rep
calls a closure; that needs the parameter's rep first, and is left.

## A guard: a coalesced nested list literal's index read

Covering `indirect call` reached `tests/cases/maps/ref-list-values.vl`'s `go`. Its
`(mss["z"] ?? [[{ v: -1 }]])[0][0].v` banks read-index span rows other than legacy does
(`spans: read index`), on master's seed too:
`print((mi["z"] ?? [[3], [4]])[1][0])`. Code bytes are identical, and a `--names` build differs.
At the coordinator's ruling, an index read of a `??` whose default is a list literal of list
literals is a named miss (`index of a coalesced nested list literal`), pinned by
`tests/ir-shadow-rows/coalesced-nested-list-index.vl`. The span rows are IR-N3's to fix.

## Step 7: a tagged call's lambda arm

A tagged call whose arm calls a hole lambda missed (`tag dispatch lambda arm`): legacy stages the
arm's callee at the lambda's instance for this call's signature (`emitArmRowFe`,
`elabArmStagePush`). `lambdaArmFe` asks the same row (`monoBundleReadFe` at `elabArmSigAt`), and
the arm is a direct call of that slot, through `directCallAt`, the tail of `callRhs` now split out.
The arm's result must be the dispatch's rep as it stands; its temp takes the dispatch's type.

## Readings (base: step 3 merged with master `8239565e`, fixpoint; candidate fixpoint)

| reading | step 3 | steps 4 to 7 |
| --- | ---: | ---: |
| corpus functions with no blocker (census) | 42,735 | 42,758 (+23) |
| `tests/cases` functions with no blocker | 57,283 | 57,942 (+659) |
| self-compile functions with no blocker (each seed on its own tree) | 19,194 | 19,205 |
| `tests/cases` `indirect call` (any) | 660 | 217 |
| `tests/cases` `call of a non-declaration` (any) | 1,094 | 849 |
| `tests/cases` `tag dispatch lambda arm` (any) | 190 | 0 |
| armed `tests/cases` covered / matched | 57,283 / 57,270 | 57,942 / 57,929 |
| L2 self-compile fuel (baseline 104,920,663,373) | | 105,114,300,766 (+0.18%) |

Armed `tests/cases`: the fail and mismatch rows are the same on both seeds, row for row
(`spans: read index` 6, `effect outside I1` 4, three verifier rows); none is new.

Fuel by step, each tree built by one seed (master `026aee96`'s merged fixpoint), L2 guest fuel:
step 4 +78.3M (+0.075%), step 5 +9.7M, step 6 and the guard +9.7M, step 7 +15.8M, and the
`ir_helper` import that replaced the checker's number types +25.1M. The compiler compiles no
captured call, closure-expression call or lambda arm of its own, so nothing here runs a new arm
in the self-compile. Step 4 adds 180 compiler lines (the `CapturedArgArm` ladder and the
builder), which the self-compile compiles; the import edge's cost is not attributed further.
