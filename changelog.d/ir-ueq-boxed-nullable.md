## Codegen, memory & runtime (Track B)

- IR: a union `==` / `!=` whose operands are boxed nullables (`A | null` held as the union box)
  lowers through the staged union compare.
