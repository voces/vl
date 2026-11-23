# IR: a union of records delivered unboxed at a record slot (2026-11-23, lane IR-D1)

The `B | D > A` one-off of `declaration coercion` (#9773's note) is one mechanism at five
positions. On master 56cbefaa every function of
`tests/cases/narrowing/union-of-contained-records-delivered-as-record-runs.vl` missed, each under
its position's name:

| position | miss |
| --- | --- |
| return | `return coercion` |
| binding | `declaration coercion` |
| argument | `argument coercion` |
| field | `object field arm unbox` |
| push (start) | `start: push operand coercion` |

## Mechanism

Legacy's `emitArmDelivery` at a record slot of heap `h` writes the value, the union box, then
the payload's `struct.get` and a `ref.cast h`. It does so where every arm is a record stored at
`h` (`exprRecordArmsAt`, D16321). The IR's `RArmUnbox` covered only a narrowed read, whose
heap is its arm record's (`armRecordHeapAt`).

- `RArmUnbox` gains `uaDst`: the destination record rep, or -1 for a narrowed read.
- `deliver` builds the box and an `RArmUnbox` at `uaDst` where `recordArmsUnboxOwedAt` holds,
  beside `armUnboxOwed`. That covers the return, binding, argument and push positions. The
  object field arm takes the same predicate past its `object field arm unbox` miss.
- The lowering writes `emitRecordArmsUnboxTo`, a wrapper over `emitNarrowedArmUnboxTo`, so the
  decision and the bytes are legacy's.

## Verifier

Rule 2: a record arms unbox lands at the record it names. Keyed self-tests:
- `record-arms-unbox-at-its-record`: holds, 0;
- `record-arms-unbox-at-another-record`: refused, 2.

## Readings

Master 56cbefaa → head, fixpoint seeds. In the ir-i8 census (tests/cases), each of the four
position classes falls by one. The `union-of-contained-records-delivered-as-record` matrix runs
46 of 46, with no SILENT, before and after.

## Legacy tails the IR calls

- `emitRecordArmsUnboxTo` (new export, wasmEmit), through `RArmUnbox.uaDst`.
