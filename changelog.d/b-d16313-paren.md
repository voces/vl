## Codegen, memory & runtime (Track B)

- **D16313 closed:** a parenthesised list literal delivered to a union with a literal-union list
  member (`(["rj"])` at `K0[] | i32`) is boxed as that member, so `is K0[]` answers `true`.
