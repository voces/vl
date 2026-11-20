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
The interleaved backing reads are right because each operand is written in place at its use: the
same test file holds computed offsets and counts, a call as the count and a call as the source
list, every function matched.

## Readings (vs merge-base `ebf4b1c17`, fixpoint seeds on both sides)

| reading | merge-base | this change |
| --- | ---: | ---: |
| self-compile functions claimed (mode 5) | 18,683 | 18,690 (+7) |
| self-compile functions with no blocker | 18,782 | 18,793 (+11) |
| self-compile `intrinsic none`, alone | 9 | 5 |
| corpus covered = verified = matched (shadow) | 41,682 of 45,678 | 41,682 |
| L2 self-compile fuel | 104,021,790,789 | 104,122,716,295 (+0.097%) |
| seed size | 6,915,397 | 6,918,317 (+2,920 bytes) |

The five self-compile functions left are the linear-memory load and store intrinsics. No corpus
function waited on `__array_copy__`. The fuel rise is spread over the phases (checking +0.05G,
code payload +0.04G, elaboration +0.01G): a new member of the `Rhs` union every match over it
checks, and the source the split adds. Legacy is A/B'd on its own: compilers with `CLAIMED` empty
built from both trees give identical bytes on every tests/cases program and probe (7,530
identical, 68 failing under both, 0 differ) and the same first diagnostic on all 59 filed
emit-reject witnesses.
