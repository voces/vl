## Codegen, memory & runtime (Track B)

- **D16943 closed:** a vector list is a value-union member (`F32x4[] | string`, `F32x4[] | i32`, `F32x4[] | f32[]`), in a list, a record field and a parameter, narrowed by `is`. It boxes under its own atom kind, whose tag code is minted at the packed band's base only in a module whose union holds one, so every other program builds byte-identical wasm. Before, the delivery built an invalid module.
