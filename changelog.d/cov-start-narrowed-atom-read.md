## Codegen, memory & runtime (Track B)

- IR coverage (lane COV-START): a field narrowed to an arm whose type is a lone literal (`if n is { kind: "end" } { print(n.kind) }`) is built by the IR, read at the union's atom it is stored as.
