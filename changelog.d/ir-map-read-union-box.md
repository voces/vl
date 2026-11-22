## Codegen, memory & runtime (Track B)

- **IR coverage, `map read mv`:** a map whose value is a union with null, read as `m[k] ?? d` where legacy keeps the box (more than one non-null member, or a nullable default), is built by the IR: legacy's box arm is a predicate and two writers (`mapGetOrUnionBoxOf`, `mapGetOrUnionBoxOpen`, `mapGetOrUnionBoxTail`) the IR's new form 5 shares.
