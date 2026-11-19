## Codegen, memory & runtime (Track B)

- **IR coverage:** a proven string accumulator append (`s = s + parts` in a loop) is built by the IR through `emitStrAccAppend`'s shared tail (self-compile: 132 more functions covered).
