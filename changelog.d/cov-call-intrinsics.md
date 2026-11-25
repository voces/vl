## Codegen, memory & runtime (Track B)

- **IR claims the integer `abs`/`min`/`max`, `__log__` and widened intrinsic operands:** legacy and the IR now share one select tail (`intSelTail`). Each intrinsic operand is delivered widened to the operation's kind, and `__log__` lowers as a call of its reserved import. In `tests/cases` the `intrinsic` misses fall from 19 distinct functions and 8 start bodies to 1 function (`__trap__` as a value). In the witnesses they fall from 1 function and 2 start bodies to 0.
