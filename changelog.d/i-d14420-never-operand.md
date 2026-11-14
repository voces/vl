## Type system (Track A)

- **D14420 closed:** an arithmetic, bitwise or comparison operator over a `never` operand outside a dead arm checks and runs: `if c { return 1 } 1 + fail()` prints `1`, where it was `operator '+' is not defined for i32 and never`. The operator is `never`, as D16006 already ruled in a dead arm; `&&`, `||`, `??` and string `+` keep their own typing.
