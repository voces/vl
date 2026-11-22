## Codegen, memory & runtime (Track B)

- **IR coverage, `map read mv`:** a map whose value is a union with no null member, read as `m[k] ?? d`, is built by the IR on legacy's plain mv arm, its default boxed into the value's union (`mapGetOrMvPlain` admits a null-free union; the legacy bytes are unchanged).
