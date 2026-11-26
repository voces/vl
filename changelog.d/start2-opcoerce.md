## Codegen, memory & runtime (Track B)

- **IR claims two binary operand coercions:** a shift's `i64` count beside an `i32` value is wrapped to `i32`, and an `i32` operand beside an `f64` or `i64` one, where no operator width names the meeting rep, is widened to the result's rep right after it is built, both as legacy writes them. `operand coercion` falls 2 → 0: `bitwise/shift-count-widens-untyped-literal.vl` (`variableCount`) and `closures/mixed-result-fn-list-call-bound-in-block.vl` (`@start`) are fully claimed. Claimed and claims-off builds are byte-identical.
