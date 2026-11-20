# IR: an i32 memory load or store through one access plan and tail, 2026-11-20

After #9290, five self-compile functions still waited on `intrinsic none`: three
`__store_i32__`, two `__load_i32__` (one with `__load_u8__`). Legacy wrote each width in one of
three arms (`__store_i32__`, `__load_i32__`, and the width tables for the rest): the address,
with any constant part moved into the memarg offset, a store's value at its declared width, then
one access at the width's natural alignment.

## The change

- The three arms of `emitCallCore` are one, `emitCallCoreMemAccess`, over one plan and one tail
  (wasmEmit.vl), which legacy and the IR both call:
  - `memAccessCallNamed`, the routing;
  - `memAccessPlanOf`, a width's opcode, alignment, operand count and store widening;
  - `memAccessTail`, the access.
- `emitMemAddr` is a plan, `memAddrPlanOf` (a new closed set `MemAddrArm`, registered), and the
  writes of each arm. Its arms are unchanged.
- `RMemAccess { mmArgs, mmAt }` is a new `Rhs`, built for an access whose value is a plain i32,
  over the plan's `const` address (an immediate 0) or `rest` address (its node), then a store's
  value. The verifier holds every operand and a load's result at i32.
- The lowerer writes it in `emitCallCoreMemAccess`'s order, as a value for a load and as an
  effect for a store; a discarded load drops its value, as legacy's statement arm does.
- Named misses stay for a widened store value (i64, f32, f64), a wide load, and the `lma`,
  `fold`, `wide` and `bad` address arms.

`vl_ir_shadow_test.ts` holds a plain, a computed, a constant and an offset address, a byte width
and a discarded load covered and matched.

## Readings (vs merge-base, fixpoint seeds on both sides)

READINGS
