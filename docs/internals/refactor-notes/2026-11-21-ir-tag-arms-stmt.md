# IR coverage: a statement call through a tagged function set (2026-11-21, lane IR-N7)

A probe on IR-N6's `ir-closure-call-loopvar` (db234288) splits `call of a non-declaration` on
`tests/cases` plus the distilled cells. It names each refusal by `fnTagArmsAt`, the callee's
declaration and `exprPrePathWhy`. The `tagArms` part is 253 functions (243 with no other blocker):
- the callee a loop variable: 155;
- a `let`: 73;
- a parameter: 25.

Every one has `exprPrePathWhy` = `pre-path tag dispatch`. The builder already writes that dispatch
for a call read as a value (`tagDispatch`). A call statement went straight to `callRhs`, where
`callRefPlainKey` refuses a tagged set.

## Change

- **A tagged call statement is legacy's dispatch** (`emitCallStmt`'s `emitFnTagDispatch` arm).
  When `tagDispatchTyIsVoid` holds at `tagDispatchTy` (the reading legacy's `isVoid` takes),
  `tagDispatchVoid` writes:
  - the callee's id stash;
  - a void `SIf` per member but the last;
  - each arm as its call statement, at the target legacy resolves (`userFnCallTarget`).

  Otherwise the valued dispatch is built and dropped, its result rep checked only where it is read.
- **Shared with legacy (`wasmEmit.vl`):** every route the builder adds calls legacy's answer.
  - `callStmtDispatches`: `emitCallStmt`'s dispatch test, split out. The builder routes a call
    statement on it rather than on `exprPrePathWhy`'s expression-side restatement.
  - `tagDispatchTyIsVoid`, which legacy's two inline `isVoidTy(ty) || tyMentionsVoid(ty, 4)` now call.
  - `userFnCallTarget`, `emitCallCoreUserFn`'s scope-chain lookup (#9453 split it out; exported here).
- **An arm declines its tail form.** Legacy disarms its tail cursor after a dispatch
  (`dispatchDeclinesTail`), so a lone arm that ends a void function keeps `call`. The arm's effect
  node goes in a new `IrFn.irNoTailEff`, beside `irNoTail` for valued temps. It is set from
  `dispatchDeclinesTail()`'s own answer, called once per arm, and the lowering only reads it.
- **IR-N6's LoopVar keying** (`callRefPlainKey` admits a loop variable) rides along. Alone it
  moved no function, since 76 of its 77 rows were tagged.
- **Two named misses keep new fail rows out:**
  - `tag dispatch callee expression`: a callee that is not a name, such as `fs[0](x)`;
  - `index valued-if operand`: `fs[if c { 0 } else { 1 }]`. The lowering would refuse it, and it
    surfaced only because the function's later call is now covered.

  `stageTyOf` no longer gives an immediate the type of a rep it is not, such as a function set's
  id in a list literal. Its stage was an ill-typed temp, rejected by verifier rule 3.

## Measured

On the 126 witness files, against master's seed: covered = verified = matched goes 1,346 → 1,560
and start functions 100 → 124, with no fail or mismatch row. The row
`tests/ir-shadow-rows/tag-dispatch-statement.vl` has 8 functions; 5 are `call of a non-declaration`
on master's seed, and here all 8 are covered and matched. The full table is in the PR body.
