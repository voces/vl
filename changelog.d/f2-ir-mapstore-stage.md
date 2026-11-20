## Codegen, memory & runtime (Track B)

- **IR coverage:** a map store of a short-circuit value (`m[k] = p && q`) stages its receiver and key below the value's `if`, as legacy writes them first; a global receiver is staged as its own read (self-compile: 15 more functions covered).
