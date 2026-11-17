## Codegen, memory & runtime (Track B)

- The collect pass's union-registration and closure-signature walks visit each type once per walk instead of unrolling a recursive type to a fixed depth.
