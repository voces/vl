## Codegen, memory & runtime (Track B)

- **IR coverage, `map read mv`:** a map whose value is a nullable record, string or closure, read as `m[k] ?? d` with a default that is not nullable, is built by the IR: legacy's niche stash arm is a predicate and two writers (`mapGetOrNicheStash`, `mapGetOrNicheHead`, `mapGetOrNicheTail`) the IR's new form 4 shares.
