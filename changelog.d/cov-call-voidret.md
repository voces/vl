## Codegen, memory & runtime (Track B)

- **IR lowers `return <expr>` in a function with no result:** the expression is built for its effect, then a bare return. Covered cases: a field's or parameter's void call, an early return in an `if` or a loop, a nested function, and a generic instance at `never`. All now run through the IR instead of missing on `void return value`.
