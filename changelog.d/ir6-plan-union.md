## Codegen, memory & runtime (Track B)

- **IR decision modules 3, the union plans:** the `is` rungs, narrowed reads, atom and union
  equality and the box plan (`holeBoxPlanOf`) move out of `wasmEmit.vl` into
  `emit_plan_union.vl`, and the narrowed-arm unbox into `emit_plan_coerce.vl`. The IR asks the
  read and compare recover decisions itself rather than calling legacy's writers. No emitted byte
  moves.
