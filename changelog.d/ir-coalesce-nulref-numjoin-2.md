## Codegen, memory & runtime (Track B)

- **IR coverage, `coalesce nulRef numJoinIf`:** a re-readable nullable number coalesced with a number of another type (`a[i] ?? 0.5` over `(i64 | null)[]`) is built by the IR as legacy's null-test `if` typed at the `??`'s result (`coalNumJoinIf`, which legacy now calls too).
