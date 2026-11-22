## Codegen, memory & runtime (Track B)

- **IR: a call through a holder of a returned bundle's record:** a call through a `const` holding a returned bundle's record whole now builds in the IR. It picks the member legacy picks and calls it at that member's signature, and legacy's `emitHolderCall` now reads the same route and pick. Byte-identical; `tests/cases`'s `call of a non-declaration` count falls from 367 to 322.
