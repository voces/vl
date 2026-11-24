## Codegen, memory & runtime (Track B)

- **IR: a read of a `null`-typed field beside a guarded nullable compare** (D17420): the read now runs where its `null` is read (`RNullOf.nuRead`), as legacy writes it, so `u.tags == s` builds the bytes legacy builds and `s == u.tags`, or a record compared with a literal holding a `null` field, no longer falls back with `non-stack temp: out of order`.
