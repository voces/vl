## Codegen, memory & runtime (Track B)

- **A `??` over a hole parameter keeps a wider record argument as a member of its join**
  (D16796). `function t(q) { print((q ?? {x: 0}).x) }` handed a `{x: i32, y: i32} | null` built an
  invalid module. The hole's join narrowed the record to `{x}`, which the concrete `??` never does.
