## Codegen, memory & runtime (Track B)

- **IR decision modules 2, the coercion and null plans:** `coerceKindAt` and the null and
  coalesce decisions move out of `wasmEmit.vl` into `emit_plan_coerce.vl` and
  `emit_plan_null.vl`. `emitNullForRet` splits into a shared plan and tail, a `??` over a nullable
  ref dispatches on one arm both emitters read, and the IR builds a dead null test as legacy
  writes it. No emitted byte moves.
