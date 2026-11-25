# Field stores: a narrowed field, a stored row, a shared field (2026-11-25, lane COV-START)

These are the three field-store classes taken over from COV-CALL's tail. None is a disagreement
between the IR's row rep and legacy's heap: in each, the IR's operand already sits where legacy's
store writes.

## The mechanisms, one commit each

- **`field store narrowed variant`.** `if q.h is B { q.h.w = 5 }`: the receiver is a field
  narrowed out of a union. `fieldStore`'s guard asked `narrowedBoxVariantPlain`, which answers
  only a local's or a global's plain read, so every field receiver missed. A member receiver is
  now asked its arm's variant (`narrowedStructArmVi`).
- **`field store row rep`.** `put(y.j)` with `put(q: { f: i32 }) { q.f = 5 }`: the parameter is
  instanced at the field's stored record (D15827). Its type reads `f` as `i32`, but its row stores
  `i32 | null`'s box, which is the heap legacy's store writes. The receiver operand is built at
  that row.
  - Where the type's row does not fit the value legacy stores, the store now takes the operand's
    row.
  - Every store the builder claimed before keeps the type's row.
- **`field store shared`.** `(A | B).w = v` is legacy's tag dispatch (`emitSharedFieldAssign`).
  - Plan 2 stages one value for every member; plan 1 writes the value in each member's arm, at
    that member's field.
  - The new `RSharedFieldSet` mirrors `RSharedRead`'s receiver forms. Under plan 2, a box local
    or a module global is read again per arm. Otherwise the receiver is staged once.
  - The arm writers `sharedFieldArmTest`, `sharedFieldArmCast` and `sharedFieldArmClose` are split
    out of legacy's loops, so legacy and the IR write one dispatch.

## Measured

The class's programs, armed shadow (`$VL_IR_SHADOW=1`), master → head:

| program | master | head |
|---|---|---|
| `narrowing/narrowed-field-of-a-global-union-member-record.vl` | start uncovered `narrowed variant` | start matched |
| `narrowing/narrowed-field-store-through-a-member-record.vl` | start and 3 functions uncovered | all matched |
| `soundness/field-read-off-wider-built-literal-binding-to-param-runs.vl` | 1 function uncovered `row rep` | matched |
| `records/hole-identity-field-uses-delivered-wider.vl` | 3 functions uncovered `row rep` | 2 matched, 1 moves to `field store coercion` |
| `unions/shared-field-read-any-rep.vl` | 1 function uncovered `shared` | matched |
| `unions/shared-litunion-field-write.vl` | start and 2 functions uncovered `shared` | start and 1 matched, 1 `shared arm value` |
| `soundness/union-shared-record-field-runs.vl` | start uncovered `shared` | start `shared arm value` |

Each prints the same output on legacy and under `$VL_IR_STRICT=1`. The ir-shadow row
`field-store-row-rep.vl` pinned the stored-row store as a named miss; it now pins it as matched.

Two sweeps print the same output on legacy and under strict IR. Every start body and function in
them is matched.

`tests/cases/records/field-store-narrowed-and-stored-row-positions.vl` covers:
- narrowed receivers: a parameter, a local, a nested field, an element, after an early return,
  and a module binding;
- a stored-row parameter, called with a field read and with a local.

On master its six functions and start body missed.

`tests/cases/unions/shared-field-store-positions.vl` covers:
- shared receivers: a parameter, a local, a module binding, an element and a field;
- both plans.

On master its three functions and start body missed.

## Left

`field store shared arm value`: a plan-1 value that needs statements inside its arm.
- A parameter typed at one member's atoms, re-encoded for another's (`n.k = s`).
- A scalar boxed for one member's `i32 | null` field.

`RSharedFieldSet` holds an operand per arm, not a body. Writing the value ahead of the dispatch
would change legacy's bytes, so it stays a miss.
