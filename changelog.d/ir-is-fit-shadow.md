## Codegen, memory & runtime (Track B)

- **IR coverage: an `is K[]` whose region reads an empty `K[]` in place of its list.** The
  builder keeps legacy's shadow rows in build order and reads the narrowed name as one variable,
  whose slot is the scratch local the `is` test's store allocates (`listFitShadowSet`), read
  non-null as legacy reads it. A pushing arm and a closure's capture stay named misses. No legacy
  bytes moved.
