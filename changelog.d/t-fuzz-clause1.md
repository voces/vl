## Codegen, memory & runtime (Track B)

- **D16317 closed:** a union's function member whose result is a list of closures or records, narrowed by `is` and called while no value of it is built, now calls at its own signature instead of building an invalid module.
- **D16315 closed:** a map whose value is a nullable function returning a literal union stores the function, so building one, or reading one that arrives through a narrowed union parameter, runs instead of being refused at emit or building an invalid module.
