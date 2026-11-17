## Codegen, memory & runtime (Track B)

- **IR N2b-2c-1b, testing a `K | null`:** legacy's null test takes its arm from one shared
  decision (`nulTestArmOf`) and its direction from the binary dispatch's own reading
  (`binNulTestOf`). The IR builds a `K | null`'s `== null`, `!= null` and `== "a"` the same way.
  The self-compile hands 123 more functions to the IR. No emitted byte moves.
