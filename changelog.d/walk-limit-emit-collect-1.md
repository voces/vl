## Codegen, memory & runtime (Track B)

- Six collect-pass walks in `emit_collect.vl` (union-box fields, nested record literals, closure signatures in shapes, arm shapes, committed annotations) visit each type or node once instead of stopping at a fixed depth.
