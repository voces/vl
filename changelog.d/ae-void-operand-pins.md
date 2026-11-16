## Type system (Track A)

- **D16870, the remaining positions:** a `void` result of an un-annotated function that ends in a call now names that function, and `vl check --fix` writes its `return`, also as an `&&`/`||` operand, under a `??`, and as an `if` or `while` condition. `--fix` is pinned over every operand position, and a callee that is `void` by design is left alone.
