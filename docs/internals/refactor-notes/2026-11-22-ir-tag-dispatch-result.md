# IR coverage: a tagged call's result admitted by legacy's own kind (2026-11-22, lane IR-N7)

`tagDispatchAt` admitted a dispatch's result by its own list: a reference rep, or a primitive among
`i32`, `i64`, `f32`, `f64` and `str`. Legacy's `emitFnTagDispatch` keys the same choice on the
result's kind (`repSigKindOfTy`). It writes each arm's value as it stands, a narrower numeric one
widened, and boxes each arm only for a `union` kind. So a `boolean` result, a plain `emitExpr` arm
in legacy, was the miss `tag dispatch result`.

## Change

- **`tagDispatchBoxes`** (`wasmEmit.vl`) is legacy's box choice, split out of
  `emitFnTagDispatch`, which now asks it.
- **`tagDispatchAt`** (`ir_build.vl`) asks `repSigKindOfTy` and `tagDispatchBoxes` in place of
  its own list:
  - no kind is still `tag dispatch result`;
  - a union is the named miss `tag dispatch result union`;
  - every other kind builds. Each arm's delivery still checks the call's rep.
- **New row:** `tests/ir-shadow-rows/tag-dispatch-bool-result.vl`, a generic function value
  called at `boolean` through a tagged set.

## Measured

Against master 4fbcb806's fixpoint seed, tests/cases covered = matched goes from 68,729 to
68,770, with no new mismatch:
- bodies: `tag dispatch result` 71 → 0. 29 are now `tag dispatch result union`, and 1 moves to
  `global read coercion`;
- starts: 28 → 0. 9 are now `tag dispatch result union`; of the rest, 1 moves to `coalesce box
  stash operand` and 1 to `pre-path coercion`.

Still open: the union result, legacy's `emitUnionBoxOwed` per arm.
