# Field stores: a narrowed field receiver, a receiver at a stored row (2026-11-25, lane COV-START)

Two of the field-store classes taken over from COV-CALL's tail. Each is a guard in `fieldStore`
(`ir_build.vl`) that asked a narrower question than legacy's store answers. Neither is a
disagreement between the IR's row rep and legacy's heap.

## The mechanisms, one commit each

- **`field store narrowed variant`.** `if q.h is B { q.h.w = 5 }`: the receiver is a field
  narrowed out of a union. The guard asked `narrowedBoxVariantPlain`, which answers only a
  local's or a global's plain read, so every field receiver missed. A member receiver is now
  asked its arm's variant (`narrowedStructArmVi`).
- **`field store row rep`.** `put(y.j)` with `put(q: { f: i32 }) { q.f = 5 }`: the parameter is
  instanced at the field's stored record (D15827). Its type reads `f` as `i32`, but its row stores
  `i32 | null`'s box, which is the heap legacy's store writes. The receiver operand is built at
  that row.
  - Where the type's row does not fit the value legacy stores, the store now takes the operand's
    row.
  - Every store the builder claimed before keeps the type's row.

## Measured

The class's programs, armed shadow (`$VL_IR_SHADOW=1`), master → head:

| program | master | head |
|---|---|---|
| `narrowing/narrowed-field-of-a-global-union-member-record.vl` | start uncovered `narrowed variant` | start matched |
| `narrowing/narrowed-field-store-through-a-member-record.vl` | start and 3 functions uncovered | all matched |
| `soundness/field-read-off-wider-built-literal-binding-to-param-runs.vl` | 1 function uncovered `row rep` | matched |
| `records/hole-identity-field-uses-delivered-wider.vl` | 3 functions uncovered `row rep` | 2 matched, 1 moves to `field store coercion` |

Each prints the same output on legacy and under `$VL_IR_STRICT=1`.

The sweep `tests/cases/records/field-store-narrowed-and-stored-row-positions.vl` covers:
- narrowed receivers: a parameter, a local, a nested field, an element, after an early return,
  and a module binding;
- a stored-row parameter, called with a field read and with a local.

It prints the same output on legacy and under strict IR. Its start body and all seven functions
are matched. On master six functions and the start body missed.

## Left

`field store shared` is a write through an un-narrowed union of records, which legacy writes as a
tag dispatch (`emitSharedFieldAssign`). It needs its own node, and is a separate PR.
