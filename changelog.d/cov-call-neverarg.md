## Codegen, memory & runtime (Track B)

- **IR builds a call whose argument never returns:** `id(fail())`, where an argument is typed `never`, gave the callee a `never` parameter with no rep, and the IR missed it (`callee signature`). The call is dead past that argument. The builder writes the effect-free arguments before it as nothing, that argument's call as a statement, then the call's `unreachable` (`RDeadNever`). A dead call statement now lowers past any callee, not only a field's, and ends its path, so a returned one is the `return` legacy writes after it.
