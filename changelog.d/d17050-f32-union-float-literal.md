## Codegen, memory & runtime (Track B)

- **D17050 closed:** a numeric union with an `f32` member and a float literal (`f32 | i32 + 2.0`, an `f32 | f64` result) builds and runs; the operator's minted result union registers its value boxes (`markNumUnionResultAtoms`).
