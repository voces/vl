# Step 7: a union of lists has an element kind by type, 2026-11-11

`rlListUnionKindOfTy` (`emit_shape_rows.vl`) declined a union of lists whose arms share one
list kind. That left `arrLitElemKind` to read the literal's shape for such an element. It now
answers by type:
- arms sharing one scalar wrapper are that wrapper, as in `i32[] | K[]`, which is one i32 list;
- two ref lists, or two different wrappers, are the box.

## Measurement

Fixpoint seeds on both sides, over the whole sweep population. The base is #7293's branch
merged with master `07a0a635`. Result: same 23,923, bytes-only 0, output movers 0,
runs → not-runs 0, new compiler traps 0. The type now gives the answer the shape reader gave.

## The shape reader's remaining floor

An `emitFail` probe on the shape reader's remaining call fires on 20 cells:

| class | cells |
| --- | --- |
| no recorded type | 13 |
| a hole or type parameter element (`T[]`, `_[][]`, `T[][]`) | 7 |

None is a union of lists.
