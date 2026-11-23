## Codegen, memory & runtime (Track B)

- **IR coverage: a record built wider at its delivery, handed to a direct call.** A direct call's signature now delivers each argument at the type the callee's frame holds its parameter at (`paramFrameTy`, legacy's declared row), as the thunk builder already does, not at the checked type. Of tests/cases' 19 `start: argument coercion` start bodies, 7 are now matched and 3 move to other classes. Legacy's bytes don't change.
