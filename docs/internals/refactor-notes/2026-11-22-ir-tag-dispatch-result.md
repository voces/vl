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
- **`tagStashLeads`** (`ir_build_ref.vl`) opens an element read's row at its receiver's first node
  wherever the receiver's nodes hold a tagged call's stash. Before, it did so only where the stash
  led or followed a global read. Legacy's `emitIndexBanked` spans the whole receiver, a callee of
  any expression included:
  - in `ts[0]("q")[1]`, master already reads the row at the call (byte 100 against legacy's 58);
  - with that start body newly covered, it was the one new mismatch,
    `closures/container-of-generic-instanced-per-call.vl`'s `start spans: read index`;
  - the bytes were identical.
- **New row:** `tests/ir-shadow-rows/tag-dispatch-bool-result.vl`, named `boolean` members through
  a hole parameter and through a choice. A generic member would add a late tag row (`{same}`).

## Measured

Against master 4fbcb806's fixpoint seed, tests/cases covered = matched goes from 68,729 to
68,770, with no new mismatch:
- bodies: `tag dispatch result` 71 → 0. 29 are now `tag dispatch result union`, and 1 moves to
  `global read coercion`;
- starts: 28 → 0. 9 are now `tag dispatch result union`; of the rest, 1 moves to `coalesce box
  stash operand` and 1 to `pre-path coercion`.

With the row rule, over all of tests/cases with an L1 head from master 4bcb34f34: bodies covered
= matched 68,783 → 68,824 and starts 5,938 → 5,956, with no mismatch row moved.

Still open: the union result, legacy's `emitUnionBoxOwed` per arm.
