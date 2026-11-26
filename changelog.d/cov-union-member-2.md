## Codegen, memory & runtime (Track B)

- **IR covers a field read off a nullable record, and a field read whose recorded kind is not the field's (lane COV-UNION):** a generic instance's `a.v == b.v` over `{ f: i32 } | null` reads the record inside (`member nullable` 5 → 0), and a read of a value whose type a generic call leaves open (`q.a`, `q = g(su, {a: 3, b: 4})`) reads the i32 field as stored, as does a pinned instance's narrowed field read that records the template's variant (`member record` 5 → 2).
