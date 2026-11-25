## Codegen, memory & runtime (Track B)

- **IR coverage: a `null` literal into a closure's nullable list parameter:** a closure call whose argument is `null` at a boxed parameter on an as-is arm (a nullable scalar list's) delivers the literal at the parameter's rep, as any other boxed argument is; the start bodies that missed on `closure argument box` with a `null` argument are claimed. Byte-identical to legacy.
