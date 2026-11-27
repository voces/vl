## Codegen, memory & runtime (Track B)

- **IR: a rowless `{ r: null }` narrowed to its union arm is built at the arm's variant row and retagged at its plain twin** (a `null`-unit field over the arm's nullable), as a binding, field, list element, map value, argument and return: `object field coercion`, `object variant field box` and `index element coercion` 10 → 5 units on their programs under `VL_IR_REQUIRE_CLAIM=1`.
