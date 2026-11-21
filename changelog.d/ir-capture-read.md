## Codegen, memory & runtime (Track B)

- **IR: a lifted local function reads its captures:** a lambda-lifted nested function's read of a variable captured from its encloser builds in the IR as the function's own parameter after the environment, where legacy's capture arm reads it. Byte-identical; the corpus's `read of <name>` blocker class (575 functions) is gone.
