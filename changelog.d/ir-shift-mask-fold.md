## Codegen, memory & runtime (Track B)

- IR coverage: a masked shift `((x >>> k) & m) << j` (or `* 2^j`) is built by the IR as legacy's strength-reduced shift and mask (`shiftMaskFoldOf`), from existing primitive ops; the two narrowing forms, which need `i32.wrap_i64`, are named misses.
