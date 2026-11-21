# IR coverage: a `??` over a record's value-union field (2026-11-21, lane IR-N1)

`o.v ?? d` over a record field that holds a value union with `null` as a box is legacy's
`emitCoalesceUnionField`: the field's box, its tag tested against `null`, the default, and in the
present arm the record re-read and the field's box kept (`boxed`, where the result is a union or
the default nullable) or its residual scalar unboxed and widened (`unbox`). It is reached past the
boxed and call-niche rungs, and the IR left it inside the miss `coalesce box next`.

## What landed

- **A plan and shared tails.** `coalFieldPlanOf` states the writer's decisions: no field box
  (`none`, the rung passes on), the refused `ambiguous`, `narrowed` and `noKind`, and the `boxed`
  or `unbox` write with the field's heap, kid, receiver unwrap, result coercion and kinds.
  `emitCoalesceUnionField` writes from it through `coalFieldBoxOpen`, `coalFieldValOpen`,
  `coalFieldRead` and `coalFieldUnbox`, which the IR's lowering also calls. The bytes are
  unchanged.
- **The IR arms.** `SCoalBox` gains `fieldBox` and `fieldVal`: the record variable, the shared
  open, the default built into the null arm, the else, the record re-read and the shared read or
  unbox. The verifier holds the record a variable and the out a box or a scalar.
- **Named misses.** A receiver legacy unwraps first (`coalesce field cast`: a narrowed box arm, or
  a nullable variant), a record that is not a variable (`coalesce field place`, such as a nested
  field), and a field the plan passes on (`coalesce field none`).

## Coverage

MEASURED
