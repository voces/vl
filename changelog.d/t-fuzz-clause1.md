## Codegen, memory & runtime (Track B)

- **D16317 closed:** a union's function member whose result is a list of closures or records, narrowed by `is` and called while no value of it is built, now calls at its own signature instead of building an invalid module.
