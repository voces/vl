## Codegen, memory & runtime (Track B)

- **IR coverage:** a `.push` of an `i32` onto a packed `u8` list is built by the IR as legacy writes it, the value a plain `i32` the backing truncates (self-compile: 76 more functions covered).
