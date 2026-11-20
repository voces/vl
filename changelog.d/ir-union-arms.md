## Codegen, memory & runtime (Track B)

- IR: a nullable union binding (`const u: A | B | null = if …`) whose `if` initializer legacy
  writes into a seeded box builds on the IR, as a non-nullable one already did.
