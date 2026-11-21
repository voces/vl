## Codegen, memory & runtime (Track B)

- **IR coverage, wide memory accesses:** the i64, f32 and f64 loads and stores (`__load_i64__`,
  `__store_f64__`, the zero-extending `__load_u*_i64__` and the rest) build through the IR along the
  same access plan and tail as the i32 widths. The plan now names each width's value prim
  (`mxPrim`). No emitted byte moves.
