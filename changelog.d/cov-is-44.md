## Codegen, memory & runtime (Track B)

- **IR builder:** a union box written from a closure into a hole-typed `let` is stored as it stands instead of missing, so programs that swap a list union inside a lambda build on the IR.
