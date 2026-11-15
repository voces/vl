## Codegen, memory & runtime (Track B)

- **D16460, D16461 closed:** a returned value `if` lowers and reserves its frames as the tail `if` does: `return if c { xs.pop() } else { xs.push(7) }`, a returned `x ?? 5` into `f64` and a nested arm widening an atom all run. D16463 (a field-write arm's result built at a minted literal row, tail spelling too) is filed open.
