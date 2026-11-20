## Codegen, memory & runtime (Track B)

- **IR coverage:** a field store whose value is a short-circuit (`r.a = p && q`) stages its receiver below the value's `if`, as legacy reads it first (self-compile: 9 more functions covered).
