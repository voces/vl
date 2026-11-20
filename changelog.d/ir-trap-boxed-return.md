## Codegen, memory & runtime (Track B)

- IR: a `__trap__` statement lowers as legacy's message stream and `unreachable`, and a return boxes a call's primitive result through the box writer, byte-identical; 685 corpus functions more are covered, among them std:fmt's `toFixed` and `parseF64`.
