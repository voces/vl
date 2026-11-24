## Codegen, memory & runtime (Track B)

- **D17115 closed:** a value `if` whose arm is a union narrowed to a record now runs when passed straight to a record parameter: directly, nested, through a generic, or as a `match`. Before, it built invalid wasm. A union parameter given the same `if` keeps its box.
