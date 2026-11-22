## Codegen, memory & runtime (Track B)

- **IR coverage, an uninitialized binding:** a `let` with no initializer builds through the IR and writes nothing, as legacy writes nothing. The armed IR shadow now runs before the function's frame closes, so it sees an unset reference local as declared nullable, as the claim path does.
