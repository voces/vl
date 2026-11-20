## Codegen, memory & runtime (Track B)

- **IR: the nullable reps:** a nullable record, list, map or closure and `boolean | null` are IR values. One delivery writes a `null` literal as legacy's own null and passes `T` into `T | null` unchanged; null tests, narrowed reads (`readOwesNonNullRecover`) and field reads through a nullable struct (`memRecvOwesNonNull`, now shared with legacy) take them. Byte-identical; the self-compile claims 69 more functions and the distilled corpus 280, and the nullable-rep blockers go from 141 to 0 (self-compile) and 359 to 11 (distilled).
