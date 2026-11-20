## Codegen, memory & runtime (Track B)

- **IR coverage:** a `.push` onto a literal-union, nullable-boolean, nullable-string or union-box list, or of a narrowed arm onto its record list, is built by the IR, its value delivered at the element rep as legacy writes it (self-compile: 41 more functions covered).
