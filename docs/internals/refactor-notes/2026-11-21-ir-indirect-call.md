# IR: closure calls by any expression, captured direct calls, 2026-11-21

Lane IR-N6, steps 4 and 5, stacked on step 3 (`2026-11-21-ir-env-cache.md`).

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

## Readings (base: step 3's fixpoint seed; candidate fixpoint)

| reading | step 3 | steps 4 and 5 |
| --- | ---: | ---: |
| corpus functions with no blocker (census) | 42,329 | 42,343 (+14) |
| `tests/cases` functions with no blocker | 56,902 | 57,202 (+300) |
| `tests/cases` `indirect call` (any) | 659 | 268 |
| `tests/cases` `callee environment` + `callee captures` (any) | 433 | 229 |
| armed `tests/cases` covered / matched | 56,902 / 56,888 | 57,202 / 57,187 |
| L2 self-compile fuel | 104,961,271,984 | 105,049,308,095 (+0.084%) |

The one new non-matching armed row is `tests/cases/maps/ref-list-values.vl`'s `go`. Until now it
stopped at `indirect call`; it now reaches a `spans: read index` mismatch that master's seed
shows on its own:
`print((ms["z"] ?? [[{ v: -1 }]])[0][0].v)` over a `{[string]: S[][]}`. Code bytes are identical,
and the `--names` spans differ; the chain is the `??`-then-index lowering's, not a closure's.
