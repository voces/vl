## Codegen, memory & runtime (Track B)

- **IR decision modules 1, the list plans:** the push, pop, element-store, reserve, list-literal
  and `for … in` decisions both emitters read move out of `wasmEmit.vl` into
  `compiler/emit_plan_list.vl`, and the narrowed-arm unbox decision into `emit_plan_union.vl`.
  Neither writes bytes or imports an emitter, which `tests/vl_emit_plan_modules_test.ts` holds
  for every `emit_plan_*.vl`. The IR's `arrLitBuildOf` alias is deleted. No emitted byte moves.
