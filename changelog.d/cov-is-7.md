## Codegen, memory & runtime (Track B)

- IR re-entry `emitDelivered` (lane COV-IS): a bare exact `as`'s sad path returns the function's own `null` as an operand the IR builds, no longer through legacy's `emitReturnValue`. The 7 programs the I8 rehearsal saw re-enter there no longer do.
