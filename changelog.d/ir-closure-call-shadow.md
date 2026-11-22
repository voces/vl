## Codegen, memory & runtime (Track B)

- **IR: a closure binding that shadows a function of its name:** a call through a parameter or local holding a function value now builds in the IR even when a function of that name is in scope, because the IR asks legacy's live-closure test. Byte-identical; `tests/cases`'s `call of a non-declaration` count falls from 367 to 345.
