## Codegen, memory & runtime (Track B)

- **D16460, D16461, D16462, D16464 closed:** a returned value `if` lowers, reserves, infers and spills as the tail `if` does: `return if c { xs.pop() } else { xs.push(7) }`, a nested arm widening an atom, a recursive field-write arm with no declared result, and an arm writing a nullable field all run. D16463 (a field-write arm's result built at a minted literal row, tail spelling too) is filed open.
