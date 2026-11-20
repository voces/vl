# IR: `__array_copy__` through legacy's plan, backing reads and copy tail, 2026-11-20

After #9278, four self-compile functions still waited on `intrinsic none` for an
`__array_copy__(dst, dstAt, src, srcAt, count)` statement, which the builder sent to the numeric
intrinsic plan. Legacy writes the destination list and its backing, the destination offset, the
source list and its backing, the source offset and the count, then one `array.copy` between the
two backings, which share one kind and row.

## The change

- `emitArrayCopyIntr` (wasmEmit.vl) is split into shared parts that legacy and the IR both call:
  - `arrCopyCallNamed`, the routing: the spelling, with no binding owning the name;
  - `arrCopyPlanOf`, the wrapper and backing pair, or the refusal legacy records;
  - `arrCopyBacking` and `arrCopyTail`, which write the backing read and the copy.
- `RListCopy { lcArgs, lcAt }` is a new `Rhs` (the lint closed set is updated), built in statement
  position over the five operands: two lists of one list rep, then three `i32`s. The verifier
  holds those reps.
- The lowerer writes it as an effect in `emitArrayCopyIntr`'s order, each list operand followed by
  its backing read.
- Named misses stay for a refused site, an operand at another rep, a short-circuit operand, and an
  `__array_copy__` in value position.

`vl_ir_shadow_test.ts` holds an i32, a string, an f64 and a record list copy covered and matched.

## Readings (vs merge-base `ebf4b1c17`, fixpoint seeds on both sides)

READINGS
