## Codegen, memory & runtime (Track B)

- **IR coverage: a choice handed to a bundle parameter.** `f(if c { g } else { h })`, where `f` calls its parameter at two signatures, is now built by the IR as legacy writes it. Each arm's function read becomes the record of closures, and the `if` opens at that record row's reference through the decided `SIf` join. This closes the last `bundle argument` arm.
