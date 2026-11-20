## Codegen, memory & runtime (Track B)

- IR: a nullable union (`A | B | null`) is held in the same box as a value union, so its `if`
  binding into a seeded box and a narrowed field read off it (`u.f` after `u is A`) build on the IR.
