## Codegen, memory & runtime (Track B)

- **IR: a parameter spelled like an intrinsic:** a call through a parameter named like an intrinsic (`__memory_grow__`) now builds in the IR as the closure call legacy writes, because the IR asks legacy's builtin dispatch (`identCallArmOf`) instead of refusing every `__` name. Byte-identical; `tests/cases`'s `call of a non-declaration` count falls from 345 to 340.
