## Codegen, memory & runtime (Track B)

- **IR coverage: a call that never returns, used as a value.** A direct call checked `never` is built at i32, which is legacy's rep for `never`, and lowered as `call; unreachable`. The IR then writes the consumer after it as legacy does: an operator beside an i32 operand, or a typed binding, which widens it. Verifier rules 3 and 6 admit that temp, and nothing else. tests/cases `rep novalue` goes from 16 functions to 1, and the rest name their real blocker.
- **D17064 filed:** `fail() * x` with `x: f64` passes `vl check` and emits an invalid module (legacy writes the operator at i32).
