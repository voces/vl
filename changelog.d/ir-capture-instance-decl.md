## Codegen, memory & runtime (Track B)

- **IR coverage: a nested function in a generic instance captures the frame's own binding.** In a cloned instance, a nested function's read of a frame `let` still names the template's declaration. So the IR refused the capture with `closure env capture` or `callee captures`. `liftCapDecl` now maps it to the frame's own clone, by `declOrigOf`, and refuses when two clones of it exist. On tests/cases, `closure env capture` went from 172 functions to 56 and `callee captures` from 123 to 40. Programs fully IR-only went from 4,021 to 4,037.
