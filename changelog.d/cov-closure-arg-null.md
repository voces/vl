## Codegen, memory & runtime (Track B)

- **IR coverage: a `null` literal or an atom into a closure's boxed parameter:** a closure call whose argument is `null` at a boxed parameter on an as-is arm (a nullable scalar list's), or a literal-union atom at that union or `null`, delivers the argument at the parameter's rep, as any other boxed argument is; the start bodies that missed on `closure argument box` with such an argument are claimed. Byte-identical to legacy.
