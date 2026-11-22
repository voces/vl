## Codegen, memory & runtime (Track B)

- **IR coverage, a tagged call through a module global read at a closed function type:** a choice of functions kept as its set's `i32` id in a module global, called through the adapter legacy writes for a closed function type, builds through the IR. The callee is read as its cell stores it, as legacy's `global.get` reads it. tests/cases covered = matched +37; `global read coercion` 68 → 32.
