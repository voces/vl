## Codegen, memory & runtime (Track B)

- **IR covers a field read off a nullable record, and a field read that records no kind (lane COV-UNION):** a generic instance's `a.v == b.v` over `{ f: i32 } | null` reads the record inside (`member nullable` 5 → 0), and a read of a value whose type a generic call leaves open (`q.a`, `q = g(su, {a: 3, b: 4})`) reads the i32 field as stored (`member record` start rows 3 → 1).
