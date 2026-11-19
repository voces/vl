## Codegen, memory & runtime (Track B)

- **IR: more record member reads are plain field reads.** A record's own `length` field, a field read whose receiver is itself a field read that recovers its non-null ref, and a field stored as a nullable record but read recovered are claimed by the IR, with legacy's bytes.
