## Codegen, memory & runtime (Track B)

- **IR stage 1, the start-order matrix:** `tests/cases/start-order/` pins the start function's
  observed order and values before the IR claims it: a guarded global read from a function the
  start calls, an initializer reading its own global, initializers with side effects interleaved
  with statements, a trap mid-start, a top-level string accumulator, promoted loop globals, and a
  multi-module initialisation. `ir-identity.sh --cases` covers it with the rest of `tests/cases`.
