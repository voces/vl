## Codegen, memory & runtime (Track B)

- **D16120:** a function whose inferred return type is a union with a packed list arm
  (`u8[] | string`, `i16[] | i32`, ...) compiles without a return annotation.
