## Codegen, memory & runtime (Track B)

- **IR: a nullable record compared with a bare one builds in the IR** (`nullable record eq bare side`, 6 rows on master's census, 4 now covered): the bare side is read as legacy's expression root, so its null test is `i32.const 0`, never a `ref.is_null` of its local.
