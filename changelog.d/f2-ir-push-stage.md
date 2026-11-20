## Codegen, memory & runtime (Track B)

- **IR coverage:** a `.push` of a short-circuit value (`g.push(p && q)`) onto a global, field or element list stages its receiver with its own `RListStage` statement ahead of the value's `if`, as legacy stages it (self-compile: 27 more functions covered).
