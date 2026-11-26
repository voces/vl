## Codegen, memory & runtime (Track B)

- **IR builds `??` over a null hole read before its fill:** `x ?? d`, where `let x = null` is filled later (in a branch, a loop or at module scope), takes legacy's `boxRuntime` rung: the box read at its storage, its tag tested, then the payload unboxed or the default. The IR missed it (`coalesce boxRuntime`). It now builds the same tag test as an `SCoalBox` arm, `boxRuntime` for a scalar result and `boxStash` for a box result. The default runs only on the null arm.
