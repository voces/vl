## Codegen, memory & runtime (Track B)

- **IR: a write to a module global that a function may make before the global's initializer ran builds in the IR**: legacy's write-before-init guard (`emitInitGuard`), then the `global.set` and its assigned bit, as `emitUserGlobalSet` writes it. tests/cases `guarded global write`: 13 functions → 0.
