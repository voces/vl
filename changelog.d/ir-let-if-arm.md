## Codegen, memory & runtime (Track B)

- IR: a union binding whose `if` initializer legacy writes into a seeded box, one arm at a time
  (every arm a box or on the box table), builds on the IR; the null box is one writer both use.
