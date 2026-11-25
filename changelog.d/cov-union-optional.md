## Codegen, memory & runtime (Track B)

- IR coverage, `?.` chains (lane COV-UNION): a standalone `?.` over a chain of links, and a `?? d` whose `?.` receiver is itself a chain, are claimed byte-identical; `optional read chain` 10 → 0 and `coalesce optional place` 13 → 3 on the I8 census.
