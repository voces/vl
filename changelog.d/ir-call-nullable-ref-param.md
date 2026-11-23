## Codegen, memory & runtime (Track B)

- **IR coverage: a function value called with a reference at a nullable map, closure or string parameter.** Legacy writes such an argument as it stands (`emitCallRefArg`'s general arm, and `emitNonNullParamRecover` writes nothing for a nullable kind). The IR now takes it, and legacy records the call as plain for the shadow. Part of `call of a non-declaration`; the cells that moved on now name `expression null`. No legacy bytes moved.
