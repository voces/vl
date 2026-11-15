## Infrastructure (Track F)

- **Mono instance keys spell a type by its set id** (type hash-cons stage 4c): `tyCanonKey(ty)` is
  `"#" + tyCanonSet(ty)`, so a key part is one interned id. Its walk, memo, budget and depth
  argument are deleted (net −156 compiler lines). One program loses a duplicate instance; every
  other output is byte-identical.
