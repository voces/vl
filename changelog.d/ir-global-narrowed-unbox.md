## Codegen, memory & runtime (Track B)

- **IR coverage, narrowed union globals:** the IR builder now builds a union global read at the one atom the checker narrowed it to, through one box-narrow decision it shares with local reads, and decides a recovered read's `ref.as_non_null` count where the read is built. tests/cases +17 functions and +51 start bodies, byte-identical.
